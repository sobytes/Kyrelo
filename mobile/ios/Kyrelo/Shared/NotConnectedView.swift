import Network
import SwiftUI

/// Shown over everything while the phone can't find the computer. The
/// pairing is fine; the phone just can't see the computer on the network.
/// Says why in plain words, and keeps trying until it can.
struct NotConnectedView: View {
    let client: BridgeClient
    @State private var onMobileData = false
    @State private var checking = false

    /// A Tailscale address (100.64.0.0/10) in the pairing: works away from home too.
    private var hasTailscale: Bool {
        client.pairing.hosts.contains { host in
            let parts = host.split(separator: ".").compactMap { Int($0) }
            return parts.count == 4 && parts[0] == 100 && (64...127).contains(parts[1])
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Can't reach your computer")
                        .font(.inter(.title2, weight: .semibold))
                    Text("Your phone is still paired, so there's nothing to set up again. It just can't find your computer right now.")
                        .foregroundStyle(Theme.muted)
                }

                if onMobileData {
                    Card(fill: Theme.accent.opacity(0.15)) {
                        Text(hasTailscale
                             ? "Your phone is on mobile data. Join the same Wi-Fi as your computer, or turn on Tailscale on your phone."
                             : "Your phone is on mobile data. Join the same Wi-Fi as your computer.")
                            .font(.inter(.body, weight: .semibold))
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Check that:").font(.inter(.headline, weight: .semibold))
                    Check(text: "Your phone and computer are on the same Wi-Fi.")
                    Check(text: "Kyrelo is open on your computer, and the computer is awake, not asleep.")
                    Check(text: "Phone access is still on, in Kyrelo's Settings on your computer.")
                    if hasTailscale {
                        Check(text: "Away from home? Turn on Tailscale on your phone and it works from anywhere.")
                    }
                }

                Button {
                    Task { await retry() }
                } label: {
                    Group { if checking { ProgressView() } else { Text("Try again") } }.frame(maxWidth: .infinity)
                }
                .buttonStyle(.primary)
                .disabled(checking)

                Text("Looking for it at \(client.pairing.hosts.joined(separator: ", ")). This closes by itself once it's found.")
                    .font(.mono(.caption2))
                    .foregroundStyle(Theme.muted)
            }
            .padding(24)
        }
        .background(Theme.canvas)
        .task {
            // Keep trying, so it goes away on its own once the computer is back.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                await retry()
            }
        }
        .task {
            for await path in NWPathMonitor.paths() {
                onMobileData = path.usesInterfaceType(.cellular) && !path.usesInterfaceType(.wifi)
            }
        }
    }

    private func retry() async {
        checking = true
        try? await client.ping()
        checking = false
    }
}

private struct Check: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "circle").font(.caption).foregroundStyle(Theme.muted)
            Text(text)
        }
    }
}

private extension NWPathMonitor {
    /// The network the phone is on, now and whenever it changes.
    static func paths() -> AsyncStream<NWPath> {
        AsyncStream { continuation in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { continuation.yield($0) }
            continuation.onTermination = { _ in monitor.cancel() }
            monitor.start(queue: DispatchQueue(label: "kyrelo.network"))
        }
    }
}
