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
})(typeof globalThis !== 'undefined' ? globalThis : this);
