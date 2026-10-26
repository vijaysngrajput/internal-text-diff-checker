/*
 * Private Diff — user interface
 *
 * Builds the whole UI with DOM APIs (createElement / textContent). User
 * supplied text is NEVER passed through innerHTML, so pasted HTML, script
 * tags or markup are always displayed as plain text.
 *
 * After Compare, the two input boxes are replaced in place by an aligned
 * side-by-side view: ORIGINAL on the left with removed/changed lines in
 * red, MODIFIED on the right with added/changed lines in green. "edit"
 * returns to the text boxes with the content intact.
 *
 * Exposes PrivateDiffUI.mount(container, options) and is shared between
 * index.html and the userscript overlay.
 */
(function (root) {
  'use strict';

  var PD = root.PrivateDiff;
  if (!PD && typeof require === 'function') PD = require('./engine.js');

  /* ---------------------------------------------------------------- */
  /* tiny DOM helper                                                  */
  /* ---------------------------------------------------------------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k === 'on') { for (var ev in v) node.addEventListener(ev, v[ev]); }
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false && v != null) node.setAttribute(k, String(v));
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ---------------------------------------------------------------- */
  /* mount                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Mount the application into `container`.
   * options.onClose  — if given, a Close button is shown (userscript overlay)
   * options.idPrefix — prefix for element ids (defaults to "pd")
   * options.overlay  — render as a full-screen overlay
   * Returns { clearAll, compare, swap, edit, getResult, root, destroy }.
   */
  function mount(container, options) {
    options = options || {};
    var pfx = options.idPrefix || 'pd';
    var ids = { orig: pfx + '-orig', mod: pfx + '-mod', mode: pfx + '-mode' };

    var state = { result: null, viewing: false, copyTimer: null };

    /* ---- header ---- */
    var closeBtn = options.onClose
      ? el('button', { class: 'pd-btn pd-btn-small pd-close', type: 'button', text: 'Close ✕',
          title: 'Clear everything and close', on: { click: function () { clearAll(); options.onClose(); } } })
      : null;

    var header = el('div', { class: 'pd-header' }, [
      el('h1', { class: 'pd-title', text: 'Private Diff' }),
      el('p', { class: 'pd-subtitle', text: 'Compare text. See what changed. Nothing saved.' }),
      el('span', { class: 'pd-tag', text: 'INTERNAL UTILITY' }),
      closeBtn
    ]);

    /* ---- options ---- */
    var optLine = el('input', { type: 'radio', name: ids.mode, value: 'line', checked: true });
    var optWord = el('input', { type: 'radio', name: ids.mode, value: 'word' });
    var optWs = el('input', { type: 'checkbox' });
    var optBlank = el('input', { type: 'checkbox' });
    var optCase = el('input', { type: 'checkbox' });
    var optWrap = el('input', { type: 'checkbox' });

    var optionsBar = el('div', { class: 'pd-options' }, [
      el('span', { class: 'pd-group' }, [
        el('span', { class: 'pd-group-label', text: 'mode:' }),
        el('label', null, [optLine, 'line-by-line']),
        el('label', null, [optWord, 'word-level'])
      ]),
      el('span', { class: 'pd-group' }, [
        el('span', { class: 'pd-group-label', text: 'ignore:' }),
        el('label', { title: 'Ignore leading and trailing whitespace on each line' }, [optWs, 'leading/trailing whitespace']),
        el('label', { title: 'Skip lines that are empty or whitespace-only' }, [optBlank, 'blank lines']),
        el('label', { title: 'Compare without regard to letter case' }, [optCase, 'case'])
      ]),
      el('span', { class: 'pd-group' }, [
        el('label', { title: 'Wrap long lines' }, [optWrap, 'wrap long lines'])
      ])
    ]);

    /* ---- editors (input mode) ---- */
    function panel(label, id, placeholder) {
      var ta = el('textarea', { id: id, placeholder: placeholder, spellcheck: 'false',
        autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', wrap: 'off',
        'aria-label': label + ' text' });
      var count = el('span', { class: 'pd-count', text: '0 lines' });
      var clear = el('button', { class: 'pd-btn pd-btn-small', type: 'button', text: 'clear',
        title: 'Clear this input', on: { click: function () { ta.value = ''; updateCount(); ta.focus(); } } });
      function updateCount() {
        var v = ta.value;
        var lines = v === '' ? 0 : PD.splitLines(v).length;
        count.textContent = fmt(lines) + (lines === 1 ? ' line' : ' lines') + ' · ' + fmt(v.length) + ' chars';
      }
      ta.addEventListener('input', updateCount);
      var head = el('div', { class: 'pd-panel-head' }, [
        el('label', { for: id, text: label }), clear, count
      ]);
      return { root: el('div', { class: 'pd-panel' }, [head, ta]), ta: ta, updateCount: updateCount };
    }

    var left = panel('ORIGINAL', ids.orig, 'Paste original text here…');
    var right = panel('MODIFIED', ids.mod, 'Paste modified text here…');
    var editors = el('div', { class: 'pd-editors' }, [left.root, right.root]);

    /* ---- side-by-side view (result mode) ---- */
    var leftStat = el('span', { class: 'pd-count' });
    var rightStat = el('span', { class: 'pd-count' });
    var editBtnL = el('button', { class: 'pd-btn pd-btn-small', type: 'button', text: '✎ edit',
      title: 'Back to the text boxes (content is kept)', on: { click: edit } });
    var editBtnR = el('button', { class: 'pd-btn pd-btn-small', type: 'button', text: '✎ edit',
      title: 'Back to the text boxes (content is kept)', on: { click: edit } });
    var viewHead = el('div', { class: 'pd-view-head' }, [
      el('div', { class: 'pd-panel-head' }, [el('span', { text: 'ORIGINAL' }), editBtnL, leftStat]),
      el('div', { class: 'pd-panel-head' }, [el('span', { text: 'MODIFIED' }), editBtnR, rightStat])
    ]);
    var viewBody = el('div', { class: 'pd-view-body', tabindex: '0', 'aria-label': 'Side-by-side comparison' });
    var view = el('div', { class: 'pd-view', hidden: true }, [viewHead, viewBody]);

    /* ---- actions ---- */
    var compareBtn = el('button', { class: 'pd-btn pd-btn-primary', type: 'button', text: 'Compare',
      on: { click: compare } });
    var swapBtn = el('button', { class: 'pd-btn', type: 'button', text: 'Swap', title: 'Exchange original and modified',
      on: { click: swap } });
    var clearBtn = el('button', { class: 'pd-btn', type: 'button', text: 'Clear All',
      title: 'Clear both inputs and the result', on: { click: clearAll } });
    var copyBtn = el('button', { class: 'pd-btn pd-btn-small', type: 'button', text: 'copy result',
      on: { click: copyResult } });
    var dlBtn = el('button', { class: 'pd-btn pd-btn-small', type: 'button', text: 'download .txt',
      title: 'Saves comparison.diff.txt to this device only', on: { click: downloadResult } });
    var summary = el('span', { class: 'pd-summary' });
    var resultTools = el('span', { class: 'pd-result-tools', hidden: true }, [summary, copyBtn, dlBtn]);
    var actions = el('div', { class: 'pd-actions' }, [
      compareBtn, swapBtn, clearBtn, resultTools,
      el('span', { class: 'pd-hint', text: 'Ctrl/⌘ + Enter to compare' })
    ]);

    /* ---- messages ---- */
    var msg = el('div', { class: 'pd-msg', role: 'status', 'aria-live': 'polite' });

    var footer = el('div', { class: 'pd-footer', text:
      'Runs entirely in this browser tab. No server, no network requests, no storage. ' +
      'Clear All empties the inputs and result; closing the tab releases the rest.' });

    var page = el('div', { class: 'pd-page' }, [header, optionsBar, editors, view, actions, msg, footer]);
    var rootEl = el('div', { class: 'pd-root' + (options.overlay ? ' pd-overlay' : '') }, [page]);
    container.appendChild(rootEl);

    /* ---- behaviour ---- */
    function currentOptions() {
      return {
        mode: optWord.checked ? 'word' : 'line',
        ignoreWhitespace: optWs.checked,
        ignoreBlankLines: optBlank.checked,
        ignoreCase: optCase.checked
      };
    }

    function setMsg(text, kind) {
      msg.textContent = text || '';
      msg.className = 'pd-msg' + (kind ? ' pd-msg-' + kind : '');
    }

    function describeOptions(opts) {
      var parts = [];
      if (opts.ignoreWhitespace) parts.push('leading/trailing whitespace');
      if (opts.ignoreBlankLines) parts.push('blank lines');
      if (opts.ignoreCase) parts.push('case');
      return parts.join(', ');
    }

    function compare() {
      var o = left.ta.value, m = right.ta.value;
      if (o === '' && m === '') {
        clearResult();
        setMsg('Paste text into at least one panel, then click Compare.', 'note');
        return;
      }
      var res = PD.compare(o, m, currentOptions());
      state.result = res;
      render(res);
    }

    function render(res) {
      var s = res.summary;
      var notes = [];
      if (res.normalized) {
        notes.push('Compared with normalized content (ignoring ' + describeOptions(res.options) +
          '). The text shown is the original, unmodified input.');
      }
      if (res.approximate) {
        notes.push('Very large number of differences: part of the result is shown as a plain ' +
          'remove/add block instead of a minimal diff.');
      }

      empty(summary);
      summary.appendChild(el('span', { class: 'pd-s-del', text: '−' + fmt(s.removed) + ' removed' }));
      summary.appendChild(el('span', { class: 'pd-s-add', text: '+' + fmt(s.added) + ' added' }));
      summary.appendChild(el('span', { class: 'pd-s-eq', text: fmt(s.unchanged) + ' unchanged' }));
      leftStat.textContent = fmt(s.removed) + ' removed';
      rightStat.textContent = fmt(s.added) + ' added';
      resultTools.hidden = false;

      if (res.identical) setMsg('No differences found.' + (notes.length ? ' ' + notes.join(' ') : ''), 'ok');
      else setMsg(notes.join(' '), notes.length ? 'note' : null);

      renderSideBySide(res.rows);
      editors.hidden = true;
      view.hidden = false;
      state.viewing = true;
    }

    /** Pair the engine's row stream into aligned left/right rows. */
    function alignRows(rows) {
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.type === 'equal') {
          out.push({ l: r, r: { type: 'equal', newNo: r.newNo, text: r.newText != null ? r.newText : r.text, segments: null } });
        } else if (r.type === 'removed') {
          var next = rows[i + 1];
          if (next && next.type === 'added') { out.push({ l: r, r: next }); i++; }
          else out.push({ l: r, r: null });
        } else {
          out.push({ l: null, r: r });
        }
      }
      return out;
    }

    function textCell(row, side) {
      var td = document.createElement('td');
      td.className = 'pd-text';
      if (!row) { td.className += ' pd-filler'; td.textContent = ' '; return td; }
      if (row.type === 'removed') td.className += ' pd-removed';
      else if (row.type === 'added') td.className += ' pd-added';
      if (row.segments) {
        for (var j = 0; j < row.segments.length; j++) {
          var seg = row.segments[j];
          if (seg.type === 'equal') td.appendChild(document.createTextNode(seg.text));
          else td.appendChild(el('span', { class: seg.type === 'ins' ? 'pd-ins' : 'pd-del', text: seg.text }));
        }
        if (!row.segments.length) td.textContent = ' ';
      } else {
        td.textContent = row.text === '' ? ' ' : row.text;
      }
      return td;
    }

    function noCell(row, side) {
      var n = row ? (side === 'l' ? row.oldNo : row.newNo) : null;
      var td = el('td', { class: 'pd-no', text: n == null ? '' : String(n) });
      if (!row) td.className += ' pd-filler';
      return td;
    }

    function renderSideBySide(rows) {
      empty(viewBody);
      var aligned = alignRows(rows);
      var frag = document.createDocumentFragment();
      for (var i = 0; i < aligned.length; i++) {
        var p = aligned[i];
        var tr = document.createElement('tr');
        tr.appendChild(noCell(p.l, 'l'));
        tr.appendChild(textCell(p.l, 'l'));
        tr.appendChild(noCell(p.r, 'r'));
        tr.appendChild(textCell(p.r, 'r'));
        frag.appendChild(tr);
      }
      var tbody = document.createElement('tbody');
      tbody.appendChild(frag);
      var table = document.createElement('table');
      table.appendChild(tbody);
      viewBody.appendChild(table);
      viewBody.scrollTop = 0;
    }

    function edit() {
      view.hidden = true;
      editors.hidden = false;
      state.viewing = false;
      left.ta.focus();
    }

    function clearResult() {
      state.result = null;
      resultTools.hidden = true;
      empty(summary);
      empty(viewBody);
      setMsg('');
      if (state.viewing) edit();
    }

    function clearAll() {
      left.ta.value = '';
      right.ta.value = '';
      left.updateCount();
      right.updateCount();
      clearResult();
      left.ta.focus();
    }

    function swap() {
      var tmp = left.ta.value;
      left.ta.value = right.ta.value;
      right.ta.value = tmp;
      left.updateCount();
      right.updateCount();
      if (state.viewing) compare();
    }

    function recompareIfShown() {
      if (state.viewing) compare();
    }

    function copyResult() {
      if (!state.result) return;
      var text = state.result.report;
      var done = function (ok) {
        copyBtn.textContent = ok ? 'copied ✓' : 'copy failed';
        clearTimeout(state.copyTimer);
        state.copyTimer = setTimeout(function () { copyBtn.textContent = 'copy result'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    }

    function fallbackCopy(text, done) {
      // Legacy path for browsers without the async clipboard API. Still local-only.
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      rootEl.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.parentNode.removeChild(ta);
      done(ok);
    }

    function downloadResult() {
      if (!state.result) return;
      // Generated in memory; the browser saves it on the user's own device.
      var blob = new Blob([state.result.report], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'comparison.diff.txt' });
      rootEl.appendChild(a);
      a.click();
      rootEl.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* ---- wiring ---- */
    [optLine, optWord, optWs, optBlank, optCase].forEach(function (inp) {
      inp.addEventListener('change', recompareIfShown);
    });
    optWrap.addEventListener('change', function () {
      viewBody.classList.toggle('pd-wrap', optWrap.checked);
    });
    function keyHandler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compare(); }
    }
    left.ta.addEventListener('keydown', keyHandler);
    right.ta.addEventListener('keydown', keyHandler);
    rootEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.viewing) { e.preventDefault(); compare(); }
    });

    return {
      clearAll: clearAll,
      compare: compare,
      swap: swap,
      edit: edit,
      getResult: function () { return state.result; },
      root: rootEl,
      destroy: function () {
        clearAll();
        if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      }
    };
  }

  var PrivateDiffUI = { mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = PrivateDiffUI;
  else root.PrivateDiffUI = PrivateDiffUI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
