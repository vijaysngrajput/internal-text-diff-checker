'use strict';
// Static privacy and packaging checks on the source and built files.
// Run with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('build.js produces both distributables', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(ROOT, 'index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'private-diff.user.js')));
});

const sourceFiles = ['src/engine.js', 'src/ui.js', 'src/userscript.boot.js', 'index.html', 'private-diff.user.js'];

test('no network APIs are used anywhere', () => {
  const banned = [
    /\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /navigator\.sendBeacon/, /EventSource/,
    /GM_xmlhttpRequest/, /GM\.xmlHttpRequest/, /\bimportScripts\b/, /new\s+Image\s*\(/
  ];
  for (const f of sourceFiles) {
    const src = read(f);
    for (const re of banned) assert.ok(!re.test(src), `${f} matches ${re}`);
  }
});

test('no external URLs are referenced', () => {
  for (const f of sourceFiles) {
    const src = read(f);
    const urls = (src.match(/https?:\/\/[^\s'"<>)]+/g) || []).filter((u) => !/^https?:\/\/\*/.test(u));
    assert.deepEqual(urls, [], `${f} references ${urls.join(', ')}`);
  }
  // The only "*://*/*" in the userscript is its @match rule.
  const us = read('private-diff.user.js');
  assert.ok(/\/\/ @match\s+\*:\/\/\*\/\*/.test(us));
});

test('no persistent storage APIs are used', () => {
  const banned = [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /GM_setValue/, /GM\.setValue/, /caches\./];
  for (const f of sourceFiles) {
    const src = read(f);
    for (const re of banned) assert.ok(!re.test(src), `${f} matches ${re}`);
  }
});

test('user content is never rendered through innerHTML / outerHTML / insertAdjacentHTML / eval', () => {
  const banned = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /\beval\s*\(/, /new\s+Function\s*\(/, /document\.write/];
  for (const f of ['src/engine.js', 'src/ui.js', 'src/userscript.boot.js']) {
    // Strip comments so that documentation may mention the banned names.
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of banned) assert.ok(!re.test(src), `${f} matches ${re}`);
  }
});

test('index.html is self-contained with a restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(!/<script[^>]+src=/i.test(html), 'external script tag');
  assert.ok(!/<link[^>]+href=/i.test(html), 'external stylesheet/link');
  assert.ok(/Content-Security-Policy/.test(html));
  assert.ok(/connect-src 'none'/.test(html));
  assert.ok(/default-src 'none'/.test(html));
  assert.ok(html.includes('Private Diff'));
  assert.ok(html.includes('Compare text. See what changed. Nothing saved.'));
});

test('userscript metadata is sane', () => {
  const us = read('private-diff.user.js');
  assert.ok(us.startsWith('// ==UserScript=='));
  assert.ok(/\/\/ @noframes/.test(us));
  assert.ok(/\/\/ @connect\s+none/.test(us));
  assert.ok(/\/\/ @version\s+\d+\.\d+\.\d+/.test(us));
  // nothing is attached to the page's global scope
  assert.ok(!/\(typeof globalThis !== 'undefined' \? globalThis : this\)/.test(us));
});

test('engine module has no DOM or Node dependencies', () => {
  const src = read('src/engine.js');
  assert.ok(!/\bdocument\b/.test(src));
  assert.ok(!/\bwindow\b/.test(src));
  assert.ok(!/\brequire\s*\(/.test(src));
});
