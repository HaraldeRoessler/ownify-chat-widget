# Changelog

## 0.1.1 — 2026-05-01

First security review pass — two reviewers, ~14 unique findings
(High/Medium/Low). All in-scope items addressed.

### Fixed

- **Endpoint redirection (HIGH)** — `opts.endpoint` / `data-endpoint`
  is now URL-parsed and validated. Non-http(s) schemes rejected,
  embedded credentials rejected, parse failures rejected. Defends
  against an attacker who can clobber `data-endpoint` redirecting
  visitor messages to a phishing endpoint.
- **innerHTML XSS pattern (MED)** — DOM construction switched from
  `root.innerHTML = '<...>'` strings to `document.createElement` /
  `appendChild`. Eliminates the entire injection class — no future
  edit can accidentally interpolate attacker-controlled HTML.
- **No fetch timeout (MED)** — every request now runs under an
  `AbortController` with a 30 s default timeout. Hung endpoints
  surface as "Request timed out." rather than locking the widget
  in a busy state.
- **Input length cap (MED)** — `MAX_MESSAGE_LENGTH = 4096`. Pasted
  multi-MB input is truncated client-side before POSTing. Backed
  by `<input maxLength>` so the user gets immediate feedback.
- **Orphaned async closures after `destroy()` (LOW)** — `destroy()`
  now aborts the in-flight fetch via the stored AbortController.
  Closures check a `destroyed` flag before mutating DOM nodes.
  Prevents memory leaks and stale-DOM bugs when remounting.
- **Missing `noreferrer` (LOW)** — "Powered by ownify" link now
  uses `rel="noopener noreferrer"`. Embedding-page URL no longer
  leaks via Referer.
- **Whitespace-only slug (LOW)** — slug is `.trim()`'d and
  rejected if empty. Both APIs.
- **Server error verbatim render (LOW)** — HTTP error bodies are
  no longer rendered into the chat. Visitor sees a generic
  "Something went wrong. Please try again."; details land in
  `console.error` for the embedding site's developer.
- **Unknown 2xx response shape (LOW)** — replaced
  `JSON.stringify(body)` fallback with a generic "Received an
  unexpected response." message. Console gets the raw body for
  debugging.
- **Standalone double-init lockout (LOW)** — `data-ownify-chat-init`
  flag is set AFTER successful slug + endpoint validation, so
  fixing a typo and re-bootstrapping actually retries the node.
- **Programmatic double-mount (LOW)** — `mountOwnifyChat()` checks
  `root.dataset.ownifyChatInit` and throws if already mounted.
- **Type validation on options (LOW)** — every string option now
  goes through `String()` coercion or rejected at construct time.
  Non-finite numeric options fall back to defaults.
- **Client-side rate limit (LOW)** — `submitCooldownMs = 500`
  default debounce on the submit handler. Stops accidental
  double-clicks + scripted spam without breaking real users.
- **Missing credentials control (LOW)** — `credentials: 'omit'`
  explicit on every fetch. Public chat is unauth-by-design;
  visitors' ownify cookies don't travel cross-origin.
- **CSP inline-style incompatibility (LOW)** — `opts.styleNonce`
  / `data-style-nonce` is set on the injected `<style>` element
  when provided. Strict-CSP sites can pass their nonce.
- **`X-Caller-DID` shape validation (LOW)** — value is regex-checked
  against `^did:[a-z0-9]{1,32}:[A-Za-z0-9._-]{1,256}$` before
  forwarding. Audit-only on the server, but rejecting bad shapes
  here keeps spoofed values out of the receiver audit log.
- **MIME type detection (INFO)** — `String.includes()` instead of
  `indexOf() !== -1`. One-character correctness improvement.

### Documentation

- README: SRI recommendation for the standalone `<script>` tag
  (with a placeholder for the per-release hash).
- README: explicit CSP section explaining the inline-style nonce
  flow.
- README: limits section documenting message length / cooldown /
  fetch timeout defaults and how to override.
- Both files explicitly noted as hand-maintained mirrors of each
  other; v0.2 build step on the roadmap.

### Compatibility

Behavioural changes (all minor):
- Server error responses no longer surface their body to the user.
- Unknown 2xx response shapes no longer dump raw JSON to the user.
- Calling `mountOwnifyChat()` twice on the same root throws.
- `data-endpoint` with bad scheme / embedded creds is rejected
  rather than silently fetched.

## 0.1.0 — 2026-05-01

Initial release.

- `mountOwnifyChat(root, opts)` — programmatic API for build-system
  users (React/Vue/Svelte/plain bundles).
- `bootstrapOwnifyChat()` — auto-mount any `[data-ownify-chat]` /
  `#ownify-chat` element on the page.
- Standalone IIFE at `src/standalone.js` for `<script>`-tag use;
  this is what gets served at https://ownify.ai/chat-widget.js.
- Wire shape: `POST <baseUrl>/api/chat/<slug>` with
  `{message: string}`. Default `baseUrl` is `https://ownify.ai`;
  override via `opts.baseUrl` or `data-base-url` for self-hosted
  ownify deployments.
- Optional `X-Caller-DID` header forwarded for audit-only attribution.
- CSS variables for theming (`--ow-bg`, `--ow-fg`, `--ow-border`,
  `--ow-accent`, `--ow-msg-bg`, `--ow-input-bg`, `--ow-meta`).
