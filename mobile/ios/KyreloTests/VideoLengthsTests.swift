import XCTest
@testable import Kyrelo

final class VideoLengthsTests: XCTestCase {
    func testAShortClipFitsEverywhere() {
        XCTAssertFalse(VideoLengths.guidance(seconds: 45).contains("Too long"))
    }

    func testALongVideoNamesWhereItIsTooLong() {
        let text = VideoLengths.guidance(seconds: 4 * 60 + 12)
        XCTAssertTrue(text.hasPrefix("Fits YouTube, TikTok"))
        XCTAssertTrue(text.contains("Too long for Bluesky (3:00), X (2:20)"))
    }

    func testClock() {
        XCTAssertEqual(VideoLengths.clock(140), "2:20")
        XCTAssertEqual(VideoLengths.clock(3725), "1:02:05")
    }
}
