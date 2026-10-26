'use strict';
// Run with:  node --test tests/
// Uses only Node's built-in test runner and assert module.

const test = require('node:test');
const assert = require('node:assert/strict');
const PD = require('../src/engine.js');

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function types(result) {
  return result.rows.map((r) => r.type);
}
function texts(result, type) {
  return result.rows.filter((r) => r.type === type).map((r) => r.text);
}

/* ------------------------------------------------------------------ */
/* 1–8: basic line comparison and empty inputs                         */
/* ------------------------------------------------------------------ */

test('1. identical inputs', () => {
  const r = PD.compare('a\nb\nc', 'a\nb\nc');
  assert.equal(r.identical, true);
  assert.deepEqual(r.summary, { added: 0, removed: 0, unchanged: 3, modified: 0 });
  assert.deepEqual(types(r), ['equal', 'equal', 'equal']);
  assert.match(r.report, /No differences found/);
});

test('2. one added line', () => {
  const r = PD.compare('a\nb', 'a\nb\nc');
  assert.equal(r.identical, false);
  assert.deepEqual(types(r), ['equal', 'equal', 'added']);
  assert.deepEqual(texts(r, 'added'), ['c']);
  assert.equal(r.summary.added, 1);
  assert.equal(r.summary.removed, 0);
  assert.equal(r.summary.unchanged, 2);
  const added = r.rows[2];
  assert.equal(added.oldNo, null);
  assert.equal(added.newNo, 3);
});

test('3. one removed line', () => {
  const r = PD.compare('a\nb\nc', 'a\nc');
  assert.deepEqual(types(r), ['equal', 'removed', 'equal']);
  assert.deepEqual(texts(r, 'removed'), ['b']);
  assert.equal(r.summary.removed, 1);
  assert.equal(r.rows[1].oldNo, 2);
  assert.equal(r.rows[1].newNo, null);
  // line numbers continue correctly after the removal
  assert.equal(r.rows[2].oldNo, 3);
  assert.equal(r.rows[2].newNo, 2);
});

test('4. one modified line', () => {
  const r = PD.compare('a\nb\nc', 'a\nB2\nc');
  assert.deepEqual(types(r), ['equal', 'removed', 'added', 'equal']);
  assert.deepEqual(texts(r, 'removed'), ['b']);
  assert.deepEqual(texts(r, 'added'), ['B2']);
  assert.equal(r.summary.modified, 1);
});

test('5. multiple additions and removals', () => {
  const orig = ['one', 'two', 'three', 'four', 'five'].join('\n');
  const mod = ['zero', 'one', 'three', 'four-b', 'five', 'six'].join('\n');
  const r = PD.compare(orig, mod);
  assert.deepEqual(texts(r, 'removed'), ['two', 'four']);
  assert.deepEqual(texts(r, 'added'), ['zero', 'four-b', 'six']);
  assert.equal(r.summary.unchanged, 3);
  assert.equal(r.summary.added, 3);
  assert.equal(r.summary.removed, 2);
});

test('6. empty original input', () => {
  const r = PD.compare('', 'x\ny');
  assert.deepEqual(types(r), ['added', 'added']);
  assert.equal(r.summary.added, 2);
  assert.equal(r.identical, false);
});

test('7. empty modified input', () => {
  const r = PD.compare('x\ny', '');
  assert.deepEqual(types(r), ['removed', 'removed']);
  assert.equal(r.summary.removed, 2);
});

test('8. both inputs empty', () => {
  const r = PD.compare('', '');
  assert.equal(r.identical, true);
  assert.deepEqual(r.rows, []);
  assert.deepEqual(r.summary, { added: 0, removed: 0, unchanged: 0, modified: 0 });
  // null / undefined must not crash either
  assert.equal(PD.compare(null, undefined).identical, true);
});

test('8b. whitespace-only inputs', () => {
  const r = PD.compare('   ', '\t');
  assert.equal(r.identical, false); // whitespace-sensitive by default
  const r2 = PD.compare('   ', '\t', { ignoreWhitespace: true });
  assert.equal(r2.identical, true);
  const r3 = PD.compare('  \n\n ', '', { ignoreBlankLines: true });
  assert.equal(r3.identical, true);
});

/* ------------------------------------------------------------------ */
/* 9–12: blank lines, whitespace, case                                 */
/* ------------------------------------------------------------------ */

test('9. blank lines are significant by default and ignorable on request', () => {
  const r = PD.compare('a\n\nb', 'a\nb');
  assert.deepEqual(types(r), ['equal', 'removed', 'equal']);
  assert.equal(r.rows[1].text, '');

  const r2 = PD.compare('a\n\nb', 'a\nb', { ignoreBlankLines: true });
  assert.equal(r2.identical, true);
  assert.equal(r2.normalized, true);
  // original line numbers are preserved for the lines that remain
  assert.deepEqual(r2.rows.map((x) => x.oldNo), [1, 3]);
});

test('10. leading and trailing whitespace', () => {
  const r = PD.compare('  select 1', 'select 1  ');
  assert.equal(r.identical, false);
  const r2 = PD.compare('  select 1', 'select 1  ', { ignoreWhitespace: true });
  assert.equal(r2.identical, true);
  // displayed text is never normalized
  assert.equal(r2.rows[0].text, '  select 1');
  // internal whitespace still matters
  const r3 = PD.compare('select  1', 'select 1', { ignoreWhitespace: true });
  assert.equal(r3.identical, false);
});

test('11. case-sensitive by default', () => {
  const r = PD.compare('SELECT * FROM t', 'select * from t');
  assert.equal(r.identical, false);
  assert.equal(r.normalized, false);
  assert.deepEqual(types(r), ['removed', 'added']);
});

test('12. case-insensitive comparison', () => {
  const r = PD.compare('SELECT * FROM t', 'select * from t', { ignoreCase: true });
  assert.equal(r.identical, true);
  assert.equal(r.normalized, true);
  assert.equal(r.rows[0].text, 'SELECT * FROM t'); // original preserved
  assert.match(r.report, /ignore case/);
});

/* ------------------------------------------------------------------ */
/* 13: word-level                                                      */
/* ------------------------------------------------------------------ */

test('13. word-level comparison highlights changed words only', () => {
  const o = 'SELECT id, name FROM users WHERE id = 1';
  const m = 'SELECT id, email FROM users WHERE id = 10';
  const w = PD.diffWords(o, m);
  assert.deepEqual(w.left, [
    { type: 'equal', text: 'SELECT id, ' },
    { type: 'del', text: 'name' },
    { type: 'equal', text: ' FROM users WHERE id = ' },
    { type: 'del', text: '1' }
  ]);
  assert.deepEqual(w.right, [
    { type: 'equal', text: 'SELECT id, ' },
    { type: 'ins', text: 'email' },
    { type: 'equal', text: ' FROM users WHERE id = ' },
    { type: 'ins', text: '10' }
  ]);
  // segments concatenate back to the original lines
  assert.equal(w.left.map((s) => s.text).join(''), o);
  assert.equal(w.right.map((s) => s.text).join(''), m);

  // In word mode, compare() attaches segments to paired removed/added rows
  const r = PD.compare('x\n' + o + '\ny', 'x\n' + m + '\ny', { mode: 'word' });
  assert.deepEqual(types(r), ['equal', 'removed', 'added', 'equal']);
  assert.ok(Array.isArray(r.rows[1].segments));
  assert.ok(Array.isArray(r.rows[2].segments));
  assert.equal(r.rows[1].segments.filter((s) => s.type === 'del').length, 2);
  // In line mode, no segments are produced
  const r2 = PD.compare(o, m, { mode: 'line' });
  assert.equal(r2.rows[0].segments, null);
});

test('13b. word-level with ignoreCase', () => {
  const w = PD.diffWords('Select a', 'SELECT b', { ignoreCase: true });
  assert.deepEqual(w.left, [{ type: 'equal', text: 'Select ' }, { type: 'del', text: 'a' }]);
  assert.deepEqual(w.right, [{ type: 'equal', text: 'SELECT ' }, { type: 'ins', text: 'b' }]);
});

test('13c. unpaired lines in a replace block stay plain', () => {
  const r = PD.compare('a\nb', 'A\nB\nC', { mode: 'word' });
  assert.deepEqual(types(r), ['removed', 'added', 'removed', 'added', 'added']);
  assert.equal(r.rows[4].segments, null);
  assert.equal(r.summary.modified, 2);
});

/* ------------------------------------------------------------------ */
/* 14–16: unicode, line endings, large input                           */
/* ------------------------------------------------------------------ */

test('14. unicode text', () => {
  const o = 'héllo wörld\n日本語のテキスト\nemoji 🎉 here';
  const m = 'héllo wörld\n日本語のテキスト!\nemoji 🎉 here';
  const r = PD.compare(o, m, { mode: 'word' });
  assert.deepEqual(types(r), ['equal', 'removed', 'added', 'equal']);
  assert.equal(r.rows[1].text, '日本語のテキスト');
  const ins = r.rows[2].segments.filter((s) => s.type === 'ins');
  assert.deepEqual(ins, [{ type: 'ins', text: '!' }]);
  assert.equal(PD.compare(o, o).identical, true);
  // ignoreCase works with non-ASCII letters
  assert.equal(PD.compare('ÄÖÜ', 'äöü', { ignoreCase: true }).identical, true);
});

test('15. Windows and Unix line endings', () => {
  assert.deepEqual(PD.splitLines('a\r\nb\r\nc'), ['a', 'b', 'c']);
  assert.deepEqual(PD.splitLines('a\nb\nc\n'), ['a', 'b', 'c']);
  assert.deepEqual(PD.splitLines('a\rb'), ['a', 'b']);
  assert.deepEqual(PD.splitLines('\n'), ['']);
  assert.deepEqual(PD.splitLines('a\n\n'), ['a', '']);
  const r = PD.compare('a\r\nb\r\nc', 'a\nb\nc');
  assert.equal(r.identical, true, 'CRLF vs LF should compare equal line by line');
  const r2 = PD.compare('a\r\nb', 'a\r\nb\r\nc');
  assert.deepEqual(types(r2), ['equal', 'equal', 'added']);
});

test('16. large text input is handled quickly and correctly', () => {
  const N = 20000;
  const a = [], b = [];
  for (let i = 0; i < N; i++) {
    a.push('line ' + i);
    b.push(i % 100 === 0 ? 'changed ' + i : 'line ' + i);
  }
  const t0 = Date.now();
  const r = PD.compare(a.join('\n'), b.join('\n'));
  const elapsed = Date.now() - t0;
  assert.equal(r.summary.added, N / 100);
  assert.equal(r.summary.removed, N / 100);
  assert.equal(r.summary.unchanged, N - N / 100);
  assert.equal(r.approximate, false);
  assert.ok(elapsed < 3000, 'took ' + elapsed + 'ms');

  // Entirely different inputs must also stay fast
  const t1 = Date.now();
  const r2 = PD.compare(a.join('\n'), a.map((x) => x + '!').join('\n'));
  assert.equal(r2.summary.unchanged, 0);
  assert.ok(Date.now() - t1 < 3000);
});

test('16b. pathological input hits the search budget but stays correct', () => {
  const N = 20000;
  const a = [], b = [];
  for (let i = 0; i < N; i++) { a.push('line ' + i); b.push('line ' + ((i * 7919) % N)); }
  const t0 = Date.now();
  const r = PD.compare(a.join('\n'), b.join('\n'));
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(r.approximate, true);
  // Every line is still accounted for exactly once.
  assert.deepEqual(texts(r, 'removed').concat(texts(r, 'equal')).sort(), a.slice().sort());
  assert.deepEqual(texts(r, 'added').concat(texts(r, 'equal')).sort(), b.slice().sort());
});

/* ------------------------------------------------------------------ */
/* 17–20: HTML-like, SQL, JSON, punctuation                            */
/* ------------------------------------------------------------------ */

test('17. HTML-like strings are treated as plain text', () => {
  const o = '<script>alert("x")</script>\n<b>bold</b>';
  const m = '<script>alert("y")</script>\n<b>bold</b>';
  const r = PD.compare(o, m, { mode: 'word' });
  assert.deepEqual(types(r), ['removed', 'added', 'equal']);
  assert.equal(r.rows[0].text, '<script>alert("x")</script>');
  assert.equal(r.rows[2].text, '<b>bold</b>');
  // report contains the raw text unchanged (escaping is the UI's job)
  assert.match(r.report, /<script>alert\("x"\)<\/script>/);
});

test('18. SQL statements', () => {
  const o = [
    'SELECT u.id, u.name',
    'FROM users u',
    'JOIN orders o ON o.user_id = u.id',
    "WHERE o.status = 'paid'",
    'ORDER BY u.id;'
  ].join('\n');
  const m = [
    'SELECT u.id, u.name, u.email',
    'FROM users u',
    'LEFT JOIN orders o ON o.user_id = u.id',
    "WHERE o.status = 'paid'",
    '  AND o.total > 100',
    'ORDER BY u.id;'
  ].join('\n');
  const r = PD.compare(o, m, { mode: 'word' });
  assert.deepEqual(texts(r, 'removed'), ['SELECT u.id, u.name', 'JOIN orders o ON o.user_id = u.id']);
  assert.deepEqual(texts(r, 'added'), [
    'SELECT u.id, u.name, u.email',
    'LEFT JOIN orders o ON o.user_id = u.id',
    '  AND o.total > 100'
  ]);
  assert.equal(r.summary.unchanged, 3);
  const firstAdded = r.rows.find((x) => x.type === 'added');
  assert.deepEqual(firstAdded.segments.filter((s) => s.type === 'ins'), [{ type: 'ins', text: ', u.email' }]);
});

test('19. JSON payloads', () => {
  const o = JSON.stringify({ id: 1, name: 'a', tags: ['x', 'y'], nested: { k: true } }, null, 2);
  const m = JSON.stringify({ id: 1, name: 'b', tags: ['x', 'y', 'z'], nested: { k: true } }, null, 2);
  const r = PD.compare(o, m);
  assert.deepEqual(texts(r, 'removed'), ['  "name": "a",', '    "y"']);
  assert.deepEqual(texts(r, 'added'), ['  "name": "b",', '    "y",', '    "z"']);
  assert.equal(PD.compare(o, o).identical, true);
});

test('20. unusual punctuation and special characters', () => {
  const o = 'a = b ?? c; // x\t|\\|  "q" \'s\' `t` ~!@#$%^&*()_+-=[]{};:,.<>/?';
  const m = 'a = b ?? d; // x\t|\\|  "q" \'s\' `t` ~!@#$%^&*()_+-=[]{};:,.<>/?';
  const w = PD.diffWords(o, m);
  assert.deepEqual(w.left.filter((s) => s.type === 'del'), [{ type: 'del', text: 'c' }]);
  assert.deepEqual(w.right.filter((s) => s.type === 'ins'), [{ type: 'ins', text: 'd' }]);
  assert.equal(w.left.map((s) => s.text).join(''), o);
  // Null bytes and control characters don't crash
  const r = PD.compare('a\u0000b\u0007', 'a\u0000b');
  assert.equal(r.identical, false);
});

/* ------------------------------------------------------------------ */
/* extra: report format, option isolation, determinism, minimality     */
/* ------------------------------------------------------------------ */

test('report has header, summary and prefixed lines', () => {
  const r = PD.compare('a\nb', 'a\nc');
  const lines = r.report.split('\n');
  assert.equal(lines[0], '--- original');
  assert.equal(lines[1], '+++ modified');
  assert.match(lines[2], /^# \+1 added, -1 removed, 1 unchanged$/);
  assert.equal(lines[3], '1 1   a');
  assert.equal(lines[4], '2   - b');
  assert.equal(lines[5], '  2 + c');
});

test('unknown options are ignored and defaults apply', () => {
  const r = PD.compare('A', 'a', { bogus: true });
  assert.equal(r.identical, false);
  assert.deepEqual(r.options, PD.DEFAULT_OPTIONS);
});

test('comparison is deterministic', () => {
  const o = 'x\ny\nz\n', m = 'x\nz\nq\n';
  assert.deepEqual(PD.compare(o, m), PD.compare(o, m));
});

test('diffSequences produces a minimal edit script (fuzz vs brute-force LCS)', () => {
  function lcs(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    return dp[0][0];
  }
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 1500; t++) {
    const n = Math.floor(rnd() * 12), m = Math.floor(rnd() * 12), alpha = 1 + Math.floor(rnd() * 5);
    const a = [], b = [];
    for (let i = 0; i < n; i++) a.push(String.fromCharCode(97 + Math.floor(rnd() * alpha)));
    for (let i = 0; i < m; i++) b.push(String.fromCharCode(97 + Math.floor(rnd() * alpha)));
    for (const fn of [PD.diffSequences, PD.diffKeys]) {
      const ops = fn(a, b);
      let ai = 0, bi = 0, eq = 0;
      const ra = [], rb = [];
      for (const op of ops) {
        assert.equal(op.ai, ai); assert.equal(op.bi, bi);
        if (op.type === 'equal') {
          for (let k = 0; k < op.n; k++) { assert.equal(a[ai + k], b[bi + k]); ra.push(a[ai + k]); rb.push(b[bi + k]); }
          ai += op.n; bi += op.n; eq += op.n;
        } else if (op.type === 'del') { for (let k = 0; k < op.n; k++) ra.push(a[ai + k]); ai += op.n; }
        else { for (let k = 0; k < op.n; k++) rb.push(b[bi + k]); bi += op.n; }
      }
      assert.deepEqual(ra, a); assert.deepEqual(rb, b);
      assert.equal(eq, lcs(a, b), `not minimal for ${a.join('')} vs ${b.join('')}`);
    }
  }
});
