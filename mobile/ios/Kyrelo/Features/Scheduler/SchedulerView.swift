import SwiftUI

/// Scheduled posts per account, as on the desktop Scheduler page. The desktop
/// does the sending; the phone edits the queue.
struct SchedulerView: View {
    @State private var model: SchedulerModel
    @State private var composing = false
    @State private var editing: ScheduledPost?
    @State private var campaignAccount: Account?
    @Environment(\.scenePhase) private var scenePhase

    init(client: BridgeClient) {
        _model = State(initialValue: SchedulerModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                if !model.accounts.isEmpty {
                    accountPicker.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                }
                if let error = model.error {
                    Text(error).font(.footnote).foregroundStyle(Theme.danger).listRowBackground(Color.clear)
                }
                if model.loaded && model.accounts.isEmpty {
                    Text("No accounts connected yet. Connect them in Kyrelo on your computer.")
                        .foregroundStyle(Theme.muted).listRowBackground(Color.clear)
                }
                if model.selected != nil {
                    Section("Upcoming") {
                        if model.upcoming.isEmpty { Text("Nothing queued.").foregroundStyle(Theme.muted) }
                        ForEach(model.upcoming) { post in
                            PostRow(post: post, client: model.client)
                                .contentShape(Rectangle())
                                .onTapGesture { if post.status == .pending { editing = post } }
                        }
                    }
                    if !model.history.isEmpty {
                        Section("History") {
                            ForEach(model.history.prefix(20)) { PostRow(post: $0, client: model.client) }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ink)
            .overlay { if !model.loaded && model.error == nil { ProgressView() } }
            .refreshable { await model.load() }
            .navigationTitle("Scheduler")
            .toolbar {
                if let selected = model.selected, selected.platform == .twitter {
                    // Auto campaigns write X posts (280 characters).
                    ToolbarItem(placement: .topBarLeading) {
                        Button("✨ Campaign") { campaignAccount = selected }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { composing = true } label: { Image(systemName: "square.and.pencil") }
                        .disabled(model.accounts.isEmpty)
                }
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await model.load()
                try? await Task.sleep(for: .seconds(10))
            }
        }
        .sheet(isPresented: $composing) {
            ComposeSheet(client: model.client, accounts: model.accounts, defaultKey: model.selectedKey) {
                Task { await model.load() }
            }
        }
        .sheet(item: $editing) { post in
            EditPostSheet(client: model.client, post: post) { Task { await model.load() } }
        }
        .sheet(item: $campaignAccount) { account in
            CampaignSheet(client: model.client, account: account) { Task { await model.load() } }
        }
    }

    private var accountPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.accounts) { account in
                    let on = account.key == model.selectedKey
                    Button { model.selectedKey = account.key } label: {
                        Label { Text("@\(account.handle)") } icon: { Text(account.platform.mark) }
                            .font(.subheadline)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(on ? Theme.accent.opacity(0.18) : Theme.panel, in: Capsule())
                            .overlay(Capsule().stroke(on ? Theme.accent : Theme.line2))
                            .foregroundStyle(on ? Theme.text : Theme.muted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
        }
    }
}

struct PostRow: View {
    let post: ScheduledPost
    let client: BridgeClient

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(ISODate.parse(post.scheduledFor)?.formatted(date: .abbreviated, time: .shortened) ?? post.scheduledFor)
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.text)
                Spacer()
                status
                if post.campaignId != nil { Text("✨ auto").font(.caption2).foregroundStyle(Theme.faint) }
            }
            Text(post.text).font(.subheadline).foregroundStyle(Theme.text)
            if let imagePath = post.imagePath { BridgeImage(client: client, filename: imagePath).frame(maxHeight: 140) }
            if let error = post.error, post.status == .failed {
                Text(error).font(.caption).foregroundStyle(Theme.danger)
            }
            if let link = post.postedUrl, let url = URL(string: link) {
                Link("View post ↗", destination: url).font(.caption)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var status: some View {
        switch post.status {
        case .pending: Text("scheduled").font(.caption2).foregroundStyle(Theme.faint)
        case .posting:
            // Matches the desktop: "posting" without sendingStartedAt is still waiting for the browser.
            Text(post.sendingStartedAt == nil ? "Waiting for the browser…" : "Posting now…")
                .font(.caption2).foregroundStyle(.orange)
        case .posted: Text("posted").font(.caption2).foregroundStyle(Theme.live)
        case .failed: Text("failed").font(.caption2).foregroundStyle(Theme.danger)
        }
    }
}

/// An image stored on the desktop, loaded through the bridge (it needs the pairing token).
struct BridgeImage: View {
    let client: BridgeClient
    let filename: String
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                RoundedRectangle(cornerRadius: 8).fill(Theme.panel2).frame(height: 80)
            }
        }
        .task(id: filename) {
            if let data = try? await client.image(filename) { image = UIImage(data: data) }
        }
    }
}
