import Observation
import SwiftUI

/// A campaign draft as the user reviews it before scheduling.
struct EditableDraft: Identifiable {
    let id: String
    let angle: String
    var text: String
    var date: Date
    let imagePath: String?
    let note: String?
    var removeImage = false
    var removed = false

    init(_ d: CampaignDraft) {
        id = d.id
        angle = d.angle
        text = d.text
        date = ISODate.parse(d.scheduledFor) ?? Date()
        imagePath = d.media.imagePath
        note = d.media.note
    }
}

/// The campaign flow, as in the desktop's auto-campaign window: form →
/// research/writing progress → review → scheduled.
@Observable
@MainActor
final class CampaignModel {
    let client: BridgeClient
    let account: Account

    var info: CampaignsInfo?
    var campaign: Campaign?
    var drafts: [EditableDraft] = []
    var error: String?
    var busy = false

    // Form
    var brief = ""
    var url = ""
    var competitors = ""
    var count = 4
    var duration = 1
    var unitMinutes = 60
    var useAiImages = true
    var reviewFirst = true

    init(client: BridgeClient, account: Account) {
        self.client = client
        self.account = account
    }

    /// Loads AI status and the saved brand profile, and resumes this
    /// account's campaign if one is running or waiting for review.
    func load() async {
        do {
            info = try await client.campaignsInfo()
            let profile = try await client.brandProfile()
            if brief.isEmpty { (brief, url, competitors) = (profile.brief, profile.url, profile.competitors) }
            if campaign == nil,
               let open = info?.campaigns.first(where: { $0.accountId == account.id && ($0.status.isRunning || $0.status == .review) }) {
                show(open)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func start() async {
        busy = true
        defer { busy = false }
        do {
            let started = try await client.startCampaign(.init(
                accountId: account.id, brief: brief, url: url, competitors: competitors, count: count,
                windowMinutes: duration * unitMinutes, useAiImages: (info?.openaiKey ?? false) && useAiImages,
                autoSchedule: !reviewFirst
            ))
            show(started)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Polls while the campaign is being prepared (or auto-scheduled).
    func follow() async {
        while let current = campaign,
              current.status.isRunning || (current.status == .review && current.autoSchedule) {
            try? await Task.sleep(for: .seconds(2))
            if Task.isCancelled { return }
            if let next = try? await client.campaign(id: current.id) { show(next) }
        }
    }

    func schedule() async {
        guard let campaign else { return }
        busy = true
        defer { busy = false }
        do {
            let edits = drafts.filter { !$0.removed }.map {
                BridgeClient.DraftEdit(id: $0.id, text: $0.text, scheduledFor: ISODate.string($0.date), removeImage: $0.removeImage)
            }
            show(try await client.scheduleCampaign(id: campaign.id, drafts: edits))
        } catch {
            self.error = error.localizedDescription
        }
    }

    func discard() async throws {
        if let campaign { try await client.discardCampaign(id: campaign.id) }
    }

    private func show(_ next: Campaign) {
        // Don't overwrite the user's edits when polling returns the same review.
        if next.status == .review, campaign?.status != .review { drafts = next.drafts.map(EditableDraft.init) }
        campaign = next
    }
}

struct CampaignSheet: View {
    let onScheduled: () -> Void
    @State private var model: CampaignModel
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, account: Account, onScheduled: @escaping () -> Void) {
        self.onScheduled = onScheduled
        _model = State(initialValue: CampaignModel(client: client, account: account))
    }

    var body: some View {
        NavigationStack {
            content
                .scrollContentBackground(.hidden)
                .background(Theme.ink)
                .navigationTitle("Auto campaign · @\(model.account.handle)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .task { await model.load() }
        .task(id: model.campaign?.id) { await model.follow() }
        .onChange(of: model.campaign?.status) { _, status in if status == .scheduled { onScheduled() } }
    }

    @ViewBuilder private var content: some View {
        if let info = model.info, !info.aiReady {
            Form {
                Text("Auto campaigns need an AI key. Add one in Kyrelo on your computer: Settings → API keys.")
                    .foregroundStyle(Theme.muted)
            }
        } else if let campaign = model.campaign {
            switch campaign.status {
            case .researching, .writing, .media: progress(campaign)
            case .review where !campaign.autoSchedule: review
            case .review: progress(campaign)
            case .scheduled: done(campaign)
            case .failed, .discarded: failed(campaign)
            }
        } else if model.info != nil {
            form
        } else {
            ProgressView()
        }
    }

    private var form: some View {
        Form {
            Section("What are you promoting?") {
                TextEditor(text: $model.brief).frame(minHeight: 110)
            }
            Section {
                TextField("Link to your product", text: $model.url)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Competitors (optional)", text: $model.competitors)
            }
            Section {
                Stepper("Posts: \(model.count)", value: $model.count, in: 1...20)
                Stepper("Over \(model.duration) \(unitName)", value: $model.duration, in: 1...(model.unitMinutes == 1440 ? 14 : 60))
                Picker("Unit", selection: $model.unitMinutes) {
                    Text("minutes").tag(1)
                    Text("hours").tag(60)
                    Text("days").tag(1440)
                }
                .pickerStyle(.segmented)
            }
            Section {
                Toggle("Generate AI images", isOn: $model.useAiImages).disabled(!(model.info?.openaiKey ?? false))
                Toggle("Review before scheduling", isOn: $model.reviewFirst)
            } footer: {
                if !(model.info?.openaiKey ?? false) { Text("AI images need an OpenAI key in Settings on your computer.") }
            }
            if let error = model.error { Section { Text(error).foregroundStyle(Theme.danger) } }
            Section {
                Button(model.busy ? "Starting…" : "Go") { Task { await model.start() } }
                    .frame(maxWidth: .infinity)
                    .disabled(model.busy || model.brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var unitName: String {
        switch model.unitMinutes { case 1: "minutes"; case 1440: "days"; default: "hours" }
    }

    private func progress(_ campaign: Campaign) -> some View {
        let steps: [(CampaignStatus, String)] = [
            (.researching, "Researching your product, competitors and the niche"),
            (.writing, "Writing \(campaign.count) posts on different angles"),
            (.media, "Picking images, screenshots and links"),
        ]
        let current = steps.firstIndex { $0.0 == campaign.status } ?? steps.count
        return Form {
            Section {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                    HStack(spacing: 10) {
                        if i == current { ProgressView() } else {
                            Image(systemName: i < current ? "checkmark" : "circle")
                                .foregroundStyle(i < current ? Theme.live : Theme.faint)
                        }
                        Text(step.1).foregroundStyle(i <= current ? Theme.text : Theme.faint)
                    }
                }
            } footer: {
                // A live clock, so a long research step visibly isn't stuck.
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let started = ISODate.parse(campaign.createdAt) ?? context.date
                    let s = max(0, Int(context.date.timeIntervalSince(started)))
                    Text("\(campaign.progress) \(s / 60):\(String(format: "%02d", s % 60)) elapsed · usually a few minutes.")
                }
            }
        }
    }

    private var review: some View {
        Form {
            ForEach($model.drafts) { $draft in
                if draft.removed {
                    Section {
                        Button("Post removed — undo") { draft.removed = false }
                    }
                } else {
                    Section(draft.angle.capitalized) {
                        TextEditor(text: $draft.text).frame(minHeight: 100)
                        let length = ReplyRules.length(draft.text)
                        Text("\(length) / \(ReplyRules.campaignMaxLength)").font(.caption)
                            .foregroundStyle(length > ReplyRules.campaignMaxLength ? Theme.danger : Theme.faint)
                        if let image = draft.imagePath, !draft.removeImage {
                            BridgeImage(client: model.client, filename: image).frame(maxHeight: 160)
                            Button("Remove image", role: .destructive) { draft.removeImage = true }
                        }
                        if let note = draft.note { Text(note).font(.caption).foregroundStyle(Theme.faint) }
                        DatePicker("When", selection: $draft.date)
                        Button("Remove post", role: .destructive) { draft.removed = true }
                    }
                }
            }
            if let error = model.error { Section { Text(error).foregroundStyle(Theme.danger) } }
            Section {
                let kept = model.drafts.filter { !$0.removed }
                Button(model.busy ? "Scheduling…" : "Schedule \(kept.count) post\(kept.count == 1 ? "" : "s")") {
                    Task { await model.schedule() }
                }
                .disabled(model.busy || kept.isEmpty || kept.contains { ReplyRules.length($0.text) > ReplyRules.campaignMaxLength })
                Button("Discard", role: .destructive) {
                    Task {
                        do { try await model.discard(); dismiss() } catch { model.error = error.localizedDescription }
                    }
                }
            }
        }
    }

    private func done(_ campaign: Campaign) -> some View {
        Form {
            Section {
                Text("\(campaign.progress) They'll show up under Upcoming.").foregroundStyle(Theme.live)
                Text("Keep Kyrelo running on your computer so the posts go out on time.").font(.footnote).foregroundStyle(Theme.muted)
                Button("Done") { dismiss() }
            }
        }
    }

    private func failed(_ campaign: Campaign) -> some View {
        Form {
            Section {
                Text(campaign.error ?? "Something went wrong.").foregroundStyle(Theme.danger)
                Button("Start again") { model.campaign = nil }
            }
        }
    }
}
