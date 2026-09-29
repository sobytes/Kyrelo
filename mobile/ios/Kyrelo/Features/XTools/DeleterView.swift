import SwiftUI

/// X's Deleter, as on the desktop: pick what to remove and how many, then
/// the desktop does it in its Chrome while this follows the log.
struct DeleterView: View {
    let client: BridgeClient
    let accounts: [Account]
    @State private var accountId: String?
    @State private var target: DeleteTarget = .posts
    @State private var count = 10
    @State private var startingAt = 0
    @State private var includeReposts = false
    @State private var job: DeleterJob?
    @State private var confirming = false
    @State private var error: String?

    init(client: BridgeClient, accounts: [Account]) {
        self.client = client
        self.accounts = accounts
        _accountId = State(initialValue: accounts.first?.id)
    }

    var body: some View {
        List {
            if accounts.isEmpty {
                Text("Connect an X account in Kyrelo on your computer first.").foregroundStyle(Theme.muted)
            } else {
                Section {
                    XAccountPicker(accounts: accounts, selected: $accountId)
                    Picker("What to delete", selection: $target) {
                        ForEach(DeleteTarget.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Stepper("How many: \(count)", value: $count, in: 1...100)
                    Stepper("Keep the newest: \(startingAt)", value: $startingAt, in: 0...1000, step: 5)
                    if target == .posts { Toggle("Include reposts", isOn: $includeReposts) }
                } footer: {
                    Text(footer).font(.inter(.caption))
                }
                Section {
                    Button(target == .likes ? "Unlike \(count)" : "Delete \(count)", role: .destructive) { confirming = true }
                        .disabled(job?.running ?? false)
                }
                if let error { Text(error).foregroundStyle(Theme.error) }
                if let job {
                    Section("On your computer") {
                        JobLogView(
                            running: job.running,
                            summary: "\(job.deleted.count) \(job.target == .likes ? "unliked" : "deleted") · \(job.skipped.count) skipped",
                            log: job.log,
                            error: job.error
                        )
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .confirmationDialog(confirmText, isPresented: $confirming, titleVisibility: .visible) {
            Button(target == .likes ? "Unlike" : "Delete", role: .destructive) { Task { await start() } }
        }
        .task {
            // Follow a job while it runs, including one started on the desktop.
            while !Task.isCancelled {
                job = (try? await client.deleterJob()) ?? job
                try? await Task.sleep(for: .seconds(job?.running == true ? 2 : 10))
            }
        }
    }

    private var footer: String {
        switch target {
        case .posts: "Your own posts, newest first after the ones you keep. Pinned posts are never touched. Deleted posts can't be recovered."
        case .replies: "Your replies to other people; replies in your own threads are kept. Deleted replies can't be recovered."
        case .likes: "Unlikes posts, newest first. You can like them again."
        }
    }

    private var confirmText: String {
        let what = target == .posts && includeReposts ? "posts and reposts" : target.label.lowercased()
        return "\(target == .likes ? "Unlike" : "Remove") up to \(count) \(what), keeping the \(startingAt) newest?"
    }

    private func start() async {
        guard let accountId else { return }
        do {
            job = try await client.startDeleter(
                accountId: accountId, target: target, count: count, startingAt: startingAt,
                includeReposts: target == .posts && includeReposts
            )
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
