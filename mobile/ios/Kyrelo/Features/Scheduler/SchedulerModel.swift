import Foundation
import Observation

/// Accounts and scheduled posts, kept fresh from the desktop.
@Observable
@MainActor
final class SchedulerModel {
    let client: BridgeClient
    var accounts: [Account] = []
    var posts: [ScheduledPost] = []
    /// The account being viewed (Account.key).
    var selectedKey: String?
    var loaded = false
    var error: String?

    init(client: BridgeClient) {
        self.client = client
    }

    var selected: Account? { accounts.first { $0.key == selectedKey } }

    private var selectedPosts: [ScheduledPost] {
        guard let selected else { return [] }
        return posts.filter { $0.platform == selected.platform && $0.accountId == selected.id }
    }

    var upcoming: [ScheduledPost] {
        selectedPosts.filter { $0.status == .pending || $0.status == .posting }.sorted { $0.scheduledFor < $1.scheduledFor }
    }

    var history: [ScheduledPost] {
        selectedPosts.filter { $0.status == .posted || $0.status == .failed }.sorted { $0.scheduledFor > $1.scheduledFor }
    }

    func load() async {
        do {
            async let a = client.accounts()
            async let p = client.posts()
            (accounts, posts) = try await (a, p)
            if selected == nil { selectedKey = accounts.first?.key }
            loaded = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func cancel(_ post: ScheduledPost) async {
        do {
            try await client.cancelPost(id: post.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
