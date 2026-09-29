import SwiftUI

/// The Monitor's watched handles and keywords, edited as on the desktop,
/// with the account finder to suggest more.
struct WatchListSheet: View {
    let client: BridgeClient
    let onSaved: (MonitorSettings) -> Void
    @State private var handles: [String]
    @State private var keywords: [String]
    @State private var newHandle = ""
    @State private var newKeyword = ""
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(client: BridgeClient, settings: MonitorSettings, onSaved: @escaping (MonitorSettings) -> Void) {
        self.client = client
        self.onSaved = onSaved
        _handles = State(initialValue: settings.handles)
        _keywords = State(initialValue: settings.keywords ?? [])
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Find accounts for my brand") {
                        FinderView(client: client, watched: handles) { handle, watch in
                            Task { await setHandles(watch ? handles + [handle] : handles.filter { $0.lowercased() != handle.lowercased() }) }
                        }
                    }
                }
                Section("Handles") {
                    ForEach(handles, id: \.self) { Text("@\($0)") }
                        .onDelete { offsets in Task { await setHandles(handles.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)) } }
                    HStack {
                        TextField("handle", text: $newHandle)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .onSubmit(addHandle)
                        Button("Add", action: addHandle).disabled(newHandle.isEmpty)
                    }
                }
                Section {
                    ForEach(keywords, id: \.self) { Text($0) }
                        .onDelete { offsets in Task { await setKeywords(keywords.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)) } }
                    HStack {
                        TextField("keyword or \"exact phrase\"", text: $newKeyword)
                            .textInputAutocapitalization(.never)
                            .onSubmit(addKeyword)
                        Button("Add", action: addKeyword).disabled(newKeyword.isEmpty)
                    }
                } header: {
                    Text("Keywords")
                } footer: {
                    Text("Posts from anyone that mention these, from the last day.").font(.inter(.caption))
                }
                if let error { Text(error).foregroundStyle(Theme.error) }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("Watching")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func addHandle() {
        let handle = newHandle.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        newHandle = ""
        guard !handle.isEmpty, !handles.contains(where: { $0.lowercased() == handle.lowercased() }) else { return }
        Task { await setHandles(handles + [handle]) }
    }

    private func addKeyword() {
        let keyword = newKeyword.trimmingCharacters(in: .whitespaces)
        newKeyword = ""
        guard !keyword.isEmpty, !keywords.contains(keyword) else { return }
        Task { await setKeywords(keywords + [keyword]) }
    }

    // The desktop cleans and saves the list; show what it kept.
    private func setHandles(_ next: [String]) async {
        do {
            let settings = try await client.setHandles(next)
            handles = settings.handles
            onSaved(settings)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setKeywords(_ next: [String]) async {
        do {
            let settings = try await client.setKeywords(next)
            keywords = settings.keywords ?? []
            onSaved(settings)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
