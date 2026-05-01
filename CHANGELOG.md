# Changelog

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
