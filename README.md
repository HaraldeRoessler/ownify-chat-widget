# ownify-chat-widget

Drop-in chat widget for embedding [ownify](https://ownify.ai) agents on any
website. Two lines of HTML. Or one npm import for build-system folks.

Vanilla JavaScript, no runtime dependencies, ~5 KB, MIT.

## What it does

Customers run their agents on ownify. This widget lets visitors of
**their** website chat with **their** agent — no account, no SDK on the
visitor side, no MCP install. The widget POSTs to ownify's public-chat
endpoint, which signs an AAE envelope using the customer's tenant
keypair and forwards through the same A2A firewall chain
agent-to-agent traffic uses.

## Setup

### Step 1 — turn on public chat for your agent

In your ownify dashboard, open the agent you want to expose, click
**Open public chat**. Copy the slug (something like `your-tenant-abc123`).

### Step 2a — drop into any HTML page (zero build)

```html
<script src="https://ownify.ai/chat-widget.js" defer></script>
<div data-ownify-chat data-slug="your-tenant-abc123"></div>
```

That's it. No backend on your side. No keys. Visitors chat with your
agent through ownify's signing infrastructure, attributed to *your*
tenant in audit.

Optional `data-*` attributes:

- `data-greeting` — first agent message shown before any user input
- `data-placeholder` — input placeholder text
- `data-base-url` — override the host (default: `https://ownify.ai`)
- `data-endpoint` — override the full POST URL (validated as http/https, embedded credentials rejected)
- `data-caller-did` — optional `X-Caller-DID` header (shape-validated against `did:method:id` pattern; **audit-only, can be set by the embedding page — never trust it for authorization or non-repudiation**)
- `data-style-nonce` — CSP nonce for the injected `<style>` tag (see "CSP" below)

### SPA cleanup hook

If your site is a single-page app and you mount/unmount the widget
across routes, call `_ownifyDestroy()` on the mount node before
removing it from the DOM:

```js
const root = document.getElementById('chat-root');
// ...later, on route change...
if (typeof root._ownifyDestroy === 'function') root._ownifyDestroy();
root.remove();
```

This aborts in-flight requests, removes the submit listener, and
clears the dataset flag so a fresh mount on a new node works
cleanly. The same handle is returned from `mountOwnifyChat(root,
opts)` for npm consumers — `const handle = mountOwnifyChat(...);
handle.destroy();`.

### Step 2b — npm package (for React / Vue / Svelte / build pipelines)

```sh
npm install ownify-chat-widget
```

```js
import { mountOwnifyChat } from 'ownify-chat-widget';

const handle = mountOwnifyChat(document.getElementById('chat-root'), {
  slug: 'your-tenant-abc123',
  greeting: "Hi! I'm <your agent name>. Ask me anything.",
});

// later, to clean up:
handle.destroy();
```

Same widget, same behaviour, importable wherever.

## Subresource Integrity (recommended for the script tag)

For defence against a compromised CDN, pin the script with SRI:

```html
<script src="https://ownify.ai/chat-widget.js"
        integrity="sha384-..."
        crossorigin="anonymous"
        defer></script>
```

The current `0.1.1` integrity hash is published with each release in
[CHANGELOG.md](./CHANGELOG.md). Bump the hash when you upgrade.

## Content-Security-Policy

The widget injects an inline `<style>` tag for its own scoped styles.
On strict-CSP sites (no `style-src 'unsafe-inline'`), pass a nonce
matching your `style-src 'nonce-...'` directive:

```html
<script src="https://ownify.ai/chat-widget.js" defer></script>
<div data-ownify-chat
     data-slug="your-tenant"
     data-style-nonce="<your-csp-nonce>"></div>
```

Or via the npm API: `mountOwnifyChat(root, { slug, styleNonce })`.

If you load the standalone with a CSP nonce on the script tag itself,
the widget reads `document.currentScript.nonce` and uses it
automatically — no per-mount-node attribute needed:

```html
<script src="https://ownify.ai/chat-widget.js" nonce="<your-csp-nonce>" defer></script>
<div data-ownify-chat data-slug="your-tenant"></div>
```

## Limits

- **Message length**: 4096 characters per message. Longer input is
  truncated client-side; the server applies its own 64 KiB body cap.
- **Reply length displayed**: 10 000 characters. Longer replies are
  truncated with `…` so a malicious / compromised backend can't
  freeze the visitor's tab with a multi-MB stream.
- **Submit cooldown**: 500 ms between consecutive sends.
- **Fetch timeout**: 30 s per request — aborts and surfaces as
  "Request timed out." in the chat. Bounded to `[1 s, 5 min]`.
- **Credentials**: `'omit'` by default (cookies don't travel
  cross-origin). Override via `opts.credentials` if you self-host
  on a same-origin domain that needs an authenticated chat surface.
- **Endpoint allowlist**: only `http://` and `https://` URLs without
  embedded credentials. Private/loopback IP literals are rejected
  (browser-side defence-in-depth — even though browser SOP usually
  blocks the response, the request itself doesn't fire).

All limits are configurable via `mountOwnifyChat(root, { fetchTimeoutMs,
submitCooldownMs, maxMessageLength, credentials })`.

## Self-hosted ownify deployments

If you run your own ownify control plane, point the widget at it:

```html
<div data-ownify-chat
     data-slug="your-tenant"
     data-base-url="https://chat.your-domain.com"></div>
```

Or via the npm API:

```js
mountOwnifyChat(root, { slug: 'your-tenant', baseUrl: 'https://chat.your-domain.com' });
```

## Theming

CSS variables override every visible style:

```css
:root {
  --ow-bg: #ffffff;
  --ow-fg: #0a0a0a;
  --ow-border: #e0e0e0;
  --ow-accent: #ff5f00;
  --ow-msg-bg: #f4f4f4;
  --ow-input-bg: #fafafa;
  --ow-meta: #666;
}
```

## How it works

```
your visitor                                          your agent
  │                                                   │
  │  POST https://ownify.ai/api/chat/<your-slug>      │
  │  {"message": "..."}                               │
  ▼                                                   │
[ownify portal]                                       │
  │  cross-origin allowed (CORS *)                    │
  ▼                                                   │
[ownify control plane]                                │
  │  signs AAE envelope using YOUR tenant's keypair   │
  │  (iss = sub = your DID — your agent self-grants   │
  │  the message capability via dashboard toggle)     │
  ▼                                                   │
[a2a gateway: per-tool ACL → trust gate → audit] ─────┘
                                                      │
                                                      ▼
                                              your agent's reply
                                              streamed back
                                              to the visitor
```

Visitors don't need an account, a DID, or any auth. Authorization is
done at the receiver tenant's ACL — `read_memory:*` and
`invoke_tool:*` capabilities stay unreachable from the public-chat path
by default.

## Privacy

The widget sends the visitor's message text and a `User-Agent` header.
Server-side, ownify computes a per-session **visitor hash** from
(IP, user agent, session) and stores only the hash in audit — your
agent's audit log never holds raw IPs.

If the visitor sets a `data-caller-did`, that DID is captured in audit
as a self-declared identity. It is shape-validated but **not**
cryptographically verified — audit-only.

## Bugs / improvements

Open an issue at
<https://github.com/HaraldeRoessler/ownify-chat-widget>.

## License

[MIT](./LICENSE).
