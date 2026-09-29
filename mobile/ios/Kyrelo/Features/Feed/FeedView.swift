import SwiftUI

/// The Monitor feed with Autopilot's draft replies under each tweet: X's
/// Monitor section, shown inside the service screen.
struct FeedView: View {
    let onUnpair: () -> Void
    @State private var model: FeedModel
    @State private var replying: ReplyTarget?
    @State private var editingAutopilot = false
    @Environment(\.scenePhase) private var scenePhase

    init(client: BridgeClient, onUnpair: @escaping () -> Void) {
        self.onUnpair = onUnpair
        _model = State(initialValue: FeedModel(client: client))
    }

    var body: some View {
        List {
            if let settings = model.settings {
                Section { statusCard(settings) }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            }
            if let error = model.error {
                Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error).listRowBackground(Color.clear)
            }
            ForEach(model.tweets) { tweet in
                TweetRow(tweet: tweet) { text in replying = ReplyTarget(tweet: tweet, text: text) }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
            if model.settings != nil && model.tweets.isEmpty {
                Text("No tweets yet.").foregroundStyle(Theme.muted).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .overlay { if model.settings == nil && model.error == nil { ProgressView() } }
        .refreshable { await model.load() }
        // Refresh every 15s while the app is in front.
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await model.load()
                try? await Task.sleep(for: .seconds(15))
            }
        }
        .onChange(of: model.unpaired) { _, unpaired in if unpaired { onUnpair() } }
        .sheet(item: $replying) { target in
            ReplySheet(client: model.client, tweet: target.tweet, initialText: target.text) {
                Task { await model.load() }
            }
        }
        .sheet(isPresented: $editingAutopilot) {
            if let autopilot = model.settings?.autopilot {
                AutopilotSheet(autopilot: autopilot, onSave: model.saveAutopilot)
            }
        }
    }

    private func statusCard(_ settings: MonitorSettings) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Toggle(isOn: Binding(get: { settings.enabled }, set: { on in Task { await model.setWatching(on) } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(settings.enabled ? "Watching \(watchingSummary(settings))" : "Not watching")
                            .foregroundStyle(Theme.fg)
                        Text(model.lastCheckedAt.map { "Last checked \(timeAgo($0))" } ?? "Not checked yet")
                            .font(.inter(.caption)).foregroundStyle(Theme.muted)
                    }
                }
                .tint(Theme.success)
                HStack {
                    Button {
                        Task { await model.checkNow() }
                    } label: {
                        Group { if model.checking { ProgressView() } else { Text("Check now") } }.frame(maxWidth: .infinity)
                    }
                    .disabled(model.checking)
                    Button { editingAutopilot = true } label: {
                        Text("Autopilot: \(settings.autopilot.enabled ? "on" : "off")").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.secondary)
            }
        }
    }
}

/// "3 handles and 2 keywords", as on the desktop's Monitor.
private func watchingSummary(_ settings: MonitorSettings) -> String {
    let count = { (n: Int, one: String) in "\(n) \(one)\(n == 1 ? "" : "s")" }
    let keywords = settings.keywords?.count ?? 0
    return [
        settings.handles.isEmpty ? nil : count(settings.handles.count, "handle"),
        keywords == 0 ? nil : count(keywords, "keyword"),
    ].compactMap { $0 }.joined(separator: " and ")
}

/// Which tweet the reply sheet is for, and the draft it starts from.
struct ReplyTarget: Identifiable {
    let tweet: SeenTweet
    let text: String?
    var id: String { tweet.id }
}

struct TweetRow: View {
    let tweet: SeenTweet
    /// Opens the reply sheet, starting from `text` when a draft was picked.
    let onReply: (String?) -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("@\(tweet.handle)").bold().foregroundStyle(Theme.fg)
                    Spacer()
                    Text("\(tweet.isReply ? "replied" : "posted") \(timeAgo(tweet.sortDate))")
                        .font(.inter(.caption)).foregroundStyle(Theme.muted)
                }
                if let keyword = tweet.keyword {
                    Text("“\(keyword)”")
                        .font(.inter(.caption2))
                        .foregroundStyle(Theme.primary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
                }
                Text(tweet.text).foregroundStyle(Theme.fg)

                HStack {
                    if let repliedAt = tweet.repliedAt {
                        Label("Replied \(timeAgo(repliedAt))", systemImage: "checkmark").font(.inter(.footnote)).foregroundStyle(Theme.success)
                    } else if tweet.draft == nil {
                        Button("Reply") { onReply(nil) }.buttonStyle(.secondary)
                    }
                    // x.com links open in the X app when it's installed.
                    Button("Open on X") {
                        if let url = URL(string: tweet.url) { openURL(url) }
                    }
                    .buttonStyle(.secondary)
                }
                if let draft = tweet.draft, tweet.repliedAt == nil {
                    DraftSuggestions(draft: draft, onUse: onReply)
                }
            }
        }
    }
}

/// Autopilot's score, reason and draft replies for one tweet.
struct DraftSuggestions: View {
    let draft: ReplyDraft
    let onUse: (String?) -> Void

    var body: some View {
        if draft.options.isEmpty {
            Button { onUse(nil) } label: {
                (Text("Autopilot skipped (\(draft.score)/100): \(draft.reason) ") + Text("Draft anyway").underline())
                    .font(.inter(.caption)).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                (Text("\(draft.score)/100 ").bold().foregroundColor(Theme.primary) + Text(draft.reason).foregroundColor(Theme.muted))
                    .font(.inter(.caption))
                ForEach(Array(draft.options.enumerated()), id: \.offset) { _, option in
                    Button { onUse(option) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(option).font(.inter(.subheadline)).foregroundStyle(Theme.fg).multilineTextAlignment(.leading)
                            Text("Use →").font(.inter(.caption)).foregroundStyle(Theme.primary)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.canvas, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
