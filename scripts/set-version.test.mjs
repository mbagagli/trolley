/** Test the Trolley release version synchronizer. */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  setProjectVersion,
  verifyProjectVersion,
} from "./set-version.mjs";

const INITIAL_VERSION = "0.1.0";

/** Write a minimal project fixture under a temporary directory. */
async function createFixture(context) {
  const rootDirectory = await mkdtemp(join(tmpdir(), "trolley-version-"));
  context.after(async () => {
    await rm(rootDirectory, { force: true, recursive: true });
  });
  await mkdir(join(rootDirectory, "src-tauri"), { recursive: true });

  const packageManifest = {
    name: "trolley",
    version: INITIAL_VERSION,
  };
  const packageLock = {
    name: "trolley",
    version: INITIAL_VERSION,
    lockfileVersion: 3,
    packages: {
      "": { name: "trolley", version: INITIAL_VERSION },
      "node_modules/example": { version: INITIAL_VERSION },
    },
  };
  const tauriConfig = {
    productName: "Trolley",
    version: INITIAL_VERSION,
  };
  const cargoManifest = [
    "[package]",
    'name = "trolley"',
    `version = "${INITIAL_VERSION}"`,
    "",
    "[dependencies]",
    "",
  ].join("\n");
  const cargoLock = [
    "[[package]]",
    'name = "example"',
    `version = "${INITIAL_VERSION}"`,
    "",
    "[[package]]",
    'name = "trolley"',
    `version = "${INITIAL_VERSION}"`,
    "",
  ].join("\n");

  await Promise.all([
    writeFile(
      join(rootDirectory, "package.json"),
      `${JSON.stringify(packageManifest, null, 2)}\n`,
    ),
    writeFile(
      join(rootDirectory, "package-lock.json"),
      `${JSON.stringify(packageLock, null, 2)}\n`,
    ),
    writeFile(
      join(rootDirectory, "src-tauri", "tauri.conf.json"),
      `${JSON.stringify(tauriConfig, null, 2)}\n`,
    ),
    writeFile(
      join(rootDirectory, "src-tauri", "Cargo.toml"),
      cargoManifest,
    ),
    writeFile(
      join(rootDirectory, "src-tauri", "Cargo.lock"),
      cargoLock,
    ),
  ]);
  return rootDirectory;
}

test("sets all project version targets", async (context) => {
  const rootDirectory = await createFixture(context);

  await setProjectVersion("1.2.3-rc.1+build.5", rootDirectory);

  assert.equal(
    await verifyProjectVersion(rootDirectory),
    "1.2.3-rc.1+build.5",
  );
  const packageLock = JSON.parse(
    await readFile(join(rootDirectory, "package-lock.json"), "utf8"),
  );
  assert.equal(
    packageLock.packages["node_modules/example"].version,
    INITIAL_VERSION,
  );
  const cargoLock = await readFile(
    join(rootDirectory, "src-tauri", "Cargo.lock"),
    "utf8",
  );
  assert.match(
    cargoLock,
    /name = "example"\nversion = "0\.1\.0"/,
  );
});

test("rejects invalid versions before writing files", async (context) => {
  const rootDirectory = await createFixture(context);
  const packagePath = join(rootDirectory, "package.json");
  const originalPackage = await readFile(packagePath, "utf8");

  await assert.rejects(
    setProjectVersion("1.02.3", rootDirectory),
    /valid semantic version/,
  );
  assert.equal(await readFile(packagePath, "utf8"), originalPackage);
});

test("reports mismatched existing versions", async (context) => {
  const rootDirectory = await createFixture(context);
  const configPath = join(
    rootDirectory,
    "src-tauri",
    "tauri.conf.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.version = "0.2.0";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await assert.rejects(
    verifyProjectVersion(rootDirectory),
    /Project versions do not agree/,
  );
});
