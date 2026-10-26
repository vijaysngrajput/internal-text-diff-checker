/* ---- userscript bootstrap --------------------------------------------
 * The tool is rendered inside a closed Shadow DOM overlay so the host
 * page's CSS cannot restyle it and the host page's scripts cannot easily
 * read the text you paste. It never reads anything from the host page.
 * Closing the overlay clears all inputs and removes it from the page.
 * -------------------------------------------------------------------- */
(function () {
  'use strict';

  var HOTKEY = { altKey: true, shiftKey: true, code: 'KeyD' };
  var HASH = '#private-diff';
  var host = null;
  var app = null;

  function isOpen() { return host !== null; }

  function open() {
    if (isOpen()) return;
    host = document.createElement('div');
    host.setAttribute('data-private-diff', '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
    var shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = PRIVATE_DIFF_CSS;
    shadow.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
    app = PrivateDiffUI.mount(shadow, { overlay: true, idPrefix: 'pdus', onClose: close });
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    host._restore = function () { document.documentElement.style.overflow = prevOverflow; };
    var ta = shadow.querySelector('textarea');
    if (ta) ta.focus();
  }

  function close() {
    if (!isOpen()) return;
    try { app.destroy(); } catch (e) { /* ignore */ }
    if (host._restore) host._restore();
    if (host.parentNode) host.parentNode.removeChild(host);
    host = null;
    app = null;
  }

  function toggle() { if (isOpen()) close(); else open(); }

  // 1. Extension menu command (Tampermonkey / Violentmonkey; Greasemonkey 4
  //    does not provide menu commands, use the hotkey or the URL hash).
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Open Private Diff', open);
    } else if (typeof GM !== 'undefined' && GM && typeof GM.registerMenuCommand === 'function') {
      GM.registerMenuCommand('Open Private Diff', open);
    }
  } catch (e) { /* menu commands unsupported */ }

  // 2. Keyboard shortcut: Alt+Shift+D toggles the overlay.
  window.addEventListener('keydown', function (e) {
    if (e.altKey === HOTKEY.altKey && e.shiftKey === HOTKEY.shiftKey && e.code === HOTKEY.code &&
        !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && isOpen() && e.target === document.body) {
      close();
    }
  }, true);

  // 3. URL hash: visiting any page with #private-diff opens the tool.
  //    (The hash never leaves the browser; it is not sent to the server.)
  function checkHash() { if (location.hash === HASH) open(); }
  window.addEventListener('hashchange', checkHash);
  checkHash();
})();
