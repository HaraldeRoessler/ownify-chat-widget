# Changelog

## 0.1.3 — 2026-05-01

Third security review pass — two reviewers, ~12 unique findings
(one MED, several LOW URL-validation edge cases, INFO niceties).

### Fixed

- **Error-body DoS (MED)** — response status is now checked BEFORE
  parsing the body. On non-2xx, the body stream is cancelled via
  `r.body.cancel()` rather than awaited via `r.json()` / `r.text()`.
  Defends against a malicious / compromised backend returning
  HTTP 500 with a multi-MB JSON payload that would freeze the
  visitor's tab.
- **URL validation hardening (LOW × 5)** — comprehensive
  expansion of `validateEndpoint`:
  - IPv4-mapped IPv6 loopback / RFC1918 / link-local
    (`::ffff:127.x`, `::ffff:10.x`, `::ffff:192.168.x`,
    `::ffff:169.254.x`, `::ffff:172.16-31.x`)
  - IPv6 unspecified `::` and expanded forms
    `0:0:0:0:0:0:0:0` / `0:0:0:0:0:0:0:1`
  - IPv6 `fc00::/7` ULA + `fe80::/10` link-local
  - Trailing-dot hostname normalisation (`localhost.` matches `localhost`)
  - Pure-numeric / hex hostnames (`2130706433`, `0x7f000001`)
  - Additional DNS loopback names: `ip6-localhost`, `ip6-loopback`
- **Referer leak (LOW)** — `referrerPolicy: 'no-referrer'` on the
  fetch. Embedding page's URL no longer travels to the chat
  endpoint with every message.
- **Standalone cleanup API (LOW)** — `mountOwnifyChat` attaches
  `_ownifyDestroy` on the mount node so SPA hosts can tear down
  before removing the container. Documented in README. Standalone
  IIFE consumers were missing this entirely; npm consumers can also
  use it instead of holding the return-value handle.
- **Network-error console leak (LOW)** — `console.error` for
  network errors logs only `err.name` instead of the full error
  object. Consistent with the HTTP-error path that already only
  logs the status code. Prevents stack-trace harvesting by a
  console-overriding script on the embedding page.
- **`data-credentials` not wired in bootstrap (INFO)** — fixed.
  Setting `data-credentials="same-origin"` on the mount node now
  works, validated by the existing `['omit','same-origin','include']`
  allowlist in `mountOwnifyChat`.
- **CSP nonce auto-inheritance for standalone (INFO)** — the
  build script captures `document.currentScript.nonce` at IIFE
  entry and forwards it as the default `styleNonce` for every
  bootstrapped node. Embedders no longer need to duplicate the
  nonce on every `<div data-ownify-chat>`; the nonce on the
  `<script>` tag is enough.

### Compatibility

Behavioural changes (all minor):
- Endpoint URLs pointing at IPv4-mapped IPv6 / IPv6 ULA + link-local
  / numeric hostnames / trailing-dot loopback variants are now
  rejected. Self-hosted ownify deployments on IPv6 ULA addresses
  should use a hostname instead.
- HTTP error responses are no longer parsed; the visitor sees a
  generic "Something went wrong" regardless of body content. (Body
  was already not rendered to the user, but it was still parsed
  into memory.)
- `Referer` header is no longer sent to the chat endpoint.
  Operators relying on Referer for analytics need to reverse-proxy
  and inject it themselves.

## 0.1.2 — 2026-05-01

Second security review pass — two reviewers, the headline issues are
the build-step gap (drift risk between index.js and standalone.js)
and several edge-case hardening items.

### Fixed

- **Build step (MED, process)** — `scripts/build-standalone.js`
  derives `src/standalone.js` from `src/index.js`. Single source of
  truth: `src/index.js`. The `prepack` hook runs the build before
  `npm publish`, so the asymmetry that caused the 0.1.1 `destroyed`
  flag drift cannot recur. Run via `npm run build:standalone`.
- **Standalone `destroyed` flag drift (LOW)** — closed automatically
  by the build step; the standalone IIFE now carries the same
  destroyed-after-await guards that index.js has.
- **Response size cap (LOW)** — `MAX_REPLY_LENGTH = 10000`. Longer
  server replies are truncated with `…`. Defends the visitor's
  browser against a compromised/malicious backend streaming a
  multi-MB reply that would freeze the tab.
- **DID regex tightened (LOW)** — method now MUST start with a
  letter (W3C DID spec), identifier MUST start with an alphanumeric.
  Prior regex accepted `did:0:abc` and `did:foo:-bar` which no real
  method spec emits.
- **`fetchTimeoutMs` upper bound (LOW)** — now bounded to
  `[1000ms, 300000ms]`. A value like `Number.MAX_VALUE` would
  silently clamp to `setTimeout`'s ~24-day max and effectively
  disable the timeout.
- **`opts.credentials` opt-in (INFO)** — added explicit
  `'omit'` / `'same-origin'` / `'include'` option. Default stays
  `'omit'` for cross-origin safety. Misleading 0.1.1 comment about
  same-origin "browser default behaviour" removed — credentials
  are now actually configurable.
- **Browser-side SSRF defence (INFO)** — `validateEndpoint` rejects
  literal private/loopback hosts (127.x, 10.x, 172.16-31.x,
  192.168.x, 169.254.x, ::1, localhost). Browser SOP/CORS already
  blocks response reads, but the request itself was being emitted —
  useful for service fingerprinting on the visitor's machine.
- **Server response no longer logged (INFO)** — failed-response
  console output now includes only the HTTP status, not the body.
  Other scripts on the embedding page (or a hostile console
  override) can no longer harvest sensitive error-body content.
- **Array / null body fallback (INFO)** — `Array.isArray` check
  added to the agent-reply extractor. Previously an array body
  hit the "unexpected response" branch despite being structurally
  valid; now still falls through cleanly.
- **`opts.greeting` / `placeholder` / `client` type warning (INFO)**
  — non-string values get a `console.warn` so a `{text: 'hi'}`
  typo doesn't silently render as `[object Object]`.

### Documentation

- README "Limits" section expanded with reply-length cap, fetch-
  timeout bounds, credentials override, and the endpoint
  allowlist's private-IP block.
- README `data-caller-did` description now explicitly notes that
  the embedding page can set arbitrary values; the server treats
  it as audit-only and operators must never trust it for
  authorization or non-repudiation.

### Out-of-scope (deliberate)

- **Version fingerprinting via `X-Ownify-Client`** — header still
  includes the exact widget version by default. Operators wanting
  to suppress can pass `opts.client` (or omit it from the embed).
  The visibility cost is low compared with the audit value of
  knowing which client version produced a given session.

### Compatibility

Behavioural changes (all minor):
- Endpoint URLs pointing at private/loopback IPs are now rejected
  at construct time. Self-hosted ownify deployments that need a
  loopback test rig should use a non-IP-literal hostname or a
  public IP for staging.
- Server replies longer than 10 000 chars are truncated in the UI.
  Set `opts.maxMessageLength` higher only if your agent legitimately
  produces longer single-turn replies.
- `fetchTimeoutMs > 300_000` falls back to the 30 s default rather
  than honouring the absurd value.

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
