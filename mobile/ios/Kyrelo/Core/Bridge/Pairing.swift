import Foundation
import Security

/// How to reach Kyrelo on the user's computer (desktop/lib/mobile-bridge.ts).
struct Pairing: Codable, Equatable {
    /// The computer's addresses, Tailscale first. Tried in order.
    let hosts: [String]
    let port: Int
    let token: String

    /// Reads a `kyrelo://pair?hosts=…&port=…&token=…` link. Format:
    /// contracts/pairing-links.json.
    init?(link: String) {
        guard let components = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              components.scheme == "kyrelo", components.host == "pair" else { return nil }
        let query = Dictionary(
            (components.queryItems ?? []).map { ($0.name, $0.value ?? "") },
            uniquingKeysWith: { first, _ in first }
        )
        let hosts = (query["hosts"] ?? "").split(separator: ",").map(String.init).filter { !$0.isEmpty }
        guard !hosts.isEmpty, let port = Int(query["port"] ?? ""), port > 0,
              let token = query["token"], !token.isEmpty else { return nil }
        self.init(hosts: hosts, port: port, token: token)
    }

    init(hosts: [String], port: Int, token: String) {
        self.hosts = hosts
        self.port = port
        self.token = token
    }
}

/// Keeps the pairing (it contains the token) in the Keychain.
enum PairingStore {
    private static let service = "com.sobytes.kyrelo.mobile"
    private static let account = "pairing"

    static func load() -> Pairing? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Pairing.self, from: data)
    }

    static func save(_ pairing: Pairing?) {
        SecItemDelete(baseQuery as CFDictionary)
        guard let pairing, let data = try? JSONEncoder().encode(pairing) else { return }
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    private static var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
