import PhotosUI
import SwiftUI

/// Pick a photo for a post, with a preview and a remove button. Holds the
/// original data; it's prepared (PhotoPrep) and uploaded when the post is
/// saved, once we know which platforms' limits apply.
struct PhotoField: View {
    @Binding var photo: Data?
    /// An image already on the post (edit), shown until replaced or removed.
    var existing: (client: BridgeClient, filename: String)?
    var onRemoveExisting: (() -> Void)?

    @State private var item: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let photo, let image = UIImage(data: photo) {
                Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Button("Remove photo", role: .destructive) { self.photo = nil; item = nil }
            } else if let existing {
                BridgeImage(client: existing.client, filename: existing.filename).frame(maxHeight: 180)
                Button("Remove photo", role: .destructive) { onRemoveExisting?() }
            }
            // The system picker runs out of process: no photo-library permission needed.
            PhotosPicker(selection: $item, matching: .images) {
                Label(photo == nil && existing == nil ? "Add photo" : "Replace photo", systemImage: "photo")
            }
        }
        .onChange(of: item) { _, newItem in
            Task { photo = try? await newItem?.loadTransferable(type: Data.self) }
        }
    }
}

extension BridgeClient {
    /// Prepares a picked photo for every platform in `platforms` and uploads it once.
    func uploadPhoto(_ original: Data, for platforms: [PlatformId]) async throws -> String {
        let limit = platforms.map(\.maxImageBytes).min() ?? PlatformId.twitter.maxImageBytes
        guard let jpeg = PhotoPrep.jpeg(from: original, maxBytes: limit) else {
            throw BridgeError.server("Couldn't prepare that photo. Try a different one.")
        }
        return try await uploadPhoto(jpeg)
    }
}
