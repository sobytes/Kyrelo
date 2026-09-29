import XCTest
@testable import Kyrelo

/// The iOS side of contracts/ (see contracts/README.md). The desktop's
/// desktop/lib/contracts.test.ts reads the same files.
final class ContractTests: XCTestCase {
    private func contract(_ name: String) throws -> Data {
        let bundle = Bundle(for: Self.self)
        let url = bundle.url(forResource: name, withExtension: "json")
            ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "contracts")
        return try Data(contentsOf: XCTUnwrap(url, "contracts/\(name).json missing from the test bundle"))
    }

    // MARK: reply-rules.json

    private struct ReplyRulesContract: Decodable {
        struct LengthCase: Decodable { let text: String; let length: Int }
        let replyMaxLength: Int
        let campaignMaxLength: Int
        let tones: [String]
        let styles: [String]
        let lengthCases: [LengthCase]
    }

    func testReplyLimitTonesAndStylesMatch() throws {
        let rules = try JSONDecoder().decode(ReplyRulesContract.self, from: contract("reply-rules"))
        XCTAssertEqual(ReplyRules.maxLength, rules.replyMaxLength)
        XCTAssertEqual(ReplyRules.campaignMaxLength, rules.campaignMaxLength)
        XCTAssertEqual(ReplyTone.allCases.map(\.rawValue), rules.tones)
        XCTAssertEqual(ReplyStyle.allCases.map(\.rawValue), rules.styles)
    }

    func testReplyLengthCountsLikeTheDesktop() throws {
        let rules = try JSONDecoder().decode(ReplyRulesContract.self, from: contract("reply-rules"))
        for c in rules.lengthCases {
            XCTAssertEqual(ReplyRules.length(c.text), c.length, "length of \(c.text.debugDescription)")
        }
    }

    // MARK: pairing-links.json

    private struct PairingContract: Decodable {
        struct Valid: Decodable { let link: String; let hosts: [String]; let port: Int; let token: String }
        let valid: [Valid]
        let invalid: [String]
    }

    func testReadsValidPairingLinks() throws {
        let links = try JSONDecoder().decode(PairingContract.self, from: contract("pairing-links"))
        for v in links.valid {
            let pairing = try XCTUnwrap(Pairing(link: v.link), v.link)
            XCTAssertEqual(pairing, Pairing(hosts: v.hosts, port: v.port, token: v.token))
        }
    }

    func testRejectsInvalidPairingLinks() throws {
        let links = try JSONDecoder().decode(PairingContract.self, from: contract("pairing-links"))
        for link in links.invalid {
            XCTAssertNil(Pairing(link: link), link)
        }
    }

    // MARK: monitor-feed.json

    private struct FeedContract: Decodable {
        let state: GrokState
        let settings: MonitorSettings
    }

    func testDecodesTheDesktopsFeedAndSettings() throws {
        let feed = try JSONDecoder().decode(FeedContract.self, from: contract("monitor-feed"))
        XCTAssertEqual(feed.state.tweets.count, 5)

        let drafted = feed.state.tweets[0]
        XCTAssertEqual(drafted.draft?.score, 62)
        XCTAssertEqual(drafted.draft?.options.count, 2)

        let skipped = feed.state.tweets[1]
        XCTAssertEqual(skipped.draft?.options, [])

        XCTAssertNotNil(feed.state.tweets[2].repliedAt)
        // No postedAt: sorted by when it was first seen.
        XCTAssertEqual(feed.state.tweets[3].sortDate, feed.state.tweets[3].seenAt)
        // Found by a keyword search, from someone not watched.
        XCTAssertNil(drafted.keyword)
        XCTAssertEqual(feed.state.tweets[4].keyword, "buffer alternative")
        XCTAssertEqual(feed.settings.keywords, ["buffer alternative"])

        XCTAssertEqual(feed.settings.autopilot.tone, .curious)
        XCTAssertEqual(feed.settings.autopilot.style, .grok)
        XCTAssertEqual(feed.settings.autopilot.minScore, 60)
    }

    func testAutopilotSettingsEncodeWithTheDesktopsFieldNames() throws {
        let feed = try JSONDecoder().decode(FeedContract.self, from: contract("monitor-feed"))
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(feed.settings.autopilot)) as? [String: Any]
        XCTAssertEqual(Set(encoded?.keys ?? [:].keys), ["enabled", "tone", "style", "minScore", "creativity", "topics", "avoid"])
    }

    // MARK: platform-rules.json

    private struct PlatformRulesContract: Decodable {
        struct Platform: Decodable {
            let id: String
            let label: String
            let maxLength: Int
            let maxImageBytes: Int
            let connect: String
            let credentials: [String]
            let loginUrl: String
            let signupUrl: String
        }
        struct LengthCase: Decodable { let platform: String; let text: String; let length: Int }
        let platforms: [Platform]
        let lengthCases: [LengthCase]
    }

    func testPlatformsNamesLimitsAndConnectingMatch() throws {
        let rules = try JSONDecoder().decode(PlatformRulesContract.self, from: contract("platform-rules"))
        XCTAssertEqual(PlatformId.allCases.map(\.rawValue), rules.platforms.map(\.id))
        for p in rules.platforms {
            let platform = try XCTUnwrap(PlatformId(rawValue: p.id))
            XCTAssertEqual(platform.label, p.label)
            XCTAssertEqual(platform.maxLength, p.maxLength)
            XCTAssertEqual(platform.maxImageBytes, p.maxImageBytes)
            XCTAssertEqual(platform.loginUrl.absoluteString, p.loginUrl)
            XCTAssertEqual(platform.signupUrl.absoluteString, p.signupUrl)
            switch platform.connect {
            case .browser: XCTAssertEqual(p.connect, "browser")
            case .oauth: XCTAssertEqual(p.connect, "oauth")
            case let .credentials(fields):
                XCTAssertEqual(p.connect, "credentials")
                XCTAssertEqual(fields.map(\.key), p.credentials)
            }
        }
    }

    func testEachPlatformCountsLengthLikeTheDesktop() throws {
        let rules = try JSONDecoder().decode(PlatformRulesContract.self, from: contract("platform-rules"))
        for c in rules.lengthCases {
            let platform = try XCTUnwrap(PlatformId(rawValue: c.platform))
            XCTAssertEqual(platform.length(c.text), c.length, "\(c.platform): \(c.text.debugDescription)")
        }
    }

    // MARK: services.json

    private struct ServicesContract: Decodable {
        struct Service: Decodable { let id: String; let slug: String; let label: String; let sections: [String] }
        let global: [String]
        let sections: [String]
        let services: [Service]
    }

    func testServicesMatchTheDesktop() throws {
        let contract = try JSONDecoder().decode(ServicesContract.self, from: contract("services"))
        XCTAssertEqual(Services.global, contract.global)
        XCTAssertEqual(SectionId.allCases.map(\.rawValue), contract.sections)
        XCTAssertEqual(Services.all.map(\.id.rawValue), contract.services.map(\.id))
        for (mine, theirs) in zip(Services.all, contract.services) {
            XCTAssertEqual(mine.slug, theirs.slug)
            XCTAssertEqual(mine.label, theirs.label)
            XCTAssertEqual(mine.sections.map(\.rawValue), theirs.sections)
        }
    }

    // MARK: design-tokens.json

    private struct DesignTokens: Decodable {
        let color: [String: String]
        let radius: [String: Double]
    }

    func testThemeUsesTheDesignTokens() throws {
        let tokens = try JSONDecoder().decode(DesignTokens.self, from: contract("design-tokens"))
        let hex = { (name: String) -> UInt32? in tokens.color[name].flatMap { UInt32($0.dropFirst(), radix: 16) } }
        let palette: [String: UInt32] = [
            "canvas": Palette.canvas, "surface": Palette.surface, "fg": Palette.fg, "muted": Palette.muted,
            "line": Palette.line, "primary": Palette.primary, "primaryHover": Palette.primaryHover,
            "accent": Palette.accent, "success": Palette.success, "warning": Palette.warning, "error": Palette.error,
        ]
        XCTAssertEqual(Set(palette.keys), Set(tokens.color.keys))
        for (name, value) in palette {
            XCTAssertEqual(value, hex(name), name)
        }
        XCTAssertEqual(tokens.radius, ["sm": Double(Radius.sm), "md": Double(Radius.md), "lg": Double(Radius.lg)])
    }

    // MARK: scheduler.json

    func testSkipsAccountsOnPlatformsThisAppDoesntSupport() throws {
        // An older desktop, from before LinkedIn was removed.
        let json = Data("""
        [{"platform":"twitter","id":"a","handle":"a","addedAt":"2026-09-20T10:00:00.000Z"},
         {"platform":"linkedin","id":"b","handle":"b","addedAt":"2026-09-20T10:00:00.000Z"},
         {"platform":"bluesky","id":"c","handle":"c","addedAt":"2026-09-20T10:00:00.000Z"}]
        """.utf8)
        let accounts = try JSONDecoder().decode(LossyList<Account>.self, from: json).items
        XCTAssertEqual(accounts.map(\.id), ["a", "c"])
    }


    private struct SchedulerContract: Decodable {
        let accounts: [Account]
        let posts: [ScheduledPost]
        let campaignsInfo: CampaignsInfo
        let brandProfile: BrandProfile
    }

    func testDecodesTheDesktopsSchedulerAndCampaigns() throws {
        let s = try JSONDecoder().decode(SchedulerContract.self, from: contract("scheduler"))
        XCTAssertEqual(s.accounts.map(\.platform), [.twitter, .bluesky])
        XCTAssertEqual(s.posts.map(\.status), [.pending, .posting, .posted, .failed, .posted])
        XCTAssertNil(s.posts[4].accountId) // legacy post
        XCTAssertNotNil(s.posts[1].sendingStartedAt)

        let campaign = try XCTUnwrap(s.campaignsInfo.campaigns.first)
        XCTAssertEqual(campaign.status, .review)
        XCTAssertEqual(campaign.platforms, [.twitter, .bluesky])
        XCTAssertEqual(campaign.drafts.first?.media.imagePath, "0f8e7d6c-5b4a-4938-8271-605f4e3d2c1c.jpg")
        XCTAssertNil(campaign.drafts.last?.media.imagePath)
        XCTAssertTrue(s.campaignsInfo.aiReady)
        XCTAssertEqual(s.brandProfile.url, "https://kyrelo.com")
        XCTAssertNotNil(ISODate.parse(campaign.createdAt))
    }

    // MARK: x-tools.json

    private struct XToolsContract: Decodable {
        struct Deleter: Decodable { let job: DeleterJob? }
        let deleter: Deleter
        let unfollow: UnfollowState
        let finder: FinderState
    }

    func testDecodesTheDesktopsXTools() throws {
        let x = try JSONDecoder().decode(XToolsContract.self, from: contract("x-tools"))
        XCTAssertEqual(x.deleter.job?.target, .likes)
        XCTAssertEqual(x.deleter.job?.running, true)

        XCTAssertEqual(x.unfollow.rows.map(\.suggested), [true, false, false])
        XCTAssertEqual(x.unfollow.rows[1].protectedBecause, "on your keep list")
        XCTAssertEqual(x.unfollow.history.first?.action, "unfollowed")
        XCTAssertEqual(x.unfollow.job?.kind, "scan")
        // The rules go back to the desktop with its field names.
        let rules = try JSONSerialization.jsonObject(with: JSONEncoder().encode(x.unfollow.rules)) as? [String: Any]
        XCTAssertEqual(Set((rules ?? [:]).keys), ["dead", "inactiveDays", "neverEngage", "bots", "notFollowingBack", "protectBig"])

        XCTAssertEqual(x.finder.data.suggestions.first?.group, "audience")
        XCTAssertTrue(x.finder.aiReady)
    }
}
