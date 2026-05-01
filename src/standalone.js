// Standalone IIFE — what gets served at https://ownify.ai/chat-widget.js
// for zero-config <script> tag use. Auto-bootstraps on DOMContentLoaded
// and is wrapped in an IIFE so it doesn't pollute the global scope.
//
// For npm/build-system use, import { mountOwnifyChat } from
// 'ownify-chat-widget' (ESM, src/index.js).

(function () {
  'use strict';

  var DEFAULT_BASE = 'https://ownify.ai';
  var DEFAULT_GREETING = 'Hi! Ask me anything.';
  var DEFAULT_PLACEHOLDER = 'Type a message…';
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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function init(root) {
    if (root.dataset.ownifyChatInit === '1') return;
    root.dataset.ownifyChatInit = '1';

    var slug = root.dataset.slug;
    if (!slug) {
      console.warn('ownify-chat: data-slug attribute required');
      return;
    }
    var baseUrl = (root.dataset.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    var endpoint = root.dataset.endpoint || (baseUrl + '/api/chat/' + encodeURIComponent(slug));
    var greeting = root.dataset.greeting || DEFAULT_GREETING;
    var placeholder = root.dataset.placeholder || DEFAULT_PLACEHOLDER;
    var callerDid = root.dataset.callerDid || null;

    ensureStyles();

    root.innerHTML = ''
      + '<div class="ow-chat">'
      + '  <div class="ow-chat-log" role="log" aria-live="polite"></div>'
      + '  <form class="ow-chat-form">'
      + '    <input class="ow-chat-input" type="text" autocomplete="off" />'
      + '    <button class="ow-chat-send" type="submit">Send</button>'
      + '  </form>'
      + '  <div class="ow-chat-meta">Powered by <a href="https://ownify.ai" target="_blank" rel="noopener">ownify</a> · agent-to-agent</div>'
      + '</div>';

    var log = root.querySelector('.ow-chat-log');
    var form = root.querySelector('.ow-chat-form');
    var input = root.querySelector('.ow-chat-input');
    var send = root.querySelector('.ow-chat-send');

    input.placeholder = placeholder;
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

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      addMsg('user', msg);
      setBusy(true);
      var pending = addMsg('agent', '…');
      try {
        var headers = {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-ownify-client': 'ownify-chat-widget@0.1.0',
        };
        if (callerDid) headers['x-caller-did'] = callerDid;
        var r = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ message: msg }),
        });
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        var body = ct.indexOf('application/json') !== -1 ? await r.json() : await r.text();
        if (!r.ok) {
          var errMsg = (body && body.error) ? ('error: ' + body.error) : ('http ' + r.status);
          pending.classList.remove('agent');
          pending.classList.add('error');
          pending.textContent = errMsg;
          return;
        }
        var reply = (body && (body.message || body.reply || body.content || body.text)) || JSON.stringify(body);
        pending.textContent = reply;
      } catch (err) {
        pending.classList.remove('agent');
        pending.classList.add('error');
        pending.textContent = 'network error: ' + (err && err.message ? err.message : 'unknown');
      } finally {
        setBusy(false);
        input.focus();
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
