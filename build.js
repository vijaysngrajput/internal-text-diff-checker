#!/usr/bin/env node
/*
 * Build script — assembles the two distributable files from src/:
 *
 *   index.html             standalone page (double-click to use)
 *   private-diff.user.js   userscript for Tampermonkey / Violentmonkey / Greasemonkey
 *
 * Uses only Node's standard library. Run:  node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const engine = read('engine.js');
const ui = read('ui.js');
const css = read('style.css');
const version = (engine.match(/VERSION:\s*'([^']+)'/) || [])[1] || '0.0.0';

function replaceMarker(template, marker, content) {
  // Use a function replacement so "$" sequences in content are kept literal.
  return template.replace('/*__' + marker + '__*/', () => content);
}

/* ---- index.html ---- */
let page = read('page.html');
if (/<\/script/i.test(engine + ui)) {
  throw new Error('source contains "</script", which would break inline embedding');
}
page = replaceMarker(page, 'STYLE', css);
page = replaceMarker(page, 'ENGINE', engine);
page = replaceMarker(page, 'UI', ui);
fs.writeFileSync(path.join(ROOT, 'index.html'), page);

/* ---- private-diff.user.js ---- */
const header = read('userscript.header.js').replace('__VERSION__', version);
const boot = read('userscript.boot.js');

// Inside the userscript everything lives in a private namespace object
// instead of the page's global scope, so the host page cannot see or
// tamper with it and a page-defined `module` global cannot confuse it.
const ROOT_EXPR = "(typeof globalThis !== 'undefined' ? globalThis : this);";
function rebase(src, name) {
  if (!src.includes(ROOT_EXPR)) throw new Error(name + ': root expression not found');
  return src.replace(ROOT_EXPR, '(PD_NS);');
}
const userscript = [
  header,
  '',
  '(function () {',
  "'use strict';",
  'var PD_NS = {};',
  'var module = undefined;',
  'var PrivateDiffUI;',
  '',
  '/* ---- stylesheet (embedded) ---- */',
  'var PRIVATE_DIFF_CSS = ' + JSON.stringify(css) + ';',
  '',
  '/* ---- engine ---- */',
  rebase(engine, 'engine.js'),
  '',
  '/* ---- ui ---- */',
  rebase(ui, 'ui.js'),
  'PrivateDiffUI = PD_NS.PrivateDiffUI;',
  '',
  boot,
  '})();',
  ''
].join('\n');
fs.writeFileSync(path.join(ROOT, 'private-diff.user.js'), userscript);

console.log('built index.html (' + page.length + ' bytes) and private-diff.user.js (' +
  userscript.length + ' bytes), version ' + version);
