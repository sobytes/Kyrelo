import Foundation

/// Each platform's name, post limit and how it counts length, shared with the
/// desktop (desktop/lib/platforms.ts). Checked against
/// contracts/platform-rules.json by ContractTests, as the desktop's are.
extension PlatformId {
    var label: String {
        switch self {
        case .twitter: "X"
        case .bluesky: "Bluesky"
        }
    }

    /// The badge the desktop shows for this platform.
    var mark: String {
        switch self {
        case .twitter: "𝕏"
        case .bluesky: "🦋"
        }
    }

    var maxLength: Int {
        switch self {
        case .twitter: 4000
        case .bluesky: 300
        }
    }

    /// Largest image file the platform accepts on a post.
    var maxImageBytes: Int {
        switch self {
        case .twitter: 5 * 1024 * 1024
        case .bluesky: 1_000_000
        }
    }

    /// Post length as this platform counts it.
    func length(_ text: String) -> Int {
        switch self {
        case .twitter: ReplyRules.length(text) // links count 23
        case .bluesky: text.count // what a person sees; links in full
        }
    }
}
