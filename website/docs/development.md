# Build and improve Trolley

Trolley uses React and TypeScript inside a Tauri 2 desktop shell, with Rust
and bundled SQLite. The product website is a separate static build in the
same repository. It reuses installed tooling without adding a site framework.

## Prepare your machine

Install Node.js 22.12 or newer, stable Rust, and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
Install JavaScript dependencies with the checked lockfile:

```text
npm ci
```

## Run the desktop app

```text
npm run tauri dev
```

The browser-only preview is useful for interface work:

```text
npm run dev
```

It binds to `127.0.0.1:1420` and uses synthetic demo data in separate local
storage. It cannot test native dialogs or database backup and restore.

## Run checks

```text
npm run check
npm run build
npm run version:check
npm run test:site
npm run test:release
```

For browser drag regressions:

```text
npx playwright install chromium
npm run test:drag
```

For the backend:

```text
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --no-deps --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

## Build the website

```text
npm run site:build
npm run site:preview
```

Open `http://127.0.0.1:4173`. Only the generated static site is served.
Markdown is rendered at build time, so documentation remains readable without
JavaScript. The homepage's preview tabs have keyboard controls and real app
screenshots using synthetic demo data.

See [release and Pages setup](../../RELEASING.md) for workflow triggers,
repository settings, and deployment paths. See
[architecture](../../ARCHITECTURE.md) for application internals.

## License

The project uses [GNU GPL version 3 or later](../../LICENSE)
(`GPL-3.0-or-later`), with its copyright and grant in [NOTICE](../../NOTICE).
Bundled third-party components keep their own licenses; Manrope is distributed under the SIL Open Font
License. The site's build includes its font license notice.

## Change the application version

Use one command to update the npm, Tauri, and Cargo manifests and lockfiles:

```text
npm run version:set -- <version>
npm run version:check
```

Replace `<version>` with your intended semantic version. Do not edit each
manifest separately. The website reads package.json when it builds. Release
tags must match the resulting version with a `v` prefix.

Dependency security checks run in Actions: `npm audit`,
`npm run test:security`, and `npm run security:rust`. See
[Security and data safety](../../SECURITY.md) for patch provenance and limits.
