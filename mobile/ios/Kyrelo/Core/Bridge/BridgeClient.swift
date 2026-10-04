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
        case .unreachable:
            "Can't reach your computer. Check Kyrelo is open on it, and that your phone is on the same Wi-Fi."
        case let .server(message):
            message
        }
    }
}

/// Talks to Kyrelo's phone bridge (desktop/lib/mobile-bridge.ts). Each method
/// is one of the endpoints the bridge allows; the desktop's own routes
/// do the work, so the phone follows the same rules as the desktop.
@Observable
final class BridgeClient {
    let pairing: Pairing
    /// The last request found none of the computer's addresses (NotConnectedView).
    private(set) var cantReach = false
    /// The address that answered last time, tried first.
    @ObservationIgnored private var lastGoodHost: String?

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

    // MARK: Comments

    func comments() async throws -> CommentsResponse {
        try await request(CommentsResponse.self, "GET", "/api/comments")
    }

    func commentSettings() async throws -> CommentSettings {
        try await request(CommentSettingsResponse.self, "GET", "/api/comments/settings").settings
    }

    func saveCommentSettings(_ settings: CommentSettings) async throws -> CommentSettings {
        try await request(CommentSettingsResponse.self, "PUT", "/api/comments/settings", body: settings).settings
    }

    /// Reads new comments now, even with background checks off.
    func checkComments() async throws {
        _ = try await request(Empty.self, "POST", "/api/comments", body: ["action": "check"], slow: true)
    }

    func draftComment(id: String) async throws -> ReplyDraft {
        let r = try await request(DraftResponse.self, "POST", "/api/comments", body: ["action": "draft", "id": id], slow: true)
        guard let draft = r.draft else { throw BridgeError.server(r.error ?? "Couldn't draft replies.") }
        return draft
    }

    /// Sends the reply from the computer, on the comment's platform.
    func replyToComment(id: String, text: String) async throws {
        _ = try await request(Empty.self, "POST", "/api/comments", body: ["action": "send", "id": id, "text": text], slow: true)
    }

    func dismissComment(id: String) async throws {
        _ = try await request(Empty.self, "POST", "/api/comments", body: CommentDismiss(id: id))
    }

    // MARK: Media

    func mediaLibrary() async throws -> MediaLibrary {
        try await request(MediaLibrary.self, "GET", "/api/media-library")
    }

    /// Sends a prepared photo (JPEG) or video (MP4, with its poster frame) to
    /// the computer's Media library. Images are described by the AI when
    /// `description` is empty; a video's poster is.
    func uploadMedia(_ media: Data, isVideo: Bool, poster: Data?, description: String, bucketId: String?) async throws -> MediaItem {
        let boundary = "kyrelo-\(UUID().uuidString)"
        var form = Data()
        func appendField(_ name: String, _ value: String) {
            form.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        func appendFile(_ name: String, _ filename: String, _ type: String, _ data: Data) {
            form.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".utf8))
            form.append(Data("Content-Type: \(type)\r\n\r\n".utf8))
            form.append(data)
            form.append(Data("\r\n".utf8))
        }
        appendFile("file", isVideo ? "video.mp4" : "photo.jpg", isVideo ? "video/mp4" : "image/jpeg", media)
        if let poster { appendFile("poster", "poster.jpg", "image/jpeg", poster) }
        if !description.isEmpty { appendField("description", description) }
        if let bucketId { appendField("bucketId", bucketId) }
        form.append(Data("--\(boundary)--\r\n".utf8))
        let data = try await raw("POST", "/api/media-library", rawBody: form,
                                 contentType: "multipart/form-data; boundary=\(boundary)", timeout: 900)
        return try JSONDecoder().decode(MediaItemResponse.self, from: data).item
    }

    func updateMedia(id: String, description: String? = nil, bucketIds: [String]? = nil) async throws {
        _ = try await request(Empty.self, "PATCH", "/api/media-library/\(id)", body: MediaPatch(description: description, bucketIds: bucketIds))
    }

    /// Takes it out of the library; posts already scheduled with it keep it.
    func deleteMedia(id: String) async throws {
        _ = try await request(Empty.self, "DELETE", "/api/media-library/\(id)")
    }

    func createBucket(name: String) async throws -> MediaBucket {
        try await request(BucketResponse.self, "POST", "/api/media-buckets", body: ["name": name]).bucket
    }

    func accounts() async throws -> [Account] {
        try await request(AccountsResponse.self, "GET", "/api/accounts").accounts.items
    }

    func posts() async throws -> [ScheduledPost] {
        try await request(PostsResponse.self, "GET", "/api/scheduler/posts").posts.items
    }

    /// One post per account: the desktop sends, tracks and retries each on its own.
    /// `imagePath` is a filename returned by uploadPhoto, or a Media library
    /// image's; `videoPath` a Media library video's.
    func schedulePost(on account: Account, text: String, at date: Date, imagePath: String?, videoPath: String? = nil) async throws {
        _ = try await request(Empty.self, "POST", "/api/scheduler/posts", body: NewPost(
            platform: account.platform.rawValue, accountId: account.id, text: text,
            scheduledFor: ISODate.string(date), imagePath: imagePath, videoPath: videoPath
        ))
    }

    enum ImageChange { case keep, remove, set(String) }

    func updatePost(id: String, text: String, at date: Date, image: ImageChange) async throws {
        var body: [String: String?] = ["text": text, "scheduledFor": ISODate.string(date)]
        switch image {
        case .keep: break
        case .remove: body["imagePath"] = .some(nil) // JSON null: remove the image
        case let .set(filename): body["imagePath"] = filename
        }
        _ = try await request(Empty.self, "PATCH", "/api/scheduler/posts/\(id)", body: body)
    }

    /// Uploads a prepared JPEG (PhotoPrep) and returns its filename on the computer.
    func uploadPhoto(_ jpeg: Data) async throws -> String {
        let boundary = "kyrelo-\(UUID().uuidString)"
        var form = Data()
        form.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n".utf8))
        form.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        form.append(jpeg)
        form.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let data = try await raw("POST", "/api/scheduler/upload", rawBody: form,
                                 contentType: "multipart/form-data; boundary=\(boundary)", slow: true)
        guard let filename = try JSONDecoder().decode(UploadResponse.self, from: data).filename else {
            throw BridgeError.server("The photo didn't upload. Try again.")
        }
        return filename
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
        /// Where every post goes, on any platforms.
        let targets: [CampaignTarget]
        /// The first target's account: desktops before multi-platform campaigns read only this.
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

    // MARK: - Monitor: watched handles and keywords

    func setHandles(_ handles: [String]) async throws -> MonitorSettings {
        try await request(SettingsResponse.self, "PUT", "/api/grok-settings", body: ["handles": handles]).settings
    }

    func setKeywords(_ keywords: [String]) async throws -> MonitorSettings {
        try await request(SettingsResponse.self, "PUT", "/api/grok-settings", body: ["keywords": keywords]).settings
    }

    // MARK: - X tools (the desktop runs them in its Chrome)

    func deleterJob() async throws -> DeleterJob? {
        try await request(DeleterResponse.self, "GET", "/api/deleter").job
    }

    func startDeleter(accountId: String, target: DeleteTarget, count: Int, startingAt: Int, includeReposts: Bool) async throws -> DeleterJob? {
        try await request(DeleterResponse.self, "POST", "/api/deleter", body: DeleterStart(
            accountId: accountId, target: target.rawValue, count: count, startingAt: startingAt, includeReposts: includeReposts
        )).job
    }

    /// The followed accounts with the desktop's verdict under these rules.
    func unfollowState(accountId: String, rules: UnfollowRules?) async throws -> UnfollowState {
        let json = String(decoding: try JSONEncoder().encode(rules ?? Self.defaultRules), as: UTF8.self)
        var q = URLComponents()
        q.queryItems = [URLQueryItem(name: "accountId", value: accountId), URLQueryItem(name: "rules", value: json)]
        return try await request(UnfollowState.self, "GET", "/api/unfollow?\(q.percentEncodedQuery ?? "")")
    }

    /// scan, activity (handles), unfollow (handles + rules), refollow (handles), keep (handle + keep).
    func unfollowAction(_ action: String, accountId: String, handles: [String] = [], handle: String? = nil,
                        keep: Bool? = nil, rules: UnfollowRules? = nil) async throws {
        _ = try await request(Empty.self, "POST", "/api/unfollow", body: UnfollowAction(
            action: action, accountId: accountId, handles: handles, handle: handle, keep: keep, rules: rules
        ))
    }

    func finderState(accountId: String) async throws -> FinderState {
        try await request(FinderState.self, "GET", "/api/handle-finder?accountId=\(accountId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? accountId)")
    }

    func startFinder(accountId: String, profile: BrandProfile) async throws {
        _ = try await request(Empty.self, "POST", "/api/handle-finder", body: FinderStart(
            action: "find", accountId: accountId, brief: profile.brief, url: profile.url, competitors: profile.competitors
        ))
    }

    func followSuggested(accountId: String, handles: [String]) async throws {
        _ = try await request(Empty.self, "POST", "/api/handle-finder", body: FinderFollow(action: "follow", accountId: accountId, handles: handles))
    }

    /// The desktop's defaults (lib/unfollow-rules.ts DEFAULT_RULES).
    static let defaultRules = UnfollowRules(dead: true, inactiveDays: 180, neverEngage: false, bots: true, notFollowingBack: false, protectBig: true)

    // MARK: - Connecting accounts (Bluesky, Mastodon, Threads; X signs in on the computer)

    /// Checks the credentials on the desktop and saves the account; returns its handle.
    func connectAccount(_ platform: PlatformId, fields: [String: String]) async throws -> String {
        try await request(ConnectResult.self, "POST", "/api/accounts/phone", body: PhoneConnect(
            action: "connect", platform: platform.rawValue, fields: fields
        ), slow: true).connected()
    }

    /// The server's "Authorize Kyrelo?" page; it redirects to kyrelo://mastodon.
    func startMastodon(server: String) async throws -> URL {
        let r = try await request(MastodonStart.self, "POST", "/api/accounts/phone", body: PhoneConnect(action: "mastodon-start", server: server), slow: true)
        guard let link = r.authorizeUrl, let url = URL(string: link) else { throw BridgeError.server(r.error ?? "Couldn't reach that server.") }
        return url
    }

    func finishMastodon(state: String, code: String) async throws -> String {
        try await request(ConnectResult.self, "POST", "/api/accounts/phone", body: PhoneConnect(
            action: "mastodon-finish", state: state, code: code
        ), slow: true).connected()
    }

    // MARK: - Transport

    private func request<T: Decodable>(
        _ type: T.Type, _ method: String, _ path: String, body: (any Encodable)? = nil, slow: Bool = false
    ) async throws -> T {
        let data = try await raw(method, path, body: body, slow: slow)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Sends one request, trying each of the computer's addresses; returns the body.
    private func raw(
        _ method: String, _ path: String, body: (any Encodable)? = nil,
        rawBody: Data? = nil, contentType: String = "application/json", slow: Bool = false, timeout: TimeInterval? = nil
    ) async throws -> Data {
        let hosts = lastGoodHost.map { good in [good] + pairing.hosts.filter { $0 != good } } ?? pairing.hosts
        var lastHost = hosts.first ?? "?"
        for host in hosts {
            lastHost = host
            guard let url = URL(string: "http://\(host):\(pairing.port)\(path)") else { continue }
            var req = URLRequest(url: url)
            req.httpMethod = method
            // Drafting and checking call the AI or scrape X, so allow longer.
            // Big uploads (a video) set their own.
            req.timeoutInterval = timeout ?? (slow ? 120 : 8)
            req.setValue("Bearer \(pairing.token)", forHTTPHeaderField: "Authorization")
            req.setValue(contentType, forHTTPHeaderField: "Content-Type")
            if let body { req.httpBody = try JSONEncoder().encode(body) } else if let rawBody { req.httpBody = rawBody }

            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await URLSession.shared.data(for: req)
            } catch {
                continue // try the next address
            }
            lastGoodHost = host
            await setCantReach(false)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { throw BridgeError.unpaired }
            guard (200..<300).contains(status) else {
                let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
                throw BridgeError.server(message ?? "Kyrelo answered \(status).")
            }
            return data
        }
        await setCantReach(true)
        throw BridgeError.unreachable(host: lastHost)
    }

    // The screens watch this, so change it on the main thread.
    @MainActor private func setCantReach(_ value: Bool) {
        if cantReach != value { cantReach = value }
    }

    private struct Empty: Decodable {}
    private struct ErrorResponse: Decodable { let error: String? }
    private struct StateResponse: Decodable { let state: GrokState }
    private struct SettingsResponse: Decodable { let settings: MonitorSettings }
    private struct CommentSettingsResponse: Decodable { let settings: CommentSettings }
    private struct MediaItemResponse: Decodable { let item: MediaItem }
    private struct BucketResponse: Decodable { let bucket: MediaBucket }
    private struct MediaPatch: Encodable {
        let description: String?
        let bucketIds: [String]?
    }
    private struct CommentDismiss: Encodable {
        let action = "dismiss"
        let id: String
        let dismissed = true
    }
    private struct CheckResponse: Decodable { let error: String? }
    private struct DraftResponse: Decodable { let draft: ReplyDraft?; let error: String? }
    private struct AutopilotPatch: Encodable { let autopilot: AutopilotSettings }
    private struct AccountsResponse: Decodable { let accounts: LossyList<Account> }
    private struct PostsResponse: Decodable { let posts: LossyList<ScheduledPost> }
    private struct CampaignResponse: Decodable { let campaign: Campaign }
    private struct BrandProfileResponse: Decodable { let profile: BrandProfile }
    private struct NewPost: Encodable {
        let platform: String
        let accountId: String
        let text: String
        let scheduledFor: String
        let imagePath: String?
        let videoPath: String?
    }
    private struct UploadResponse: Decodable { let filename: String? }
    private struct DeleterResponse: Decodable { let job: DeleterJob? }
    private struct DeleterStart: Encodable {
        let accountId: String
        let target: String
        let count: Int
        let startingAt: Int
        let includeReposts: Bool
    }
    private struct UnfollowAction: Encodable {
        let action: String
        let accountId: String
        let handles: [String]
        let handle: String?
        let keep: Bool?
        let rules: UnfollowRules?
    }
    private struct FinderStart: Encodable {
        let action: String
        let accountId: String
        let brief: String
        let url: String
        let competitors: String
    }
    private struct PhoneConnect: Encodable {
        let action: String
        var platform: String?
        var fields: [String: String]?
        var server: String?
        var state: String?
        var code: String?
    }
    /// { ok, handle } or { error }, as lib/accounts.ts ConnectResult.
    private struct ConnectResult: Decodable {
        let handle: String?
        let error: String?
        func connected() throws -> String {
            guard let handle else { throw BridgeError.server(error ?? "Couldn't connect.") }
            return handle
        }
    }
    private struct MastodonStart: Decodable { let authorizeUrl: String?; let error: String? }
    private struct FinderFollow: Encodable {
        let action: String
        let accountId: String
        let handles: [String]
    }
}
