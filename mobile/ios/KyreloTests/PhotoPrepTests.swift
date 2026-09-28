import UIKit
import XCTest
@testable import Kyrelo

final class PhotoPrepTests: XCTestCase {
    /// A photo of random pixels: noise compresses badly, like a real camera
    /// shot, so it exercises both lowering the quality and shrinking.
    private func noisyPhoto(width: Int, height: Int) -> Data {
        var pixels = [UInt8](repeating: 255, count: width * height * 4)
        pixels.withUnsafeMutableBytes { arc4random_buf($0.baseAddress, $0.count) }
        let context = CGContext(
            data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )!
        return UIImage(cgImage: context.makeImage()!).pngData()!
    }

    func testFitsBlueskysLimitAndStaysAnImage() throws {
        let original = noisyPhoto(width: 4032, height: 3024) // an iPhone photo's size
        XCTAssertGreaterThan(original.count, PlatformId.bluesky.maxImageBytes)
        let jpeg = try XCTUnwrap(PhotoPrep.jpeg(from: original, maxBytes: PlatformId.bluesky.maxImageBytes))
        XCTAssertLessThanOrEqual(jpeg.count, PlatformId.bluesky.maxImageBytes)
        let image = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertLessThanOrEqual(max(image.size.width, image.size.height), PhotoPrep.maxSide)
    }

    func testKeepsSmallPhotosAtFullSize() throws {
        let jpeg = try XCTUnwrap(PhotoPrep.jpeg(from: noisyPhoto(width: 800, height: 600), maxBytes: 5 * 1024 * 1024))
        XCTAssertEqual(UIImage(data: jpeg)?.size, CGSize(width: 800, height: 600))
    }

    func testRejectsDataThatIsntAnImage() {
        XCTAssertNil(PhotoPrep.jpeg(from: Data("not an image".utf8), maxBytes: 1_000_000))
    }
}
