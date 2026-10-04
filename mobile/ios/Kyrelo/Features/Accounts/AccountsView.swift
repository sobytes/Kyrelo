import AuthenticationServices
import SwiftUI

/// A service's Accounts section: who's connected, and connecting another,
/// as on the desktop. Everything is checked and stored on the computer;
/// disconnecting stays there. X signs in through Chrome on the computer.
struct AccountsView: View {
    let service: ServiceSpec
    let client: BridgeClient
    let accounts: [Account]
    let onChange: () async -> Void

    var body: some View {
        List {
            Section("Connected") {
                if accounts.isEmpty {
                    Text("No \(service.label) accounts connected yet.").foregroundStyle(Theme.muted)
                }
                ForEach(accounts) { ConnectedRow(account: $0) }
            }
            Section {
                switch service.id.connect {
                case .browser:
                    Text("\(service.label) accounts connect in Kyrelo on your computer: it opens Chrome there for you to sign in once."
                         + (service.id == .facebook ? " To post as a Page, switch to it in Facebook before clicking I'm logged in." : ""))
                        .foregroundStyle(Theme.muted)
                case .oauth:
                    MastodonConnect(client: client, onDone: onChange)
                case .app:
                    Text("\(service.label) connects in Kyrelo on your computer, with your own developer app: the steps are on its \(service.label) page, and approving it opens in the computer's browser.")
                        .foregroundStyle(Theme.muted)
                case let .credentials(fields):
                    CredentialsConnect(platform: service.id, fields: fields, client: client, onDone: onChange)
                }
                Link("No \(service.label) account yet? Sign up", destination: service.id.signupUrl)
                    .font(.inter(.footnote))
                    .foregroundStyle(Theme.primary)
            } header: {
                Text(accounts.isEmpty ? "Connect \(service.label)" : "Add another \(service.label) account")
            } footer: {
                Text("Stored only on your computer. Disconnect accounts there. Kyrelo isn't affiliated with \(service.label).")
                    .font(.inter(.caption))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
    }
}

/// A connected account: posts to it go through the Scheduler.
private struct ConnectedRow: View {
    let account: Account

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("@\(account.handle)").font(.inter(.body, weight: .semibold)).foregroundStyle(Theme.fg)
                if let added = account.addedAt.flatMap(ISODate.parse) {
                    Text("Added \(added.formatted(date: .abbreviated, time: .omitted))").font(.mono(.caption)).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Label("Connected", systemImage: "checkmark.circle.fill")
                .font(.inter(.caption, weight: .semibold))
                .foregroundStyle(Theme.success)
        }
    }
}

/// Bluesky (handle + app password), Threads (token), Telegram (bot token +
/// channel) or Discord (webhook URL): the fields from PlatformId.connect. The desktop checks them before saving.
private struct CredentialsConnect: View {
    let platform: PlatformId
    let fields: [CredentialField]
    let client: BridgeClient
    let onDone: () async -> Void
    @State private var values: [String: String] = [:]
    @State private var saving = false
    @State private var message: String?
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(platform.credentialsHint.text)
                .foregroundStyle(Theme.muted)
            Link(platform.credentialsHint.link, destination: platform.loginUrl)
                .foregroundStyle(Theme.primary)
        }
        .font(.inter(.footnote))
        ForEach(fields, id: \.key) { field in
            Group {
                if field.secret {
                    SecureField(field.placeholder, text: binding(field.key))
                } else {
                    TextField(field.placeholder, text: binding(field.key))
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        Button {
            Task { await connect() }
        } label: {
            Group { if saving { ProgressView() } else { Text("Connect \(platform.label)") } }.frame(maxWidth: .infinity)
        }
        .buttonStyle(.primary)
        .disabled(saving || fields.contains { (values[$0.key] ?? "").trimmingCharacters(in: .whitespaces).isEmpty })
        if let message {
            Text(message).font(.inter(.footnote)).foregroundStyle(failed ? Theme.error : Theme.success)
        }
    }

    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }

    private func connect() async {
        saving = true
        defer { saving = false }
        do {
            let handle = try await client.connectAccount(platform, fields: values)
            values = [:]
            failed = false
            message = "@\(handle) is connected."
            await onDone()
        } catch {
            failed = true
            message = error.localizedDescription
        }
    }
}

/// Mastodon: type the server, approve Kyrelo in a browser sheet. The
/// server hands the code to this app, which passes it to the computer.
private struct MastodonConnect: View {
    let client: BridgeClient
    let onDone: () async -> Void
    @State private var server = ""
    @State private var working = false
    @State private var message: String?
    @State private var failed = false
    @Environment(\.webAuthenticationSession) private var webAuth

    var body: some View {
        Text("Enter the server you signed up on, then approve Kyrelo. No tokens to copy.")
            .font(.inter(.footnote)).foregroundStyle(Theme.muted)
        TextField("mastodon.social", text: $server)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
        Button {
            Task { await connect() }
        } label: {
            Group { if working { ProgressView() } else { Text("Connect") } }.frame(maxWidth: .infinity)
        }
        .buttonStyle(.primary)
        .disabled(working || server.trimmingCharacters(in: .whitespaces).isEmpty)
        if let message {
            Text(message).font(.inter(.footnote)).foregroundStyle(failed ? Theme.error : Theme.success)
        }
    }

    private func connect() async {
        working = true
        defer { working = false }
        do {
            let page = try await client.startMastodon(server: server)
            let callback = try await webAuth.authenticate(using: page, callbackURLScheme: "kyrelo")
            let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            guard let code = query.first(where: { $0.name == "code" })?.value,
                  let state = query.first(where: { $0.name == "state" })?.value else {
                throw BridgeError.server("Kyrelo wasn't approved. You can try again.")
            }
            let handle = try await client.finishMastodon(state: state, code: code)
            server = ""
            failed = false
            message = "@\(handle) is connected."
            await onDone()
        } catch ASWebAuthenticationSessionError.canceledLogin {
            // Closed the sheet: nothing to say.
        } catch {
            failed = true
            message = error.localizedDescription
        }
    }
}
