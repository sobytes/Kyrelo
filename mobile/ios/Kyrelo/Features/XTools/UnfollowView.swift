import SwiftUI

/// X's Unfollow, as on the desktop: scan who the account follows, see what
/// the rules suggest (the desktop works it out), pick, and confirm. The
/// desktop does the unfollowing in its Chrome while this follows the log.
struct UnfollowView: View {
    let client: BridgeClient
    let accounts: [Account]
    @State private var accountId: String?
    @State private var state: UnfollowState?
    @State private var rules: UnfollowRules?
    @State private var filter: Filter = .suggested
    @State private var selected: Set<String> = []
    @State private var confirming = false
    @State private var error: String?

    /// X locks accounts that unfollow too fast (lib/unfollow.ts MAX_UNFOLLOWS_PER_RUN).
    private let maxPerRun = 100

    enum Filter: String, CaseIterable {
        case suggested = "Suggested", everyone = "Everyone", kept = "Kept"
    }

    init(client: BridgeClient, accounts: [Account]) {
        self.client = client
        self.accounts = accounts
        _accountId = State(initialValue: accounts.first?.id)
    }

    var body: some View {
        List {
            if accounts.isEmpty {
                Text("Connect an X account first.").foregroundStyle(Theme.muted)
            } else {
                Section {
                    XAccountPicker(accounts: accounts, selected: $accountId)
                    HStack {
                        Text(scanSummary).font(.inter(.footnote)).foregroundStyle(Theme.muted)
                        Spacer()
                        Button(state?.scannedAt == nil ? "Scan" : "Scan again") { act("scan") }
                            .buttonStyle(.secondary)
                            .disabled(busy)
                    }
                    if let job = state?.job {
                        JobLogView(running: job.running, summary: "\(job.kind) · \(job.done) done", log: job.log, error: job.error)
                    }
                    if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
                }
                if rules != nil { rulesSection }
                if let state, state.scannedAt != nil { rowsSection(state) }
                if let history = state?.history, !history.isEmpty { historySection(history) }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .safeAreaInset(edge: .bottom) {
            if !selected.isEmpty {
                Button("Unfollow \(selected.count)", role: .destructive) { confirming = true }
                    .buttonStyle(.primary)
                    .disabled(busy || selected.count > maxPerRun)
                    .padding(16)
                    .background(Theme.canvas)
            }
        }
        .confirmationDialog("Unfollow \(selected.count) \(selected.count == 1 ? "account" : "accounts")?",
                            isPresented: $confirming, titleVisibility: .visible) {
            Button("Unfollow", role: .destructive) {
                act("unfollow", handles: Array(selected))
                selected = []
            }
        } message: {
            Text("Done slowly in Chrome on your computer. You can follow them again from the history.")
        }
        .task(id: accountId) {
            selected = []
            // Poll faster while a job runs on the desktop.
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(busy ? 2 : 15))
            }
        }
        .onChange(of: rules) { _, _ in Task { await load() } }
    }

    private var busy: Bool { state?.job?.running ?? false }

    private var scanSummary: String {
        guard let state, let scannedAt = state.scannedAt else { return "Scan to see who this account follows." }
        return "Following \(state.rows.count)\(state.partial ? "+" : "") · scanned \(timeAgo(scannedAt))"
    }

    private var rulesSection: some View {
        Section("Suggest unfollowing") {
            let r = Binding(get: { rules ?? BridgeClient.defaultRules }, set: { rules = $0 })
            Toggle("Dead accounts", isOn: r.dead)
            Picker("Inactive for", selection: r.inactiveDays) {
                ForEach([30, 90, 180, 365], id: \.self) { Text("\($0) days").tag($0) }
            }
            Toggle("Likely bots", isOn: r.bots)
            Toggle("Never interacts with you", isOn: r.neverEngage)
            Toggle("Doesn't follow back", isOn: r.notFollowingBack)
            Toggle("Protect big accounts", isOn: r.protectBig)
        }
        .tint(Theme.success)
    }

    private func rowsSection(_ state: UnfollowState) -> some View {
        let rows = state.rows.filter { row in
            switch filter {
            case .suggested: row.suggested
            case .everyone: true
            case .kept: row.kept
            }
        }
        let unchecked = state.rows.filter(\.needsActivityCheck).map(\.handle)
        return Section {
            Picker("Show", selection: $filter) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            if !unchecked.isEmpty {
                Button("Check when \(min(unchecked.count, 200)) last posted") {
                    act("activity", handles: Array(unchecked.prefix(200)))
                }
                .disabled(busy)
            }
            if filter == .suggested && !rows.isEmpty {
                Button(selected.isEmpty ? "Select all \(min(rows.count, maxPerRun))" : "Clear selection") {
                    selected = selected.isEmpty ? Set(rows.prefix(maxPerRun).map(\.handle)) : []
                }
            }
            if rows.isEmpty {
                Text(filter == .suggested ? "Nothing to suggest with these rules." : "No accounts here.").foregroundStyle(Theme.muted)
            }
            ForEach(rows) { row in
                FollowRow(row: row, selected: selected.contains(row.handle)) {
                    guard row.protectedBecause == nil else { return }
                    if selected.contains(row.handle) { selected.remove(row.handle) } else { selected.insert(row.handle) }
                }
                .swipeActions {
                    Button(row.kept ? "Unkeep" : "Keep") { keep(row) }.tint(Theme.success)
                }
            }
        } footer: {
            Text("Swipe to keep an account: kept accounts are never suggested. Up to \(maxPerRun) at a time.")
                .font(.inter(.caption))
        }
    }

    private func historySection(_ history: [FollowChange]) -> some View {
        Section("History") {
            ForEach(history.prefix(20)) { change in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(change.action == "unfollowed" ? "Unfollowed" : "Followed again") @\(change.handle)")
                        .font(.inter(.subheadline)).foregroundStyle(Theme.fg)
                    Text("\(timeAgo(change.at))\(change.reasons.isEmpty ? "" : " · " + change.reasons.joined(separator: " · "))")
                        .font(.inter(.caption)).foregroundStyle(Theme.muted)
                }
                .swipeActions {
                    if change.action == "unfollowed" {
                        Button("Follow again") { act("refollow", handles: [change.handle]) }.tint(Theme.primary)
                    }
                }
            }
        }
    }

    private func load() async {
        guard let accountId else { return }
        do {
            let next = try await client.unfollowState(accountId: accountId, rules: rules)
            state = next
            if rules == nil { rules = next.rules }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func act(_ action: String, handles: [String] = []) {
        guard let accountId else { return }
        Task {
            do {
                try await client.unfollowAction(action, accountId: accountId, handles: handles, rules: rules)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
            await load()
        }
    }

    private func keep(_ row: UnfollowRow) {
        guard let accountId else { return }
        selected.remove(row.handle)
        Task {
            do {
                try await client.unfollowAction("keep", accountId: accountId, handle: row.handle, keep: !row.kept)
            } catch {
                self.error = error.localizedDescription
            }
            await load()
        }
    }
}

private struct FollowRow: View {
    let row: UnfollowRow
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: selected ? "checkmark.square.fill" : "square")
                    .foregroundStyle(row.protectedBecause != nil ? Theme.line : selected ? Theme.primary : Theme.muted)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(row.name) ").font(.inter(.subheadline, weight: .semibold)).foregroundStyle(Theme.fg)
                        + Text("@\(row.handle)").font(.inter(.subheadline)).foregroundStyle(Theme.muted)
                    Text(stats).font(.mono(.caption2)).foregroundStyle(Theme.muted)
                    if let why = row.protectedBecause {
                        Text("Kept: \(why)").font(.inter(.caption)).foregroundStyle(Theme.success)
                    } else if !row.reasons.isEmpty {
                        Text(row.reasons.joined(separator: " · ")).font(.inter(.caption)).foregroundStyle(Theme.warning)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var stats: String {
        [
            row.followers.map { "\($0.formatted(.number.notation(.compactName))) followers" },
            row.lastPostAt.map { "posted \(timeAgo($0))" },
            row.followsYou ? "follows you" : nil,
        ].compactMap { $0 }.joined(separator: " · ")
    }
}
