import PhotosUI
import SwiftUI

/// The computer's Media library from the phone: take a photo or video, or pick
/// one from the library, and send it to a bucket for posts and auto campaigns.
/// Browse, describe and sort what's there. The computer keeps the files.
struct MediaView: View {
    let client: BridgeClient
    @State private var library: MediaLibrary?
    /// nil: all media; "" : unsorted; otherwise a bucket id.
    @State private var filter: String?
    @State private var error: String?
    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var showPicker = false
    /// What the camera took, shown once the camera has closed.
    @State private var captured: Capture?
    @State private var pending: PendingCapture?
    @State private var selected: MediaItem?
    @State private var newBucket = false
    @State private var bucketName = ""
    @Environment(\.scenePhase) private var scenePhase

    private var items: [MediaItem] {
        (library?.items.items ?? []).filter { item in
            switch filter {
            case nil: true
            case "": item.buckets.isEmpty
            case let id?: item.buckets.contains(id)
            }
        }
    }

    private var filterLabel: String {
        switch filter {
        case nil: "All media"
        case "": "Unsorted"
        case let id?: library?.buckets.first { $0.id == id }?.name ?? "Bucket"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error {
                    Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error)
                }
                Menu {
                    Button("All media") { filter = nil }
                    Button("Unsorted") { filter = "" }
                    ForEach(library?.buckets ?? []) { bucket in
                        Button(bucket.name) { filter = bucket.id }
                    }
                    Divider()
                    Button("New bucket…") { newBucket = true }
                } label: {
                    Label(filterLabel, systemImage: "chevron.down")
                        .font(.inter(.subheadline, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                }

                if library != nil && items.isEmpty {
                    Text("Nothing here yet. Tap + to take a photo or video, or add one from your library.")
                        .font(.inter(.subheadline))
                        .foregroundStyle(Theme.muted)
                        .padding(.vertical, 30)
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], spacing: 8) {
                    ForEach(items) { item in
                        Button { selected = item } label: { MediaTile(client: client, item: item) }
                            .buttonStyle(.plain)
                    }
                }
                Text("The AI looks at each photo, and a frame of each video, so auto campaigns can pick the right one for each post.")
                    .font(.inter(.caption))
                    .foregroundStyle(Theme.muted)
            }
            .padding(16)
        }
        .background(Theme.canvas)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if CameraPicker.isAvailable {
                        Button { showCamera = true } label: { Label("Take photo or video", systemImage: "camera") }
                    }
                    Button { showPicker = true } label: { Label("Choose from library", systemImage: "photo.on.rectangle") }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable { await load() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await load()
        }
        .fullScreenCover(isPresented: $showCamera, onDismiss: {
            if let captured { pending = PendingCapture(capture: captured) }
            captured = nil
        }) {
            CameraPicker { captured = $0 }.ignoresSafeArea()
        }
        // The system picker runs out of process: no photo-library permission needed.
        .photosPicker(isPresented: $showPicker, selection: $pickerItem, matching: .any(of: [.images, .videos]))
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            pickerItem = nil
            Task { await load(picked: item) }
        }
        .sheet(item: $pending) { pending in
            AddMediaSheet(client: client, capture: pending.capture, buckets: library?.buckets ?? [], startBucket: filter.flatMap { $0.isEmpty ? nil : $0 }) {
                Task { await load() }
            }
        }
        .sheet(item: $selected) { item in
            MediaDetailSheet(client: client, item: item, buckets: library?.buckets ?? []) { Task { await load() } }
        }
        .alert("New bucket", isPresented: $newBucket) {
            TextField("Name, e.g. Launch campaign", text: $bucketName)
            Button("Create") { Task { await createBucket() } }
            Button("Cancel", role: .cancel) { bucketName = "" }
        }
    }

    private func load() async {
        do {
            library = try await client.mediaLibrary()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// A photo or video chosen from the phone's library.
    private func load(picked item: PhotosPickerItem) async {
        var capture: Capture?
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            if let movie = try? await item.loadTransferable(type: PickedMovie.self) { capture = .video(movie.url) }
        } else if let data = try? await item.loadTransferable(type: Data.self) {
            capture = .photo(data)
        }
        if let capture {
            pending = PendingCapture(capture: capture)
        } else {
            error = "Couldn't open that item. Try another."
        }
    }

    private func createBucket() async {
        let name = bucketName.trimmingCharacters(in: .whitespaces)
        bucketName = ""
        guard !name.isEmpty else { return }
        do {
            let bucket = try await client.createBucket(name: name)
            await load()
            filter = bucket.id
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// `sheet(item:)` needs an Identifiable value; each capture is a new sheet.
private struct PendingCapture: Identifiable {
    let id = UUID()
    let capture: Capture
}

private struct MediaTile: View {
    let client: BridgeClient
    let item: MediaItem

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let thumb = item.thumbnailFilename {
                    BridgeThumbnail(client: client, filename: thumb)
                } else {
                    Theme.surface
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Theme.line))
            if item.isVideo {
                Image(systemName: "play.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.white)
                    .padding(5)
                    .background(.black.opacity(0.55), in: Circle())
                    .padding(6)
            }
        }
    }
}

/// A square, filled thumbnail of an image on the computer.
struct BridgeThumbnail: View {
    let client: BridgeClient
    let filename: String
    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geo in
            if let image {
                Image(uiImage: image).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped()
            } else {
                Theme.surface
            }
        }
        .task(id: filename) {
            if let data = try? await client.image(filename) { image = UIImage(data: data) }
        }
    }
}

/// Describe a new photo or video, choose its buckets, and send it to the computer.
private struct AddMediaSheet: View {
    let client: BridgeClient
    let buckets: [MediaBucket]
    let onAdded: () -> Void

    /// What's being added; trimming a video replaces it with the trimmed copy.
    @State private var capture: Capture
    @State private var videoInfo: (seconds: Double, bytes: Int)?
    @State private var preview: UIImage?
    @State private var trimming = false
    @State private var description = ""
    @State private var chosen: Set<String>
    @State private var status: String?
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, capture: Capture, buckets: [MediaBucket], startBucket: String?, onAdded: @escaping () -> Void) {
        self.client = client
        _capture = State(initialValue: capture)
        self.buckets = buckets
        self.onAdded = onAdded
        _chosen = State(initialValue: startBucket.map { [$0] } ?? [])
    }

    private var isVideo: Bool {
        if case .video = capture { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    switch capture {
                    case let .photo(data):
                        if let image = UIImage(data: data) {
                            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220).frame(maxWidth: .infinity)
                        }
                    case let .video(url):
                        if let preview {
                            Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 220).frame(maxWidth: .infinity)
                        }
                        if let videoInfo {
                            Label("\(VideoLengths.clock(videoInfo.seconds)) · \(ByteCountFormatter.string(fromByteCount: Int64(videoInfo.bytes), countStyle: .file))", systemImage: "video")
                                .font(.inter(.subheadline))
                        }
                        if VideoTrimmer.canTrim(url) {
                            Button { trimming = true } label: { Label("Trim", systemImage: "scissors") }
                                .disabled(status != nil)
                        }
                    }
                } footer: {
                    if let videoInfo, isVideo {
                        Text("\(VideoLengths.guidance(seconds: videoInfo.seconds)) Big videos are made smaller automatically.")
                    }
                }
                Section {
                    TextField(isVideo ? "What's in it? (optional)" : "What does it show? (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                } footer: {
                    Text("Leave it blank and the AI describes it from the \(isVideo ? "video" : "photo"). Auto campaigns use this to pick it.")
                }
                if !buckets.isEmpty {
                    Section("Buckets") {
                        ForEach(buckets) { bucket in
                            Toggle(bucket.name, isOn: Binding(
                                get: { chosen.contains(bucket.id) },
                                set: { on in if on { chosen.insert(bucket.id) } else { chosen.remove(bucket.id) } }
                            ))
                            .tint(Theme.primary)
                        }
                    }
                }
                Section {
                    Button(action: send) {
                        HStack {
                            if status != nil { ProgressView() }
                            Text(status ?? "Send to computer")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(status != nil)
                    if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
                }
            }
            .navigationTitle(isVideo ? "Add video" : "Add photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .interactiveDismissDisabled(status != nil)
            .task(id: videoURL) {
                guard let videoURL else { return }
                videoInfo = await MediaPrep.info(of: videoURL)
                preview = await MediaPrep.previewFrame(of: videoURL)
            }
            .fullScreenCover(isPresented: $trimming) {
                if let videoURL {
                    VideoTrimmer(url: videoURL) { trimmed in
                        capture = .video(trimmed)
                        error = nil
                    }
                    .ignoresSafeArea()
                }
            }
        }
    }

    private var videoURL: URL? {
        if case let .video(url) = capture { return url }
        return nil
    }

    private func send() {
        error = nil
        Task {
            defer { status = nil }
            do {
                let first = chosen.first
                let item: MediaItem
                switch capture {
                case let .photo(data):
                    status = "Preparing…"
                    guard let jpeg = MediaPrep.photo(data) else { throw BridgeError.server("Couldn't prepare that photo.") }
                    status = "Sending…"
                    item = try await client.uploadMedia(jpeg, isVideo: false, poster: nil, description: description, bucketId: first)
                case let .video(url):
                    let video = try await MediaPrep.video(at: url) { step in
                        Task { @MainActor in status = step }
                    }
                    status = "Sending \(ByteCountFormatter.string(fromByteCount: Int64(video.mp4.count), countStyle: .file))…"
                    item = try await client.uploadMedia(video.mp4, isVideo: true, poster: video.poster, description: description, bucketId: first)
                }
                // The upload puts it in one bucket; any others are added after.
                if chosen.count > 1 { try await client.updateMedia(id: item.id, bucketIds: Array(chosen)) }
                onAdded()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// One item: its picture, description and buckets, or remove it.
private struct MediaDetailSheet: View {
    let client: BridgeClient
    let item: MediaItem
    let buckets: [MediaBucket]
    let onChanged: () -> Void

    @State private var description: String
    @State private var chosen: Set<String>
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, item: MediaItem, buckets: [MediaBucket], onChanged: @escaping () -> Void) {
        self.client = client
        self.item = item
        self.buckets = buckets
        self.onChanged = onChanged
        _description = State(initialValue: item.description)
        _chosen = State(initialValue: Set(item.buckets))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let thumb = item.thumbnailFilename {
                        BridgeImage(client: client, filename: thumb).frame(maxHeight: 260)
                    }
                    if item.isVideo {
                        Label("Video\(item.bytes.map { " · \(ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file))" } ?? "")", systemImage: "video")
                            .font(.inter(.footnote)).foregroundStyle(Theme.muted)
                    }
                }
                Section("Description") {
                    TextField("What does it show?", text: $description, axis: .vertical).lineLimit(2...6)
                }
                if !buckets.isEmpty {
                    Section("Buckets") {
                        ForEach(buckets) { bucket in
                            Toggle(bucket.name, isOn: Binding(
                                get: { chosen.contains(bucket.id) },
                                set: { on in if on { chosen.insert(bucket.id) } else { chosen.remove(bucket.id) } }
                            ))
                            .tint(Theme.primary)
                        }
                    }
                }
                Section {
                    Button("Remove from library", role: .destructive) { Task { await remove() } }
                } footer: {
                    Text("Posts already scheduled with it keep it.")
                }
                if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
            }
            .navigationTitle(item.isVideo ? "Video" : "Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } } }
            }
        }
    }

    private func save() async {
        do {
            try await client.updateMedia(id: item.id, description: description, bucketIds: Array(chosen))
            onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        do {
            try await client.deleteMedia(id: item.id)
            onChanged()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Pick a photo or video from the Media library, e.g. for a new post.
struct MediaPickerSheet: View {
    let client: BridgeClient
    let onPick: (MediaItem) -> Void
    @State private var library: MediaLibrary?
    @State private var bucket: String?
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    private var items: [MediaItem] {
        (library?.items.items ?? []).filter { bucket == nil || $0.buckets.contains(bucket!) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
                    if let buckets = library?.buckets, !buckets.isEmpty {
                        Picker("Bucket", selection: $bucket) {
                            Text("All media").tag(String?.none)
                            ForEach(buckets) { Text($0.name).tag(Optional($0.id)) }
                        }
                        .pickerStyle(.menu)
                    }
                    if library != nil && items.isEmpty {
                        Text("Nothing here yet. Add photos and videos on the Media screen.")
                            .font(.inter(.subheadline)).foregroundStyle(Theme.muted)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                        ForEach(items) { item in
                            Button {
                                onPick(item)
                                dismiss()
                            } label: {
                                MediaTile(client: client, item: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.canvas)
            .navigationTitle("Your media")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task {
                do {
                    library = try await client.mediaLibrary()
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
    }
}
