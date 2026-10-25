# Trolley

Trolley is an offline-first desktop project manager. One canonical task set is
shown as a Kanban board, interactive Gantt timeline, Eisenhower Matrix, or
compact list. Changes made in one view appear in the others immediately.

The current version is recorded in [package.json](package.json).

The temporary product name is defined in `src/config/product.ts` and
`src-tauri/src/config.rs`. Native package metadata is in
`src-tauri/tauri.conf.json`.

## Features

- Multiple active or archived projects with duplication and recovery.
  Both active and archived projects offer Delete with a confirmation.
  Permanent deletion removes project contents and clears undo and redo history.
- Pointer and keyboard reordering for Kanban columns, cards, and List rows.
- Whole-card pointer dragging in Board and Matrix, with clickable card controls.
- Twenty-card default workflow limits, configurable in Project setup.
- Ordered checklist Sub-tasks with editable text, card progress, and automatic
  movement into or out of the workflow's completion stage.
- Gantt scheduling, resizing, milestones, hierarchy, and dependencies.
- Drag-and-drop urgency and importance classification in a 2 by 2 matrix.
- Search, shared filters, saved presets, bulk actions, undo, and redo.
- Project-specific terminology, workflow, labels, icons, priorities, dates,
  working days, local team members, card metadata, and default view.
- Dashboard project renaming and safe workflow or label removal.
- Timeline navigation that can show or omit configured non-working days.
  A bounded two-year window keeps widely separated dates responsive; use
  Earlier, Later, date focus, or Show scheduled dates to reach other work.
- Local SQLite persistence, JSON project exchange, and database backups.
- Supplied Trolley branding, bundled Manrope, coordinated light and dark
  themes, two density levels, keyboard operation, and reduced-motion support.
- No account, server, telemetry, or runtime network dependency.

## Current behavior and boundaries

- Board is the Kanban view; Timeline is the Gantt view; Matrix is the
  Eisenhower urgency/importance decision matrix. List supports sorting,
  selection, and bulk completion, status, priority, and archive actions.
- Estimated and actual hours are entered manually in task details. There
  is no running timer, timesheet, recurring task, or notification service.
- The drawer calls checklist entries "Sub-tasks". Each entry has one
  editable text field and a completion flag. It has no independent dates,
  assignee, priority, or description field. Parent-linked Timeline tasks
  are separate full task records; their progress is not rolled up.
- Task notes are one editable text field, not an authored comment thread.
  Local team members are assignee records, not collaborative accounts.
- Matrix hides completed tasks by default. Its "Show completed" control
  enables both the project preference and the shared completion filter.
  Hiding completed tasks from Matrix leaves the shared filter unchanged.
  Matrix movement changes classification, not workflow status or a
  separately persisted order inside a quadrant.
- Shared project filters survive view changes but reset when selecting a
  project. Saved presets persist; List sort and Timeline zoom are local
  view state. "Clear filters" also clears project search text. The header
  and panel count the same selected conditions, including search and hiding
  completed tasks. Both project and global task search include notes.
- New task opens task details from any project view and uses the first
  active workflow stage. Advanced relationships, effort, and notes expand
  separately. Project setup includes section navigation.
- New workspaces offer "Explore the demo" or "Start empty". Theme follows
  live OS changes in System mode, or can be explicitly light or dark.
  Density is global. Narrow windows retain the active view name, saved
  filter access, and save status.

## Requirements

- Node.js 22.12 or newer.
- A current stable Rust toolchain.
- The platform packages required by Tauri 2. See the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

Install JavaScript dependencies from the checked lockfile:

```text
npm ci
```

## Development

Run the native desktop application:

```text
npm run tauri dev
```

Keep the Tauri API and dialog plugin on the same major/minor releases in npm
and Cargo. Run `npm run tauri -- info` after dependency updates to check for
mismatches. GLib compiler warnings are separate: the vendored crate retains
a verified security backport, so do not apply `cargo fix` to it blindly.

Run only the Vite interface in a browser:

```text
npm run dev
```

The browser preview uses the `io.trolley.desktop.workspace.v1` local-storage
key for each browser origin. Its initial workspace is seeded demo data.
JSON file exchange and database backup/restore require the desktop build;
the browser preview cannot open native file dialogs.
It is useful for interface work, but native persistence should be verified in
the Tauri application.

## Production builds

Set the release version in every npm, Tauri, and Cargo manifest and lockfile:

```text
npm run version:set -- <version>
```

Replace `<version>` with the intended semantic version. Verify that every
version target already agrees without changing any file:

```text
npm run version:check
```

Build and type-check the web assets:

```text
npm run build
```

Build the platform installer and application bundle:

```text
npm run tauri build
```

This command remaps Rust source paths in release builds so the executable
does not embed the builder's home, Cargo cache, or checkout paths.

Tauri packages for the current operating system. Produce Windows, macOS, and
Linux artifacts on their respective build hosts or in a suitable CI matrix.

## Tests and checks

Run the TypeScript component and domain tests:

```text
npm run test:run
```

Run the combined TypeScript check and test suite:

```text
npm run check
```

Install the browser used by the drag regression checks, then run them:

```text
npx playwright install chromium
npm run test:drag
```

These checks use isolated demo workspaces, not the desktop database. They
verify whole-card pickup, cursor tracking, cross-column drops, reordering,
cancellation, card controls, and the saved-limit upgrade in light, dark,
compact, narrow, and reduced-motion configurations. The preview binds only to
`127.0.0.1:1421` and closes when the checks finish.

Run the Rust checks from the repository root:

```text
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Data location

The desktop app stores `trolley.sqlite3` in Tauri's application-data directory
for the identifier `io.trolley.desktop`:

- Linux: `$XDG_DATA_HOME/io.trolley.desktop`, or the matching directory under
  `$HOME/.local/share` when `XDG_DATA_HOME` is unset.
- macOS: `$HOME/Library/Application Support/io.trolley.desktop`.
- Windows: the `io.trolley.desktop` folder under roaming application data.

Do not edit the live database while Trolley is running. The browser preview
uses a separate local-storage key and does not share the desktop database.

On the first launch after the twenty-card limit upgrade, saved limits below 20
are raised to 20. Unlimited lists and higher limits are preserved. This runs
once; later custom limits remain unchanged. Limits are advisory warnings, not
hard caps that prevent adding or moving tasks.

## Backup, restore, import, and export

Open a project and choose Project setup from the settings button.

- Export project writes a readable, versioned JSON file for one project.
- Import project remaps every entity identifier before adding the project.
- Back up database creates a consistent SQLite copy and verifies that it can
  pass the same validation used by Restore before reporting success.
- Restore database validates the selected database, builds a clean replacement,
  and preserves the previous database and journal files before replacement.

All four file actions first flush pending autosaves and wait for queued
writes. If saving fails, the file action stops and shows the error. Edits
are temporarily blocked during the action. Import and restore clear undo and redo
history and selection so an older snapshot cannot be reinstated afterward.
Normal autosave still waits 350 ms before entering the write queue.

Restore keeps `trolley.before-restore.zip` beside the live database.
This raw recovery archive contains the original database and any SQLite
journal files. It is for troubleshooting, rather than direct use with Restore.
A later restore replaces it; it is not a backup history.

A workspace that cannot load opens recovery controls instead of an editable
project. Save recovery copy preserves a ZIP archive without autosaving;
Restore a backup validates a known-good SQLite backup before replacement.
Closing the recovery screen does not save an empty or partial workspace.

Desktop storage permits one writable instance at a time. A lifetime operating
system lock protects the data folder; a revision check rejects stale saves
without overwriting newer data. Resolve a conflict before continuing to save.
Browser previews provide only a best-effort revision check across tabs.

Restoring replaces the complete local workspace. Use the confirmation dialog
and retain an external backup before testing a restore workflow.

## Keyboard shortcuts

- `Ctrl+K` or `Cmd+K`: search all projects and tasks.
- `/`: focus the current project search.
- `Ctrl+Z` or `Cmd+Z`: undo the most recent reversible workspace change.
  Editable fields retain their normal text undo and redo.
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` or `Ctrl+Y` / `Cmd+Y`: redo a workspace
  change outside editable fields. A new edit clears redo history.
- `1`, `2`, `3`, `4`: switch among Board, Timeline, Matrix, and List.
- `N`: focus the first Board quick-add field.
- `Escape`: close searches, filters, settings, and task details. Field edits
  commit on blur before a panel closes. Search and onboarding use native
  modal focus containment; the other panels remain modeless and restore
  their opening control when it is still present.

## Project documentation

- [Installation](website/docs/installation.md)
- [Getting started](website/docs/getting-started.md)
- [Planning views](website/docs/planning-views.md)
- [Data and backups](website/docs/data-and-backups.md)
- [Development](website/docs/development.md)
- [Architecture](ARCHITECTURE.md)
- [Security and data safety](SECURITY.md)
- [Releasing](RELEASING.md)

## Product website and release automation

Trolley uses GNU GPL version 3 or later (`GPL-3.0-or-later`). The license is in
[LICENSE](LICENSE), and the copyright and grant are in [NOTICE](NOTICE).
Bundled third-party components retain their own licenses, including Manrope's SIL Open Font License.

The product site uses the existing Trolley mark, favicon, palette, and font.
Its four preview images show real app views with synthetic demo data. Public
user guides are generated from selected Markdown at build time.

```text
npm run site:build
npm run test:site
npm run site:preview
```

The website preview is `http://127.0.0.1:4173` and serves only `dist-site/`.
See [Releases and GitHub Pages](RELEASING.md) for repository setup, workflow
triggers, deployment prefixes, and signing limitations.

- Checks: frontend/build/browser regressions and native checks on three OSes.
- Installers: manual test artifacts, or draft beta assets for a matching
  user-pushed version tag. Linux x64, Windows x64, and both Mac architectures.
- Pages: product site and selected docs deployed from `main` through Actions.

These workflows need to run on GitHub after the maintainer pushes the files.
Adding them locally does not create a published site or validated installers.

The project header keeps New task, Undo, Redo, and Settings visible. Theme and
spacing controls live in Settings > Appearance and apply to every project.

Normal desktop window closure and Quit wait for focused-field edits and
queued saves. Save failure keeps the app open for retry; closing during a
file action asks you to wait and try again. Forced termination cannot save
pending edits. Undo/Redo buttons reflect available history and are disabled
during file actions. Project navigation preserves redo and stays outside
edit history.

See [Security and data safety](SECURITY.md) for the dependency fixes,
remaining maintenance warning, protection limits, and backup recommendations.
