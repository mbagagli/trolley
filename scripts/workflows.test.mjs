import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflows = new URL("../.github/workflows/", import.meta.url);

/** Read a workflow job using this repository's explicit indentation.
 *
 * Args:
 *     text: Workflow YAML source.
 *     name: Job identifier to inspect.
 * Returns:
 *     string: The complete job block, or fail if it is missing.
 */
function jobBlock(text, name) {
  const block = text.match(new RegExp(
    `^  ${name}:\\n[\\s\\S]*?(?=^  [a-z][a-z-]*:\\n|$(?![\\s\\S]))`,
    "m",
  ))?.[0];
  assert.ok(block, `Missing workflow job: ${name}`);
  return block;
}

test("installers require shared security and native checks before packaging",
  async () => {
    const installers = await readFile(new URL("installers.yml", workflows),
      "utf8");
    const checks = await readFile(new URL("checks.yml", workflows), "utf8");
    const called = jobBlock(installers, "checks");
    const build = jobBlock(installers, "build");
    assert.match(checks, /^  workflow_call:\s*$/m);
    assert.match(called, /^    uses: \.\/\.github\/workflows\/checks\.yml$/m);
    assert.match(build, /^    needs: \[validate, checks\]$/m);
    assert.match(jobBlock(installers, "draft-release"),
      /^    needs: build$/m);
    assert.doesNotMatch(checks, /continue-on-error:|if:.*always\(\)/);
    assert.doesNotMatch(build, /continue-on-error:|if:.*always\(\)/);
    assert.doesNotMatch(called, /secrets:|if:/);
    const frontend = jobBlock(checks, "frontend");
    assert.doesNotMatch(frontend, /^ {4,8}if:/m);
    for (const command of [
      "npm audit --audit-level=moderate", "npm run test:security",
      "npm run security:rust", "npm run check", "npm run build",
      "npm run version:check", "npm run site:build", "npm run test:site",
      "npm run test:release", "npm run test:drag",
      "node --test scripts/workflows.test.mjs",
    ]) {
      assert.ok(frontend.includes(`      - run: ${command}\n`),
        `Missing required release validation: ${command}`);
    }
    const native = jobBlock(checks, "native");
    assert.doesNotMatch(native, /^    if:/m);
    assert.match(native, /os: \[ubuntu-22\.04, windows-latest, macos-latest\]/);
    for (const command of ["cargo fmt", "cargo clippy", "cargo test"]) {
      assert.ok(native.includes(`      - run: ${command}`),
        `Missing required native validation: ${command}`);
    }
  });

test("validation and packaging check out one immutable revision safely",
  async () => {
    for (const filename of ["checks.yml", "installers.yml"]) {
      const text = await readFile(new URL(filename, workflows), "utf8");
      const checkoutPattern = new RegExp(
        "uses: actions/checkout@[a-f0-9]{40}[^\\n]*\\n" +
        "(\\s+with:\\n(?: {10}[^\\n]+\\n)+)", "g",
      );
      const checkouts = text.matchAll(checkoutPattern);
      let count = 0;
      for (const checkout of checkouts) {
        count += 1;
        assert.match(checkout[1], /persist-credentials: false/);
        assert.match(checkout[1], /ref: \$\{\{ github\.sha \}\}/);
      }
      assert.equal(count, 2, `${filename}: every checkout must pin the SHA`);
    }
    const checks = await readFile(new URL("checks.yml", workflows), "utf8");
    assert.match(checks,
      /group: checks-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
    const installers = await readFile(new URL("installers.yml", workflows),
      "utf8");
    assert.match(installers, /group: installers-\$\{\{ github\.ref \}\}/);
  });

test("security-only edits rebuild both Pages previews and published docs",
  async () => {
    const pages = await readFile(new URL("pages.yml", workflows), "utf8");
    for (const event of ["push", "pull_request"]) {
      const block = jobBlock(pages, event);
      assert.match(block, /^      - SECURITY\.md$/m);
    }
    assert.doesNotMatch(pages, /pull_request_target/);
  });

test("native checks link tests and the production app on every host",
  async () => {
    const checks = await readFile(new URL("checks.yml", workflows), "utf8");
    const native = jobBlock(checks, "native");
    assert.doesNotMatch(native, /continue-on-error:|--no-run/);
    assert.match(native,
      /cargo test --manifest-path src-tauri\/Cargo\.toml --locked\n/);
    const production = native.indexOf(
      "run: npm run tauri -- build --ci --no-bundle -- --locked",
    );
    const install = native.indexOf("run: npm ci");
    assert.ok(production > native.indexOf("run: cargo test"));
    assert.ok(install >= 0 && install < production);
    assert.match(native, /uses: actions\/setup-node@[a-f0-9]{40}/);
    assert.doesNotMatch(native.slice(native.indexOf("run: cargo test")),
      /if:|--debug/);
  });
