import SwiftUI

/// The home screen, as on the desktop: the Scheduler (every account) and
/// Comments, then one row per service, each opening its sections.
struct HomeView: View {
    let client: BridgeClient
    let onUnpair: () -> Void
    @State private var accounts: [Account]?
    /// "Add a service" starts open when nothing is connected yet.
    @State private var showUnused = false
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
                    HomeRow(icon: Image("Global-scheduler"), title: "Scheduler", status: accounts.map { "\($0.count) accounts" } ?? "…",
                            detail: "Post and run campaigns across all your accounts")
                }
                .listRowBackground(Theme.canvas)

                NavigationLink {
                    CommentsView(client: client)
                        .navigationTitle("Comments")
                        .navigationBarTitleDisplayMode(.inline)
                } label: {
                    HomeRow(icon: Image("Global-comments"), title: "Comments", status: "AI reply drafts",
                            detail: "Answer comments on your posts, on every service")
                }
                .listRowBackground(Theme.canvas)

                NavigationLink {
                    MediaView(client: client)
                        .navigationTitle("Media")
                        .navigationBarTitleDisplayMode(.inline)
                } label: {
                    HomeRow(icon: Image("Global-media"), title: "Media", status: "Photos and videos",
                            detail: "Send photos and videos to buckets for posts and campaigns")
                }
                .listRowBackground(Theme.canvas)

                // The services in use, then the rest folded under "Add a service",
                // as on the desktop's sidebar. Until accounts load, nothing is folded.
                ForEach(connectedServices) { service in
                    NavigationLink(value: service) {
                        ServiceRow(service: service, accounts: accounts?.filter { $0.platform == service.id })
                    }
                    .listRowBackground(Theme.canvas)
                }

                if !unusedServices.isEmpty {
                    DisclosureGroup(isExpanded: $showUnused) {
                        ForEach(unusedServices) { service in
                            NavigationLink(value: service) {
                                HStack(spacing: 12) {
                                    service.id.icon.resizable().scaledToFit().frame(width: 16, height: 16).foregroundStyle(Theme.muted)
                                    Text(service.label).font(.inter(.subheadline)).foregroundStyle(Theme.muted)
                                    Spacer()
                                    Text("Connect").font(.inter(.caption)).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 44, height: 44)
                                .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Theme.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Add a service").font(.inter(.body, weight: .semibold)).foregroundStyle(Theme.fg)
                                Text("\(unusedServices.count) more you can connect").font(.inter(.caption)).foregroundStyle(Theme.muted)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .tint(Theme.muted)
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

    private var connectedServices: [ServiceSpec] {
        guard let accounts else { return Services.all }
        return Services.all.filter { s in accounts.contains { $0.platform == s.id } }
    }

    private var unusedServices: [ServiceSpec] {
        guard let accounts else { return [] }
        return Services.all.filter { s in !accounts.contains { $0.platform == s.id } }
    }

    private func load() async {
        do {
            let loaded = try await client.accounts()
            if accounts == nil && loaded.isEmpty { showUnused = true }
            accounts = loaded
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
            icon: service.id.icon,
            title: service.label,
            status: status,
            detail: service.sections.map(\.label).joined(separator: " · "),
            connected: !(accounts ?? []).isEmpty
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
    let icon: Image
    let title: String
    let status: String
    let detail: String
    /// Shows the green "connected" dot.
    var connected = false

    var body: some View {
        HStack(spacing: 14) {
            icon
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                .foregroundStyle(Theme.fg)
                .frame(width: 44, height: 44)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md))
                .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Theme.line))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.inter(.body, weight: .semibold)).foregroundStyle(Theme.fg)
                Text(status).font(.mono(.caption)).foregroundStyle(Theme.muted)
                Text(detail).font(.inter(.caption)).foregroundStyle(Theme.muted)
            }
            if connected {
                Spacer()
                Circle().fill(Theme.success).frame(width: 8, height: 8).accessibilityLabel("Connected")
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
