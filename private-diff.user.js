// ==UserScript==
// @name         Private Diff
// @namespace    private-diff.internal
// @version      1.0.0
// @description  Compare two pieces of text locally in the browser. No server, no network, nothing saved. Open from the extension menu, with Alt+Shift+D, or by adding #private-diff to any page URL.
// @author       Internal
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      none
// @noconnect
// ==/UserScript==


(function () {
'use strict';
var PD_NS = {};
var module = undefined;
var PrivateDiffUI;

/* ---- stylesheet (embedded) ---- */
var PRIVATE_DIFF_CSS = "/* Private Diff — stylesheet\n * Retro developer-utility look: muted neutrals, monospace, thin borders,\n * square corners, compact spacing. No gradients, no animation.\n * All rules are scoped under .pd-root so the same sheet works inside the\n * userscript's shadow DOM overlay and in the standalone page. */\n\n.pd-root {\n  --pd-bg: #f4f3ee;\n  --pd-panel: #fbfaf6;\n  --pd-fg: #1f1f1f;\n  --pd-muted: #6b6a63;\n  --pd-border: #8a8a80;\n  --pd-border-soft: #c9c8c0;\n  --pd-btn: #e8e7e1;\n  --pd-btn-hover: #dcdbd4;\n  --pd-btn-active: #cfcec6;\n  --pd-accent: #2b2b2b;\n  --pd-add-bg: #e3f1dc;\n  --pd-add-fg: #1d4f1a;\n  --pd-add-mark: #b9dfae;\n  --pd-del-bg: #f7dedc;\n  --pd-del-fg: #7a1f1f;\n  --pd-del-mark: #efb8b4;\n  --pd-eq-bg: transparent;\n  --pd-lineno: #8d8c84;\n  --pd-note-bg: #fff8dc;\n  --pd-note-border: #d8c98a;\n  --pd-mono: ui-monospace, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", \"DejaVu Sans Mono\", monospace;\n  --pd-sans: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif;\n\n  font-family: var(--pd-sans);\n  font-size: 13px;\n  line-height: 1.4;\n  color: var(--pd-fg);\n  background: var(--pd-bg);\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n.pd-root *, .pd-root *::before, .pd-root *::after { box-sizing: inherit; }\n\n@media (prefers-color-scheme: dark) {\n  .pd-root {\n    --pd-bg: #1e1e1c;\n    --pd-panel: #262624;\n    --pd-fg: #e4e3dd;\n    --pd-muted: #9a9990;\n    --pd-border: #5c5b55;\n    --pd-border-soft: #3e3d39;\n    --pd-btn: #33332f;\n    --pd-btn-hover: #3f3e39;\n    --pd-btn-active: #4a4943;\n    --pd-accent: #e4e3dd;\n    --pd-add-bg: #1f3a1d;\n    --pd-add-fg: #bfe8b4;\n    --pd-add-mark: #2f5f2b;\n    --pd-del-bg: #44201f;\n    --pd-del-fg: #f2b8b4;\n    --pd-del-mark: #6e2f2c;\n    --pd-lineno: #76756d;\n    --pd-note-bg: #3a3420;\n    --pd-note-border: #6b5f2e;\n  }\n}\n\n.pd-page {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 14px 16px 32px;\n}\n\n/* ---- header ---------------------------------------------------------- */\n.pd-header {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 6px 14px;\n  border-bottom: 1px solid var(--pd-border);\n  padding-bottom: 8px;\n  margin-bottom: 12px;\n}\n.pd-title {\n  font-family: var(--pd-mono);\n  font-size: 18px;\n  font-weight: 700;\n  letter-spacing: 0.02em;\n  margin: 0;\n}\n.pd-subtitle { color: var(--pd-muted); margin: 0; }\n.pd-tag {\n  font-family: var(--pd-mono);\n  font-size: 10px;\n  letter-spacing: 0.12em;\n  border: 1px solid var(--pd-border);\n  padding: 1px 6px;\n  color: var(--pd-muted);\n  margin-left: auto;\n  white-space: nowrap;\n}\n.pd-close {\n  margin-left: 8px;\n}\n\n/* ---- options --------------------------------------------------------- */\n.pd-options {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 18px;\n  align-items: center;\n  margin-bottom: 10px;\n  font-family: var(--pd-mono);\n  font-size: 12px;\n}\n.pd-options label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap; }\n.pd-options input { margin: 0; accent-color: var(--pd-accent); }\n.pd-options .pd-group { display: inline-flex; gap: 12px; align-items: center; }\n.pd-options .pd-group-label { color: var(--pd-muted); }\n\n/* ---- editors --------------------------------------------------------- */\n.pd-editors {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}\n@media (max-width: 800px) {\n  .pd-editors { grid-template-columns: 1fr; }\n}\n.pd-panel {\n  border: 1px solid var(--pd-border);\n  background: var(--pd-panel);\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n.pd-panel-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 8px;\n  border-bottom: 1px solid var(--pd-border-soft);\n  font-family: var(--pd-mono);\n  font-size: 11px;\n  letter-spacing: 0.1em;\n}\n.pd-panel-head .pd-count { color: var(--pd-muted); letter-spacing: 0; margin-left: auto; }\n.pd-panel textarea {\n  font-family: var(--pd-mono);\n  font-size: 12.5px;\n  line-height: 1.45;\n  color: var(--pd-fg);\n  background: transparent;\n  border: 0;\n  outline: none;\n  resize: vertical;\n  min-height: 320px;\n  height: 360px;\n  width: 100%;\n  padding: 8px;\n  margin: 0;\n  white-space: pre;\n  overflow: auto;\n  tab-size: 4;\n}\n.pd-panel textarea::placeholder { color: var(--pd-muted); opacity: 0.8; }\n.pd-panel textarea:focus { background: rgba(127, 127, 127, 0.05); }\n\n/* ---- buttons --------------------------------------------------------- */\n.pd-btn {\n  font-family: var(--pd-mono);\n  font-size: 12px;\n  color: var(--pd-fg);\n  background: var(--pd-btn);\n  border: 1px solid var(--pd-border);\n  border-radius: 0;\n  padding: 5px 12px;\n  cursor: pointer;\n  line-height: 1.2;\n}\n.pd-btn:hover { background: var(--pd-btn-hover); }\n.pd-btn:active { background: var(--pd-btn-active); }\n.pd-btn:focus-visible { outline: 2px solid var(--pd-accent); outline-offset: 1px; }\n.pd-btn-primary { font-weight: 700; }\n.pd-btn-small { font-size: 10px; padding: 1px 6px; letter-spacing: 0; }\n.pd-btn:disabled { opacity: 0.5; cursor: default; }\n\n.pd-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n  margin: 10px 0;\n}\n.pd-actions .pd-hint { color: var(--pd-muted); font-family: var(--pd-mono); font-size: 11px; margin-left: auto; }\n.pd-actions .pd-result-tools {\n  display: inline-flex;\n  flex-wrap: wrap;\n  gap: 6px 12px;\n  align-items: center;\n  margin-left: 10px;\n  padding-left: 12px;\n  border-left: 1px solid var(--pd-border-soft);\n  font-family: var(--pd-mono);\n  font-size: 11px;\n}\n.pd-actions .pd-result-tools[hidden] { display: none; }\n.pd-summary { display: inline-flex; gap: 10px; }\n.pd-summary .pd-s-add { color: var(--pd-add-fg); }\n.pd-summary .pd-s-del { color: var(--pd-del-fg); }\n.pd-summary .pd-s-eq  { color: var(--pd-muted); }\n\n/* ---- messages -------------------------------------------------------- */\n.pd-msg {\n  font-family: var(--pd-mono);\n  font-size: 12px;\n  border: 1px solid var(--pd-border-soft);\n  padding: 6px 10px;\n  margin: 8px 0;\n  background: var(--pd-panel);\n}\n.pd-msg-note { background: var(--pd-note-bg); border-color: var(--pd-note-border); }\n.pd-msg-ok { border-color: var(--pd-add-mark); background: var(--pd-add-bg); color: var(--pd-add-fg); }\n.pd-msg:empty { display: none; }\n\n/* ---- side-by-side view (replaces the editors after Compare) ---------- */\n.pd-view {\n  border: 1px solid var(--pd-border);\n  background: var(--pd-panel);\n}\n.pd-view[hidden], .pd-editors[hidden] { display: none; }\n.pd-view-head {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n}\n.pd-view-head .pd-panel-head:first-child { border-right: 1px solid var(--pd-border); }\n.pd-view-body {\n  overflow: auto;\n  min-height: 200px;\n  max-height: 75vh;\n  font-family: var(--pd-mono);\n  font-size: 12.5px;\n  line-height: 1.45;\n  outline: none;\n}\n.pd-view-body:focus-visible { box-shadow: inset 0 0 0 2px var(--pd-accent); }\n.pd-view-body table { border-collapse: collapse; width: 100%; table-layout: fixed; }\n.pd-view-body td { padding: 0 6px; vertical-align: top; white-space: pre; overflow: hidden; }\n.pd-view-body.pd-wrap td.pd-text { white-space: pre-wrap; word-break: break-all; }\n.pd-view-body td.pd-no {\n  color: var(--pd-lineno);\n  text-align: right;\n  user-select: none;\n  -webkit-user-select: none;\n  width: 3.2em;\n  border-right: 1px solid var(--pd-border-soft);\n}\n.pd-view-body td.pd-text { width: 50%; }\n/* vertical divider between the two halves */\n.pd-view-body td.pd-text:nth-child(2) { border-right: 1px solid var(--pd-border); }\n.pd-view-body td.pd-removed { background: var(--pd-del-bg); color: var(--pd-del-fg); }\n.pd-view-body td.pd-added   { background: var(--pd-add-bg); color: var(--pd-add-fg); }\n.pd-view-body td.pd-filler { background: var(--pd-bg); }\n.pd-view-body .pd-ins { background: var(--pd-add-mark); font-weight: 700; }\n.pd-view-body .pd-del { background: var(--pd-del-mark); font-weight: 700; }\n@media (max-width: 800px) {\n  /* On narrow screens the table scrolls horizontally rather than squashing. */\n  .pd-view-body table { min-width: 800px; }\n}\n\n.pd-footer {\n  margin-top: 18px;\n  color: var(--pd-muted);\n  font-size: 11px;\n  font-family: var(--pd-mono);\n  border-top: 1px solid var(--pd-border-soft);\n  padding-top: 6px;\n}\n\n/* ---- userscript overlay ---------------------------------------------- */\n.pd-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483647;\n  overflow: auto;\n  background: var(--pd-bg);\n}\n";

/* ---- engine ---- */
/*
 * Private Diff — comparison engine
 *
 * Pure, deterministic, dependency-free text comparison.
 * No DOM access, no network access, no storage. Works in a browser
 * (as the global `PrivateDiff`) and in Node (via module.exports) so it
 * can be unit-tested without a browser.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Sequence diff (Myers O(ND), linear-space "middle snake" variant)    */
  /* ------------------------------------------------------------------ */

  /**
   * Compute a minimal edit script between arrays `a` and `b`.
   * `eq(x, y)` decides element equality.
   * Returns an array of operations: { type: 'equal'|'del'|'ins', ai, bi, n }
   * where ai/bi are start indices in a/b and n is the run length.
   */
  function diffSequences(a, b, eq, ctx) {
    eq = eq || function (x, y) { return x === y; };
    ctx = ctx || { approximate: false };
    var ops = [];
    diffRange(a, 0, a.length, b, 0, b.length, eq, ops, ctx);
    return mergeOps(ops);
  }

  /** Maximum edit distance searched per sub-problem before giving up and
   *  treating the region as a plain replace. Keeps pathological inputs
   *  (e.g. tens of thousands of completely reordered lines) responsive. */
  var MAX_EDIT_SEARCH = 3000;

  function push(ops, type, ai, bi, n) {
    if (n > 0) ops.push({ type: type, ai: ai, bi: bi, n: n });
  }

  function diffRange(a, aStart, aEnd, b, bStart, bEnd, eq, ops, ctx) {
    // Strip common prefix.
    while (aStart < aEnd && bStart < bEnd && eq(a[aStart], b[bStart])) {
      push(ops, 'equal', aStart, bStart, 1);
      aStart++; bStart++;
    }
    // Strip common suffix (emitted after the middle is processed).
    var suffix = 0;
    while (aStart < aEnd && bStart < bEnd && eq(a[aEnd - 1], b[bEnd - 1])) {
      aEnd--; bEnd--; suffix++;
    }

    var n = aEnd - aStart, m = bEnd - bStart;
    if (n === 0 && m === 0) {
      // nothing in the middle
    } else if (n === 0) {
      push(ops, 'ins', aStart, bStart, m);
    } else if (m === 0) {
      push(ops, 'del', aStart, bStart, n);
    } else {
      var snake = middleSnake(a, aStart, aEnd, b, bStart, bEnd, eq);
      var progress = snake &&
        !(snake.x0 === 0 && snake.y0 === 0 && snake.x1 === n && snake.y1 === m) &&
        !(snake.x1 === 0 && snake.y1 === 0) && !(snake.x0 === n && snake.y0 === m);
      if (!progress) {
        // Either the edit-search budget was exceeded (snake === null) or,
        // as a safety net against infinite recursion, no progress was
        // made: treat the whole region as a replace.
        if (!snake) ctx.approximate = true;
        push(ops, 'del', aStart, bStart, n);
        push(ops, 'ins', aStart, bStart, m);
      } else {
        diffRange(a, aStart, aStart + snake.x0, b, bStart, bStart + snake.y0, eq, ops, ctx);
        push(ops, 'equal', aStart + snake.x0, bStart + snake.y0, snake.x1 - snake.x0);
        diffRange(a, aStart + snake.x1, aEnd, b, bStart + snake.y1, bEnd, eq, ops, ctx);
      }
    }

    push(ops, 'equal', aEnd, bEnd, suffix);
  }

  /**
   * Find the middle snake of the shortest edit path for the sub-problem
   * a[aStart..aEnd) vs b[bStart..bEnd). Coordinates returned are relative
   * to aStart/bStart: the snake runs from (x0,y0) to (x1,y1).
   */
  function middleSnake(a, aStart, aEnd, b, bStart, bEnd, eq) {
    var n = aEnd - aStart, m = bEnd - bStart;
    var max = n + m;
    var delta = n - m;
    var odd = (delta & 1) !== 0;
    var size = 2 * max + 3;
    var off = max + 1;
    var vf = new Int32Array(size);
    var vb = new Int32Array(size);
    // vb stores x in *reversed* coordinates (searching from the end).
    var half = Math.min(Math.ceil(max / 2) + 1, MAX_EDIT_SEARCH);

    for (var d = 0; d <= half; d++) {
      // Forward pass
      for (var k = -d; k <= d; k += 2) {
        var x, y;
        if (k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1])) {
          x = vf[off + k + 1];
        } else {
          x = vf[off + k - 1] + 1;
        }
        y = x - k;
        var sx = x, sy = y;
        while (x < n && y < m && eq(a[aStart + x], b[bStart + y])) { x++; y++; }
        vf[off + k] = x;
        if (odd) {
          var kr = delta - k; // corresponding reverse diagonal
          if (kr >= -(d - 1) && kr <= d - 1) {
            if (x + vb[off + kr] >= n) {
              return { x0: sx, y0: sy, x1: x, y1: y };
            }
          }
        }
      }
      // Reverse pass (same algorithm on reversed sequences)
      for (var k2 = -d; k2 <= d; k2 += 2) {
        var xr, yr;
        if (k2 === -d || (k2 !== d && vb[off + k2 - 1] < vb[off + k2 + 1])) {
          xr = vb[off + k2 + 1];
        } else {
          xr = vb[off + k2 - 1] + 1;
        }
        yr = xr - k2;
        var sxr = xr, syr = yr;
        while (xr < n && yr < m && eq(a[aEnd - 1 - xr], b[bEnd - 1 - yr])) { xr++; yr++; }
        vb[off + k2] = xr;
        if (!odd) {
          var kf = delta - k2;
          if (kf >= -d && kf <= d) {
            if (xr + vf[off + kf] >= n) {
              // Convert reversed snake back to forward coordinates.
              return { x0: n - xr, y0: m - yr, x1: n - sxr, y1: m - syr };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Diff two key arrays, first removing elements that occur on only one
   * side (they can never match, so they only slow the search down).
   * Result has the same shape as diffSequences, with original indices.
   */
  function diffKeys(a, b, ctx) {
    ctx = ctx || { approximate: false };
    var inA = Object.create(null), inB = Object.create(null), i;
    for (i = 0; i < a.length; i++) inA[a[i]] = true;
    for (i = 0; i < b.length; i++) inB[b[i]] = true;
    var fa = [], fai = [], fb = [], fbi = [];
    for (i = 0; i < a.length; i++) if (inB[a[i]]) { fa.push(a[i]); fai.push(i); }
    for (i = 0; i < b.length; i++) if (inA[b[i]]) { fb.push(b[i]); fbi.push(i); }

    var inner = diffSequences(fa, fb, null, ctx);
    var ops = [];
    var ai = 0, bi = 0; // cursors over the ORIGINAL arrays

    function flush(toA, toB) {
      push(ops, 'del', ai, bi, toA - ai); ai = toA;
      push(ops, 'ins', ai, bi, toB - bi); bi = toB;
    }

    for (var k = 0; k < inner.length; k++) {
      var op = inner[k];
      if (op.type === 'equal') {
        for (var j = 0; j < op.n; j++) {
          flush(fai[op.ai + j], fbi[op.bi + j]);
          push(ops, 'equal', ai, bi, 1); ai++; bi++;
        }
      } else if (op.type === 'del') {
        // Skip over these filtered elements; the flush at the next
        // equal/end emits everything up to there as del/ins.
        var lastA = fai[op.ai + op.n - 1] + 1;
        push(ops, 'del', ai, bi, lastA - ai); ai = lastA;
      } else {
        var lastB = fbi[op.bi + op.n - 1] + 1;
        push(ops, 'ins', ai, bi, lastB - bi); bi = lastB;
      }
    }
    flush(a.length, b.length);
    return mergeOps(ops);
  }

  function mergeOps(ops) {
    var out = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var last = out[out.length - 1];
      if (last && last.type === op.type &&
          last.ai + (op.type === 'ins' ? 0 : last.n) === op.ai &&
          last.bi + (op.type === 'del' ? 0 : last.n) === op.bi) {
        last.n += op.n;
      } else {
        out.push({ type: op.type, ai: op.ai, bi: op.bi, n: op.n });
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Text helpers                                                        */
  /* ------------------------------------------------------------------ */

  /** Split text into lines. Handles \n, \r\n and \r. A single trailing
   *  line terminator does not produce an extra empty line. */
  function splitLines(text) {
    if (text == null || text === '') return [];
    var lines = String(text).split(/\r\n|\r|\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '' && /[\r\n]$/.test(text)) {
      lines.pop();
    }
    return lines;
  }

  function isBlank(line) {
    return line.trim() === '';
  }

  /** Build the comparison key for a line under the given options. */
  function normalizeLine(line, options) {
    var s = line;
    if (options.ignoreWhitespace) s = s.trim();
    if (options.ignoreCase) s = s.toLowerCase();
    return s;
  }

  /** Tokenize a line into words, whitespace runs and punctuation. */
  function tokenize(line) {
    if (line === '') return [];
    var re;
    try {
      re = new RegExp('\\s+|[\\p{L}\\p{N}_]+|[^\\p{L}\\p{N}_\\s]', 'gu');
    } catch (e) {
      re = /\s+|\w+|[^\w\s]/g; // very old engines without \p{} support
    }
    return line.match(re) || [];
  }

  function normalizeToken(tok, options) {
    var s = tok;
    if (options.ignoreWhitespace && /^\s+$/.test(s)) s = ' ';
    if (options.ignoreCase) s = s.toLowerCase();
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Word-level (inline) diff of two lines                               */
  /* ------------------------------------------------------------------ */

  /**
   * Returns { left: segments, right: segments } where each segment is
   * { type: 'equal'|'del'|'ins', text }. `left` only contains equal/del,
   * `right` only equal/ins.
   */
  function diffWords(oldLine, newLine, options) {
    options = options || {};
    var ta = tokenize(oldLine), tb = tokenize(newLine);
    var ka = ta.map(function (t) { return normalizeToken(t, options); });
    var kb = tb.map(function (t) { return normalizeToken(t, options); });
    var ops = diffSequences(ka, kb);
    var left = [], right = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'equal') {
        appendSeg(left, 'equal', ta.slice(op.ai, op.ai + op.n).join(''));
        appendSeg(right, 'equal', tb.slice(op.bi, op.bi + op.n).join(''));
      } else if (op.type === 'del') {
        appendSeg(left, 'del', ta.slice(op.ai, op.ai + op.n).join(''));
      } else {
        appendSeg(right, 'ins', tb.slice(op.bi, op.bi + op.n).join(''));
      }
    }
    return { left: left, right: right };
  }

  function appendSeg(list, type, text) {
    if (text === '') return;
    var last = list[list.length - 1];
    if (last && last.type === type) last.text += text;
    else list.push({ type: type, text: text });
  }

  /* ------------------------------------------------------------------ */
  /* Main comparison                                                     */
  /* ------------------------------------------------------------------ */

  var DEFAULT_OPTIONS = {
    mode: 'line',            // 'line' | 'word'
    ignoreWhitespace: false, // ignore leading/trailing whitespace per line
    ignoreBlankLines: false, // drop blank lines before comparing
    ignoreCase: false        // case-insensitive comparison
  };

  /**
   * Compare two texts.
   *
   * Returns:
   * {
   *   identical: boolean,            // no differences under current options
   *   normalized: boolean,           // any ignore-* option is active
   *   approximate: boolean,          // true when a region was too costly to
   *                                  // diff minimally and was shown as a
   *                                  // plain remove/add block instead
   *   options: {...},
   *   summary: { added, removed, unchanged, modified },
   *   rows: [ { type: 'equal'|'removed'|'added',
   *             oldNo: number|null, newNo: number|null,
   *             text: string,                   // ORIGINAL text, never normalized
   *             segments: [ {type,text} ]|null  // word-level highlights, when available
   *           } ],
   *   report: string                 // plain-text diff report
   * }
   */
  function compare(original, modified, userOptions) {
    var options = {};
    for (var k in DEFAULT_OPTIONS) options[k] = DEFAULT_OPTIONS[k];
    if (userOptions) for (var k2 in userOptions) if (k2 in DEFAULT_OPTIONS) options[k2] = userOptions[k2];

    original = original == null ? '' : String(original);
    modified = modified == null ? '' : String(modified);

    var oldLines = buildLineList(original, options);
    var newLines = buildLineList(modified, options);

    var ctx = { approximate: false };
    var ops = diffKeys(oldLines.keys, newLines.keys, ctx);

    var rows = [];
    var summary = { added: 0, removed: 0, unchanged: 0, modified: 0 };

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'equal') {
        for (var j = 0; j < op.n; j++) {
          rows.push({
            type: 'equal',
            oldNo: oldLines.numbers[op.ai + j],
            newNo: newLines.numbers[op.bi + j],
            text: oldLines.lines[op.ai + j],
            newText: newLines.lines[op.bi + j],
            segments: null
          });
        }
        summary.unchanged += op.n;
      } else if (op.type === 'del') {
        var next = ops[i + 1];
        if (next && next.type === 'ins') {
          // A replace block: pair removed/added lines for inline highlights.
          emitReplace(op, next, oldLines, newLines, options, rows, summary);
          i++;
        } else {
          for (var d = 0; d < op.n; d++) {
            rows.push({ type: 'removed', oldNo: oldLines.numbers[op.ai + d], newNo: null,
              text: oldLines.lines[op.ai + d], segments: null });
          }
          summary.removed += op.n;
        }
      } else { // ins
        for (var a = 0; a < op.n; a++) {
          rows.push({ type: 'added', oldNo: null, newNo: newLines.numbers[op.bi + a],
            text: newLines.lines[op.bi + a], segments: null });
        }
        summary.added += op.n;
      }
    }

    var identical = summary.added === 0 && summary.removed === 0;
    var normalized = !!(options.ignoreWhitespace || options.ignoreBlankLines || options.ignoreCase);

    var result = {
      identical: identical,
      normalized: normalized,
      approximate: ctx.approximate, // true if the edit-search budget was hit
      options: options,
      summary: summary,
      rows: rows,
      report: ''
    };
    result.report = buildReport(result);
    return result;
  }

  function buildLineList(text, options) {
    var raw = splitLines(text);
    var lines = [], numbers = [], keys = [];
    for (var i = 0; i < raw.length; i++) {
      if (options.ignoreBlankLines && isBlank(raw[i])) continue;
      lines.push(raw[i]);
      numbers.push(i + 1);
      keys.push(normalizeLine(raw[i], options));
    }
    return { lines: lines, numbers: numbers, keys: keys };
  }

  function emitReplace(del, ins, oldLines, newLines, options, rows, summary) {
    var pairs = Math.min(del.n, ins.n);
    var wordMode = options.mode === 'word';
    for (var p = 0; p < pairs; p++) {
      var oldText = oldLines.lines[del.ai + p];
      var newText = newLines.lines[ins.bi + p];
      var segs = wordMode ? diffWords(oldText, newText, options) : null;
      rows.push({ type: 'removed', oldNo: oldLines.numbers[del.ai + p], newNo: null,
        text: oldText, segments: segs ? segs.left : null });
      rows.push({ type: 'added', oldNo: null, newNo: newLines.numbers[ins.bi + p],
        text: newText, segments: segs ? segs.right : null });
    }
    for (var d = pairs; d < del.n; d++) {
      rows.push({ type: 'removed', oldNo: oldLines.numbers[del.ai + d], newNo: null,
        text: oldLines.lines[del.ai + d], segments: null });
    }
    for (var a = pairs; a < ins.n; a++) {
      rows.push({ type: 'added', oldNo: null, newNo: newLines.numbers[ins.bi + a],
        text: newLines.lines[ins.bi + a], segments: null });
    }
    summary.removed += del.n;
    summary.added += ins.n;
    summary.modified += pairs;
  }

  /** Plain-text report suitable for copying or saving. */
  function buildReport(result) {
    var out = [];
    out.push('--- original');
    out.push('+++ modified');
    var o = result.options;
    var flags = [];
    if (o.mode === 'word') flags.push('word-level');
    if (o.ignoreWhitespace) flags.push('ignore leading/trailing whitespace');
    if (o.ignoreBlankLines) flags.push('ignore blank lines');
    if (o.ignoreCase) flags.push('ignore case');
    if (flags.length) out.push('# options: ' + flags.join(', '));
    out.push('# +' + result.summary.added + ' added, -' + result.summary.removed +
      ' removed, ' + result.summary.unchanged + ' unchanged');
    if (result.identical) {
      out.push('# No differences found.');
      return out.join('\n') + '\n';
    }
    var w = 0;
    for (var i = 0; i < result.rows.length; i++) {
      var r = result.rows[i];
      w = Math.max(w, String(r.oldNo || 0).length, String(r.newNo || 0).length);
    }
    for (var j = 0; j < result.rows.length; j++) {
      var row = result.rows[j];
      var mark = row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' ';
      out.push(pad(row.oldNo, w) + ' ' + pad(row.newNo, w) + ' ' + mark + ' ' + row.text);
    }
    return out.join('\n') + '\n';
  }

  function pad(n, w) {
    var s = n == null ? '' : String(n);
    while (s.length < w) s = ' ' + s;
    return s;
  }

  var PrivateDiff = {
    compare: compare,
    diffWords: diffWords,
    diffSequences: diffSequences,
    diffKeys: diffKeys,
    splitLines: splitLines,
    tokenize: tokenize,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    VERSION: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrivateDiff;
  } else {
    root.PrivateDiff = PrivateDiff;
  }
})(PD_NS);


/* ---- ui ---- */
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
})(PD_NS);

PrivateDiffUI = PD_NS.PrivateDiffUI;

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

})();
