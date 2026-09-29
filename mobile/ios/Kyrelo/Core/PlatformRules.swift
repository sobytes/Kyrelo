import Foundation

/// Each platform's name, post limit and how it counts length, shared with the
/// desktop (desktop/lib/platforms.ts). Checked against
/// contracts/platform-rules.json by ContractTests, as the desktop's are.
extension PlatformId {
    var label: String {
        switch self {
        case .twitter: "X"
        case .bluesky: "Bluesky"
        case .mastodon: "Mastodon"
        case .threads: "Threads"
        }
    }

    /// A letter mark for the service, where there is no room for its name.
    var mark: String {
        switch self {
        case .twitter: "X"
        case .bluesky: "B"
        case .mastodon: "M"
        case .threads: "T"
        }
    }

    var maxLength: Int {
        switch self {
        case .twitter: 4000
        case .bluesky: 300
        case .mastodon, .threads: 500
        }
    }

    /// Largest image file the platform accepts on a post.
    var maxImageBytes: Int {
        switch self {
        case .twitter, .mastodon: 5 * 1024 * 1024
        case .bluesky: 1_000_000
        // Threads' API only takes images from a public web address.
        case .threads: 0
        }
    }

    /// The longest post a campaign writes here: X's standard 280 (not X
    /// Premium's longer limit), the platform's own elsewhere. As the desktop's
    /// campaignLimit.
    var campaignLimit: Int { self == .twitter ? ReplyRules.campaignMaxLength : maxLength }

    /// Post length as this platform counts it.
    func length(_ text: String) -> Int {
        switch self {
        case .twitter: ReplyRules.length(text) // links count 23
        case .bluesky, .threads: text.count // what a person sees; links in full
        case .mastodon: Self.mastodonCountable(text).count
        }
    }

    /// Mastodon counts every link as 23 characters, and @user@server as @user.
    private static func mastodonCountable(_ text: String) -> String {
        text
            .replacingOccurrences(of: #"https?://\S+"#, with: String(repeating: "x", count: 23), options: .regularExpression)
            .replacingOccurrences(of: #"(@[\w.]+)@[\w.-]+\w"#, with: "$1", options: .regularExpression)
    }
}
