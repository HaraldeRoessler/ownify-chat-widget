// ownify-chat-widget — programmatic API for build-system users.
//
// Two ways to use the widget:
//   1. Standalone <script src="https://ownify.ai/chat-widget.js"> on
//      any HTML page (zero build, src/standalone.js).
//   2. import { mountOwnifyChat } from 'ownify-chat-widget' inside
//      your React/Vue/Svelte/whatever app and call mountOwnifyChat
//      (rootEl, opts).
//
// The behaviour is identical: a small chat box that POSTs visitor
// messages to https://ownify.ai/api/chat/<slug> (or your own
// self-hosted endpoint). The receiver tenant signs the AAE envelope
// for its own public-chat traffic; visitors don't need accounts or DIDs.

const DEFAULT_BASE_URL = 'https://ownify.ai';
const DEFAULT_GREETING = 'Hi! Ask me anything.';
const DEFAULT_PLACEHOLDER = 'Type a message…';
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_SUBMIT_COOLDOWN_MS = 500;
const MAX_MESSAGE_LENGTH = 4096;
const VERSION = '0.1.1';

// Same shape the receiver-side library validates against. Audit-only
// header — the server never trusts it for authorization, but we
// shape-validate before forwarding to avoid spoofing arbitrary
// values into the receiver's audit log.
const DID_PATTERN = /^did:[a-z0-9]{1,32}:[A-Za-z0-9._-]{1,256}$/;

const STYLE_ID = 'ownify-chat-widget-styles';
const STYLES = ''
  + '.ow-chat{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'
  + 'border:1px solid var(--ow-border,#2a2a2a);border-radius:12px;background:var(--ow-bg,#0a0a0a);'
  + 'color:var(--ow-fg,#e6e6e6);max-width:560px;display:flex;flex-direction:column;height:480px}'
  + '.ow-chat-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}'
  + '.ow-chat-msg{max-width:85%;padding:8px 12px;border-radius:10px;line-height:1.5;font-size:14px;white-space:pre-wrap;word-wrap:break-word}'
  + '.ow-chat-msg.user{align-self:flex-end;background:var(--ow-accent,#3b82f6);color:#fff}'
  + '.ow-chat-msg.agent{align-self:flex-start;background:var(--ow-msg-bg,#1a1a1a)}'
  + '.ow-chat-msg.error{align-self:flex-start;background:#3a1a1a;color:#ff8a8a;font-size:13px}'
  + '.ow-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--ow-border,#2a2a2a)}'
  + '.ow-chat-input{flex:1;background:var(--ow-input-bg,#1a1a1a);color:inherit;border:1px solid var(--ow-border,#2a2a2a);'
  + 'border-radius:8px;padding:8px 12px;font-size:14px;font-family:inherit;outline:none}'
  + '.ow-chat-input:focus{border-color:var(--ow-accent,#3b82f6)}'
  + '.ow-chat-send{background:var(--ow-accent,#3b82f6);color:#fff;border:none;border-radius:8px;'
  + 'padding:8px 16px;font-size:14px;font-weight:500;cursor:pointer}'
  + '.ow-chat-send:disabled{opacity:0.5;cursor:wait}'
  + '.ow-chat-meta{font-size:11px;color:var(--ow-meta,#888);text-align:center;padding:8px;border-top:1px solid var(--ow-border,#2a2a2a)}'
  + '.ow-chat-meta a{color:inherit}';

function ensureStyles(doc, nonce) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  // CSP-strict pages can pass `styleNonce` so the inline <style> is
  // allowed under a nonce-based style-src directive.
  if (nonce) style.nonce = String(nonce);
  doc.head.appendChild(style);
}

// Validate an endpoint URL. Rejects non-http(s), embedded credentials,
// and any URL that fails to parse. Defends against an attacker who
// can clobber data-endpoint on the mount node redirecting messages
// to a phishing endpoint.
function validateEndpoint(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return true;
}

/**
 * Mount the chat widget onto a DOM element.
 *
 * @param {HTMLElement} root
 * @param {object} opts
 *   @param {string} opts.slug                — REQUIRED. Receiver tenant slug.
 *   @param {string} [opts.baseUrl]           — default 'https://ownify.ai'
 *   @param {string} [opts.endpoint]          — overrides baseUrl entirely
 *   @param {string} [opts.greeting]
 *   @param {string} [opts.placeholder]
 *   @param {string} [opts.callerDid]         — optional X-Caller-DID (audit-only)
 *   @param {string} [opts.client]            — X-Ownify-Client header value
 *   @param {string} [opts.styleNonce]        — CSP nonce for the injected <style>
 *   @param {number} [opts.fetchTimeoutMs=30000]
 *   @param {number} [opts.submitCooldownMs=500] — debounce between user submits
 *   @param {number} [opts.maxMessageLength=4096]
 *
 * @returns {{ destroy: () => void }}
 */
export function mountOwnifyChat(root, opts) {
  if (!root || typeof root !== 'object' || root.nodeType !== 1) {
    throw new Error('mountOwnifyChat: root must be an HTMLElement');
  }
  if (!opts || typeof opts.slug !== 'string' || opts.slug.trim().length === 0) {
    throw new Error('mountOwnifyChat: opts.slug is required (non-empty string)');
  }
  if (root.dataset && root.dataset.ownifyChatInit === '1') {
    throw new Error('mountOwnifyChat: this root is already mounted — call destroy() first');
  }

  const slug = opts.slug.trim();
  const baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const endpoint = opts.endpoint != null
    ? String(opts.endpoint)
    : (baseUrl + '/api/chat/' + encodeURIComponent(slug));
  if (!validateEndpoint(endpoint)) {
    throw new Error('mountOwnifyChat: endpoint must be a valid http(s) URL without embedded credentials');
  }

  const greeting = String(opts.greeting || DEFAULT_GREETING);
  const placeholder = String(opts.placeholder || DEFAULT_PLACEHOLDER);
  const client = String(opts.client || ('ownify-chat-widget@' + VERSION));
  const fetchTimeoutMs = Number.isFinite(opts.fetchTimeoutMs) && opts.fetchTimeoutMs > 0
    ? opts.fetchTimeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
  const submitCooldownMs = Number.isFinite(opts.submitCooldownMs) && opts.submitCooldownMs >= 0
    ? opts.submitCooldownMs : DEFAULT_SUBMIT_COOLDOWN_MS;
  const maxMessageLength = Number.isInteger(opts.maxMessageLength) && opts.maxMessageLength > 0
    ? opts.maxMessageLength : MAX_MESSAGE_LENGTH;

  // Validate caller DID shape before forwarding. Audit-only signal
  // server-side; rejecting bad shapes here keeps spoofed values out
  // of the receiver's audit log.
  let callerDid = null;
  if (opts.callerDid != null) {
    const candidate = String(opts.callerDid);
    if (DID_PATTERN.test(candidate)) callerDid = candidate;
  }

  ensureStyles(root.ownerDocument || document, opts.styleNonce);

  // Build DOM via createElement — never via innerHTML. Eliminates the
  // entire XSS class (no future edit can accidentally interpolate
  // attacker-controlled HTML) and makes destroy() cleaner.
  const doc = root.ownerDocument || document;
  const container = doc.createElement('div');
  container.className = 'ow-chat';

  const log = doc.createElement('div');
  log.className = 'ow-chat-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  container.appendChild(log);

  const form = doc.createElement('form');
  form.className = 'ow-chat-form';
  const input = doc.createElement('input');
  input.className = 'ow-chat-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.maxLength = maxMessageLength;
  input.placeholder = placeholder;
  const send = doc.createElement('button');
  send.className = 'ow-chat-send';
  send.type = 'submit';
  send.textContent = 'Send';
  form.appendChild(input);
  form.appendChild(send);
  container.appendChild(form);

  const meta = doc.createElement('div');
  meta.className = 'ow-chat-meta';
  meta.appendChild(doc.createTextNode('Powered by '));
  const metaLink = doc.createElement('a');
  metaLink.href = 'https://ownify.ai';
  metaLink.target = '_blank';
  metaLink.rel = 'noopener noreferrer';
  metaLink.textContent = 'ownify';
  meta.appendChild(metaLink);
  meta.appendChild(doc.createTextNode(' · agent-to-agent'));
  container.appendChild(meta);

  // Replace any existing children of root with our container.
  while (root.firstChild) root.removeChild(root.firstChild);
  root.appendChild(container);
  if (root.dataset) root.dataset.ownifyChatInit = '1';

  addMsg('agent', greeting);

  function addMsg(role, text) {
    const div = doc.createElement('div');
    div.className = 'ow-chat-msg ' + role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function setBusy(busy) {
    send.disabled = busy;
    input.disabled = busy;
  }

  // Track in-flight requests so destroy() can abort them and so
  // closures don't try to mutate detached DOM after teardown.
  let inflightController = null;
  let lastSubmitAt = 0;
  let destroyed = false;

  async function onSubmit(e) {
    e.preventDefault();
    if (destroyed) return;
    const now = Date.now();
    if (now - lastSubmitAt < submitCooldownMs) return;
    lastSubmitAt = now;

    let msg = input.value.trim();
    if (!msg) return;
    if (msg.length > maxMessageLength) msg = msg.slice(0, maxMessageLength);
    input.value = '';
    addMsg('user', msg);
    setBusy(true);
    const pending = addMsg('agent', '…');

    const ac = new AbortController();
    inflightController = ac;
    const timer = setTimeout(() => {
      try { ac.abort(); } catch { /* ignore */ }
    }, fetchTimeoutMs);

    try {
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-ownify-client': client,
      };
      if (callerDid) headers['x-caller-did'] = callerDid;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: msg }),
        // Public chat is unauth-by-design — never send the visitor's
        // ownify cookies cross-origin. Operators who need credentials
        // can mount the widget against a same-origin endpoint where
        // browser default behaviour applies.
        credentials: 'omit',
        signal: ac.signal,
        redirect: 'error',
      });
      if (destroyed) return;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if (destroyed) return;
      if (!r.ok) {
        // Don't render server error bodies verbatim — they may leak
        // internal state. Log details to the console for the
        // embedding site's developer; show a generic message to the
        // visitor.
        try { console.error('ownify-chat request failed:', r.status, body); } catch { /* ignore */ }
        pending.classList.remove('agent');
        pending.classList.add('error');
        pending.textContent = 'Something went wrong. Please try again.';
        return;
      }
      const reply = (body && typeof body === 'object'
        && (body.message || body.reply || body.content || body.text))
        || (typeof body === 'string' ? body : null);
      if (typeof reply === 'string' && reply.length > 0) {
        pending.textContent = reply;
      } else {
        try { console.warn('ownify-chat: unexpected response shape', body); } catch { /* ignore */ }
        pending.textContent = 'Received an unexpected response.';
      }
    } catch (err) {
      if (destroyed) return;
      const aborted = err && (err.name === 'AbortError' || err.message === 'aborted');
      try { console.error('ownify-chat:', aborted ? 'request timed out' : err); } catch { /* ignore */ }
      pending.classList.remove('agent');
      pending.classList.add('error');
      pending.textContent = aborted ? 'Request timed out.' : 'Network error. Please try again.';
    } finally {
      clearTimeout(timer);
      if (inflightController === ac) inflightController = null;
      if (!destroyed) {
        setBusy(false);
        try { input.focus(); } catch { /* ignore */ }
      }
    }
  }

  form.addEventListener('submit', onSubmit);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      form.removeEventListener('submit', onSubmit);
      if (inflightController) {
        try { inflightController.abort(); } catch { /* ignore */ }
        inflightController = null;
      }
      while (root.firstChild) root.removeChild(root.firstChild);
      if (root.dataset) delete root.dataset.ownifyChatInit;
    },
  };
}

/**
 * Auto-bootstrap any element on the page with [data-ownify-chat] or
 * id="ownify-chat". Useful for non-build pages — but most of those
 * use the standalone <script> tag instead, which calls this on load.
 */
export function bootstrapOwnifyChat() {
  const nodes = document.querySelectorAll('[data-ownify-chat], #ownify-chat');
  for (const node of nodes) {
    if (node.dataset.ownifyChatInit === '1') continue;
    try {
      mountOwnifyChat(node, {
        slug: node.dataset.slug,
        baseUrl: node.dataset.baseUrl,
        endpoint: node.dataset.endpoint,
        greeting: node.dataset.greeting,
        placeholder: node.dataset.placeholder,
        callerDid: node.dataset.callerDid,
        styleNonce: node.dataset.styleNonce,
      });
    } catch (err) {
      try { console.warn('ownify-chat: failed to bootstrap node:', err.message); } catch { /* ignore */ }
    }
  }
}
