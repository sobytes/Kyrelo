import Foundation

// The desktop's Scheduler and campaign data (desktop/lib/types.ts).
// contracts/scheduler.json is a sample both apps are tested against.

enum PlatformId: String, Codable, CaseIterable {
    case twitter, bluesky, mastodon, threads, instagram, facebook
}

/// A list from the desktop, skipping items this app can't read. The desktop
/// and the phone update separately: an older desktop may still send an
/// account or post on a platform this app has dropped (LinkedIn, removed in
/// September 2026), and one of those mustn't hide all the others.
struct LossyList<Element: Decodable>: Decodable {
    let items: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var items: [Element] = []
        while !container.isAtEnd {
            if let item = try? container.decode(Element.self) {
                items.append(item)
            } else {
                _ = try container.decode(Skipped.self)
            }
        }
        self.items = items
    }

    private struct Skipped: Decodable {}
}

struct Account: Decodable, Hashable, Identifiable {
    let platform: PlatformId
    let id: String
    let handle: String
    /// When it was connected (ISO); missing from older desktops.
    let addedAt: String?

    /// Accounts are identified by platform + id: the same handle can exist on several platforms.
    var key: String { "\(platform.rawValue):\(id)" }
}

enum PostStatus: String, Decodable {
    case pending, posting, posted, failed
}

struct ScheduledPost: Decodable, Identifiable, Hashable {
    let id: String
    let platform: PlatformId
    /// Missing on posts made before accounts were chosen per post.
    let accountId: String?
    let text: String
    let imagePath: String?
    let scheduledFor: String
    let status: PostStatus
    /// Set once the browser is open and the post is really being sent.
    let sendingStartedAt: String?
    let postedAt: String?
    let postedUrl: String?
    let error: String?
    let campaignId: String?
}

enum CampaignStatus: String, Decodable {
    case researching, writing, media, review, scheduled, discarded, failed

    var isRunning: Bool { self == .researching || self == .writing || self == .media }
}

/// An account a campaign posts to.
struct CampaignTarget: Codable, Hashable {
    let platform: PlatformId
    let accountId: String
}

struct Campaign: Decodable, Identifiable {
    let id: String
    let accountId: String
    /// Where every post goes. Missing from desktops before campaigns could
    /// post to several platforms: those posted to one X account.
    let targets: [CampaignTarget]?
    var platforms: [PlatformId] {
        let list = targets?.map(\.platform) ?? [.twitter]
        return PlatformId.allCases.filter(list.contains)
    }
    let count: Int
    let autoSchedule: Bool
    let status: CampaignStatus
    let progress: String
    let drafts: [CampaignDraft]
    let error: String?
    let createdAt: String
}

struct CampaignDraft: Decodable, Identifiable, Hashable {
    struct Media: Decodable, Hashable {
        let kind: String
        let imagePath: String?
        let note: String?
    }

    let id: String
    let angle: String
    let text: String
    let media: Media
    let sources: [String]
    let scheduledFor: String
}

/// GET /api/campaigns: recent campaigns and whether AI is set up.
struct CampaignsInfo: Decodable {
    let campaigns: [Campaign]
    let provider: String
    let aiReady: Bool
    let openaiKey: Bool
}

struct BrandProfile: Decodable {
    let brief: String
    let url: String
    let competitors: String
}

/// Dates as the desktop reads and writes them.
enum ISODate {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ s: String) -> Date? { withFraction.date(from: s) ?? plain.date(from: s) }
    static func string(_ date: Date) -> String { withFraction.string(from: date) }
}
