import SwiftUI

/// The account finder, as on the desktop: from the brand profile, the AI
/// suggests accounts worth watching and following, and the desktop checks
/// each on X. Watch adds one to the Monitor; Follow is done in Chrome.
struct FinderView: View {
    let client: BridgeClient
    let watched: [String]
    let onWatch: (String, Bool) -> Void
    @State private var accountId: String?
    @State private var xAccounts: [Account] = []
    @State private var state: FinderState?
    @State private var brief = ""
    @State private var url = ""
    @State private var competitors = ""
    @State private var toFollow: Set<String> = []
    @State private var error: String?

    private let groups: [(id: String, title: String)] = [
        ("audience", "Where your audience is"), ("competitor", "Competitors"), ("news", "News & journalists"), ("peer", "Peers"),
    ]

    var body: some View {
        List {
            if accountId == nil && state == nil {
                Text(error ?? "Connect an X account first.").foregroundStyle(Theme.muted)
            }
            if let state {
                Section {
                    XAccountPicker(accounts: xAccounts, selected: $accountId)
                    TextField("What your brand does, and for whom", text: $brief, axis: .vertical).lineLimit(2...5)
                    TextField("https://your-site.com", text: $url)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    TextField("Competitors (optional)", text: $competitors)
                    Button(state.data.suggestions.isEmpty ? "Find accounts" : "Find again") { find() }
                        .buttonStyle(.primary)
                        .disabled(!state.aiReady || busy || brief.trimmingCharacters(in: .whitespaces).isEmpty)
                    if !state.aiReady {
                        Text("Add an AI key in Kyrelo's Settings on your computer first.").font(.inter(.footnote)).foregroundStyle(Theme.warning)
                    }
                    if let job = state.job {
                        JobLogView(running: job.running, summary: "\(job.kind) · \(job.done) done", log: job.log, error: job.error)
                    }
                    if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
                }
                ForEach(groups, id: \.id) { group in
                    let inGroup = state.data.suggestions.filter { $0.group == group.id }
                    if !inGroup.isEmpty {
                        Section(group.title) {
                            ForEach(inGroup) { suggestion in row(suggestion) }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("Find accounts")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if !toFollow.isEmpty {
                Button("Follow \(toFollow.count) on X") { follow() }
                    .buttonStyle(.primary)
                    .disabled(busy)
                    .padding(16)
                    .background(Theme.canvas)
            }
        }
        .task {
            do {
                xAccounts = try await client.accounts().filter { $0.platform == .twitter }
                accountId = xAccounts.first?.id
            } catch {
                self.error = error.localizedDescription
            }
            var first = true
            while !Task.isCancelled, accountId != nil {
                await load(fillProfile: first)
                first = false
                try? await Task.sleep(for: .seconds(busy ? 2 : 15))
            }
        }
    }

    private var busy: Bool { state?.job?.running ?? false }

    private func row(_ s: HandleSuggestion) -> some View {
        let isWatched = watched.contains { $0.lowercased() == s.handle.lowercased() }
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(s.name) ").font(.inter(.subheadline, weight: .semibold)).foregroundStyle(Theme.fg)
                + Text("@\(s.handle)").font(.inter(.subheadline)).foregroundStyle(Theme.muted)
            Text(s.reason).font(.inter(.caption)).foregroundStyle(Theme.muted)
            if let followers = s.followers {
                Text("\(followers.formatted(.number.notation(.compactName))) followers\(s.lastPostAt.map { " · posted \(timeAgo($0))" } ?? "")")
                    .font(.mono(.caption2)).foregroundStyle(Theme.muted)
            }
            HStack {
                Button(isWatched ? "Watching" : "Watch") { onWatch(s.handle, !isWatched) }
                if s.youFollow {
                    Text("You follow").font(.inter(.caption)).foregroundStyle(Theme.success)
                } else {
                    Button(toFollow.contains(s.handle) ? "✓ Follow" : "Follow") {
                        if toFollow.contains(s.handle) { toFollow.remove(s.handle) } else { toFollow.insert(s.handle) }
                    }
                }
            }
            .buttonStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func load(fillProfile: Bool) async {
        guard let accountId else { return }
        do {
            let next = try await client.finderState(accountId: accountId)
            state = next
            if fillProfile {
                brief = next.profile.brief
                url = next.profile.url
                competitors = next.profile.competitors
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func find() {
        guard let accountId else { return }
        Task {
            do {
                try await client.startFinder(accountId: accountId, profile: BrandProfile(brief: brief, url: url, competitors: competitors))
            } catch {
                self.error = error.localizedDescription
            }
            await load(fillProfile: false)
        }
    }

    private func follow() {
        guard let accountId else { return }
        let handles = Array(toFollow)
        Task {
            do {
                try await client.followSuggested(accountId: accountId, handles: handles)
                toFollow = []
            } catch {
                self.error = error.localizedDescription
            }
            await load(fillProfile: false)
        }
    }
}
