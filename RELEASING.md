# Releases and GitHub Pages

Trolley uses GNU GPL version 3 or later (`GPL-3.0-or-later`). The source is intended
to be public, for its author and a small group of beta testers. These workflows prepare packages and a
public static site. They do not establish native acceptance or production
signing. Git staging, commits, tags, and pushes remain maintainer-managed.

## Repository setup

The current site links to `https://github.com/mbagagli/trolley`. If the
repository moves, update `website/site-config.mjs` and the installation guide.

In repository Settings:

1. Enable GitHub Actions.
2. In **Pages > Build and deployment**, choose **GitHub Actions** as Source.
3. Ensure the `github-pages` environment allows deployments from `main`.
4. Keep the repository public for public beta downloads and Pages hosting.

The project site is normally `https://mbagagli.github.io/trolley/` after its
first successful Pages deployment. This document does not claim it is live.
The Pages workflow uses GitHub's actual deployment base path, including
custom-domain root deployments. A custom domain can be configured later.

## Checks workflow

`checks.yml` runs on pull requests, pushes to `main`, manual requests, and
as a reusable workflow called by the installer workflow.
Frontend checks include types, unit tests, version agreement, the production
app build, website/release tests, and browser drag regressions. Native jobs
run formatting, Clippy, and Rust tests on Linux, Windows, and macOS hosts.
Each native job also compiles the production desktop application using
`npm run tauri -- build --ci --no-bundle -- --locked`. This exercises release
linking, embedded frontend assets, and the same build wrapper as packaging.
Installer generation remains in the installer workflow.
The macOS job tests its host architecture; Intel packaging is covered by
the installer matrix, not by executing Intel tests on the ARM runner.

On Windows MSVC, `src-tauri/build.rs` embeds the Common Controls v6 manifest
through the linker for both the app and Cargo test executables. Tauri's
default resource manifest does not reach the library test harness, which
can then fail before running tests with `STATUS_ENTRYPOINT_NOT_FOUND`
(`0xc0000139`). Keep the resource manifest disabled only on this target to
avoid embedding it twice. Do not skip Windows tests to work around a loader
failure. A Windows regression test explicitly imports `TaskDialogIndirect`
without opening a dialog, so the loader must resolve the required v6 API.
See the [upstream Tauri issue](https://github.com/tauri-apps/tauri/issues/13419).

macOS duplicate-instance startup uses `AppHandle::exit` after activating the
existing app; `App` itself has no `exit` method. Platform-specific startup
code must compile on the native matrix even when Linux checks pass.

## Installer workflow

`installers.yml` supports two paths:

- **Run workflow manually:** build all four platform targets and retain
  installers as workflow artifacts. No tag or release is created. For the Run workflow button to appear,
  this workflow must first be pushed to the default branch.
- **Push a `v*` tag:** verify it exactly matches the manifest version, then
  build all targets. After all succeed, assemble a draft prerelease with
  installers and SHA-256 checksums. The tag must already exist; the workflow
  never creates one. Existing published releases cannot be overwritten.

Both paths run the complete Checks workflow before packaging. Every checkout
uses the exact triggering commit, including tag builds; a failed frontend,
browser, dependency-security, or native job prevents installer builds and draft
release creation. Expect this to take longer than packaging alone. Validation
and installer concurrency groups are distinct, so they do not cancel each
other. Local checks do not establish that these jobs passed on GitHub.

Targets:

| Build host | Target | Packages |
| --- | --- | --- |
| Ubuntu 22.04 | Linux x64 | AppImage and Debian package |
| Windows | Windows x64 | NSIS `.exe` installer |
| macOS | Apple Silicon | `.dmg` |
| macOS | Intel | `.dmg` |

Node 22 and stable Rust use the committed npm/Cargo lockfiles. Third-party
Actions are pinned to verified commit SHAs. Review pin updates deliberately.
Workflow artifact retention is 14 days; published Release assets remain
available according to GitHub's release storage policies.

## Prepare a beta

1. Run local checks and review the changes.
2. Set the intended version with `npm run version:set -- <version>`.
3. Verify with `npm run version:check`.
4. Commit and push the intended release state yourself.
5. Create and push the matching `v<version>` tag yourself.
6. Wait for every build to finish. Review the draft release and checksums.
7. Install and exercise the app on each target platform, including immediate
   window close and Quit after edits, save failures, saves,
   imports, exports, backup, restore, keyboard use, and visual behavior.
8. Edit release notes with actual tested platforms and known limitations,
   then publish the prerelease yourself.

A matching version tag still produces a prerelease: beta status is deliberate,
not inferred from the version spelling. A mismatched tag fails before build
and upload. Manual workflow runs are useful before choosing a release version.

## Build path privacy

Use `npm run tauri build` for local release packaging. The same wrapper
runs in the installer workflow. It supplies `--remap-path-prefix` for the
builder's home, Cargo home, and checkout, using anonymous `/build/` paths.
It preserves explicit `CARGO_ENCODED_RUSTFLAGS` or `RUSTFLAGS`; Cargo's
encoded flags take precedence over flags configured in Cargo config files.
Debug builds retain their source paths for debugging.

Direct `cargo build` and `npx tauri build` bypass this wrapper. Rebuild
before packaging rather than bundling an older executable. Rust flags do
not sanitize prebuilt system libraries or arbitrary embedded resources;
scan the final installer contents for personal paths and credentials.

## Offline Windows installation

The shared Tauri configuration sets Windows `webviewInstallMode` to
`offlineInstaller`. Both local packaging and the Windows Actions build
include the WebView2 offline installer, adding roughly 127 MB. The build
host needs internet access to obtain this installer; the end user does not
need internet access for runtime installation or normal app use.

Before publishing, test setup on a clean Windows machine without WebView2
and with networking disabled. Confirm launch, save, close, and reopen.
This configuration does not replace native installer acceptance testing.

## Signing status

Windows beta installers are unsigned. macOS uses the isolated
`.github/tauri.macos-beta.json` override for ad-hoc signing; these builds are
not notarized. No signing secrets are currently needed. macOS and Windows
may warn or block downloaded installers. State this in release notes.

For wider distribution, add Developer ID signing and notarization on macOS,
and publisher signing on Windows. Keep certificates and credentials in
GitHub Secrets, never in the repository. Refer to the
[Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) and
[Windows signing guide](https://v2.tauri.app/distribute/sign/windows/).
The beta override must then be replaced by the intended signing configuration.
Packages include the GPLv3 text, Trolley copyright notice, and Manrope OFL
notice as resources.
Trolley has no automatic updater or updater keys in this setup.

## Website and docs workflow

`pages.yml` builds the product page and selected documentation on relevant
pushes to `main`, including changes to `SECURITY.md`, or a manual run.
It also checks builds on pull requests,
but deployment is limited to `main` push/manual events.

Only `dist-site/` is uploaded. The app bundle, database, development cache,
and arbitrary repository files are not part of the Pages artifact. Docs
come from the explicit `DOC_PAGES` list in `website/site-config.mjs`:
user guides, the architecture document, and this release guide. Markdown
renders through the existing sanitized renderer at build time.

Product preview images show actual app views with synthetic demo records.
The app mark preserves the geometry in `BrandLogo`; the favicon uses the
existing native icon. Manrope's font license is included in the output.
Homepage source version is build metadata, not a claim about the latest
published release. Download links use `/releases` because GitHub's
`/releases/latest` excludes prereleases.

## Local site commands

```text
npm run site:build
npm run test:site
npm run site:preview
```

Open `http://127.0.0.1:4173`. The preview binds only to localhost and serves
the generated site. To test a project prefix on Linux/macOS:

```text
SITE_BASE=/trolley/ npm run site:build
SITE_BASE=/trolley/ npm run test:site
SITE_BASE=/trolley/ npm run site:preview
```

On Windows PowerShell set `$env:SITE_BASE = '/trolley/'` before the same npm
commands. The preview URL then ends in `/trolley/`. Run with the environment
variable unset to build for the domain root. No backend or public dev server
is required for the site.

## Publication boundaries

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Accidental file publication | Low | High | Explicit docs/assets, isolated output, local-link checks |
| Untrusted PR obtaining write access | Low | High | PR jobs read-only; Pages deploy restricted to main; no pull_request_target |
| Action supply-chain changes | Low | High | Actions pinned to verified commits; update deliberately |
| Partial installer release | Medium | Medium | Release job waits for every build; result stays a draft |

This setup contains no telemetry, user-data upload, account system, or
application backend. GitHub serves the public static site over HTTPS.
CI execution, actual Pages deployment, and native installers must still be
verified on GitHub after the maintainer pushes these files.

## License and source for installers

The root LICENSE contains GPLv3, and NOTICE states Trolley's copyright and
version-3-or-later grant. Bundled dependencies retain their own licenses. Beta
release notes identify GPLv3 and link to source at the exact release tag,
including the build scripts and lockfiles. Keep that source publicly
available alongside the installer downloads. Review the exact release
source before publishing a draft.
