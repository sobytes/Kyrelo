# Contracts

Rules the desktop app (TypeScript) and the iOS app (Swift) must agree on,
written as test fixtures. Each app's tests read these same files, so if one
side's logic drifts, its tests fail:

- desktop: `desktop/lib/contracts.test.ts` (Vitest)
- iOS: `mobile/ios/KyreloTests/ContractTests.swift` (XCTest)

| File | Rule |
|---|---|
| `reply-rules.json` | Reply and campaign-post length (as X counts it: links are 23) and their limits, tone and style names |
| `platform-rules.json` | Each platform's name, post limit, image size limit, whether a post needs an image, how it counts length, how long a campaign post may be, how an account connects and its sign-up link (desktop/lib/platforms.ts) |
| `pairing-links.json` | The `kyrelo://pair` link the desktop shows and the phone reads |
| `scheduler.json` | Sample accounts, posts, campaigns and brand profile responses the phone must decode |
| `monitor-feed.json` | A sample `/api/grok-state` + `/api/grok-settings` response the phone must decode |
| `services.json` | The services (X, Bluesky, Mastodon and the rest) and each one's own sections, plus the global ones (the Scheduler and Comments); the desktop's home screen, sidebar and routes, and the iPhone's screens, are built from it |
| `comments.json` | A sample `/api/comments` + `/api/comments/settings` response the phone must decode |
| `service-icons.json` | Each service's icon (SVG shapes). The desktop draws them; `npm run service-icons` (in desktop/) writes the iPhone's copies into its asset catalog, and a test fails if they're out of date |
| `design-tokens.json` | The design system: colours, radii (never over 12px), spacing and fonts. The desktop's Tailwind config reads it, the website builds from a checked copy (`website/design-tokens.json`), and the iPhone's `Theme.swift` must match it |

Change a rule here first, then make both apps pass.
