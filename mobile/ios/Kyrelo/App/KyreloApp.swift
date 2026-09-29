import SwiftUI

@main
struct KyreloApp: App {
    @State private var pairing: Pairing? = PairingStore.load()
    /// A pairing link that was opened, waiting for the user to confirm it.
    @State private var linkPairing: Pairing?

    var body: some Scene {
        WindowGroup {
            Group {
                if let pairing {
                    let client = BridgeClient(pairing: pairing)
                    TabView {
                        FeedView(client: client, onUnpair: { setPairing(nil) })
                            .tabItem { Label("Monitor", systemImage: "dot.radiowaves.left.and.right") }
                        SchedulerView(client: client)
                            .tabItem { Label("Scheduler", systemImage: "calendar") }
                    }
                    .id(pairing.token) // a new pairing starts fresh
                } else {
                    PairView(onPaired: setPairing)
                }
            }
            .preferredColorScheme(.dark)
            .tint(Theme.accent)
            // Any web page or app can open a kyrelo://pair link, so ask first:
            // pairing with someone else's server would send it your posts.
            .onOpenURL { url in linkPairing = Pairing(link: url.absoluteString) }
            .alert("Pair with this computer?", isPresented: Binding(
                get: { linkPairing != nil }, set: { if !$0 { linkPairing = nil } }
            ), presenting: linkPairing) { next in
                Button("Pair") {
                    Task { if (try? await BridgeClient(pairing: next).ping()) != nil { setPairing(next) } }
                }
                Button("Cancel", role: .cancel) {}
            } message: { next in
                Text("Kyrelo at \(next.hosts.joined(separator: ", ")). Only pair if this link came from Kyrelo's Settings on your own computer.")
            }
        }
    }

    private func setPairing(_ next: Pairing?) {
        PairingStore.save(next)
        pairing = next
    }
}
