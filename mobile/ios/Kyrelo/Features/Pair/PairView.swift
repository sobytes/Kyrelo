import SwiftUI

/// First run: pair with Kyrelo on the computer by scanning its code or
/// pasting the pairing link (Settings → Phone app on the desktop).
struct PairView: View {
    let onPaired: (Pairing) -> Void

    @State private var link = ""
    @State private var scanning = false
    @State private var checking = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Kyrelo").font(.largeTitle.bold()).foregroundStyle(Theme.text)
                Text("See your Monitor feed and Autopilot's draft replies, and reply from the X app. Kyrelo on your computer does the watching, so keep it running.")
                    .foregroundStyle(Theme.muted)

                Card {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(text: "Pair with your computer")
                        Text("In Kyrelo on your computer: Settings → Phone app → turn it on.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                        Button { scanning = true } label: {
                            Text("Scan the code").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)

                        Text("or paste the pairing link").font(.footnote).foregroundStyle(Theme.faint)
                            .frame(maxWidth: .infinity)
                        TextField("kyrelo://pair?…", text: $link)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        Button { pair(link) } label: {
                            Text("Connect").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(checking || link.trimmingCharacters(in: .whitespaces).isEmpty)

                        if checking { ProgressView().frame(maxWidth: .infinity) }
                        if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
                    }
                }

                Text("Works on the same Wi-Fi as your computer. Install Tailscale on both to use it anywhere, and on public Wi-Fi.")
                    .font(.footnote).foregroundStyle(Theme.faint)
            }
            .padding(20)
        }
        .background(Theme.ink)
        .sheet(isPresented: $scanning) {
            QRScannerView(
                onCode: { code in scanning = false; pair(code) },
                onUnavailable: { message in scanning = false; error = message }
            )
            .ignoresSafeArea()
        }
    }

    private func pair(_ text: String) {
        guard let pairing = Pairing(link: text) else {
            error = "That isn't a Kyrelo pairing link. It starts with kyrelo://pair"
            return
        }
        checking = true
        error = nil
        Task {
            defer { checking = false }
            do {
                try await BridgeClient(pairing: pairing).ping()
                onPaired(pairing)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
