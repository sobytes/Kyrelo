import SwiftUI

/// Comments people left on your posts, from every account the desktop checks,
/// with the AI's reply drafts. Replies go out from the computer when you tap
/// Reply, as on the desktop's Comments page; nothing is sent on its own.
struct CommentsView: View {
    let client: BridgeClient
    @State private var data: CommentsResponse?
    @State private var settings: CommentSettings?
    @State private var replying: PostComment?
    @State private var checking = false
    @State private var error: String?
    @Environment(\.scenePhase) private var scenePhase

    private var waiting: [PostComment] {
        (data?.state.comments.items ?? []).filter(\.isWaiting).sorted { $0.postedAt > $1.postedAt }
    }

    private var replied: [PostComment] {
        (data?.state.comments.items ?? []).filter { $0.repliedAt != nil }.sorted { $0.postedAt > $1.postedAt }
    }

    var body: some View {
        List {
            if let error {
                Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error).listRowBackground(Color.clear)
            }
            if let settings {
                Section {
                    Toggle("Check in the background", isOn: Binding(
                        get: { settings.enabled },
                        set: { on in Task { await save { $0.enabled = on } } }
                    ))
                    .font(.inter(.subheadline))
                    .tint(Theme.primary)
                } footer: {
                    Text("Every few minutes your computer reads new comments and drafts replies. Nothing is sent until you tap Reply.")
                        .font(.inter(.caption))
                }
            }
            ForEach(Array((data?.state.accountErrors ?? [:]).sorted(by: { $0.key < $1.key })), id: \.key) { key, message in
                Text("\(key.split(separator: ":").dropFirst().joined(separator: ":")): \(message)")
                    .font(.inter(.footnote))
                    .foregroundStyle(Theme.error)
                    .listRowBackground(Theme.canvas)
            }
            if let needToken = data?.needToken.items, !needToken.isEmpty {
                Text("\(needToken.map { "@\($0.handle)" }.joined(separator: ", ")) need an API token for comments. Add it on the Comments page in Kyrelo on your computer.")
                    .font(.inter(.footnote))
                    .foregroundStyle(Theme.muted)
                    .listRowBackground(Theme.canvas)
            }
            Section("Waiting (\(waiting.count))") {
                if data != nil && waiting.isEmpty {
                    Text("No comments waiting for an answer.").foregroundStyle(Theme.muted)
                }
                ForEach(waiting) { comment in
                    Button { replying = comment } label: { CommentRow(comment: comment) }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button("Dismiss", role: .destructive) { Task { await dismiss(comment) } }
                        }
                }
            }
            .listRowBackground(Theme.canvas)
            if !replied.isEmpty {
                Section("Replied") {
                    ForEach(replied.prefix(20)) { CommentRow(comment: $0) }
                }
                .listRowBackground(Theme.canvas)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await checkNow() }
                } label: {
                    if checking { ProgressView() } else { Text("Check now").font(.inter(.footnote)) }
                }
                .disabled(checking)
            }
        }
        .refreshable { await load() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await load()
        }
        .sheet(item: $replying) { comment in
            CommentReplySheet(client: client, comment: comment) { Task { await load() } }
        }
    }

    private func load() async {
        do {
            async let comments = client.comments()
            async let current = client.commentSettings()
            (data, settings) = try await (comments, current)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(_ change: (inout CommentSettings) -> Void) async {
        guard var next = settings else { return }
        change(&next)
        settings = next
        do {
            settings = try await client.saveCommentSettings(next)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func checkNow() async {
        checking = true
        defer { checking = false }
        do {
            try await client.checkComments()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func dismiss(_ comment: PostComment) async {
        do {
            try await client.dismissComment(id: comment.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct CommentRow: View {
    let comment: PostComment

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            comment.platform.icon
                .resizable()
                .scaledToFit()
                .frame(width: 14, height: 14)
                .foregroundStyle(Theme.fg)
                .frame(width: 26, height: 26)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.sm))
                .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(Theme.line))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("@\(comment.author)").font(.inter(.footnote, weight: .semibold)).foregroundStyle(Theme.fg)
                    if let date = ISODate.parse(comment.postedAt) {
                        Text(date, style: .relative).font(.mono(.caption2)).foregroundStyle(Theme.muted)
                    }
                }
                Text(comment.text).font(.inter(.subheadline)).foregroundStyle(Theme.fg).lineLimit(4)
                Text(comment.postText).font(.inter(.caption)).foregroundStyle(Theme.muted).lineLimit(1)
                if let reply = comment.replyText {
                    Text("You: \(reply)").font(.inter(.caption)).foregroundStyle(Theme.success).lineLimit(2)
                } else if let draft = comment.draft {
                    Text(draft.options.isEmpty ? "Skipped (\(draft.score)/100): \(draft.reason)" : "\(draft.options.count) drafts · \(draft.score)/100")
                        .font(.inter(.caption))
                        .foregroundStyle(draft.options.isEmpty ? Theme.muted : Theme.primary)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

/// Pick or edit a reply, then send it: the computer posts it on the comment's platform.
private struct CommentReplySheet: View {
    let client: BridgeClient
    let comment: PostComment
    let onChanged: () -> Void

    @State private var options: [String]
    @State private var text: String
    @State private var drafting = false
    @State private var sending = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, comment: PostComment, onChanged: @escaping () -> Void) {
        self.client = client
        self.comment = comment
        self.onChanged = onChanged
        _options = State(initialValue: comment.draft?.options ?? [])
        _text = State(initialValue: comment.draft?.options.first ?? "")
        _error = State(initialValue: comment.replyError)
    }

    private var limit: Int { min(comment.platform.maxLength, 280) }
    private var length: Int { comment.platform.length(text) }
    private var canSend: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && length <= comment.platform.maxLength && !sending }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Card(fill: Theme.canvas) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(comment.text).font(.inter(.subheadline)).foregroundStyle(Theme.fg)
                            Text("On: \(comment.postText)").font(.inter(.caption)).foregroundStyle(Theme.muted).lineLimit(3)
                        }
                    }
                    if options.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(Array(options.enumerated()), id: \.offset) { i, option in
                                    Button("Option \(i + 1)") { text = option }
                                        .buttonStyle(SecondaryButtonStyle(isSelected: text == option))
                                }
                            }
                        }
                    }
                    TextEditor(text: $text)
                        .frame(minHeight: 130)
                        .scrollContentBackground(.hidden)
                        .padding(8)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                        .disabled(drafting || sending)
                    Text("\(length) / \(comment.platform.maxLength)")
                        .font(.inter(.caption))
                        .foregroundStyle(length > comment.platform.maxLength ? Theme.error : Theme.muted)

                    Button(action: send) {
                        Group { if sending { ProgressView() } else { Text("Reply on \(comment.platform.label)") } }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.primary)
                    .disabled(!canSend)

                    Button(action: draft) {
                        Group { if drafting { ProgressView() } else { Text(options.isEmpty ? "Draft replies" : "New drafts") } }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.secondary)
                    .disabled(drafting || sending)

                    if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
                    Text("Your computer posts the reply under the comment. Short replies (under \(limit) characters) read best.")
                        .font(.inter(.footnote)).foregroundStyle(Theme.muted)
                }
                .padding(20)
            }
            .background(Theme.canvas)
            .navigationTitle("Reply to @\(comment.author)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .onAppear { if text.isEmpty && options.isEmpty && comment.draft == nil { draft() } }
    }

    private func draft() {
        drafting = true
        error = nil
        Task {
            defer { drafting = false }
            do {
                let result = try await client.draftComment(id: comment.id)
                options = result.options
                text = result.options.first ?? text
                onChanged()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func send() {
        sending = true
        error = nil
        Task {
            defer { sending = false }
            do {
                try await client.replyToComment(id: comment.id, text: text)
                onChanged()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
