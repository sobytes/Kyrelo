import SwiftUI

/// Writes a post to one or more accounts on any platforms, like the desktop
/// compose form.
struct ComposeSheet: View {
    let client: BridgeClient
    let accounts: [Account]
    let onScheduled: () -> Void

    @State private var text = ""
    @State private var photo: Data?
    @State private var targetKeys: Set<String>
    @State private var date = Date().addingTimeInterval(60)
    @State private var sending = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, accounts: [Account], defaultKey: String?, onScheduled: @escaping () -> Void) {
        self.client = client
        self.accounts = accounts
        self.onScheduled = onScheduled
        _targetKeys = State(initialValue: defaultKey.map { [$0] } ?? [])
    }

    private var targets: [Account] { accounts.filter { targetKeys.contains($0.key) } }
    private var platforms: [PlatformId] { PlatformId.allCases.filter { p in targets.contains { $0.platform == p } } }
    private var overLimit: Bool { platforms.contains { $0.length(text) > $0.maxLength } }
    /// Chosen platforms Kyrelo can't send images to: their posts go without the photo.
    private var noPhoto: [PlatformId] { photo == nil ? [] : platforms.filter { $0.maxImageBytes == 0 } }
    /// A chosen platform that needs a photo (Instagram) while there isn't one.
    private var needsPhoto: PlatformId? { photo == nil ? platforms.first(where: \.requiresImage) : nil }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextEditor(text: $text).frame(minHeight: 140)
                    HStack(spacing: 12) {
                        ForEach(platforms, id: \.self) { p in
                            Text("\(platforms.count > 1 || p != .twitter ? "\(p.label) " : "")\(p.length(text)) / \(p.maxLength)")
                                .font(.inter(.caption))
                                .foregroundStyle(p.length(text) > p.maxLength ? Theme.error : Theme.muted)
                        }
                    }
                }
                Section("Photo") {
                    PhotoField(photo: $photo)
                    if let needsPhoto {
                        Text("\(needsPhoto.label) posts need a photo. Add one, or turn \(needsPhoto.label) off below.")
                            .font(.inter(.caption)).foregroundStyle(Theme.warning)
                    }
                    if !noPhoto.isEmpty {
                        Text("\(noPhoto.map(\.label).joined(separator: " and ")) posts are sent without the photo: Kyrelo can't post images there.")
                            .font(.inter(.caption)).foregroundStyle(Theme.muted)
                    }
                }
                if accounts.count > 1 {
                    Section("Post to") {
                        ForEach(accounts) { account in
                            Toggle(isOn: Binding(
                                get: { targetKeys.contains(account.key) },
                                set: { on in if on { targetKeys.insert(account.key) } else { targetKeys.remove(account.key) } }
                            )) {
                                Text("\(account.platform.label)  @\(account.handle)")
                            }
                        }
                    }
                }
                Section {
                    DatePicker("When", selection: $date, in: Date()...)
                }
                if let error { Section { Text(error).foregroundStyle(Theme.error) } }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("New post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Scheduling…" : targets.count > 1 ? "Schedule \(targets.count)" : "Schedule", action: schedule)
                        .disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || targets.isEmpty || overLimit || needsPhoto != nil)
                }
            }
        }
    }

    private func schedule() {
        sending = true
        error = nil
        Task {
            defer { sending = false }
            // One upload, sized for the strictest platform chosen (Bluesky: 1 MB).
            var imagePath: String?
            if let photo, platforms.contains(where: { $0.maxImageBytes > 0 }) {
                do {
                    imagePath = try await client.uploadPhoto(photo, for: platforms.filter { $0.maxImageBytes > 0 })
                } catch {
                    self.error = error.localizedDescription
                    return
                }
            }
            var failures: [String] = []
            for account in targets {
                do {
                    let photoPath = account.platform.maxImageBytes > 0 ? imagePath : nil
                    try await client.schedulePost(on: account, text: text, at: date, imagePath: photoPath)
                } catch {
                    failures.append("\(account.platform.label) @\(account.handle): \(error.localizedDescription)")
                }
            }
            onScheduled()
            if failures.isEmpty { dismiss() } else { error = "Some posts weren't scheduled:\n" + failures.joined(separator: "\n") }
        }
    }
}

/// Edits or cancels a pending post.
struct EditPostSheet: View {
    let client: BridgeClient
    let post: ScheduledPost
    let onChanged: () -> Void

    @State private var text: String
    @State private var date: Date
    @State private var photo: Data?
    @State private var removeExisting = false
    @State private var saving = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, post: ScheduledPost, onChanged: @escaping () -> Void) {
        self.client = client
        self.post = post
        self.onChanged = onChanged
        _text = State(initialValue: post.text)
        _date = State(initialValue: ISODate.parse(post.scheduledFor) ?? Date())
    }

    private var length: Int { post.platform.length(text) }
    /// Instagram posts can't lose their photo.
    private var needsPhoto: Bool {
        post.platform.requiresImage && photo == nil && (removeExisting || post.imagePath == nil)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextEditor(text: $text).frame(minHeight: 140)
                    Text("\(length) / \(post.platform.maxLength)")
                        .font(.inter(.caption)).foregroundStyle(length > post.platform.maxLength ? Theme.error : Theme.muted)
                }
                // Threads posts are text only (PlatformRules.maxImageBytes 0).
                if post.platform.maxImageBytes > 0 {
                    Section("Photo") {
                        PhotoField(
                            photo: $photo,
                            existing: post.imagePath.flatMap { removeExisting ? nil : (client, $0) },
                            onRemoveExisting: { removeExisting = true }
                        )
                        if needsPhoto {
                            Text("\(post.platform.label) posts need a photo.").font(.inter(.caption)).foregroundStyle(Theme.warning)
                        }
                    }
                }
                Section { DatePicker("When", selection: $date) }
                Section {
                    Button("Cancel this post", role: .destructive) { run { try await client.cancelPost(id: post.id) } }
                }
                if let error { Section { Text(error).foregroundStyle(Theme.error) } }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("Edit \(post.platform.label) post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { run { try await save() } }
                        .disabled(saving || length > post.platform.maxLength || text.trimmingCharacters(in: .whitespaces).isEmpty || needsPhoto)
                }
            }
        }
    }

    private func save() async throws {
        let image: BridgeClient.ImageChange
        if let photo {
            image = .set(try await client.uploadPhoto(photo, for: [post.platform]))
        } else if removeExisting {
            image = .remove
        } else {
            image = .keep
        }
        try await client.updatePost(id: post.id, text: text, at: date, image: image)
    }

    private func run(_ action: @escaping () async throws -> Void) {
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await action()
                onChanged()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
