import SwiftUI

/// The home screen, as on the desktop: the Scheduler (every account), then
/// one row per service, each opening its sections.
struct HomeView: View {
    let client: BridgeClient
    let onUnpair: () -> Void
    @State private var accounts: [Account]?
    @State private var error: String?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error).listRowBackground(Color.clear)
                }
                NavigationLink {
                    SchedulerView(client: client)
                        .navigationTitle("Scheduler")
                        .navigationBarTitleDisplayMode(.inline)
                } label: {
                    HomeRow(mark: "S", title: "Scheduler", status: accounts.map { "\($0.count) accounts" } ?? "…",
                            detail: "Post and run campaigns across all your accounts")
                }
                .listRowBackground(Theme.canvas)

                ForEach(Services.all) { service in
                    NavigationLink(value: service) {
                        ServiceRow(service: service, accounts: accounts?.filter { $0.platform == service.id })
                    }
                    .listRowBackground(Theme.canvas)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("Kyrelo")
            .navigationDestination(for: ServiceSpec.self) { service in
                ServiceView(service: service, client: client, onUnpair: onUnpair)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Unpair", role: .destructive, action: onUnpair).font(.inter(.footnote))
                }
            }
            .refreshable { await load() }
        }
        .overlay {
            if client.cantReach { NotConnectedView(client: client) }
        }
        .onChange(of: client.cantReach) { _, cantReach in
            if !cantReach { Task { await load() } }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await load()
        }
    }

    private func load() async {
        do {
            accounts = try await client.accounts()
            error = nil
        } catch BridgeError.unpaired {
            onUnpair()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct ServiceRow: View {
    let service: ServiceSpec
    /// nil while loading.
    let accounts: [Account]?

    var body: some View {
        HomeRow(
            mark: service.id.mark,
            title: service.label,
            status: status,
            detail: service.sections.map(\.label).joined(separator: " · ")
        )
    }

    private var status: String {
        guard let accounts else { return "…" }
        switch accounts.count {
        case 0: return "Not connected"
        case 1: return "@\(accounts[0].handle)"
        default: return "\(accounts.count) accounts"
        }
    }
}

private struct HomeRow: View {
    let mark: String
    let title: String
    let status: String
    let detail: String

    var body: some View {
        HStack(spacing: 14) {
            Text(mark)
                .font(.inter(.headline, weight: .semibold))
                .foregroundStyle(Theme.fg)
                .frame(width: 44, height: 44)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Theme.line))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.inter(.body, weight: .semibold)).foregroundStyle(Theme.fg)
                Text(status).font(.mono(.caption)).foregroundStyle(Theme.muted)
                Text(detail).font(.inter(.caption)).foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 6)
    }
}

/// One service's sections, as the desktop's sidebar: with more than one (X),
/// a switch at the top moves between them.
struct ServiceView: View {
    let service: ServiceSpec
    let client: BridgeClient
    let onUnpair: () -> Void
    @State private var section: SectionId
    /// nil until loaded: the sections' account pickers start on the first one.
    @State private var accounts: [Account]?
    @State private var error: String?

    init(service: ServiceSpec, client: BridgeClient, onUnpair: @escaping () -> Void) {
        self.service = service
        self.client = client
        self.onUnpair = onUnpair
        _section = State(initialValue: service.sections.first ?? .accounts)
    }

    var body: some View {
        Group {
            if let accounts {
                switch section {
                case .monitor: FeedView(client: client, onUnpair: onUnpair)
                case .deleter: DeleterView(client: client, accounts: accounts)
                case .unfollow: UnfollowView(client: client, accounts: accounts)
                case .accounts: AccountsView(service: service, client: client, accounts: accounts, onChange: loadAccounts)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.canvas)
            }
        }
        .navigationTitle(service.label)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) {
            VStack(alignment: .leading, spacing: 8) {
                if service.sections.count > 1 {
                    Picker("Section", selection: $section) {
                        ForEach(service.sections, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Theme.canvas)
        }
        .task { await loadAccounts() }
    }

    private func loadAccounts() async {
        do {
            accounts = try await client.accounts().filter { $0.platform == service.id }
            error = nil
        } catch BridgeError.unpaired {
            onUnpair()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
