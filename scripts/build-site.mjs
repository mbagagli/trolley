import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { build } from "vite";

import { DOC_PAGES, REPOSITORY_URL, siteBase } from
  "../website/site-config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "dist-site");

/** Escape trusted metadata for insertion into an HTML template.
 *
 * Args:
 *     value: Text to place in an attribute or text node.
 * Returns:
 *     string: HTML-escaped text.
 */
export function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("'", "&#39;");
}

/** Map Markdown document links to their published routes.
 *
 * Args:
 *     href: The source Markdown link.
 *     source: The current document's repository path.
 *     base: The validated Pages prefix.
 * Returns:
 *     string: A static route or a source link for non-page files.
 */
export function documentLink(href, source, base) {
  if (/^(?:https?:|mailto:|#)/.test(href)) return href;
  const [filename, fragment] = href.split("#");
  const target = path.posix.normalize(path.posix.join(
    path.posix.dirname(source), filename,
  ));
  if (target.startsWith("../") || path.posix.isAbsolute(target)) {
    throw new Error(`Document link leaves the repository: ${href}`);
  }
  const page = DOC_PAGES.find((candidate) => candidate.source === target);
  const url = page ? `${base}docs/${page.slug}/` :
    `${REPOSITORY_URL}/blob/main/${target}`;
  return fragment ? `${url}#${fragment}` : url;
}

/** Render a sanitized Markdown document without client-side JavaScript.
 *
 * Args:
 *     text: The Markdown source.
 *     source: Its repository path for relative links.
 *     base: The validated deployment prefix.
 * Returns:
 *     string: Static article markup.
 */
export function renderDocument(text, source, base) {
  return renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSanitize],
    components: {
      a({ href, children }) {
        return React.createElement("a", {
          href: href ? documentLink(href, source, base) : undefined,
        }, children);
      },
    },
  }, text));
}

/** Wrap static documentation with the shared branded navigation.
 *
 * Args:
 *     title: The document title.
 *     article: Sanitized article markup.
 *     base: The deployment prefix.
 *     stylesheet: The Vite-built stylesheet URL.
 *     activeSlug: The selected documentation route, if any.
 * Returns:
 *     string: A complete accessible HTML page.
 */
function documentPage(title, article, base, stylesheet, activeSlug = "") {
  let previousGroup = "";
  const navigation = DOC_PAGES.map((page) => {
    const heading = previousGroup === page.group ? "" :
      `<h2>${escapeHtml(page.group)}</h2>`;
    previousGroup = page.group;
    const current = page.slug === activeSlug ? ' aria-current="page"' : "";
    return `${heading}<a href="${base}docs/${page.slug}/"${current}>` +
      `${escapeHtml(page.title)}</a>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(title)} - Trolley documentation">
<meta name="theme-color" content="#F7F4EE">
<title>${escapeHtml(title)} - Trolley</title>
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${stylesheet}">
</head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header wrap">
<a class="brand" href="${base}" aria-label="Trolley home">
<img src="${base}mark.svg" alt="" width="48" height="30">
<span>Trolley</span></a>
<nav aria-label="Main navigation">
<a href="${base}#views">The app</a>
<a href="${base}docs/" aria-current="page">Docs</a>
<a class="source-link" href="${REPOSITORY_URL}">Source</a>
<a class="nav-download" href="${base}#download">Get the beta</a>
</nav></header>
<div class="docs-layout wrap">
<nav class="docs-nav" aria-label="Documentation">${navigation}</nav>
<main class="docs-article" id="main">${article}
<p class="doc-meta">Trolley is in beta. <a href="${REPOSITORY_URL}/issues">Report an issue</a>
 or <a href="${base}">return to the product page</a>.</p></main>
</div>
<footer class="site-footer wrap">
<a class="brand" href="${base}"><img src="${base}mark.svg" alt="" width="48" height="30"><span>Trolley</span></a>
<p>A little order. A clearer day.</p>
<nav aria-label="Footer"><a href="${base}docs/">Documentation</a>
<a href="${REPOSITORY_URL}">GitHub</a>
<a href="${REPOSITORY_URL}/blob/main/LICENSE">GPLv3 or later</a></nav>
</footer></body></html>`;
}

/** Build the product site and the explicit public documentation set.
 *
 * Args:
 *     none: Configuration comes from SITE_BASE and committed source files.
 * Returns:
 *     Promise<void>: Complete the isolated static output directory.
 */
async function buildSite() {
  const base = siteBase(process.env.SITE_BASE);
  await build({ configFile: path.join(root, "website/vite.config.mjs") });
  const index = await readFile(path.join(output, "index.html"), "utf8");
  const stylesheet = index.match(
    /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/,
  )?.[1];
  if (!stylesheet) throw new Error("Site build did not produce a stylesheet");
  for (const page of DOC_PAGES) {
    const text = await readFile(path.join(root, page.source), "utf8");
    const directory = path.join(output, "docs", page.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), documentPage(
      page.title, renderDocument(text, page.source, base), base,
      stylesheet, page.slug,
    ));
  }
  const intro = `<h1>A good place to start.</h1>
<p>Get comfortable with the four views, make your first project,
 and keep your local data safe.</p>
<ul>${DOC_PAGES.map((page) => `<li><a href="${base}docs/${page.slug}/">` +
    `${escapeHtml(page.title)}</a></li>`).join("")}</ul>`;
  await writeFile(path.join(output, "docs/index.html"), documentPage(
    "Documentation", intro, base, stylesheet,
  ));
  await writeFile(path.join(output, "404.html"), documentPage(
    "Page not found", `<h1>This page has moved.</h1><p>Try the
<a href="${base}docs/">documentation</a> or return to the
<a href="${base}">Trolley homepage</a>.</p>`, base, stylesheet,
  ));
  await copyFile(path.join(root,
    "licenses/Manrope-OFL.txt"),
  path.join(output, "Manrope-OFL.txt"));
  await writeFile(path.join(output, ".nojekyll"), "");
  console.info(`Built product site and ${DOC_PAGES.length} Markdown pages`);
}

if (process.argv[1] && path.resolve(process.argv[1]) ===
  fileURLToPath(import.meta.url)) {
  await buildSite();
}
