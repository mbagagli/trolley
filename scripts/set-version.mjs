/**
 * Synchronize the Trolley release version across project manifests.
 *
 * This command validates every version target before it writes any file. It
 * updates the npm, Tauri, and Cargo manifests together with their lockfiles.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), "..");

const VERSION_PATHS = Object.freeze({
  cargoLock: "src-tauri/Cargo.lock",
  cargoManifest: "src-tauri/Cargo.toml",
  npmLock: "package-lock.json",
  npmManifest: "package.json",
  tauriConfig: "src-tauri/tauri.conf.json",
});

const NUMERIC_IDENTIFIER = "(?:0|[1-9]\\d*)";
const PRERELEASE_IDENTIFIER =
  "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const BUILD_IDENTIFIER = "[0-9A-Za-z-]+";
const SEMANTIC_VERSION_PATTERN = new RegExp(
  `^${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}` +
    `\\.${NUMERIC_IDENTIFIER}` +
    `(?:-${PRERELEASE_IDENTIFIER}` +
    `(?:\\.${PRERELEASE_IDENTIFIER})*)?` +
    `(?:\\+${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*)?$`,
);

const HELP_TEXT = `Trolley release version synchronizer

Set one semantic version across the npm, Tauri, and Cargo manifests and their
lockfiles. All targets are parsed and validated before any file is written.

Input:
  A semantic version such as 0.2.0 or 1.0.0-rc.1.

Output:
  Updated package.json, package-lock.json, src-tauri/tauri.conf.json,
  src-tauri/Cargo.toml, and src-tauri/Cargo.lock files.

Processing flow:
  1. Validate the requested semantic version.
  2. Read and validate every version target.
  3. Update all five files together.
  4. Verify that the resulting versions agree.

Usage:
  npm run version:set -- 0.2.0
  npm run version:check
`;

/** Parse one JSON file with a path-specific error. */
function parseJson(contents, relativePath) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot parse ${relativePath}: ${detail}`);
  }
}

/** Render JSON using the repository's stable formatting. */
function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Validate one application version value. */
function requireVersion(value, location) {
  if (typeof value !== "string" || !SEMANTIC_VERSION_PATTERN.test(value)) {
    throw new Error(
      `${location} must contain a valid semantic version; found ` +
        `${JSON.stringify(value)}.`,
    );
  }
  return value;
}

/** Locate one TOML section without parsing unrelated dependency versions. */
function findTomlSection(contents, header, relativePath) {
  const headerPattern = new RegExp(`^\\[${header}\\]\\s*$`, "m");
  const headerMatch = headerPattern.exec(contents);
  if (!headerMatch) {
    throw new Error(`Cannot find [${header}] in ${relativePath}.`);
  }

  const sectionStart = headerMatch.index + headerMatch[0].length;
  const remainder = contents.slice(sectionStart);
  const nextHeader = /^\s*\[(?:\[)?[^\n]+\]\]?\s*$/m.exec(remainder);
  const sectionEnd = nextHeader
    ? sectionStart + nextHeader.index
    : contents.length;

  return {
    end: sectionEnd,
    start: sectionStart,
    text: contents.slice(sectionStart, sectionEnd),
  };
}

/** Read or replace the version in Cargo.toml's package section. */
function transformCargoManifest(contents, relativePath, newVersion) {
  const section = findTomlSection(contents, "package", relativePath);
  const versionPattern = /^(version\s*=\s*")([^"]+)("\s*)$/m;
  const versionMatch = versionPattern.exec(section.text);
  if (!versionMatch) {
    throw new Error(`Cannot find package.version in ${relativePath}.`);
  }

  const currentVersion = requireVersion(
    versionMatch[2],
    `${relativePath} package.version`,
  );
  if (newVersion === undefined) {
    return { contents, version: currentVersion };
  }

  const updatedSection = section.text.replace(
    versionPattern,
    `$1${newVersion}$3`,
  );
  return {
    contents:
      contents.slice(0, section.start) +
      updatedSection +
      contents.slice(section.end),
    version: newVersion,
  };
}

/** Locate Trolley's package block in Cargo.lock. */
function findCargoLockPackage(contents, relativePath) {
  const blockPattern = /^\[\[package\]\]\s*$/gm;
  const matches = [...contents.matchAll(blockPattern)];

  for (const [index, match] of matches.entries()) {
    if (match.index === undefined) {
      continue;
    }
    const start = match.index;
    const end = matches[index + 1]?.index ?? contents.length;
    const text = contents.slice(start, end);
    if (/^name\s*=\s*"trolley"\s*$/m.test(text)) {
      return { end, start, text };
    }
  }

  throw new Error(`Cannot find the trolley package in ${relativePath}.`);
}

/** Read or replace Trolley's version in Cargo.lock. */
function transformCargoLock(contents, relativePath, newVersion) {
  const block = findCargoLockPackage(contents, relativePath);
  const versionPattern = /^(version\s*=\s*")([^"]+)("\s*)$/m;
  const versionMatch = versionPattern.exec(block.text);
  if (!versionMatch) {
    throw new Error(`Cannot find the trolley version in ${relativePath}.`);
  }

  const currentVersion = requireVersion(
    versionMatch[2],
    `${relativePath} trolley version`,
  );
  if (newVersion === undefined) {
    return { contents, version: currentVersion };
  }

  const updatedBlock = block.text.replace(
    versionPattern,
    `$1${newVersion}$3`,
  );
  return {
    contents:
      contents.slice(0, block.start) +
      updatedBlock +
      contents.slice(block.end),
    version: newVersion,
  };
}

/** Read every source file needed by the version operation. */
async function readSources(rootDirectory) {
  const entries = await Promise.all(
    Object.entries(VERSION_PATHS).map(async ([key, relativePath]) => {
      const absolutePath = resolve(rootDirectory, relativePath);
      const contents = await readFile(absolutePath, "utf8");
      return [key, { absolutePath, contents, relativePath }];
    }),
  );
  return Object.fromEntries(entries);
}

/** Parse and optionally update all JSON version targets. */
function transformJsonSources(sources, newVersion) {
  const npmManifest = parseJson(
    sources.npmManifest.contents,
    sources.npmManifest.relativePath,
  );
  const npmLock = parseJson(
    sources.npmLock.contents,
    sources.npmLock.relativePath,
  );
  const tauriConfig = parseJson(
    sources.tauriConfig.contents,
    sources.tauriConfig.relativePath,
  );

  const versions = {
    [sources.npmManifest.relativePath]: requireVersion(
      npmManifest.version,
      `${sources.npmManifest.relativePath} version`,
    ),
    [`${sources.npmLock.relativePath} root`]: requireVersion(
      npmLock.version,
      `${sources.npmLock.relativePath} root version`,
    ),
    [`${sources.npmLock.relativePath} workspace`]: requireVersion(
      npmLock.packages?.[""]?.version,
      `${sources.npmLock.relativePath} workspace version`,
    ),
    [sources.tauriConfig.relativePath]: requireVersion(
      tauriConfig.version,
      `${sources.tauriConfig.relativePath} version`,
    ),
  };

  if (newVersion !== undefined) {
    npmManifest.version = newVersion;
    npmLock.version = newVersion;
    npmLock.packages[""].version = newVersion;
    tauriConfig.version = newVersion;
  }

  return {
    rendered: {
      npmLock: renderJson(npmLock),
      npmManifest: renderJson(npmManifest),
      tauriConfig: renderJson(tauriConfig),
    },
    versions,
  };
}

/** Prepare a complete version state before any write begins. */
async function prepareVersionState(rootDirectory, newVersion) {
  const sources = await readSources(rootDirectory);
  const jsonState = transformJsonSources(sources, newVersion);
  const cargoManifest = transformCargoManifest(
    sources.cargoManifest.contents,
    sources.cargoManifest.relativePath,
    newVersion,
  );
  const cargoLock = transformCargoLock(
    sources.cargoLock.contents,
    sources.cargoLock.relativePath,
    newVersion,
  );

  return {
    sources,
    updated: {
      ...jsonState.rendered,
      cargoLock: cargoLock.contents,
      cargoManifest: cargoManifest.contents,
    },
    versions: {
      ...jsonState.versions,
      [sources.cargoManifest.relativePath]: cargoManifest.version,
      [sources.cargoLock.relativePath]: cargoLock.version,
    },
  };
}

/** Verify that all project version targets agree. */
export async function verifyProjectVersion(rootDirectory = PROJECT_ROOT) {
  const state = await prepareVersionState(rootDirectory);
  const uniqueVersions = new Set(Object.values(state.versions));
  if (uniqueVersions.size !== 1) {
    const detail = Object.entries(state.versions)
      .map(([location, version]) => `  ${location}: ${version}`)
      .join("\n");
    throw new Error(`Project versions do not agree:\n${detail}`);
  }
  return uniqueVersions.values().next().value;
}

/** Set and verify one semantic version across all project targets. */
export async function setProjectVersion(
  newVersion,
  rootDirectory = PROJECT_ROOT,
) {
  requireVersion(newVersion, "Requested version");
  const state = await prepareVersionState(rootDirectory, newVersion);

  await Promise.all(
    Object.entries(state.updated).map(([key, contents]) =>
      writeFile(state.sources[key].absolutePath, contents, "utf8"),
    ),
  );

  const verifiedVersion = await verifyProjectVersion(rootDirectory);
  if (verifiedVersion !== newVersion) {
    throw new Error(
      `Version verification returned ${verifiedVersion}, not ${newVersion}.`,
    );
  }
  return verifiedVersion;
}

/** Run the command-line interface. */
async function main(arguments_) {
  if (arguments_.includes("--help") || arguments_.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  if (arguments_.length === 1 && arguments_[0] === "--check") {
    const version = await verifyProjectVersion();
    console.log(`Trolley version ${version} is synchronized.`);
    return;
  }

  if (arguments_.length !== 1) {
    throw new Error(
      "Provide one semantic version. Run with --help for usage details.",
    );
  }

  const version = await setProjectVersion(arguments_[0]);
  console.log(`Updated all Trolley version targets to ${version}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Version update failed: ${message}`);
    process.exitCode = 1;
  });
}
