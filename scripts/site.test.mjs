import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JSDOM } from "jsdom";

import { documentLink, renderDocument } from "./build-site.mjs";
import { DOC_PAGES, siteBase } from "../website/site-config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("deployment prefixes support root and project Pages safely", () => {
  assert.equal(siteBase(), "/");
  assert.equal(siteBase("/trolley"), "/trolley/");
  assert.equal(siteBase("trolley/"), "/trolley/");
  for (const input of ["https://example.org", "../", "/a?b", '/a"b']) {
    assert.throws(() => siteBase(input), /SITE_BASE/);
  }
});

test("Markdown links map to deployed routes and cannot leave the repo", () => {
  assert.equal(documentLink("planning-views.md", DOC_PAGES[0].source,
    "/trolley/"), "/trolley/docs/planning-views/");
  assert.equal(documentLink("../../ARCHITECTURE.md#persistence",
    "website/docs/development.md", "/"),
  "/docs/architecture/#persistence");
  assert.throws(() => documentLink("../../secret", "README.md", "/"),
    /leaves the repository/);
});

test("documentation sanitizes HTML and unsafe Markdown URLs", () => {
  const html = renderDocument(
    '# Safe\n<script>alert(1)</script>\n[bad](javascript:alert)\n' +
    '[guide](planning-views.md)\n| A | B |\n| - | - |\n| 1 | 2 |',
    DOC_PAGES[0].source, "/trolley/",
  );
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelector("script"), null);
  assert.equal(dom.window.document.querySelector('a[href^="javascript:"]'),
    null);
  assert.ok(dom.window.document.querySelector("table"));
  assert.ok(dom.window.document.querySelector(
    'a[href="/trolley/docs/planning-views/"]',
  ));
});

/** Collect built HTML files for link and asset validation.
 *
 * Args:
 *     directory: The generated site directory to inspect.
 * Returns:
 *     Promise<string[]>: HTML paths under the generated output only.
 */
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(filename));
    else if (entry.name.endsWith(".html")) files.push(filename);
  }
  return files;
}

test("built pages have working local routes, assets, and no placeholders",
  async () => {
    const output = path.join(root, "dist-site");
    const base = siteBase(process.env.SITE_BASE);
    const files = await htmlFiles(output);
    assert.equal(files.length, DOC_PAGES.length + 3);
    for (const filename of files) {
      const html = await readFile(filename, "utf8");
      assert.doesNotMatch(html, /__(?:BASE|VERSION|REPOSITORY_URL)__/);
      const document = new JSDOM(html).window.document;
      assert.equal(document.querySelectorAll("h1").length, 1);
      assert.equal(document.documentElement.lang, "en");
      for (const element of document.querySelectorAll(
        "a[href], img[src], script[src], link[href]",
      )) {
        const url = element.getAttribute("href") ?? element.getAttribute("src");
        if (!url || /^(?:https?:|mailto:|#)/.test(url)) continue;
        assert.ok(url.startsWith(base), `${filename}: wrong base in ${url}`);
        const pathname = url.split(/[?#]/)[0].slice(base.length);
        let target = path.join(output, pathname);
        if ((await stat(target)).isDirectory()) {
          target = path.join(target, "index.html");
        }
        assert.ok((await stat(target)).isFile(), `Missing ${url}`);
      }
    }
  });


test("preview tabs support click, keyboard navigation, and panel labels",
  async () => {
    const html = await readFile(path.join(root, "website/index.html"), "utf8");
    const dom = new JSDOM(html, {
      url: "https://example.org/trolley/", runScripts: "outside-only",
    });
    dom.window.eval(await readFile(path.join(root, "website/main.js"), "utf8"));
    const document = dom.window.document;
    const matrix = document.querySelector("#tab-matrix");
    matrix.click();
    const modifiedHome = new dom.window.KeyboardEvent("keydown", {
      key: "Home", ctrlKey: true, bubbles: true, cancelable: true,
    });
    matrix.dispatchEvent(modifiedHome);
    assert.equal(modifiedHome.defaultPrevented, false);
    assert.equal(matrix.getAttribute("aria-selected"), "true");
    assert.match(document.querySelector("#view-image").src, /matrix\.jpg$/);
    assert.equal(document.querySelector("#view-panel").getAttribute(
      "aria-labelledby"), "tab-matrix");
    matrix.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "End", bubbles: true, cancelable: true,
    }));
    assert.equal(document.activeElement.id, "tab-list");
    assert.match(document.querySelector("#view-image").alt, /List/);
    assert.equal(document.querySelectorAll(
      '[role="tab"][aria-selected="true"]',
    ).length, 1);
    document.activeElement.dispatchEvent(new dom.window.KeyboardEvent(
      "keydown", { key: "Home", bubbles: true },
    ));
    assert.equal(document.activeElement.id, "tab-board");
  });
