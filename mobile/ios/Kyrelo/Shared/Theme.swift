import SwiftUI

/// Kyrelo's desktop palette (desktop/tailwind.config.ts).
enum Theme {
    static let ink = Color(hex: 0x0B0D12)
    static let panel = Color(hex: 0x11141B)
    static let panel2 = Color(hex: 0x161A23)
    static let line = Color(hex: 0x1F2430)
    static let line2 = Color(hex: 0x2A3142)
    static let accent = Color(hex: 0x7C5CFF)
    static let live = Color(hex: 0x10B981)
    static let text = Color(hex: 0xE4E4E7)
    static let muted = Color(hex: 0xA1A1AA)
    static let faint = Color(hex: 0x71717A)
    static let danger = Color(hex: 0xFB7185)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// A rounded panel, as used for cards across the desktop app.
struct Card<Content: View>: View {
    var fill = Theme.panel
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(1)
            .foregroundStyle(Theme.faint)
    }
}

func timeAgo(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
    let seconds = max(0, Int(Date().timeIntervalSince(date)))
    switch seconds {
    case ..<60: return "just now"
    case ..<3600: return "\(seconds / 60)m ago"
    case ..<86400: return "\(seconds / 3600)h ago"
    default: return "\(seconds / 86400)d ago"
    }
}
