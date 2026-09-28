---
name: architecture-first-engineering
description: Safe, minimal, architecture-consistent changes to an existing codebase. Use for any non-trivial change, and especially in monorepos where several apps or platforms (web, iOS, Android, TV, backend, CLI, SDK) must implement the same behaviour. Covers tracing the code before editing, keeping cross-app contracts in parity, the smallest correct change, verification, and resisting AI over-production.
---

# Architecture-First Engineering

Make safe, minimal, architecture-consistent changes to existing codebases. Language, framework and platform agnostic.

The goal is not the most elegant solution in isolation. It is to understand the existing system, preserve its contracts, follow its patterns, keep equivalent apps behaving the same, make the smallest correct change, prove it works, and leave the codebase no worse than you found it.

> Understand first. Follow precedent. Respect contracts. Write boring code. Make the smallest safe change. Prove it works. Remove anything you didn't need.

**Loop:** INSPECT → UNDERSTAND → IDENTIFY CONTRACTS → PLAN → IMPLEMENT → VERIFY → COMPARE → REVIEW → REFINE

Never jump straight from a task description to implementation.

---

## 1. Inspect before coding

- Find the relevant implementation and trace the real execution path.
- Find related interfaces, types, tests, consumers, events, APIs and state.
- Look for the same functionality elsewhere, including sibling apps and packages, and identify the canonical (reference) implementation if one exists.
- Learn the ownership boundaries and the conventions in nearby code.
- Check whether the behaviour is governed by an existing cross-app contract.

Don't infer architecture from filenames. Read the code.

## 2. Understand the architecture

Answer before planning:

- Which layer owns this behaviour, and which component should make the decision?
- Where does the data originate, get transformed, and get stored?
- What public contracts exist, and who depends on them?
- What lifecycle and event boundaries apply?
- Is this already implemented on another platform? Is there a shared spec, schema, interface, protocol or test describing it?

Extend the existing architecture rather than building a parallel one.

## 3. Contracts are architecture

In a multi-app repo, apps can differ in language, framework and platform APIs while implementing the same product behaviour. That shared behaviour is a **contract**: it says *what* must happen, not *how*.

Contracts typically cover: request construction (headers, parameters, payloads), authentication, response interpretation, error mapping, retries, timeouts, caching, state transitions, events and analytics, feature flags, configuration, persistence, navigation, entitlement and business rules, lifecycle, and public APIs.

Different languages, frameworks and native APIs are fine. **Unintentional differences in product behaviour are not.**

### Discovering a contract

Before changing functionality that may exist in more than one app:

1. Search the repo for equivalent implementations.
2. Decide which one, if any, is canonical.
3. Compare behaviour, not names: inputs, outputs, side effects, errors, events, state transitions, external calls.
4. Separate intentional platform differences from drift.
5. State the contract every relevant implementation must satisfy.

### Contract before platform

Don't start with "how should Android do this?". Start with "what must every client do?", written as inputs, outputs, side effects, errors, events, state transitions, lifecycle and external interactions. Then ask what the cleanest *native* implementation of that contract is on each platform.

For an external service, parity usually means every app: validates and normalises input the same way → builds an equivalent request → calls the same logical operation → interprets responses the same way → maps errors consistently → produces the same domain result and observable events.

### Platform differences

Differences are legitimate when they come from OS capabilities, lifecycle, native APIs, security rules, performance, hardware, framework limits, or genuinely different product requirements. For each difference decide: **intentional or drift?**

- Don't flatten intentional differences for symmetry.
- Don't keep accidental drift just because it already exists.
- Document intentional differences where the next engineer will find them.

### Changing a contract

A contract change is bigger than a local change:

1. Find every implementation and consumer.
2. Check schemas, interfaces, tests, docs and external dependencies.
3. Decide whether it is additive or breaking; prefer additive.
4. Update every affected implementation in the same change.
5. Verify parity afterwards.

Never change one app's interpretation of shared behaviour without checking its siblings. A task in one app may reveal a repo-wide contract problem; investigate before assuming the fix stays local.

### Making contracts hard to break

Prefer contracts that a machine can check: schemas, OpenAPI specs, generated models, shared fixtures and test vectors, shared constants, versioned contract docs. Where practical, give every implementation tests that assert the same behavioural expectations (request semantics, response and error mapping, retries, timeouts, state transitions, events), even if each is written in its own language.

Use the smallest mechanism that makes the contract clear and difficult to violate. Don't build a contract framework because one could exist.

## 4. Search for precedent

Prefer, in order: **REUSE → EXTEND → ADAPT → CREATE.**

If the repo already solves this class of problem, follow that implementation unless there's a concrete reason not to. Consistency beats local cleverness.

### Novelty budget: zero

Don't add new abstractions, layers, dependencies, frameworks, state or event systems, wrappers or patterns unless the existing architecture genuinely can't support the requirement. Every new abstraction must solve a demonstrated problem, not a hypothetical one.

## 5. Make the smallest safe change

Make the smallest change that completely solves the problem. A task is not permission to redesign its surroundings. Avoid unrelated refactors, speculative cleanup, renaming or reformatting untouched code, premature generalisation, and public API changes you don't need.

Smallest doesn't mean blindly local: if the behaviour belongs to a cross-app contract, the smallest *correct* change may touch several implementations.

**Preserve existing contracts.** Assume current behaviour is intentional until evidence says otherwise. Before changing an interface, event, return value, request, error, state transition or lifecycle: find its consumers, check sibling implementations and tests, and prefer additive changes. Never silently change established semantics.

**Keep responsibilities where they belong:** domain logic in the domain layer, platform code behind platform boundaries, UI logic in presentation, state transitions where the state is owned, translation at the boundaries. Don't fix architecture problems by teaching unrelated layers about each other.

## 6. Coding practices

Write boring, obvious, maintainable code. Optimise for correctness, then readability, simplicity, maintainability and consistency, then performance where it matters.

- **Simple:** solve the current requirement. No speculative abstractions, indirection, helpers, wrappers, configuration or generic solutions for imagined futures (YAGNI, KISS).
- **Explicit:** clear control flow over clever one-liners. `if (isPlaying) { startTimer() }` beats `isPlaying && startTimer()`. Fewer lines is not the same as simpler.
- **Functions:** one coherent job, predictable inputs and outputs, no hidden side effects. Extract a function when it removes real duplication, names an important operation, isolates complexity or aids testing; not to create one-use helpers that hide the flow.
- **Names:** say what things are, in the domain's own terms (`remainingDuration`, `hasActiveSession`, `createPlaybackRequest`, not `data`, `flag`, `handleThing`). Booleans read naturally: `isReady`, `canRetry`, `shouldRefresh`.
- **Control flow:** early returns, guard clauses, shallow nesting, an obvious happy path.
- **Types:** use them to make invalid states unrepresentable. Don't weaken types, force-unwrap or cast just to silence the compiler; fix the underlying contract. Represent optionality honestly.
- **Missing values:** decide whether absence is valid, invalid, recoverable or a bug, and handle it accordingly. Don't scatter fallbacks and optional chaining without knowing whether the value can really be missing.
- **Errors:** never swallow a meaningful error. Handle, propagate, translate or log it at the right boundary. Don't catch just to rethrow. Equivalent apps map equivalent failures the same way.
- **State:** minimise mutable state, keep one source of truth, don't store what you can cheaply derive, make ownership and transitions obvious.
- **Side effects:** I/O, mutation, network calls, events and persistence should be visible from a function's name and location.
- **Duplication:** two similar blocks aren't necessarily one concept. Abstract only when they change for the same reason; small obvious duplication beats the wrong abstraction.
- **Constants:** name values that encode a rule; don't wrap every literal.
- **Comments:** explain *why*: non-obvious constraints, platform limits, workarounds, intentional contract differences. Prefer clearer code to explanatory comments.
- **Dependencies:** don't add one for something the project already does. Weigh maintenance, size, security and compatibility first.
- **Performance:** don't optimise blindly. Know whether a path is hot and how big the data is; measure when you can.
- **Async and concurrency:** think about ordering, cancellation, stale responses, repeated calls, races, retries, partial failure and teardown. Don't add concurrency machinery the problem doesn't need.
- **APIs:** small, exposing only what consumers need, following project conventions. Replace unreadable calls like `createItem(true, false, true)` with meaningful domain concepts.
- **Defensiveness:** don't guard against states the architecture guarantees can't happen. Check whether a state is actually possible first.
- **Local style wins:** the repository is the style guide for naming, structure, imports, errors, tests, async, state, DI, comments and formatting.

## 7. AI coding discipline

AI-generated code over-produces. Resist it.

- Before adding anything: *does this need to exist?*
- After implementing: *what can I remove without losing required behaviour or breaking a contract?*

Watch for unnecessary abstractions, interfaces, helpers and configuration; excess defensive checks, validation, comments and logging; overly generic types; speculative edge cases; rewriting surrounding code; solving adjacent problems; and large diffs for small requirements.

When several solutions are correct, choose the one with fewer concepts, fewer moving parts, a smaller surface area and clearer intent.

## 8. Verify as you go

Make one coherent change at a time. After each step: **BUILD → TEST → INSPECT → COMPARE → FIX → REPEAT.**

Use the strongest signals available: compiler/type checker, focused tests, contract tests, integration tests, lint/static analysis, runtime behaviour, manual inspection. Don't stop because the code *looks* right, and don't build a large speculative implementation to test only at the end.

**Tests** prove behaviour, not implementation details. Cover the normal path and the edge cases that can really occur. A bug fix should come with a test that would have failed before the fix. For shared behaviour, assert the contract.

**Cross-app check** for shared functionality. Do the implementations:

- accept equivalent inputs and produce equivalent domain outputs?
- call external services with equivalent semantics and read responses the same way?
- map errors, emit events and transition state consistently?
- apply the same business rules?

Where they differ, is the difference intentional and documented? Code can differ; product behaviour shouldn't.

## 9. Review and challenge your own work

Read the final diff as if reviewing someone else's PR:

- Is every changed line required? Did I change more than necessary?
- Did I duplicate an existing pattern or add needless complexity?
- Did I accidentally change behaviour or a contract? Did I update every relevant implementation?
- Are platform differences intentional? Are lifecycle and error paths covered?
- Did I leave debugging code behind? Would another engineer understand why each piece exists?

Then try to prove it wrong against cases that can genuinely occur: missing values, empty collections, duplicate events, repeated calls, races, stale state, partial failures, retries, cancellation, initialisation and teardown, unexpected ordering, backwards compatibility, contract drift, platform lifecycle differences. Don't manufacture complexity to tick a checklist.

## 10. Stop and rethink when

- the change needs to bypass an established abstraction;
- unrelated systems unexpectedly need modifying;
- a public contract must unexpectedly change;
- implementations start diverging with no product reason;
- significant duplication is required;
- the reference architecture can't support the requirement;
- far more code is needed than expected;
- tests contradict your architectural assumptions;
- a small problem seems to need a new framework or abstraction.

Inspect again before writing more code. Don't solve architectural uncertainty by piling on patches.

## Definition of done

- The requested behaviour works, and relevant tests and build/type checks pass.
- The architecture is still consistent, and the relevant contracts are understood.
- Shared behaviour is aligned across implementations; platform differences are intentional.
- Existing contracts are preserved unless deliberately changed, and every implementation was updated if they were.
- The final diff was reviewed and unnecessary changes removed.
- No known relevant failure was ignored.

The objective is not maximum code. It is the smallest well-understood, verified change that fits the existing architecture and preserves behavioural contracts across the system.
