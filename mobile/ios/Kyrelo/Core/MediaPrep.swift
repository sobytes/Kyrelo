import AVFoundation
import CoreTransferable
import UIKit
import UniformTypeIdentifiers

/// Gets a photo or video from the phone ready for the computer's Media
/// library: photos become JPEGs within the image limit (PhotoPrep); videos are
/// re-encoded to 1080p H.264 MP4, which every platform takes and which keeps
/// them well under Kyrelo's 256 MB limit, with a still frame as the poster.
enum MediaPrep {
    /// The desktop's limit for a video (desktop/lib/uploads.ts MAX_VIDEO_BYTES).
    static let maxVideoBytes = 256 * 1024 * 1024
    /// The desktop's limit for an image (desktop/lib/uploads.ts MAX_IMAGE_BYTES).
    static let maxImageBytes = 5 * 1024 * 1024

    struct PreparedVideo {
        let mp4: Data
        let poster: Data?
    }

    static func photo(_ data: Data) -> Data? {
        PhotoPrep.jpeg(from: data, maxBytes: maxImageBytes)
    }

    static func video(at url: URL) async throws -> PreparedVideo {
        let asset = AVURLAsset(url: url)
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("kyrelo-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: output) }
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
            throw BridgeError.server("This video can't be converted on the phone.")
        }
        export.outputURL = output
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        await export.export()
        guard export.status == .completed else {
            throw BridgeError.server("Couldn't prepare the video: \(export.error?.localizedDescription ?? "unknown error").")
        }
        let mp4 = try Data(contentsOf: output)
        guard mp4.count <= maxVideoBytes else {
            throw BridgeError.server("That video is too long: even at 1080p it's over 256 MB. Trim it and try again.")
        }
        return PreparedVideo(mp4: mp4, poster: await poster(of: asset))
    }

    /// A frame a second in (or the first, for a shorter clip), as a JPEG at most 1280 px wide.
    private static func poster(of asset: AVAsset) async -> Data? {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        let duration = (try? await asset.load(.duration)).map(CMTimeGetSeconds) ?? 0
        let time = CMTime(seconds: min(1, duration / 2), preferredTimescale: 600)
        guard let (image, _) = try? await generator.image(at: time) else { return nil }
        return UIImage(cgImage: image).jpegData(compressionQuality: 0.8)
    }
}

/// A video from the photo library, copied to a temporary file the app can read.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let copy = FileManager.default.temporaryDirectory
                .appendingPathComponent("kyrelo-\(UUID().uuidString).\(received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}
