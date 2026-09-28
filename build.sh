#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN=false
PACK=false
RELEASE=false
RELEASE_TEST=false
TARGET_SPEC=""

usage() {
    echo "Usage: $0 <target[|target...]> [run|pack|release [test]]"
    echo ""
    echo "Targets (pipe-separate for multiple):"
    echo "  desktop         Electron app (Next.js UI + worker + Playwright)"
    echo "  website         Marketing site (kyrelo.com)"
    echo "  ios             iPhone app (mobile/ios): Monitor + Autopilot, paired with desktop"
    echo "  check           Type-check both apps, run the desktop tests and scan tracked"
    echo "                  files for secrets."
    echo "                  No build, no server."
    echo ""
    echo "Options:"
    echo "  run             Start the app / dev server instead of a production build"
    echo "  pack            Desktop: unsigned .app / .exe in desktop/dist/ to try locally"
    echo "  release         Desktop: checks, then build, sign and publish."
    echo "                  macOS: bumps the patch version, commits, tags, pushes and"
    echo "                  creates the GitHub release with the .dmg."
    echo "                  Windows: attaches the signed .exe to that same release,"
    echo "                  so release on the Mac first."
    echo "  release test    Desktop: the release build only. No notarising, no push,"
    echo "                  no upload."
    echo ""
    echo "Examples:"
    echo "  $0 desktop run            Launch the Electron app in dev mode"
    echo "  $0 website run            Website on http://localhost:3000"
    echo "  $0 ios run                iPhone app in the simulator"
    echo "  $0 'desktop|website'      Production builds of both"
    echo "  $0 check                  Everything that must pass before a release"
    echo "  $0 desktop pack           Unsigned local build to click through"
    echo "  $0 desktop release test   Dry run of the release build"
    echo "  $0 desktop release        Ship it"
    exit 1
}

[ $# -eq 0 ] && usage

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            usage
            ;;
        run)
            RUN=true
            shift
            ;;
        pack)
            PACK=true
            shift
            ;;
        release)
            RELEASE=true
            shift
            ;;
        test)
            RELEASE_TEST=true
            shift
            ;;
        *)
            if [ -z "$TARGET_SPEC" ]; then
                TARGET_SPEC="$1"
                shift
            else
                echo -e "${RED}Unexpected argument: $1${NC}"
                usage
            fi
            ;;
    esac
done

[ -z "$TARGET_SPEC" ] && usage

if $RELEASE_TEST && ! $RELEASE; then
    echo -e "${RED}test only applies to release. Try: $0 desktop release test${NC}"
    exit 1
fi

# Git Bash on Windows has no lsof, so fall back to netstat + taskkill.
# Without this the port cleanup silently does nothing there.
listeners_on() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:"$1"
    else
        netstat -ano \
            | grep -i 'listening' \
            | awk -v p=":$1" 'index($2, p) == length($2) - length(p) + 1 {print $5}' \
            | sort -u
    fi
}

kill_port() {
    local pids
    pids="$(listeners_on "$1")"
    [ -n "$pids" ] || return 0
    if command -v lsof >/dev/null 2>&1; then
        echo "$pids" | xargs kill -9 2>/dev/null
    else
        echo "$pids" | xargs -n1 -I{} taskkill //PID {} //T //F >/dev/null 2>&1
    fi
}

ensure_deps() {
    if [ ! -d node_modules ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm install || return 1
    fi
}

build_desktop() {
    cd "$BASE_DIR/desktop" || return 1
    ensure_deps || return 1

    if $RELEASE; then
        release_desktop
        return $?
    fi

    if $PACK; then
        echo -e "${GREEN}Packing an unsigned desktop build...${NC}"
        npm run pack || return 1
        echo -e "${GREEN}Done. The app is in desktop/dist/${NC}"
        return 0
    fi

    if ! $RUN; then
        echo -e "${GREEN}Building desktop app (Next.js production build)...${NC}"
        npm run build || return 1
        echo -e "${GREEN}Done!${NC}"
        return 0
    fi

    # Unpackaged Electron spawns `next dev` and the worker itself
    # (electron/main.cjs), so clear anything left on the dev port first.
    # Dev Electron points Playwright at build/pw-browsers (electron/main.cjs),
    # so fetch Chromium there on first run.
    if [ ! -d "$BASE_DIR/desktop/build/pw-browsers" ] && [ -z "$PLAYWRIGHT_BROWSERS_PATH" ]; then
        echo -e "${YELLOW}First run: downloading Playwright Chromium...${NC}"
        npm run pw:install || return 1
    fi
    echo -e "${GREEN}Launching Kyrelo in dev mode...${NC}"
    kill_port 3000
    npm run desktop
}

release_desktop() {
    local version
    version="$(node -p "require('./package.json').version")"

    if $RELEASE_TEST; then
        echo -e "${CYAN}Release dry run (current version ${version})${NC}"
    else
        # The mac release commits the version bump, tags and pushes HEAD, so it
        # must start from a clean main or it ships whatever else is lying around.
        local branch
        branch="$(git -C "$BASE_DIR" rev-parse --abbrev-ref HEAD)"
        if [ "$branch" != "main" ]; then
            echo -e "${RED}Releases go out from main, not ${branch}.${NC}"
            return 1
        fi
        if [ -n "$(git -C "$BASE_DIR" status --porcelain)" ]; then
            echo -e "${RED}Uncommitted changes. Commit or stash them before releasing.${NC}"
            return 1
        fi
        echo -e "${CYAN}Releasing from main (current version ${version})${NC}"
    fi
    echo ""

    echo -e "${CYAN}[RELEASE] Running checks before packaging...${NC}"
    (cd "$BASE_DIR" && ./build.sh check) || {
        echo -e "${RED}Checks failed. Not packaging.${NC}"
        return 1
    }
    cd "$BASE_DIR/desktop" || return 1

    local suffix=""
    $RELEASE_TEST && suffix=":test"

    case "$(uname -s)" in
        Darwin)
            if ! $RELEASE_TEST; then
                echo -e "${YELLOW}This bumps the patch version, pushes to origin and publishes a GitHub release.${NC}"
                echo -e "${YELLOW}Notarising takes several minutes and needs the Apple credentials in desktop/.env.local.${NC}"
            fi
            npm run "release:mac${suffix}" || return 1
            ;;
        MINGW*|MSYS*|CYGWIN*)
            if ! $RELEASE_TEST; then
                echo -e "${YELLOW}Attaching the Windows installer to the v${version} release. Release on the Mac first.${NC}"
            fi
            npm run "release:win${suffix}" || return 1
            ;;
        *)
            echo -e "${RED}Desktop releases are built on macOS or Windows.${NC}"
            return 1
            ;;
    esac

    echo -e "${GREEN}Done. Artifacts are in desktop/dist/${NC}"
}

build_website() {
    cd "$BASE_DIR/website" || return 1
    ensure_deps || return 1

    if ! $RUN; then
        echo -e "${GREEN}Building website...${NC}"
        npm run build || return 1
        echo -e "${GREEN}Done!${NC}"
        return 0
    fi

    echo -e "${GREEN}Starting website on http://localhost:3000${NC}"
    kill_port 3000
    npm run dev
}

IOS_DIR="$BASE_DIR/mobile/ios"

# The committed Kyrelo.xcodeproj is generated from project.yml. Regenerate when
# xcodegen is installed; otherwise build the committed project as-is.
ios_project() {
    if command -v xcodegen >/dev/null 2>&1; then
        (cd "$IOS_DIR" && xcodegen generate >/dev/null) || return 1
    fi
}

# First available iPhone simulator: "udid|name".
ios_simulator() {
    xcrun simctl list devices available | grep -m1 -E "^\s+iPhone" \
        | sed -E 's/^ *(.*) \(([0-9A-F-]{36})\).*/\2|\1/'
}

build_ios() {
    ios_project || return 1
    cd "$IOS_DIR" || return 1

    if ! $RUN; then
        echo -e "${GREEN}Building iOS app...${NC}"
        xcodebuild -project Kyrelo.xcodeproj -scheme Kyrelo -destination "generic/platform=iOS" \
            -derivedDataPath .build CODE_SIGNING_ALLOWED=NO build -quiet || return 1
        echo -e "${GREEN}Done!${NC}"
        return 0
    fi

    local sim id name
    sim="$(ios_simulator)"
    [ -n "$sim" ] || { echo -e "${RED}No iPhone simulator available${NC}"; return 1; }
    id="${sim%%|*}"; name="${sim##*|}"
    echo -e "${GREEN}Building for $name...${NC}"
    xcodebuild -project Kyrelo.xcodeproj -scheme Kyrelo -destination "platform=iOS Simulator,id=$id" \
        -derivedDataPath .build build -quiet || return 1
    xcrun simctl boot "$id" 2>/dev/null
    open -a Simulator
    xcrun simctl install "$id" .build/Build/Products/Debug-iphonesimulator/Kyrelo.app || return 1
    xcrun simctl launch "$id" com.sobytes.kyrelo.mobile >/dev/null || return 1
    echo -e "${GREEN}Kyrelo is running on $name.${NC}"
}

ios_tests() {
    local sim
    sim="$(ios_simulator)"
    [ -n "$sim" ] || return 1
    cd "$IOS_DIR" && xcodebuild -project Kyrelo.xcodeproj -scheme Kyrelo \
        -destination "platform=iOS Simulator,id=${sim%%|*}" -derivedDataPath .build test -quiet
}

# The repo is public, so a leaked key in a tracked file is a real leak.
# Matches the shapes of the keys this project handles, not generic words.
scan_secrets() {
    local hits
    hits="$(git -C "$BASE_DIR" grep -nIE \
        'sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj-)?[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY' \
        -- ':!*package-lock.json')"
    if [ -n "$hits" ]; then
        echo "$hits"
        return 1
    fi
    local tracked
    tracked="$(git -C "$BASE_DIR" ls-files | grep -E '(^|/)\.env(\.[a-z]+)?$|(^|/)\.data/|\.(pem|p12|pfx|key)$' | grep -v '\.env\.example$')"
    if [ -n "$tracked" ]; then
        echo "Sensitive files are tracked:"
        echo "$tracked"
        return 1
    fi
}

run_checks() {
    local failed=0
    local summary=""

    step() {
        local name="$1"; shift
        echo -e "${CYAN}[CHECK] ${name}${NC}"
        if "$@"; then
            summary="${summary}\n  ${GREEN}pass${NC}  ${name}"
        else
            summary="${summary}\n  ${RED}FAIL${NC}  ${name}"
            failed=1
        fi
    }

    (cd "$BASE_DIR/desktop" && ensure_deps) || return 1
    (cd "$BASE_DIR/website" && ensure_deps) || return 1

    step "desktop type-check" bash -c "cd '$BASE_DIR/desktop' && npm run typecheck --silent"
    step "desktop tests"      bash -c "cd '$BASE_DIR/desktop' && npm test --silent"
    step "website type-check" bash -c "cd '$BASE_DIR/website' && npm run typecheck --silent"
    step "secret scan"        scan_secrets
    # iOS needs Xcode. Skip rather than fail on machines without it (the
    # Windows release box); the same contracts/ are still checked by the
    # desktop tests above.
    if command -v xcodebuild >/dev/null 2>&1; then
        step "ios tests"          ios_tests
    else
        echo -e "${YELLOW}[CHECK] ios tests - skipped, no Xcode here${NC}"
        summary="${summary}\n  ${YELLOW}skip${NC}  ios tests"
    fi

    echo ""
    echo -e "${CYAN}Summary${NC}${summary}"
    echo ""
    if [ $failed -eq 1 ]; then
        echo -e "${RED}Checks failed${NC}"
        return 1
    fi
    echo -e "${GREEN}All checks passed${NC}"
    return 0
}

IFS='|' read -ra TARGETS <<< "$TARGET_SPEC"
FAILED=0

if { $RELEASE || $PACK; } && [ "$TARGET_SPEC" != "desktop" ]; then
    echo -e "${RED}pack and release apply to the desktop target only${NC}"
    echo "Try: $0 desktop release"
    exit 1
fi

if $RUN && [ ${#TARGETS[@]} -gt 1 ]; then
    # Both dev servers use port 3000 and each run blocks, so run them one at a time.
    echo -e "${RED}run takes one target at a time${NC}"
    exit 1
fi

for target in "${TARGETS[@]}"; do
    case "$target" in
        desktop)  build_desktop  || FAILED=1 ;;
        website)  build_website  || FAILED=1 ;;
        ios)      build_ios      || FAILED=1 ;;
        check)    run_checks     || FAILED=1 ;;
        *)
            echo -e "${RED}Unknown target: $target${NC}"
            usage
            ;;
    esac

    if [ $FAILED -eq 1 ]; then
        echo -e "${RED}Failed on target: $target${NC}"
        exit 1
    fi
done
