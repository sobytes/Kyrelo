import SwiftUI

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
        case .facebook: "Facebook"
        case .telegram: "Telegram"
        case .discord: "Discord"
        }
    }

    /// The service's mark, as the desktop draws it (contracts/service-icons.json,
    /// generated into the asset catalog by desktop/scripts/generate-service-icons.mjs).
    var icon: Image { Image("Service-\(rawValue)") }

    var maxLength: Int {
        switch self {
        case .twitter: 4000
        case .bluesky: 300
        case .mastodon, .threads: 500
        case .instagram: 2200 // the caption limit
        case .facebook: 63_206
        case .telegram: 4096
        case .discord: 2000
        }
    }

    /// Largest image file the platform accepts on a post.
    var maxImageBytes: Int {
        switch self {
        case .twitter, .mastodon, .instagram, .facebook, .telegram, .discord: 5 * 1024 * 1024
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
        case .facebook: URL(string: "https://www.facebook.com/login/")!
        case .telegram: URL(string: "https://t.me/BotFather")!
        case .discord: URL(string: "https://support.discord.com/hc/en-us/articles/228383668")!
        }
    }

    /// What the credentials screen says, and its link to where they come from.
    var credentialsHint: (text: String, link: String) {
        switch self {
        case .bluesky: ("Use an app password, not your main password.", "Create an app password")
        case .telegram: ("Make a bot with @BotFather, add it to your channel as an admin that can post, then paste its token and the channel's @name.", "Open @BotFather")
        case .discord: ("In the channel's settings, open Integrations → Webhooks, make one and paste its URL.", "Discord's webhook guide")
        case .threads: ("Threads needs a token from a Meta developer app. The steps are on the Threads page in Kyrelo on your computer; paste the token here.", "Meta's Threads API guide")
        // Not credentials platforms: they never show this screen.
        case .twitter, .mastodon, .instagram, .facebook: ("", "Open \(label)")
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
        case .facebook: URL(string: "https://www.facebook.com/r.php")!
        case .telegram: URL(string: "https://telegram.org/")!
        case .discord: URL(string: "https://discord.com/register")!
        }
    }

    /// How an account is connected, as the desktop's PLATFORMS[..].connect.
    var connect: ConnectMethod {
        switch self {
        case .twitter, .instagram, .facebook: .browser
        case .bluesky: .credentials([
            CredentialField(key: "handle", placeholder: "yourname.bsky.social", secret: false),
            CredentialField(key: "appPassword", placeholder: "App password", secret: true),
        ])
        case .mastodon: .oauth
        case .threads: .credentials([CredentialField(key: "token", placeholder: "Threads access token", secret: true)])
        case .telegram: .credentials([
            CredentialField(key: "token", placeholder: "Bot token from @BotFather", secret: true),
            CredentialField(key: "handle", placeholder: "@yourchannel", secret: false),
        ])
        case .discord: .credentials([CredentialField(key: "webhookUrl", placeholder: "Webhook URL", secret: true)])
        }
    }

    /// The longest post an auto campaign writes here: short enough to read as
    /// a social post, even where the platform allows far more. As the desktop's
    /// PlatformSpec.campaignLimit.
    var campaignLimit: Int {
        switch self {
        case .twitter: ReplyRules.campaignMaxLength // X's standard 280, not Premium's
        case .bluesky: 300
        case .mastodon, .threads, .facebook, .telegram, .discord: 500
        case .instagram: 2200
        }
    }

    /// Post length as this platform counts it.
    func length(_ text: String) -> Int {
        switch self {
        case .twitter: ReplyRules.length(text) // links count 23
        case .bluesky, .threads, .instagram, .facebook, .discord: text.count // what a person sees; links in full
        case .telegram: text.utf16.count // Telegram counts UTF-16 units
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
