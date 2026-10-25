/** Run Tauri builds with anonymous Rust source paths. */

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tauri from "@tauri-apps/cli";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");

/** Append path remapping while preserving explicit environment flags.
 *
 * Cargo's encoded form preserves arguments containing spaces. More
 * specific source mappings follow the home mapping because rustc uses
 * the last matching prefix. Existing symlinks also get a resolved mapping.
 *
 * Args:
 *     environment: Build environment, including optional Rust flags.
 *     userHome: The builder's home directory.
 *     root: The repository checkout directory.
 * Returns:
 *     string: Rust arguments separated by Cargo's unit separator.
 */
export function releaseRustFlags(environment, userHome, root) {
  const flags = environment.CARGO_ENCODED_RUSTFLAGS !== undefined
    ? environment.CARGO_ENCODED_RUSTFLAGS.split("\x1f").filter(Boolean)
    : (environment.RUSTFLAGS ?? "").split(/\s+/).filter(Boolean);
  const cargoHome = environment.CARGO_HOME
    ? resolve(root, "src-tauri", environment.CARGO_HOME)
    : join(userHome, ".cargo");
  for (const [source, target] of [
    [userHome, "/build/user"],
    [cargoHome, "/build/cargo"],
    [root, "/build/trolley"],
  ]) {
    const absolute = resolve(source);
    const paths = new Set([absolute]);
    try {
      paths.add(realpathSync(absolute));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const path of paths) {
      flags.push(`--remap-path-prefix=${path}=${target}`);
    }
  }
  return flags.join("\x1f");
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  const args = process.argv.slice(2);
  if (args[0] === "build" && !args.includes("--debug")) {
    process.env.CARGO_ENCODED_RUSTFLAGS = releaseRustFlags(
      process.env, homedir(), ROOT,
    );
  }
  tauri.run(args, "npm run tauri").catch((error) => {
    tauri.logError(error.message);
    process.exitCode = 1;
  });
}
