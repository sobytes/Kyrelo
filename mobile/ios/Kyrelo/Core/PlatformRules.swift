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
        case .linkedin: "LinkedIn"
        case .youtube: "YouTube"
        case .tiktok: "TikTok"
        case .slack: "Slack"
        case .devto: "DEV"
        case .hashnode: "Hashnode"
        case .wordpress: "WordPress"
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
        case .linkedin: 3000
        case .youtube: 5000
        case .tiktok: 2200
        case .slack: 4000
        case .devto, .hashnode, .wordpress: 100_000
        }
    }

    /// Largest image file the platform accepts on a post.
    var maxImageBytes: Int {
        switch self {
        case .twitter, .mastodon, .instagram, .facebook, .telegram, .discord, .linkedin, .wordpress: 5 * 1024 * 1024
        case .bluesky: 1_000_000
        // Threads' API only takes images from a public web address; YouTube takes videos.
        case .threads, .youtube, .tiktok, .slack, .devto, .hashnode: 0
        }
    }

    /// Largest video file the desktop can post here; 0 where it can't post
    /// videos (yet). The phone doesn't attach videos yet.
    var maxVideoBytes: Int {
        switch self {
        case .mastodon: 40 * 1024 * 1024
        case .telegram: 50 * 1024 * 1024
        case .discord: 10 * 1024 * 1024
        case .youtube, .tiktok: 256 * 1024 * 1024
        case .twitter, .bluesky, .threads, .instagram, .facebook, .linkedin, .slack, .devto, .hashnode, .wordpress: 0
        }
    }

    /// Every post needs an image (Instagram): text-only posts can't go there.
    var requiresImage: Bool { self == .instagram }

    /// Every post needs a video (YouTube, TikTok).
    var requiresVideo: Bool { self == .youtube || self == .tiktok }

    /// The image files it takes, by extension, if not all of Kyrelo's.
    var imageTypes: [String]? { self == .instagram ? ["jpg", "jpeg", "png"] : nil }

    /// Why a post with this image (or none) can't go here, or nil if it can.
    /// Same rules and words as the desktop's postImageError.
    func imageError(_ imagePath: String?) -> String? {
        if requiresVideo { return "\(label) posts need a video" }
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
        case .linkedin: URL(string: "https://www.linkedin.com/developers/tools/oauth/token-generator")!
        case .youtube: URL(string: "https://console.cloud.google.com/apis/credentials")!
        case .tiktok: URL(string: "https://developers.tiktok.com/apps/")!
        case .slack: URL(string: "https://api.slack.com/apps")!
        case .devto: URL(string: "https://dev.to/settings/extensions")!
        case .hashnode: URL(string: "https://hashnode.com/settings/developer")!
        case .wordpress: URL(string: "https://wordpress.org/documentation/article/application-passwords/")!
        }
    }

    /// What the credentials screen says, and its link to where they come from.
    var credentialsHint: (text: String, link: String) {
        switch self {
        case .bluesky: ("Use an app password, not your main password.", "Create an app password")
        case .telegram: ("Make a bot with @BotFather, add it to your channel as an admin that can post, then paste its token and the channel's @name.", "Open @BotFather")
        case .slack: ("Make a Slack app with an incoming webhook for the channel, then paste its URL. The steps are on the Slack page in Kyrelo on your computer.", "Slack apps")
        case .devto: ("Generate an API key in DEV's Settings → Extensions and paste it here.", "DEV settings")
        case .hashnode: ("Generate a personal access token in Hashnode's Settings → Developer, and enter your blog's address.", "Hashnode settings")
        case .wordpress: ("Add an application password in your site's Users → Profile, and enter it with your site and username.", "WordPress's guide")
        case .linkedin: ("LinkedIn needs a token from your own LinkedIn app. The steps are on the LinkedIn page in Kyrelo on your computer; paste the token here.", "LinkedIn's token generator")
        case .discord: ("In the channel's settings, open Integrations → Webhooks, make one and paste its URL.", "Discord's webhook guide")
        case .threads: ("Threads needs a token from a Meta developer app. The steps are on the Threads page in Kyrelo on your computer; paste the token here.", "Meta's Threads API guide")
        // Not credentials platforms: they never show this screen.
        case .twitter, .mastodon, .instagram, .facebook, .youtube, .tiktok: ("", "Open \(label)")
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
        case .linkedin: URL(string: "https://www.linkedin.com/signup")!
        case .youtube: URL(string: "https://www.youtube.com/create_channel")!
        case .tiktok: URL(string: "https://www.tiktok.com/signup")!
        case .slack: URL(string: "https://slack.com/get-started")!
        case .devto: URL(string: "https://dev.to/enter")!
        case .hashnode: URL(string: "https://hashnode.com/onboard")!
        case .wordpress: URL(string: "https://wordpress.org/download/")!
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
        case .linkedin: .credentials([CredentialField(key: "token", placeholder: "LinkedIn access token", secret: true)])
        case .youtube, .tiktok: .app(["clientId", "clientSecret"])
        case .slack: .credentials([
            CredentialField(key: "webhookUrl", placeholder: "Webhook URL", secret: true),
            CredentialField(key: "handle", placeholder: "#channel (to tell webhooks apart)", secret: false),
        ])
        case .devto: .credentials([CredentialField(key: "token", placeholder: "DEV API key", secret: true)])
        case .hashnode: .credentials([
            CredentialField(key: "token", placeholder: "Hashnode personal access token", secret: true),
            CredentialField(key: "site", placeholder: "yourname.hashnode.dev", secret: false),
        ])
        case .wordpress: .credentials([
            CredentialField(key: "site", placeholder: "example.com", secret: false),
            CredentialField(key: "handle", placeholder: "Username", secret: false),
            CredentialField(key: "appPassword", placeholder: "Application password", secret: true),
        ])
        }
    }

    /// The longest post an auto campaign writes here: short enough to read as
    /// a social post, even where the platform allows far more. As the desktop's
    /// PlatformSpec.campaignLimit.
    var campaignLimit: Int {
        switch self {
        case .twitter: ReplyRules.campaignMaxLength // X's standard 280, not Premium's
        case .bluesky: 300
        case .mastodon, .threads, .facebook, .telegram, .discord, .youtube, .tiktok, .slack: 500
        case .devto, .hashnode, .wordpress: 1300
        case .instagram: 2200
        case .linkedin: 1300
        }
    }

    /// Post length as this platform counts it.
    func length(_ text: String) -> Int {
        switch self {
        case .twitter: ReplyRules.length(text) // links count 23
        case .bluesky, .threads, .instagram, .facebook, .discord, .linkedin, .youtube, .tiktok, .slack, .devto, .hashnode, .wordpress: text.count // what a person sees; links in full
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
/// fields the user types, approving Kyrelo on the platform's own page, or
/// approving the user's own developer app (its client id and secret, the
/// desktop's field keys) in the computer's browser.
enum ConnectMethod {
    case browser
    case credentials([CredentialField])
    case oauth
    case app([String])
}

struct CredentialField {
    /// The desktop's field name (lib/platforms.ts CredentialField.key).
    let key: String
    let placeholder: String
    let secret: Bool
}
