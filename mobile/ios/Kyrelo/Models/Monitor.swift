import Foundation

// What the desktop's Monitor endpoints return (desktop/lib/types.ts). Fields
// the phone doesn't use are simply not decoded. contracts/monitor-feed.json is
// a sample both apps are tested against.

struct GrokState: Decodable {
    let lastCheckedAt: String?
    let tweets: [SeenTweet]
}

struct SeenTweet: Decodable, Identifiable, Hashable {
    let id: String
    let handle: String
    let text: String
    let url: String
    let isReply: Bool
    let seenAt: String
    let postedAt: String?
    let repliedAt: String?
    let replyText: String?
    let draft: ReplyDraft?

    /** When it was posted, or first seen if X didn't give a time. */
    var sortDate: String { postedAt ?? seenAt }
}

/// Autopilot's verdict on a tweet. `options` is empty when it was skipped.
struct ReplyDraft: Decodable, Hashable {
    let score: Int
    let reason: String
    let options: [String]
}

enum ReplyTone: String, Codable, CaseIterable, Identifiable {
    case curious, contrarian, supportive, witty, expert
    var id: String { rawValue }
}

enum ReplyStyle: String, Codable, CaseIterable, Identifiable {
    case grok, direct, mix
    var id: String { rawValue }

    var label: String {
        switch self {
        case .grok: "Ask @grok"
        case .direct: "Direct"
        case .mix: "Mix"
        }
    }
}

struct AutopilotSettings: Codable, Equatable {
    var enabled: Bool
    var tone: ReplyTone
    var style: ReplyStyle
    /// 0–100: tweets scoring below this are skipped.
    var minScore: Int
    /// 0–1: higher gives more varied wording.
    var creativity: Double
    var topics: String
    var avoid: String
}

/// The part of the desktop's Monitor settings the phone shows and changes.
struct MonitorSettings: Decodable {
    let enabled: Bool
    let handles: [String]
    let autopilot: AutopilotSettings
}
