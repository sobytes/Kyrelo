import SwiftUI

@main
struct KyreloApp: App {
    @State private var pairing: Pairing? = PairingStore.load()

    var body: some Scene {
        WindowGroup {
            Group {
                if let pairing {
                    FeedView(client: BridgeClient(pairing: pairing), onUnpair: { setPairing(nil) })
                        .id(pairing.token) // a new pairing starts a fresh feed
                } else {
                    PairView(onPaired: setPairing)
                }
            }
            .preferredColorScheme(.dark)
            .tint(Theme.accent)
            // Tapping a kyrelo://pair link (e.g. sent to yourself) pairs directly.
            .onOpenURL { url in
                guard let next = Pairing(link: url.absoluteString) else { return }
                Task {
                    if (try? await BridgeClient(pairing: next).ping()) != nil { setPairing(next) }
                }
            }
        }
    }

    private func setPairing(_ next: Pairing?) {
        PairingStore.save(next)
        pairing = next
    }
}
