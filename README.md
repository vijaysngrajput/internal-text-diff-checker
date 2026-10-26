# Private Diff — Internal Text Comparison Tool

Paste two pieces of text, click **Compare**, see what changed. Nothing is
saved and nothing leaves the browser.

Private Diff is a single self-contained HTML page (and, optionally, a
userscript) that runs entirely inside the employee's browser. There is no
server, no installation, no dependencies, and no network traffic.

---

## Business use case

Employees regularly need to compare two versions of sensitive, plain-text
company content: SQL queries, database schemas, JSON payloads, application
logs, ETL/YAML configuration, Python code, error messages, text reports.

Public "online diff" websites are not acceptable for that content. Private
Diff provides the same convenience without the data ever leaving the
employee's machine.

## Features

- Side-by-side **ORIGINAL** / **MODIFIED** panels (stacked on narrow screens)
- **Compare** turns the two boxes into an aligned side-by-side view in place:
  removed/changed lines are red in ORIGINAL, added/changed lines are green in
  MODIFIED, with line numbers on both sides. **✎ edit** returns to the text
  boxes with the content intact.
- **Swap**, **Clear All**, plus per-panel *clear*
- Optional **word-level** mode that highlights the exact changed words inside
  modified lines (ideal for long SQL statements and config lines)
- Options: ignore leading/trailing whitespace · ignore blank lines · ignore
  case — all **off by default**; a banner tells you when normalization is in
  effect, and the displayed text is always the original input
- Compact summary: added / removed / unchanged (and modified, in word mode)
- "No differences found." for identical inputs
- Long lines scroll horizontally by default; optional *wrap long lines*
- **copy result** (plain-text report to clipboard) and **download .txt**
  (`comparison.diff.txt`, generated in memory, saved only on your device)
- `Ctrl/⌘ + Enter` to compare
- Light and dark colour schemes (follows the OS setting)
- Handles CRLF/LF/CR line endings, Unicode, empty inputs, whitespace-only
  inputs, HTML-like content (shown as text, never interpreted)

## Technology stack

- Plain HTML, CSS and JavaScript — **no frameworks, no libraries, no build
  dependencies**.
- Diff algorithm: Myers' O(ND) shortest-edit-script algorithm (linear-space
  middle-snake variant — the same family of algorithm used by `git diff`),
  implemented in `src/engine.js`.
- Node.js (≥ 18) is needed **only by developers**, to run the tests and the
  build script. End users need nothing but a browser.

Supported browsers: current Chrome, Edge, Firefox and Safari.

## Architecture

```
src/engine.js   pure comparison engine – no DOM, no network, no storage
src/ui.js       user interface – builds the page with DOM APIs only
src/style.css   stylesheet
src/page.html   template for index.html
src/userscript.header.js / userscript.boot.js   userscript metadata + overlay bootstrap
build.js        concatenates the above into the two distributables
```

`node build.js` produces:

| File | What it is | How to use |
|---|---|---|
| `index.html` | The complete application in one file | Double-click it, or bookmark it, or put it on any internal web server / shared drive |
| `private-diff.user.js` | The same application packaged as a userscript | Install once in Tampermonkey / Violentmonkey / Greasemonkey, then open it on any page |

Both files are generated — edit `src/` and rebuild rather than editing them
directly.

## Privacy model

Three separate claims, each verified separately:

1. **No transmission anywhere.** The page makes zero network requests after
   it is loaded. `index.html` carries a Content-Security-Policy of
   `default-src 'none'; connect-src 'none'; …`, so the *browser itself*
   blocks any request even if a future bug tried to make one. The code
   contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, image
   beacons or external resources (`tests/build.test.js` enforces this; a
   Playwright run confirmed the only request is the page load itself).
2. **No server-side processing.** There is no server. Comparison runs in the
   browser tab's JavaScript engine. This is stricter than the original
   Streamlit design, in which pasted text would have been sent to an
   application server.
3. **No persistence.** Nothing is written to `localStorage`,
   `sessionStorage`, IndexedDB, cookies or userscript storage (`GM_setValue`).
   Content never appears in the URL. There is no history feature. *Download*
   produces a file only where the employee chooses to save it.

Additional safeguards:

- Pasted text is rendered with `textContent` / `createTextNode` only — never
  `innerHTML` — so pasted HTML or `<script>` is always shown as text.
- The userscript renders inside a **closed Shadow DOM** overlay and attaches
  nothing to the page's global scope, so the host page's CSS cannot restyle
  it and its scripts cannot trivially read the overlay's contents. The
  overlay never reads anything from the host page. Closing the overlay runs
  *Clear All* and removes it from the page.
- `@noframes` / `@connect none` in the userscript metadata.

**Honest limits.** *Clear All* empties the inputs and result, but JavaScript
cannot guarantee immediate erasure from browser process memory; closing the
tab does. Browser features outside this tool — form autofill, session
restore, clipboard history, screen recording, an extension with page access —
are governed by the browser and company endpoint policy, not by this page.
Because the userscript runs on `*://*/*`, employees should install it only
from the company-distributed file; review the userscript manager's own
privacy settings as part of the security review.

## Project structure

```
text_diff_checker/
├── index.html              ← generated: the app (open this)
├── private-diff.user.js    ← generated: userscript version
├── build.js                ← node build.js
├── README.md
├── .gitignore
├── src/
│   ├── engine.js
│   ├── ui.js
│   ├── style.css
│   ├── page.html
│   ├── userscript.header.js
│   └── userscript.boot.js
└── tests/
    ├── engine.test.js      ← comparison behaviour (node:test)
    └── build.test.js       ← packaging & privacy checks
```

## Using it

### Option 1 — the HTML file (recommended, zero install)

1. Open `index.html` in a browser (double-click it). Bookmark the resulting
   `file:///…/index.html` address for next time.
2. Paste the original text on the left, the modified text on the right.
3. Click **Compare** (or press `Ctrl/⌘ + Enter`). The two boxes become the
   highlighted side-by-side comparison.
4. Optionally switch to **word-level** or enable the *ignore* options; the
   result updates immediately.
5. **copy result** / **download .txt** if you need the report elsewhere.
6. **✎ edit** to go back and change the text; **Clear All** when you are done.

The file can also be placed on an internal web server, intranet page or
shared drive — it is a static file with no server-side requirements.

### Option 2 — the userscript

1. Install a userscript manager if you do not have one: Tampermonkey
   (Chrome, Edge, Safari, Firefox), Violentmonkey (Chrome, Edge, Firefox) or
   Greasemonkey (Firefox).
2. Open `private-diff.user.js` in the browser (drag the file into a tab, or
   open it via the manager's *Utilities → Import*). The manager shows the
   script's metadata; click **Install**.
3. Open the tool in one of three ways, on any normal web page:
   - **Extension menu** → *Open Private Diff* (Tampermonkey / Violentmonkey)
   - **Keyboard**: `Alt + Shift + D` toggles it (works in Greasemonkey too)
   - **URL hash**: add `#private-diff` to any page's address, e.g. bookmark
     `https://intranet.example.internal/#private-diff`
4. **Close ✕** (top right) clears everything and removes the overlay.

Limitation: userscripts cannot run on browser-internal pages
(`chrome://…`, new-tab page, error pages, extension pages). A userscript also
cannot listen on a port, so "open `localhost:3450`" is not possible without
a separate server process — use Option 1's `file://` bookmark instead, which
gives the same experience with nothing running.

## Development

Prerequisites: Node.js 18 or newer (only for tests and building).

```bash
# run the test suite (36 tests: comparison behaviour + privacy checks)
node --test

# rebuild index.html and private-diff.user.js after editing src/
node build.js
```

No `npm install` is required; the project has no dependencies.

### Testing

`tests/engine.test.js` verifies behaviour, not just execution, for: identical
inputs; one added / removed / modified line; multiple additions and
removals; empty original / modified / both; whitespace-only input; blank
lines; leading/trailing whitespace; case-sensitive and case-insensitive
comparison; word-level comparison; Unicode; Windows and Unix line endings;
large input (20,000 lines) and a pathological fully-reordered input;
HTML-like strings; SQL; JSON; unusual punctuation; report format;
determinism; and a randomized check that the edit script is minimal
(compared against a brute-force LCS).

`tests/build.test.js` rebuilds the distributables and asserts that no network,
storage or unsafe-HTML APIs are used, no external URLs are referenced,
`index.html` is self-contained with the restrictive CSP, and the userscript
metadata is correct.

A manual browser smoke test (Playwright/Chromium) was also run during
development covering every button, copy, download, the 20k-line case,
narrow-screen layout, dark mode and the userscript overlay injected into a
page with hostile CSS; network logs showed only the page load itself.

## Internal deployment

Nothing needs to be deployed in the server sense. Recommended distribution:

- Publish `index.html` and `private-diff.user.js` on an existing internal
  web server, intranet page or shared drive that employees already trust, so
  that everyone uses the same reviewed version. Serve `index.html` with the
  usual static-file headers; it needs no special configuration. If you can
  set response headers, sending the same CSP as the `<meta>` tag is a good
  belt-and-braces measure.
- Do **not** publish it on a public host; it is intended for internal use.
- Network administrators and the security team should review and approve
  the distribution channel like any other internal tool, and may wish to
  pin the files' checksums so that employees can verify them.

Verifying privacy yourself: open the page, open browser DevTools → Network,
paste text and compare. No requests appear. Application → Storage shows
nothing written.

## Performance and limits

Measured in Chromium on a laptop-class machine:

| Input | Compare | Compare + render |
|---|---|---|
| 20,000 lines, 200 changed | ~60 ms | ~5 s (rendering 20k table rows) |
| 20,000 lines, all different | ~90 ms | — |
| 20,000 lines fully reordered | ~200 ms (edit-search budget hit, see below) | — |

- Lines that exist on only one side are excluded from the expensive part
  of the algorithm, so "everything changed" inputs stay fast.
- Per region, the search for a minimal diff is capped (`MAX_EDIT_SEARCH`
  in `src/engine.js`). If the cap is hit the region is shown as a plain
  remove/add block and the UI shows a notice. This only occurs for very
  large inputs with tens of thousands of scattered changes; the result is
  still correct, just not minimal.
- Rendering time is dominated by the number of result rows. Inputs up to a
  few thousand lines feel instant; tens of thousands take a few seconds.
- Word-level mode pairs removed and added lines in order within each
  changed block; it does not try to guess which line "moved" where.
- Blank lines skipped by *ignore blank lines* are omitted from the result
  (line numbers of the remaining lines are preserved).
- A single trailing newline does not count as an extra empty line.

## Known limitations

- Userscripts cannot run on browser-internal or error pages, and cannot
  provide a `localhost` URL (see *Using it*).
- Greasemonkey 4 has no menu commands; use the hotkey or `#private-diff`.
- Very old browsers without Unicode property escapes in regular expressions
  fall back to ASCII word tokenization in word-level mode.
- There is no "moved lines" detection, no character-level (sub-word) diff,
  and no three-way merge — by design.

## Security considerations for the reviewer

- Confirm the distributed `index.html` / `private-diff.user.js` were built
  from the reviewed `src/` (`node build.js` is deterministic; compare
  checksums).
- The CSP in `index.html` is a `<meta>` policy; if hosted, mirror it as an
  HTTP header.
- The userscript matches all sites because it must be reachable from any
  page; it does nothing until invoked and never reads page content. If
  policy requires, narrow `@match` in `src/userscript.header.js` to the
  intranet domain and rebuild.
- No authentication is included (not requested). Access control, if needed,
  belongs to the hosting location.
