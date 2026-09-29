import SwiftUI
import UIKit

/// The design system's values (contracts/design-tokens.json, shared with the
/// desktop app and the website). ContractTests checks these match the JSON.
enum Palette {
    static let canvas: UInt32 = 0xF5F3EE
    static let surface: UInt32 = 0xFFFFFF
    static let fg: UInt32 = 0x171717
    static let muted: UInt32 = 0x686868
    static let line: UInt32 = 0xD8D5CE
    static let primary: UInt32 = 0xD94F35
    static let primaryHover: UInt32 = 0xBB402B
    static let accent: UInt32 = 0xE9B949
    static let success: UInt32 = 0x397A55
    static let warning: UInt32 = 0xB7791F
    static let error: UInt32 = 0xB83A3A
}

enum Radius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
}

/// The tokens as SwiftUI values. Views use these, never their own colours.
enum Theme {
    static let canvas = Color(hex: Palette.canvas)
    static let surface = Color(hex: Palette.surface)
    static let fg = Color(hex: Palette.fg)
    static let muted = Color(hex: Palette.muted)
    static let line = Color(hex: Palette.line)
    static let primary = Color(hex: Palette.primary)
    static let accent = Color(hex: Palette.accent)
    static let success = Color(hex: Palette.success)
    static let warning = Color(hex: Palette.warning)
    static let error = Color(hex: Palette.error)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

// MARK: - Type

/// Inter for text and IBM Plex Mono for data (times, counts, handles),
/// bundled in Resources/Fonts. Both scale with the user's text size.
extension Font {
    static func inter(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .custom("Inter", size: UIFont.preferredFont(forTextStyle: style.uiKit).pointSize, relativeTo: style).weight(weight)
    }

    static func mono(_ style: Font.TextStyle) -> Font {
        .custom("IBMPlexMono-Regular", size: UIFont.preferredFont(forTextStyle: style.uiKit).pointSize, relativeTo: style)
    }
}

private extension Font.TextStyle {
    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

enum Appearance {
    /// Navigation and tab bars in the design's colours and type: flat
    /// canvas, a hairline, Inter titles.
    static func apply() {
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor(hex: Palette.canvas)
        nav.shadowColor = UIColor(hex: Palette.line)
        nav.titleTextAttributes = [
            .foregroundColor: UIColor(hex: Palette.fg),
            .font: UIFont(name: "Inter", size: 17)?.withWeight(.semibold) ?? .systemFont(ofSize: 17, weight: .semibold),
        ]
        nav.largeTitleTextAttributes = [
            .foregroundColor: UIColor(hex: Palette.fg),
            .font: UIFont(name: "Inter", size: 30)?.withWeight(.semibold) ?? .systemFont(ofSize: 30, weight: .semibold),
        ]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(hex: Palette.canvas)
        tab.shadowColor = UIColor(hex: Palette.line)
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }
}

private extension UIFont {
    /// A weight of a variable font (Inter ships as one file with a weight axis).
    func withWeight(_ weight: UIFont.Weight) -> UIFont {
        let descriptor = fontDescriptor.addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: weight]])
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}

// MARK: - Components

/// The one main action on a screen: primary fill, 4px corners.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.inter(.body, weight: .medium))
            .foregroundStyle(Theme.surface)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                configuration.isPressed ? Color(hex: Palette.primaryHover) : Theme.primary,
                in: RoundedRectangle(cornerRadius: Radius.sm)
            )
            .opacity(isEnabled ? 1 : 0.5)
    }
}

/// Everything else: a bordered surface. `isSelected` marks the chosen one of a set.
struct SecondaryButtonStyle: ButtonStyle {
    var isSelected = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.inter(.subheadline, weight: .medium))
            .foregroundStyle(Theme.fg)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(configuration.isPressed ? Theme.canvas : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.sm))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(isSelected ? Theme.fg : Theme.line))
            .opacity(isEnabled ? 1 : 0.5)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

/// A surface for things that are objects (a post, a draft). Screens group
/// content with whitespace and rules, not cards.
struct Card<Content: View>: View {
    var fill = Theme.surface
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(Theme.line))
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.mono(.caption))
            .tracking(0.8)
            .foregroundStyle(Theme.muted)
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
