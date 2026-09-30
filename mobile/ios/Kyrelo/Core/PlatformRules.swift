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
        case .instagram: "Instagram"
        }
    }

    /// A letter mark for the service, where there is no room for its name.
    var mark: String {
        switch self {
        case .twitter: "X"
        case .bluesky: "B"
        case .mastodon: "M"
        case .threads: "T"
        case .instagram: "I"
        }
    }

    var maxLength: Int {
        switch self {
        case .twitter: 4000
        case .bluesky: 300
        case .mastodon, .threads: 500
        case .instagram: 2200 // the caption limit
        }
    }

    /// Largest image file the platform accepts on a post.
    var maxImageBytes: Int {
        switch self {
        case .twitter, .mastodon, .instagram: 5 * 1024 * 1024
        case .bluesky: 1_000_000
        // Threads' API only takes images from a public web address.
        case .threads: 0
        }
    }

    /// Every post needs an image (Instagram): text-only posts can't go there.
    var requiresImage: Bool { self == .instagram }

    /// The image files it takes, by extension, if not all of Kyrelo's.
    var imageTypes: [String]? { self == .instagram ? ["jpg", "jpeg", "png"] : nil }

    /// Why a post with this image (or none) can't go here, or nil if it can.
    /// Same rules and words as the desktop's postImageError.
    func imageError(_ imagePath: String?) -> String? {
        guard let imagePath else { return requiresImage ? "\(label) posts need a photo" : nil }
        if maxImageBytes == 0 { return "Kyrelo can't post images to \(label)" }
        let ext = (imagePath as NSString).pathExtension.lowercased()
        if let imageTypes, !imageTypes.contains(ext) { return "\(label) takes JPEG or PNG photos" }
        return nil
    }

    /// Where to log in, or to create the credentials Kyrelo asks for.
    var loginUrl: URL {
        switch self {
        case .twitter: URL(string: "https://x.com/login")!
        case .bluesky: URL(string: "https://bsky.app/settings/app-passwords")!
        case .mastodon: URL(string: "https://joinmastodon.org/servers")!
        case .threads: URL(string: "https://developers.facebook.com/docs/threads/get-started")!
        case .instagram: URL(string: "https://www.instagram.com/accounts/login/")!
        }
    }

    /// Where to make an account, for someone who doesn't have one yet.
    var signupUrl: URL {
        switch self {
        case .twitter: URL(string: "https://x.com/i/flow/signup")!
        case .bluesky: URL(string: "https://bsky.app/")!
        case .mastodon: URL(string: "https://joinmastodon.org/servers")!
        case .threads: URL(string: "https://www.threads.com/login")!
        case .instagram: URL(string: "https://www.instagram.com/accounts/emailsignup/")!
        }
    }

    /// How an account is connected, as the desktop's PLATFORMS[..].connect.
    var connect: ConnectMethod {
        switch self {
        case .twitter, .instagram: .browser
        case .bluesky: .credentials([
            CredentialField(key: "handle", placeholder: "yourname.bsky.social", secret: false),
            CredentialField(key: "appPassword", placeholder: "App password", secret: true),
        ])
        case .mastodon: .oauth
        case .threads: .credentials([CredentialField(key: "token", placeholder: "Threads access token", secret: true)])
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
        case .bluesky, .threads, .instagram: text.count // what a person sees; links in full
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

/// Signing in through Chrome on the computer (so not from the phone),
/// fields the user types, or approving Kyrelo on the platform's own page.
enum ConnectMethod {
    case browser
    case credentials([CredentialField])
    case oauth
}

struct CredentialField {
    /// The desktop's field name (lib/platforms.ts CredentialField.key).
    let key: String
    let placeholder: String
    let secret: Bool
}
