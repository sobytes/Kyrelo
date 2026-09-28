# Contracts

Rules the desktop app (TypeScript) and the iOS app (Swift) must agree on,
written as test fixtures. Each app's tests read these same files, so if one
side's logic drifts, its tests fail:

- desktop: `desktop/lib/contracts.test.ts` (Vitest)
- iOS: `mobile/ios/KyreloTests/ContractTests.swift` (XCTest)

| File | Rule |
|---|---|
| `reply-rules.json` | Reply and campaign-post length (as X counts it: links are 23) and their limits, tone and style names |
| `platform-rules.json` | Each platform's name, post limit and how it counts length (desktop/lib/platforms.ts) |
| `pairing-links.json` | The `kyrelo://pair` link the desktop shows and the phone reads |
| `scheduler.json` | Sample accounts, posts, campaigns and brand profile responses the phone must decode |
| `monitor-feed.json` | A sample `/api/grok-state` + `/api/grok-settings` response the phone must decode |

Change a rule here first, then make both apps pass.
