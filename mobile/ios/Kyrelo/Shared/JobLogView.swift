import SwiftUI

/// A desktop job's status and log, as the desktop's JobLog shows it.
struct JobLogView: View {
    let running: Bool
    let summary: String
    let log: [String]
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(error != nil ? "FAILED" : running ? "RUNNING" : "DONE")
                    .font(.mono(.caption2))
                    .foregroundStyle(error != nil ? Theme.error : running ? Theme.warning : Theme.success)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(Theme.line))
                Text(summary).font(.inter(.footnote)).foregroundStyle(Theme.muted)
                if running { ProgressView().controlSize(.small) }
            }
            if let error { Text(error).font(.inter(.footnote)).foregroundStyle(Theme.error) }
            // The newest lines, trimmed of their timestamps.
            ForEach(Array(log.suffix(8).enumerated()), id: \.offset) { _, line in
                Text(line.replacingOccurrences(of: #"^\[[^\]]+\] "#, with: "", options: .regularExpression))
                    .font(.mono(.caption2))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
        }
    }
}

/// Picks one of the X accounts, when there's more than one.
struct XAccountPicker: View {
    let accounts: [Account]
    @Binding var selected: String?

    var body: some View {
        if accounts.count > 1 {
            Picker("Account", selection: $selected) {
                ForEach(accounts) { Text("@\($0.handle)").tag(Optional($0.id)) }
            }
        }
    }
}
