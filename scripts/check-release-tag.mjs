import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Require an existing version tag to match the release manifests.
 *
 * Args:
 *     tag: The user-pushed GitHub tag.
 *     version: The package version, already checked across manifests.
 * Returns:
 *     undefined: Succeed or throw before any installer or release upload.
 */
export function checkReleaseTag(tag, version) {
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must match v${version}. ` +
      "Update the version manifests before tagging a release.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) ===
  fileURLToPath(import.meta.url)) {
  const version = JSON.parse(readFileSync(
    new URL("../package.json", import.meta.url), "utf8",
  )).version;
  checkReleaseTag(process.argv[2], version);
  console.info(`Release tag matches version ${version}`);
}
