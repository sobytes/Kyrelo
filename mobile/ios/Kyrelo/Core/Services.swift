import Foundation

/// The services Kyrelo works with and their sections, shared with the desktop
/// (contracts/services.json; ContractTests keeps this list in step). The
/// phone shows the sections it has screens for; the rest (Deleter,
/// Unfollow, connecting accounts) are on the computer.
enum SectionId: String, CaseIterable {
    case monitor, scheduler, deleter, unfollow, accounts

    var label: String {
        switch self {
        case .monitor: "Monitor"
        case .scheduler: "Scheduler"
        case .deleter: "Deleter"
        case .unfollow: "Unfollow"
        case .accounts: "Accounts"
        }
    }
}

struct ServiceSpec: Identifiable, Hashable {
    let id: PlatformId
    let slug: String
    let sections: [SectionId]
    let features: [String]

    var label: String { id.label }
    /// The sections this app has screens for, in order.
    var phoneSections: [SectionId] { sections.filter { $0 == .monitor || $0 == .scheduler } }
    var hasCampaigns: Bool { features.contains("campaigns") }
}

enum Services {
    static let all: [ServiceSpec] = [
        ServiceSpec(id: .twitter, slug: "x", sections: [.monitor, .scheduler, .deleter, .unfollow, .accounts], features: ["campaigns"]),
        ServiceSpec(id: .bluesky, slug: "bluesky", sections: [.scheduler, .accounts], features: []),
        ServiceSpec(id: .mastodon, slug: "mastodon", sections: [.scheduler, .accounts], features: []),
        ServiceSpec(id: .threads, slug: "threads", sections: [.scheduler, .accounts], features: []),
    ]
}
