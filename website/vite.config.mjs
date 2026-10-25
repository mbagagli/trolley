import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { REPOSITORY_URL, siteBase } from "./site-config.mjs";

const version = JSON.parse(readFileSync(
  new URL("../package.json", import.meta.url), "utf8",
)).version;
const base = siteBase(process.env.SITE_BASE);

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base,
  plugins: [{
    name: "trolley-site-content",
    transformIndexHtml(html) {
      return html.replaceAll("__BASE__", base)
        .replaceAll("__REPOSITORY_URL__", REPOSITORY_URL)
        .replaceAll("__VERSION__", version);
    },
  }],
  build: {
    outDir: fileURLToPath(new URL("../dist-site", import.meta.url)),
    emptyOutDir: true,
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
