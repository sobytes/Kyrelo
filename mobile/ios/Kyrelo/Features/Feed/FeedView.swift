import SwiftUI

/// The Monitor feed with Autopilot's draft replies under each tweet.
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
        NavigationStack {
            List {
                if let settings = model.settings {
                    Section { statusCard(settings) }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                }
                if let error = model.error {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger).listRowBackground(Color.clear)
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
            .background(Theme.ink)
            .overlay { if model.settings == nil && model.error == nil { ProgressView() } }
            .refreshable { await model.load() }
            .navigationTitle("Monitor")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Unpair", role: .destructive, action: onUnpair).font(.footnote)
                }
            }
        }
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
                        Text(settings.enabled ? "Watching \(settings.handles.count) handles" : "Not watching")
                            .foregroundStyle(Theme.text)
                        Text(model.lastCheckedAt.map { "Last checked \(timeAgo($0))" } ?? "Not checked yet")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .tint(Theme.live)
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
                .buttonStyle(.bordered)
            }
        }
    }
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
                    Text("@\(tweet.handle)").bold().foregroundStyle(Theme.text)
                    Spacer()
                    Text("\(tweet.isReply ? "replied" : "posted") \(timeAgo(tweet.sortDate))")
                        .font(.caption).foregroundStyle(Theme.faint)
                }
                Text(tweet.text).foregroundStyle(Theme.text)

                HStack {
                    if let repliedAt = tweet.repliedAt {
                        Label("Replied \(timeAgo(repliedAt))", systemImage: "checkmark").font(.footnote).foregroundStyle(Theme.live)
                    } else if tweet.draft == nil {
                        Button("Reply") { onReply(nil) }.buttonStyle(.bordered)
                    }
                    // x.com links open in the X app when it's installed.
                    Button("Open on X") {
                        if let url = URL(string: tweet.url) { openURL(url) }
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.muted)
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
                    .font(.caption).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                (Text("\(draft.score)/100 ").bold().foregroundColor(Theme.accent) + Text(draft.reason).foregroundColor(Theme.muted))
                    .font(.caption)
                ForEach(Array(draft.options.enumerated()), id: \.offset) { _, option in
                    Button { onUse(option) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(option).font(.subheadline).foregroundStyle(Theme.text).multilineTextAlignment(.leading)
                            Text("Use →").font(.caption).foregroundStyle(Theme.accent)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
