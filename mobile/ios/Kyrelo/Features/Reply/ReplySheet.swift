import SwiftUI
import UIKit

/// Pick or edit a reply, then copy it and open the tweet in the X app to paste
/// and send. Kyrelo never posts replies itself: the person sends them.
struct ReplySheet: View {
    let client: BridgeClient
    let tweet: SeenTweet
    /// Called when drafts were saved or the tweet was marked replied.
    let onChanged: () -> Void

    @State private var options: [String]
    @State private var text: String
    @State private var drafting = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    init(client: BridgeClient, tweet: SeenTweet, initialText: String?, onChanged: @escaping () -> Void) {
        self.client = client
        self.tweet = tweet
        self.onChanged = onChanged
        _options = State(initialValue: tweet.draft?.options ?? [])
        _text = State(initialValue: initialText ?? tweet.draft?.options.first ?? "")
    }

    private var length: Int { ReplyRules.length(text) }
    private var canSend: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && length <= ReplyRules.maxLength }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Card(fill: Theme.panel2) {
                        Text(tweet.text).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(6)
                    }

                    if options.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(Array(options.enumerated()), id: \.offset) { i, option in
                                    Button("Option \(i + 1)") { text = option }
                                        .buttonStyle(.bordered)
                                        .tint(text == option ? Theme.accent : Theme.faint)
                                }
                            }
                        }
                    }

                    TextEditor(text: $text)
                        .frame(minHeight: 130)
                        .scrollContentBackground(.hidden)
                        .padding(8)
                        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line2))
                        .disabled(drafting)
                    Text("\(length) / \(ReplyRules.maxLength)")
                        .font(.caption)
                        .foregroundStyle(length > ReplyRules.maxLength ? Theme.danger : Theme.faint)

                    Button(action: copyAndOpen) {
                        Text("Copy & open in X").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(!canSend)

                    Button(action: draft) {
                        Group {
                            if drafting { ProgressView() } else { Text(options.isEmpty ? "Draft replies" : "New drafts") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(drafting)

                    if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
                    Text("Copies the reply and opens the tweet in X. Tap reply there, paste and send. The tweet is marked as replied in Kyrelo.")
                        .font(.footnote).foregroundStyle(Theme.faint)
                }
                .padding(20)
            }
            .background(Theme.ink)
            .navigationTitle("Reply to @\(tweet.handle)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        // Nothing to start from (no Autopilot drafts, no picked reply): draft straight away.
        .onAppear { if text.isEmpty && options.isEmpty { draft() } }
    }

    private func draft() {
        drafting = true
        error = nil
        Task {
            defer { drafting = false }
            do {
                let result = try await client.draft(tweetId: tweet.id)
                options = result.options
                text = result.options.first ?? text
                onChanged()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func copyAndOpen() {
        UIPasteboard.general.string = text
        // x.com links open in the X app when it's installed.
        if let url = URL(string: tweet.url) { openURL(url) }
        Task {
            // X is open either way; a failed mark can be redone on the desktop.
            try? await client.markReplied(tweetId: tweet.id, text: text)
            onChanged()
        }
        dismiss()
    }
}
