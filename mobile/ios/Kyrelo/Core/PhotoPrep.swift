import UIKit

/// Turns a photo from the library (often a large HEIC) into a JPEG the
/// platforms accept: at most 2048 px on the long side and no bigger than
/// `maxBytes` (the smallest limit among the accounts being posted to).
enum PhotoPrep {
    static let maxSide: CGFloat = 2048

    static func jpeg(from data: Data, maxBytes: Int) -> Data? {
        guard var image = UIImage(data: data) else { return nil }
        image = resized(image, maxSide: maxSide)
        // Lower the quality first; if that isn't enough, shrink and try again.
        for _ in 0..<4 {
            for quality in stride(from: 0.85, through: 0.35, by: -0.1) {
                if let jpeg = image.jpegData(compressionQuality: quality), jpeg.count <= maxBytes { return jpeg }
            }
            image = resized(image, maxSide: max(image.size.width, image.size.height) * 0.75)
        }
        return nil
    }

    private static func resized(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxSide else { return image }
        let scale = maxSide / longest
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1 // pixels, not points
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
