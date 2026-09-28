import Foundation

/// Reply rules shared with the desktop (desktop/lib/tweet.ts). Checked against
/// contracts/reply-rules.json by ContractTests, as the desktop's are.
enum ReplyRules {
    static let maxLength = 270

    private static let url = try! NSRegularExpression(pattern: #"https?://\S+"#)

    /// Length as X counts it: every link is 23. Counted in UTF-16 units, as
    /// JavaScript's `length` does, so both apps agree on emoji.
    static func length(_ text: String) -> Int {
        let range = NSRange(text.startIndex..., in: text)
        let replaced = url.stringByReplacingMatches(in: text, range: range, withTemplate: String(repeating: "x", count: 23))
        return replaced.utf16.count
    }
}
