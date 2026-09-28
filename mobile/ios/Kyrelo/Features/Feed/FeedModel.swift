import Foundation
import Observation

/// The Monitor feed and settings, kept fresh from the desktop.
@Observable
@MainActor
final class FeedModel {
    let client: BridgeClient
    var tweets: [SeenTweet] = []
    var lastCheckedAt: String?
    var settings: MonitorSettings?
    var error: String?
    var checking = false
    /// Set when the desktop refuses our pairing token.
    var unpaired = false

    init(client: BridgeClient) {
        self.client = client
    }

    func load() async {
        do {
            async let feed = client.feed()
            async let current = client.settings()
            let (state, s) = try await (feed, current)
            tweets = state.tweets.sorted { $0.sortDate > $1.sortDate }
            lastCheckedAt = state.lastCheckedAt
            settings = s
            error = nil
        } catch BridgeError.unpaired {
            unpaired = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func checkNow() async {
        checking = true
        defer { checking = false }
        do {
            try await client.checkNow()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func setWatching(_ enabled: Bool) async {
        do {
            settings = try await client.setWatching(enabled)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func saveAutopilot(_ autopilot: AutopilotSettings) async throws {
        settings = try await client.setAutopilot(autopilot)
    }
}
