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
        /// What it was sized down to, e.g. "720p", when 1080p was too big.
        let reducedTo: String?
    }

    /// The sizes tried in turn: the first that fits under the limit is sent.
    private static let ladder: [(preset: String, label: String)] = [
        (AVAssetExportPreset1920x1080, "1080p"),
        (AVAssetExportPreset1280x720, "720p"),
        (AVAssetExportPreset960x540, "540p"),
    ]

    static func photo(_ data: Data) -> Data? {
        PhotoPrep.jpeg(from: data, maxBytes: maxImageBytes)
    }

    /// How long the video is, in seconds, and how big the file is.
    static func info(of url: URL) async -> (seconds: Double, bytes: Int) {
        let seconds = (try? await AVURLAsset(url: url).load(.duration)).map(CMTimeGetSeconds) ?? 0
        let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        return (seconds.isFinite ? seconds : 0, bytes)
    }

    /// Re-encodes to MP4 at the largest size that fits Kyrelo's limit, with a poster frame.
    static func video(at url: URL, progress: @escaping (String) -> Void = { _ in }) async throws -> PreparedVideo {
        let asset = AVURLAsset(url: url)
        for (i, step) in ladder.enumerated() {
            // Skip a size iOS already expects to be too big (all but the last).
            if i < ladder.count - 1, let estimate = await estimatedBytes(asset, preset: step.preset), estimate > maxVideoBytes {
                continue
            }
            progress(i == 0 ? "Preparing video…" : "Making it smaller (\(step.label))…")
            let mp4 = try await export(asset, preset: step.preset)
            if mp4.count <= maxVideoBytes {
                return PreparedVideo(mp4: mp4, poster: await poster(of: asset), reducedTo: i == 0 ? nil : step.label)
            }
        }
        throw BridgeError.server("This video is too long to send whole, even made smaller. Tap Trim and keep the part you want to share.")
    }

    private static func estimatedBytes(_ asset: AVAsset, preset: String) async -> Int? {
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else { return nil }
        session.outputFileType = .mp4
        let bytes = session.estimatedOutputFileLength
        return bytes > 0 ? Int(bytes) : nil
    }

    private static func export(_ asset: AVAsset, preset: String) async throws -> Data {
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("kyrelo-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: output) }
        guard let export = AVAssetExportSession(asset: asset, presetName: preset) else {
            throw BridgeError.server("This video can't be converted on the phone.")
        }
        export.outputURL = output
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        await export.export()
        guard export.status == .completed else {
            throw BridgeError.server("Couldn't prepare the video: \(export.error?.localizedDescription ?? "unknown error").")
        }
        return try Data(contentsOf: output)
    }

    /// A preview frame for the phone's own screens.
    static func previewFrame(of url: URL) async -> UIImage? {
        (await poster(of: AVURLAsset(url: url))).flatMap(UIImage.init(data:))
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

/// How long a video each platform takes, for the guidance on the phone
/// (the platforms' own limits for most accounts; nil: long videos are fine).
enum VideoLengths {
    static let limits: [(platform: PlatformId, seconds: Double?)] = [
        (.youtube, nil),
        (.tiktok, 600),
        (.facebook, nil),
        (.mastodon, nil),
        (.telegram, nil),
        (.bluesky, 180),
        (.twitter, 140),
    ]

    /// "Fits YouTube, TikTok… Too long for X (2:20), Bluesky (3:00)."
    static func guidance(seconds: Double) -> String {
        let fits = limits.filter { $0.seconds.map { seconds <= $0 } ?? true }.map(\.platform.label)
        let tooLong = limits.compactMap { limit -> String? in
            guard let max = limit.seconds, seconds > max else { return nil }
            return "\(limit.platform.label) (\(clock(max)))"
        }
        var text = "Fits \(fits.joined(separator: ", "))."
        if !tooLong.isEmpty { text += " Too long for \(tooLong.joined(separator: ", ")): trim a short clip for those." }
        return text
    }

    static func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}
