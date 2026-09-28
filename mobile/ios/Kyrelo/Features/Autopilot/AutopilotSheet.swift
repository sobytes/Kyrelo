import SwiftUI

/// The same Autopilot settings as the Monitor card on the desktop.
struct AutopilotSheet: View {
    let onSave: (AutopilotSettings) async throws -> Void

    @State private var settings: AutopilotSettings
    @State private var saving = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(autopilot: AutopilotSettings, onSave: @escaping (AutopilotSettings) async throws -> Void) {
        self.onSave = onSave
        _settings = State(initialValue: autopilot)
    }

    private var creativityLabel: String {
        settings.creativity < 0.4 ? "focused" : settings.creativity > 0.8 ? "adventurous" : "balanced"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Draft replies automatically", isOn: $settings.enabled)
                } footer: {
                    Text("Scores new tweets and drafts replies under them. Nothing is posted: you choose a draft and send it from X.")
                }

                Section("Tone") {
                    Picker("Tone", selection: $settings.tone) {
                        ForEach(ReplyTone.allCases) { Text($0.rawValue.capitalized).tag($0) }
                    }
                    .pickerStyle(.menu)
                }

                Section("Reply style") {
                    Picker("Style", selection: $settings.style) {
                        ForEach(ReplyStyle.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Stepper("Worth replying: \(settings.minScore)+", value: $settings.minScore, in: 0...100, step: 5)
                    VStack(alignment: .leading) {
                        Text("Creativity: \(creativityLabel)")
                        Slider(value: $settings.creativity, in: 0...1, step: 0.1)
                    }
                } footer: {
                    Text("Tweets scoring below the minimum are skipped, with the reason shown.")
                }

                Section("Topics you care about") {
                    TextField("AI agents, dev tools, startups", text: $settings.topics)
                }
                Section("Stay away from") {
                    TextField("politics, giveaways", text: $settings.avoid)
                }

                if let error {
                    Section { Text(error).foregroundStyle(Theme.danger) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ink)
            .navigationTitle("Autopilot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save).disabled(saving)
                }
            }
        }
    }

    private func save() {
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                try await onSave(settings)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
