/** Verify release path privacy and compiler flag preservation. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { releaseRustFlags } from "./tauri.mjs";

test("the documented npm command uses the path-remapping wrapper", async () => {
  const manifest = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url), "utf8",
  ));
  assert.equal(manifest.scripts.tauri, "node scripts/tauri.mjs");
});

test("preserves encoded flags and remaps custom Cargo paths with spaces", () => {
  const root = join(tmpdir(), "trolley flag fixture");
  const cargo = join(root, "external cargo");
  const flags = releaseRustFlags({
    CARGO_ENCODED_RUSTFLAGS: "--cfg\x1ftest_value=\"with spaces\"",
    RUSTFLAGS: "--cfg ignored",
    CARGO_HOME: cargo,
  }, root, join(root, "checkout")).split("\x1f");
  assert.deepEqual(flags.slice(0, 2), ["--cfg", 'test_value="with spaces"']);
  assert.ok(!flags.includes("ignored"));
  assert.ok(flags.includes(`--remap-path-prefix=${cargo}=/build/cargo`));
  assert.ok(flags.includes(
    `--remap-path-prefix=${join(root, "checkout")}=/build/trolley`,
  ));
  assert.deepEqual(releaseRustFlags({ RUSTFLAGS: "-C opt-level=2" },
    root, root).split("\x1f").slice(0, 2), ["-C", "opt-level=2"]);
  assert.ok(releaseRustFlags({ CARGO_HOME: "cache" }, root, root)
    .split("\x1f").includes(
      `--remap-path-prefix=${join(root, "src-tauri", "cache")}` +
      "=/build/cargo",
    ));
});

test("compiled file locations exclude home, cache, and checkout paths",
  async (context) => {
    const home = await mkdtemp(join(tmpdir(), "trolley private build "));
    context.after(() => rm(home, { recursive: true, force: true }));
    const cargo = join(home, ".cargo");
    const root = join(home, "checkout");
    await mkdir(cargo);
    await mkdir(root);
    const dependency = join(cargo, "dependency.rs");
    const source = join(root, "main.rs");
    await writeFile(dependency, 'pub const SOURCE: &str = file!();\n');
    await writeFile(source,
      `#[path = ${JSON.stringify(dependency)}] mod dependency;\n` +
      'fn main() { println!("{}\\n{}", file!(), dependency::SOURCE); }\n');
    const binary = join(root, process.platform === "win32" ? "probe.exe" :
      "probe");
    execFileSync("rustc", [source, "-o", binary,
      ...releaseRustFlags({}, home, root).split("\x1f")]);
    const output = execFileSync(binary, { encoding: "utf8" });
    assert.match(output, /\/build\/trolley[/\\]main\.rs/);
    assert.match(output, /\/build\/cargo[/\\]dependency\.rs/);
    assert.ok(!output.includes(home));
    const bytes = await readFile(binary);
    assert.ok(!bytes.includes(Buffer.from(home)));
  });
