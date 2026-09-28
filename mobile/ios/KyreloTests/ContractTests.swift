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
        let tones: [String]
        let styles: [String]
        let lengthCases: [LengthCase]
    }

    func testReplyLimitTonesAndStylesMatch() throws {
        let rules = try JSONDecoder().decode(ReplyRulesContract.self, from: contract("reply-rules"))
        XCTAssertEqual(ReplyRules.maxLength, rules.replyMaxLength)
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
        XCTAssertEqual(feed.state.tweets.count, 4)

        let drafted = feed.state.tweets[0]
        XCTAssertEqual(drafted.draft?.score, 62)
        XCTAssertEqual(drafted.draft?.options.count, 2)

        let skipped = feed.state.tweets[1]
        XCTAssertEqual(skipped.draft?.options, [])

        XCTAssertNotNil(feed.state.tweets[2].repliedAt)
        // No postedAt: sorted by when it was first seen.
        XCTAssertEqual(feed.state.tweets[3].sortDate, feed.state.tweets[3].seenAt)

        XCTAssertEqual(feed.settings.autopilot.tone, .curious)
        XCTAssertEqual(feed.settings.autopilot.style, .grok)
        XCTAssertEqual(feed.settings.autopilot.minScore, 60)
    }

    func testAutopilotSettingsEncodeWithTheDesktopsFieldNames() throws {
        let feed = try JSONDecoder().decode(FeedContract.self, from: contract("monitor-feed"))
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(feed.settings.autopilot)) as? [String: Any]
        XCTAssertEqual(Set(encoded?.keys ?? [:].keys), ["enabled", "tone", "style", "minScore", "creativity", "topics", "avoid"])
    }
}
