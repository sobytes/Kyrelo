import Foundation

// What the desktop's Media endpoints return (desktop/lib/types.ts MediaItem,
// MediaBucket). contracts/media.json is a sample both apps are tested against.

struct MediaLibrary: Decodable {
    let items: LossyList<MediaItem>
    let buckets: [MediaBucket]
}

struct MediaItem: Decodable, Identifiable, Hashable {
    let id: String
    let filename: String
    /// nil on items from before videos could be added: they're images.
    let kind: String?
    let bytes: Int?
    /// A video's still frame, for its thumbnail.
    let posterFilename: String?
    let description: String
    let bucketIds: [String]?
    let addedAt: String

    var isVideo: Bool { kind == "video" }
    var buckets: [String] { bucketIds ?? [] }
    /// The image to show for it: the photo itself, or a video's poster.
    var thumbnailFilename: String? { isVideo ? posterFilename : filename }
}

struct MediaBucket: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
}
