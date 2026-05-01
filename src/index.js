// ownify-chat-widget — programmatic API for build-system users.
//
// Two ways to use the widget:
//   1. Drop the standalone <script src="https://ownify.ai/chat-widget.js">
//      onto any HTML page (zero build, the standalone version is at
//      src/standalone.js if you want to self-host that file).
//   2. import { mountOwnifyChat } from 'ownify-chat-widget' inside your
//      React/Vue/Svelte/whatever app and call mountOwnifyChat(rootEl, opts).
//
// The behaviour is identical: a small chat box that POSTs visitor
// messages to https://ownify.ai/api/chat/<slug> (or your own
// self-hosted endpoint). The receiver tenant signs the AAE envelope
// for its own public-chat traffic; visitors don't need accounts or DIDs.

const DEFAULT_BASE_URL = 'https://ownify.ai';
const DEFAULT_GREETING = 'Hi! Ask me anything.';
const DEFAULT_PLACEHOLDER = 'Type a message…';

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

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  doc.head.appendChild(style);
}

/**
 * Mount the chat widget onto a DOM element.
 *
 * @param {HTMLElement} root — the element to mount into. Existing
 *                              children are replaced.
 * @param {object} opts
 *   @param {string} opts.slug              — REQUIRED. Your ownify tenant slug.
 *   @param {string} [opts.baseUrl]         — base URL of the chat backend.
 *                                             Default 'https://ownify.ai'. Override
 *                                             for self-hosted ownify deployments.
 *   @param {string} [opts.endpoint]        — full POST URL. Overrides baseUrl
 *                                             entirely if set.
 *   @param {string} [opts.greeting]        — first agent message shown before
 *                                             any user input.
 *   @param {string} [opts.placeholder]     — input placeholder text.
 *   @param {string} [opts.callerDid]       — optional X-Caller-DID header
 *                                             (audit-only; not used for auth).
 *   @param {string} [opts.client='ownify-chat-widget@<version>'] — X-Ownify-Client
 *                                             header value used in audit.
 *
 * @returns {{ destroy: () => void }} handle for unmounting
 */
export function mountOwnifyChat(root, opts) {
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error('mountOwnifyChat: root must be an HTMLElement');
  }
  if (!opts || typeof opts.slug !== 'string' || opts.slug.length === 0) {
    throw new Error('mountOwnifyChat: opts.slug is required');
  }

  const slug = opts.slug;
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const endpoint = opts.endpoint || (baseUrl + '/api/chat/' + encodeURIComponent(slug));
  const greeting = opts.greeting || DEFAULT_GREETING;
  const placeholder = opts.placeholder || DEFAULT_PLACEHOLDER;
  const callerDid = opts.callerDid || null;
  const client = opts.client || 'ownify-chat-widget@0.1.0';

  ensureStyles(document);

  root.innerHTML = ''
    + '<div class="ow-chat">'
    + '  <div class="ow-chat-log" role="log" aria-live="polite"></div>'
    + '  <form class="ow-chat-form">'
    + '    <input class="ow-chat-input" type="text" autocomplete="off" />'
    + '    <button class="ow-chat-send" type="submit">Send</button>'
    + '  </form>'
    + '  <div class="ow-chat-meta">Powered by <a href="https://ownify.ai" target="_blank" rel="noopener">ownify</a> · agent-to-agent</div>'
    + '</div>';

  const log = root.querySelector('.ow-chat-log');
  const form = root.querySelector('.ow-chat-form');
  const input = root.querySelector('.ow-chat-input');
  const send = root.querySelector('.ow-chat-send');

  input.placeholder = placeholder;
  addMsg('agent', greeting);

  function addMsg(role, text) {
    const div = document.createElement('div');
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

  async function onSubmit(e) {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    addMsg('user', msg);
    setBusy(true);
    const pending = addMsg('agent', '…');
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
      });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const body = ct.indexOf('application/json') !== -1 ? await r.json() : await r.text();
      if (!r.ok) {
        const errMsg = (body && body.error) ? ('error: ' + body.error) : ('http ' + r.status);
        pending.classList.remove('agent');
        pending.classList.add('error');
        pending.textContent = errMsg;
        return;
      }
      const reply = (body && (body.message || body.reply || body.content || body.text)) || JSON.stringify(body);
      pending.textContent = reply;
    } catch (err) {
      pending.classList.remove('agent');
      pending.classList.add('error');
      pending.textContent = 'network error: ' + (err && err.message ? err.message : 'unknown');
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', onSubmit);

  return {
    destroy() {
      form.removeEventListener('submit', onSubmit);
      root.innerHTML = '';
      delete root.dataset.ownifyChatInit;
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
    node.dataset.ownifyChatInit = '1';
    mountOwnifyChat(node, {
      slug: node.dataset.slug,
      baseUrl: node.dataset.baseUrl,
      endpoint: node.dataset.endpoint,
      greeting: node.dataset.greeting,
      placeholder: node.dataset.placeholder,
      callerDid: node.dataset.callerDid,
    });
  }
}
