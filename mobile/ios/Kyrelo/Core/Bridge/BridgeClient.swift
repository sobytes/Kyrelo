import Foundation

enum BridgeError: LocalizedError {
    /// The computer answered but refused the pairing token.
    case unpaired
    case unreachable(host: String)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unpaired:
            "This phone isn't paired any more. Scan the code in Kyrelo's Settings again."
        case let .unreachable(host):
            "Couldn't reach your computer at \(host). Is Kyrelo running, and are you on the same Wi-Fi or Tailscale?"
        case let .server(message):
            message
        }
    }
}

/// Talks to Kyrelo's phone bridge (desktop/lib/mobile-bridge.ts). Each method
/// is one of the Monitor endpoints the bridge allows; the desktop's own routes
/// do the work, so the phone follows the same rules as the desktop.
final class BridgeClient {
    let pairing: Pairing
    /// The address that answered last time, tried first.
    private var lastGoodHost: String?

    init(pairing: Pairing) {
        self.pairing = pairing
    }

    func ping() async throws {
        _ = try await request(Empty.self, "GET", "/ping")
    }

    func feed() async throws -> GrokState {
        try await request(StateResponse.self, "GET", "/api/grok-state").state
    }

    func settings() async throws -> MonitorSettings {
        try await request(SettingsResponse.self, "GET", "/api/grok-settings").settings
    }

    /// The settings route takes partial updates.
    func setWatching(_ enabled: Bool) async throws -> MonitorSettings {
        try await request(SettingsResponse.self, "PUT", "/api/grok-settings", body: ["enabled": enabled]).settings
    }

    func setAutopilot(_ autopilot: AutopilotSettings) async throws -> MonitorSettings {
        try await request(SettingsResponse.self, "PUT", "/api/grok-settings", body: AutopilotPatch(autopilot: autopilot)).settings
    }

    /// Scrapes the watched handles now (and drafts, if Autopilot is on).
    func checkNow() async throws {
        let r = try await request(CheckResponse.self, "POST", "/api/grok-run", slow: true)
        if let error = r.error { throw BridgeError.server(error) }
    }

    /// Drafts replies for one tweet, whatever its score (the user asked).
    func draft(tweetId: String) async throws -> ReplyDraft {
        let r = try await request(DraftResponse.self, "POST", "/api/grok-reply",
                                  body: ["action": "draft", "tweetId": tweetId], slow: true)
        guard let draft = r.draft, !draft.options.isEmpty else {
            throw BridgeError.server(r.error ?? "No draft came back. Try again.")
        }
        return draft
    }

    func markReplied(tweetId: String, text: String) async throws {
        _ = try await request(Empty.self, "POST", "/api/grok-reply",
                              body: ["action": "mark", "tweetId": tweetId, "replyText": text])
    }

    // MARK: - Scheduler

    func accounts() async throws -> [Account] {
        try await request(AccountsResponse.self, "GET", "/api/accounts").accounts
    }

    func posts() async throws -> [ScheduledPost] {
        try await request(PostsResponse.self, "GET", "/api/scheduler/posts").posts
    }

    /// One post per account: the desktop sends, tracks and retries each on its own.
    func schedulePost(on account: Account, text: String, at date: Date) async throws {
        _ = try await request(Empty.self, "POST", "/api/scheduler/posts", body: NewPost(
            platform: account.platform.rawValue, accountId: account.id, text: text, scheduledFor: ISODate.string(date)
        ))
    }

    func updatePost(id: String, text: String, at date: Date) async throws {
        _ = try await request(Empty.self, "PATCH", "/api/scheduler/posts/\(id)",
                              body: ["text": text, "scheduledFor": ISODate.string(date)])
    }

    func cancelPost(id: String) async throws {
        _ = try await request(Empty.self, "DELETE", "/api/scheduler/posts/\(id)")
    }

    /// An image attached to a post or campaign draft.
    func image(_ filename: String) async throws -> Data {
        try await raw("GET", "/api/scheduler/uploads/\(filename)")
    }

    // MARK: - Auto campaigns

    func campaignsInfo() async throws -> CampaignsInfo {
        try await request(CampaignsInfo.self, "GET", "/api/campaigns")
    }

    func brandProfile() async throws -> BrandProfile {
        try await request(BrandProfileResponse.self, "GET", "/api/brand-profile").profile
    }

    func startCampaign(_ start: CampaignStart) async throws -> Campaign {
        try await request(CampaignResponse.self, "POST", "/api/campaigns", body: start).campaign
    }

    func campaign(id: String) async throws -> Campaign {
        try await request(CampaignResponse.self, "GET", "/api/campaigns/\(id)").campaign
    }

    func scheduleCampaign(id: String, drafts: [DraftEdit]) async throws -> Campaign {
        try await request(CampaignResponse.self, "POST", "/api/campaigns/\(id)/schedule", body: ["drafts": drafts]).campaign
    }

    func discardCampaign(id: String) async throws {
        _ = try await request(Empty.self, "DELETE", "/api/campaigns/\(id)")
    }

    /// What the campaign form sends (desktop: POST /api/campaigns).
    struct CampaignStart: Encodable {
        let accountId: String
        let brief: String
        let url: String
        let competitors: String
        let count: Int
        let windowMinutes: Int
        let useAiImages: Bool
        let autoSchedule: Bool
    }

    /// A reviewed draft (desktop: DraftEdit in lib/campaign.ts). Drafts left out are dropped.
    struct DraftEdit: Encodable {
        let id: String
        let text: String
        let scheduledFor: String
        let removeImage: Bool
    }

    // MARK: - Transport

    private func request<T: Decodable>(
        _ type: T.Type, _ method: String, _ path: String, body: (any Encodable)? = nil, slow: Bool = false
    ) async throws -> T {
        let data = try await raw(method, path, body: body, slow: slow)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Sends one request, trying each of the computer's addresses; returns the body.
    private func raw(_ method: String, _ path: String, body: (any Encodable)? = nil, slow: Bool = false) async throws -> Data {
        let hosts = lastGoodHost.map { good in [good] + pairing.hosts.filter { $0 != good } } ?? pairing.hosts
        var lastHost = hosts.first ?? "?"
        for host in hosts {
            lastHost = host
            guard let url = URL(string: "http://\(host):\(pairing.port)\(path)") else { continue }
            var req = URLRequest(url: url)
            req.httpMethod = method
            // Drafting and checking call the AI or scrape X, so allow longer.
            req.timeoutInterval = slow ? 120 : 8
            req.setValue("Bearer \(pairing.token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let body { req.httpBody = try JSONEncoder().encode(body) }

            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await URLSession.shared.data(for: req)
            } catch {
                continue // try the next address
            }
            lastGoodHost = host
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { throw BridgeError.unpaired }
            guard (200..<300).contains(status) else {
                let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
                throw BridgeError.server(message ?? "Kyrelo answered \(status).")
            }
            return data
        }
        throw BridgeError.unreachable(host: lastHost)
    }

    private struct Empty: Decodable {}
    private struct ErrorResponse: Decodable { let error: String? }
    private struct StateResponse: Decodable { let state: GrokState }
    private struct SettingsResponse: Decodable { let settings: MonitorSettings }
    private struct CheckResponse: Decodable { let error: String? }
    private struct DraftResponse: Decodable { let draft: ReplyDraft?; let error: String? }
    private struct AutopilotPatch: Encodable { let autopilot: AutopilotSettings }
    private struct AccountsResponse: Decodable { let accounts: [Account] }
    private struct PostsResponse: Decodable { let posts: [ScheduledPost] }
    private struct CampaignResponse: Decodable { let campaign: Campaign }
    private struct BrandProfileResponse: Decodable { let profile: BrandProfile }
    private struct NewPost: Encodable { let platform: String; let accountId: String; let text: String; let scheduledFor: String }
}
