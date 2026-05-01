// Standalone IIFE — what gets served at https://ownify.ai/chat-widget.js
// for zero-config <script> tag use. Auto-bootstraps on DOMContentLoaded
// and is wrapped in an IIFE so it doesn't pollute the global scope.
//
// For npm/build-system use, import { mountOwnifyChat } from
// 'ownify-chat-widget' (ESM, src/index.js).
//
// NOTE: this file is hand-maintained as a near-mirror of src/index.js.
// A v0.2 build step will derive it automatically. Until then, fixes
// MUST be applied to both files; CI / test coverage in this repo is
// the safety net.

(function () {
  'use strict';

  var DEFAULT_BASE = 'https://ownify.ai';
  var DEFAULT_GREETING = 'Hi! Ask me anything.';
  var DEFAULT_PLACEHOLDER = 'Type a message…';
  var DEFAULT_FETCH_TIMEOUT_MS = 30000;
  var DEFAULT_SUBMIT_COOLDOWN_MS = 500;
  var MAX_MESSAGE_LENGTH = 4096;
  var VERSION = '0.1.1';

  var DID_PATTERN = /^did:[a-z0-9]{1,32}:[A-Za-z0-9._-]{1,256}$/;
  var STYLE_ID = 'ownify-chat-widget-styles';

  var STYLES = ''
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

  function ensureStyles(nonce) {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    if (nonce) style.nonce = String(nonce);
    document.head.appendChild(style);
  }

  function validateEndpoint(urlStr) {
    try {
      var u = new URL(urlStr);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      if (u.username || u.password) return false;
      return true;
    } catch (_e) {
      return false;
    }
  }

  function init(root) {
    var slug = ((root.dataset.slug || '') + '').trim();
    if (!slug) {
      try { console.warn('ownify-chat: data-slug attribute required'); } catch (_e) {}
      return;
    }
    var baseUrl = String(root.dataset.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    var endpoint = root.dataset.endpoint != null && root.dataset.endpoint !== ''
      ? String(root.dataset.endpoint)
      : baseUrl + '/api/chat/' + encodeURIComponent(slug);
    if (!validateEndpoint(endpoint)) {
      try { console.warn('ownify-chat: data-endpoint must be a valid http(s) URL'); } catch (_e) {}
      return;
    }

    // Mark init AFTER successful validation so a fix-and-rebootstrap
    // path actually retries this node.
    if (root.dataset.ownifyChatInit === '1') return;
    root.dataset.ownifyChatInit = '1';

    var greeting = String(root.dataset.greeting || DEFAULT_GREETING);
    var placeholder = String(root.dataset.placeholder || DEFAULT_PLACEHOLDER);
    var callerDid = null;
    if (root.dataset.callerDid != null) {
      var candidate = String(root.dataset.callerDid);
      if (DID_PATTERN.test(candidate)) callerDid = candidate;
    }

    ensureStyles(root.dataset.styleNonce);

    var container = document.createElement('div');
    container.className = 'ow-chat';

    var log = document.createElement('div');
    log.className = 'ow-chat-log';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    container.appendChild(log);

    var form = document.createElement('form');
    form.className = 'ow-chat-form';
    var input = document.createElement('input');
    input.className = 'ow-chat-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.maxLength = MAX_MESSAGE_LENGTH;
    input.placeholder = placeholder;
    var send = document.createElement('button');
    send.className = 'ow-chat-send';
    send.type = 'submit';
    send.textContent = 'Send';
    form.appendChild(input);
    form.appendChild(send);
    container.appendChild(form);

    var meta = document.createElement('div');
    meta.className = 'ow-chat-meta';
    meta.appendChild(document.createTextNode('Powered by '));
    var metaLink = document.createElement('a');
    metaLink.href = 'https://ownify.ai';
    metaLink.target = '_blank';
    metaLink.rel = 'noopener noreferrer';
    metaLink.textContent = 'ownify';
    meta.appendChild(metaLink);
    meta.appendChild(document.createTextNode(' · agent-to-agent'));
    container.appendChild(meta);

    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(container);

    addMsg('agent', greeting);

    function addMsg(role, text) {
      var div = document.createElement('div');
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

    var inflightController = null;
    var lastSubmitAt = 0;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var now = Date.now();
      if (now - lastSubmitAt < DEFAULT_SUBMIT_COOLDOWN_MS) return;
      lastSubmitAt = now;

      var msg = input.value.trim();
      if (!msg) return;
      if (msg.length > MAX_MESSAGE_LENGTH) msg = msg.slice(0, MAX_MESSAGE_LENGTH);
      input.value = '';
      addMsg('user', msg);
      setBusy(true);
      var pending = addMsg('agent', '…');

      var ac = new AbortController();
      inflightController = ac;
      var timer = setTimeout(function () {
        try { ac.abort(); } catch (_e) {}
      }, DEFAULT_FETCH_TIMEOUT_MS);

      try {
        var headers = {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-ownify-client': 'ownify-chat-widget@' + VERSION,
        };
        if (callerDid) headers['x-caller-did'] = callerDid;
        var r = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ message: msg }),
          credentials: 'omit',
          signal: ac.signal,
          redirect: 'error',
        });
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        var body = ct.includes('application/json') ? await r.json() : await r.text();
        if (!r.ok) {
          try { console.error('ownify-chat request failed:', r.status, body); } catch (_e) {}
          pending.classList.remove('agent');
          pending.classList.add('error');
          pending.textContent = 'Something went wrong. Please try again.';
          return;
        }
        var reply = (body && typeof body === 'object'
          && (body.message || body.reply || body.content || body.text))
          || (typeof body === 'string' ? body : null);
        if (typeof reply === 'string' && reply.length > 0) {
          pending.textContent = reply;
        } else {
          try { console.warn('ownify-chat: unexpected response shape', body); } catch (_e) {}
          pending.textContent = 'Received an unexpected response.';
        }
      } catch (err) {
        var aborted = err && (err.name === 'AbortError' || err.message === 'aborted');
        try { console.error('ownify-chat:', aborted ? 'request timed out' : err); } catch (_e) {}
        pending.classList.remove('agent');
        pending.classList.add('error');
        pending.textContent = aborted ? 'Request timed out.' : 'Network error. Please try again.';
      } finally {
        clearTimeout(timer);
        if (inflightController === ac) inflightController = null;
        setBusy(false);
        try { input.focus(); } catch (_e) {}
      }
    });
  }

  function bootstrap() {
    var nodes = document.querySelectorAll('[data-ownify-chat], #ownify-chat');
    for (var i = 0; i < nodes.length; i += 1) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
