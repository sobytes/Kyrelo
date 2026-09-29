import Foundation

/// The services Kyrelo works with and their sections, shared with the desktop
/// (contracts/services.json; ContractTests keeps this list in step). Sections
/// are a service's own per-account tools; the Scheduler and its campaigns are
/// global, since a post goes to accounts on any platform. The phone has
/// every screen; the desktop does the work (X's tools run in its Chrome).
enum SectionId: String, CaseIterable {
    case monitor, deleter, unfollow, accounts

    var label: String {
        switch self {
        case .monitor: "Monitor"
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

    var label: String { id.label }
}

enum Services {
    /// Sections that cover every service.
    static let global = ["scheduler"]

    static let all: [ServiceSpec] = [
        ServiceSpec(id: .twitter, slug: "x", sections: [.monitor, .deleter, .unfollow, .accounts]),
        ServiceSpec(id: .bluesky, slug: "bluesky", sections: [.accounts]),
        ServiceSpec(id: .mastodon, slug: "mastodon", sections: [.accounts]),
        ServiceSpec(id: .threads, slug: "threads", sections: [.accounts]),
    ]
}
