import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Read registry and local packages from Cargo's generated lockfile.
 *
 * Args:
 *     contents: Generated Cargo.lock text.
 * Returns:
 *     object[]: Public names, versions, and package source identifiers.
 */
export function lockedPackages(contents) {
  return contents.split("[[package]]").slice(1).map((block) => {
    const field = (name) => block.match(
      new RegExp(`^${name} = "([^"\\n]+)"$`, "m"),
    )?.[1];
    const name = field("name");
    const version = field("version");
    if (!name || !version) throw new Error("Malformed Cargo lock package");
    return { name, version, source: field("source") };
  });
}

/** Hash every retained vendor file in deterministic path order.
 *
 * Args:
 *     directory: Vendored crate directory.
 * Returns:
 *     Promise<string>: SHA-256 of relative paths and file contents.
 */
export async function vendorDigest(directory) {
  const files = [];
  async function collect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error("Vendor tree must contain only files and folders");
    }
  }
  await collect(directory);
  const hash = createHash("sha256");
  files.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  for (const file of files) {
    hash.update(path.relative(directory, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Recognize only the verified backport and dated maintenance exceptions.
 *
 * Args:
 *     item: Dependency package and advisory identifier.
 *     policy: Explicit patch and exception policy.
 *     patchVerified: Whether the full vendored patch was verified.
 *     today: ISO date for deterministic expiry checks.
 * Returns:
 *     string | null: Reason for accepting the finding, or null to fail.
 */
export function findingDisposition(item, policy, patchVerified, today) {
  if (item.name === "glib" && item.version === policy.glib.version &&
      patchVerified && policy.glib.advisories.includes(item.id)) {
    return "verified upstream security backport";
  }
  const maintenance = policy.maintenance.find((entry) =>
    item.name === entry.name && item.version === entry.version &&
    item.id === entry.advisory && today <= entry.reviewBy);
  if (maintenance) {
    return `maintenance warning; review by ${maintenance.reviewBy}`;
  }
  return null;
}

/** Query all locked public Rust packages and fail on unexpected advisories.
 *
 * Args:
 *     none: Reads repository configuration and public advisory metadata.
 * Returns:
 *     Promise<void>: Resolves after a successful complete review.
 */
async function run() {
  const policy = JSON.parse(await readFile(
    path.join(root, "scripts/security-policy.json"), "utf8",
  ));
  const packages = lockedPackages(await readFile(
    path.join(root, "src-tauri/Cargo.lock"), "utf8",
  ));
  const manifest = await readFile(path.join(root, "src-tauri/Cargo.toml"), "utf8");
  const glib = packages.find((item) => item.name === "glib");
  const patch = manifest.split("[patch.crates-io]")[1]?.split(/\n\[/)[0];
  const patchVerified = glib?.version === policy.glib.version && !glib.source &&
    /^glib\s*=\s*\{\s*path\s*=\s*"vendor\/glib"\s*\}/m.test(patch ?? "") &&
    await vendorDigest(path.join(root, "src-tauri/vendor/glib")) === policy.glib.sha256;
  if (!patchVerified) throw new Error("GLib backport integrity check failed");
  const reviewed = packages.filter((item) => item.source?.startsWith("registry+"));
  reviewed.push(glib);
  const unexpected = [];
  const today = new Date().toISOString().slice(0, 10);
  if (policy.maintenance.some((entry) => today > entry.reviewBy)) {
    throw new Error("Maintenance exception expired; review and update policy");
  }
  for (let start = 0; start < reviewed.length; start += 100) {
    const group = reviewed.slice(start, start + 100);
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: group.map((item) => ({
        package: { name: item.name, ecosystem: "crates.io" },
        version: item.version,
      })) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OSV query failed: ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result.results) || result.results.length !== group.length) {
      throw new Error("Incomplete OSV response");
    }
    for (const [index, value] of result.results.entries()) {
      for (const advisory of value.vulns ?? []) {
        const item = { ...group[index], id: advisory.id };
        const reason = findingDisposition(item, policy, patchVerified, today);
        const label = `${item.name} ${item.version}: ${item.id}`;
        if (reason) console.log(`${label} (${reason})`);
        else unexpected.push(label);
      }
    }
  }
  if (unexpected.length) throw new Error(unexpected.join("\n"));
  console.log(`Checked ${reviewed.length} Rust packages; no unhandled advisories.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
