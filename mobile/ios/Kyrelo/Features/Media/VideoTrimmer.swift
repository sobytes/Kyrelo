import SwiftUI
import UIKit

/// The iPhone's own video trimmer (the one Photos uses): drag the handles,
/// keep the part to share. Wraps UIVideoEditorController.
struct VideoTrimmer: UIViewControllerRepresentable {
    let url: URL
    let onTrimmed: (URL) -> Void
    @Environment(\.dismiss) private var dismiss

    static func canTrim(_ url: URL) -> Bool { UIVideoEditorController.canEditVideo(atPath: url.path) }

    func makeUIViewController(context: Context) -> UIVideoEditorController {
        let editor = UIVideoEditorController()
        editor.videoPath = url.path
        editor.videoQuality = .typeHigh
        editor.delegate = context.coordinator
        return editor
    }

    func updateUIViewController(_ controller: UIVideoEditorController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIVideoEditorControllerDelegate, UINavigationControllerDelegate {
        let parent: VideoTrimmer
        init(_ parent: VideoTrimmer) { self.parent = parent }

        func videoEditorController(_ editor: UIVideoEditorController, didSaveEditedVideoToPath editedVideoPath: String) {
            parent.onTrimmed(URL(fileURLWithPath: editedVideoPath))
            parent.dismiss()
        }

        func videoEditorControllerDidCancel(_ editor: UIVideoEditorController) {
            parent.dismiss()
        }

        func videoEditorController(_ editor: UIVideoEditorController, didFailWithError error: Error) {
            parent.dismiss()
        }
    }
}
