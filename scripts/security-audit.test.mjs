import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { findingDisposition, lockedPackages, vendorDigest } from "./security-audit.mjs";

const policy = {
  glib: { version: "0.18.5", advisories: ["RUSTSEC-2024-0429"] },
  maintenance: [{ name: "proc-macro-error", version: "1.0.4",
    advisory: "RUSTSEC-2024-0370", reviewBy: "2027-01-07" }],
};

test("reads registry and patched packages without dependency text confusion", () => {
  const packages = lockedPackages(`version = 4
[[package]]
name = "glib"
version = "0.18.5"
[[package]]
name = "example"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["glib"]
`);
  assert.equal(packages.length, 2);
  assert.equal(packages[0].source, undefined);
  assert.ok(packages[1].source.startsWith("registry+"));
  assert.throws(() => lockedPackages('[[package]]\nname = "bad"'));
});

test("fails on new advisories, changed versions, missing patches and expiry", () => {
  const glib = { name: "glib", version: "0.18.5", id: "RUSTSEC-2024-0429" };
  assert.ok(findingDisposition(glib, policy, true, "2026-10-07"));
  assert.equal(findingDisposition(glib, policy, false, "2026-10-07"), null);
  assert.equal(findingDisposition({ ...glib, id: "new" }, policy, true, "2026-10-07"), null);
  assert.equal(findingDisposition({ ...glib, version: "0.18.4" }, policy, true, "2026-10-07"), null);
  const warning = { name: "proc-macro-error", version: "1.0.4", id: "RUSTSEC-2024-0370" };
  assert.ok(findingDisposition(warning, policy, true, "2027-01-07"));
  assert.equal(findingDisposition(warning, policy, true, "2027-01-08"), null);
});

test("each approved maintenance exception requires its exact tuple and date",
  async () => {
    const configured = JSON.parse(await readFile(
      new URL("./security-policy.json", import.meta.url), "utf8",
    ));
    assert.equal(configured.maintenance.length, 4);
    for (const entry of configured.maintenance) {
      assert.equal(entry.reviewBy, "2027-01-07");
      const item = {
        name: entry.name, version: entry.version, id: entry.advisory,
      };
      assert.ok(findingDisposition(item, configured, false, entry.reviewBy));
      for (const change of [
        { name: "unapproved-package" },
        { version: "0.0.0" },
        { id: "unapproved-advisory" },
      ]) {
        assert.equal(findingDisposition(
          { ...item, ...change }, configured, true, entry.reviewBy,
        ), null);
      }
      assert.equal(findingDisposition(
        item, configured, true, "2027-01-08",
      ), null);
    }
    const wrongPackage = {
      name: "zvariant", version: "5.15.0", id: "RUSTSEC-2026-0372",
    };
    assert.equal(findingDisposition(
      wrongPackage, configured, true, "2026-10-23",
    ), null);
    assert.equal(findingDisposition({
      name: "zip", version: "8.6.0", id: "RUSTSEC-2026-0369",
    }, configured, true, "2026-10-23"), null);
  });

test("vendor integrity changes when any retained content changes", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "trolley-security-"));
  try {
    await writeFile(path.join(folder, "source.rs"), "original");
    const original = await vendorDigest(folder);
    await writeFile(path.join(folder, "source.rs"), "changed");
    assert.notEqual(await vendorDigest(folder), original);
    await writeFile(path.join(folder, "LICENSE"), "license");
    assert.notEqual(await vendorDigest(folder), original);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
