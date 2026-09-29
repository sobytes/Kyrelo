import Foundation

// X's own tools as the desktop reports them: the Deleter, Unfollow and the
// account finder (desktop/lib/deleter.ts, lib/unfollow.ts,
// lib/handle-finder.ts). contracts/x-tools.json is a sample both apps are
// tested against. The desktop does the work in its Chrome; the phone starts
// jobs and follows their log.

/// What the Deleter removes: posts (and reposts), replies to others, or likes.
enum DeleteTarget: String, Codable, CaseIterable {
    case posts, replies, likes

    var label: String {
        switch self {
        case .posts: "Posts"
        case .replies: "Replies"
        case .likes: "Likes"
        }
    }
}

struct DeleterJob: Decodable {
    let id: String
    let handle: String
    let target: DeleteTarget?
    let count: Int
    let running: Bool
    let deleted: [String]
    let skipped: [String]
    let log: [String]
    let error: String?
}

/// A job on the desktop's X browser (Unfollow's scan, checks and unfollows; the finder).
struct BrowserJob: Decodable {
    let id: String
    let kind: String
    let accountId: String
    let running: Bool
    let total: Int
    let done: Int
    let failed: Int
    let log: [String]
    let error: String?
}

struct UnfollowRules: Codable, Equatable {
    var dead: Bool
    var inactiveDays: Int
    var neverEngage: Bool
    var bots: Bool
    var notFollowingBack: Bool
    var protectBig: Bool
}

/// A followed account with what the rules say about it (worked out on the desktop).
struct UnfollowRow: Decodable, Identifiable, Hashable {
    let handle: String
    let name: String
    let followers: Int?
    let following: Int?
    let posts: Int?
    let followsYou: Bool
    let lastPostAt: String?
    let kept: Bool
    let reasons: [String]
    let protectedBecause: String?
    let needsActivityCheck: Bool

    var id: String { handle.lowercased() }
    var suggested: Bool { protectedBecause == nil && !reasons.isEmpty }
}

struct FollowChange: Decodable, Identifiable, Hashable {
    let handle: String
    let name: String
    let action: String
    let at: String
    let reasons: [String]

    var id: String { "\(handle)-\(at)" }
}

struct UnfollowState: Decodable {
    let job: BrowserJob?
    let rules: UnfollowRules
    let scannedAt: String?
    let hasStats: Bool
    let partial: Bool
    let rows: [UnfollowRow]
    let history: [FollowChange]
}

struct HandleSuggestion: Decodable, Identifiable, Hashable {
    let handle: String
    let name: String
    let group: String
    let reason: String
    let fromX: Bool
    let followers: Int?
    let lastPostAt: String?
    let youFollow: Bool

    var id: String { handle.lowercased() }
}

struct FinderState: Decodable {
    struct Dropped: Decodable, Hashable { let handle: String; let why: String }
    struct Data: Decodable {
        let suggestions: [HandleSuggestion]
        let dropped: [Dropped]
        let ranAt: String?
    }

    let job: BrowserJob?
    let data: Data
    let profile: BrandProfile
    let aiReady: Bool
}
