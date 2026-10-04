import Foundation

// What the desktop's Comments endpoints return (desktop/lib/types.ts
// PostComment, CommentSettings). contracts/comments.json is a sample both
// apps are tested against.

struct CommentsResponse: Decodable {
    let state: CommentsState
    /// Accounts Comments checks.
    let accounts: LossyList<Account>
    /// Instagram and Facebook accounts that need a token, added on the computer.
    let needToken: LossyList<Account>
}

struct CommentsState: Decodable {
    let lastCheckedAt: String?
    /// Why an account couldn't be checked, by "platform:accountId".
    let accountErrors: [String: String]
    let comments: LossyList<PostComment>
}

/// A comment someone left on one of your posts.
struct PostComment: Decodable, Identifiable, Hashable {
    let id: String
    let platform: PlatformId
    let accountId: String
    let author: String
    let text: String
    let url: String
    let postedAt: String
    /// Your post it's on.
    let postText: String
    let draft: ReplyDraft?
    let repliedAt: String?
    let replyText: String?
    let replyUrl: String?
    let replyError: String?
    let dismissedAt: String?

    var isWaiting: Bool { repliedAt == nil && dismissedAt == nil }
}

struct CommentSettings: Codable, Equatable {
    var enabled: Bool
    var tone: ReplyTone
    var voiceNotes: String
    /// 0–100: comments scoring below this get no drafts.
    var minScore: Int
}
