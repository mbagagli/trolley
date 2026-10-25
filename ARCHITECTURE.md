# Architecture

## Overview

Trolley is a local desktop application with a React interface inside a Tauri 2
shell. The design keeps domain data independent from any one visualization so
future synchronization can be added behind the repository boundary.

```text
React views
    |
WorkspaceStore and domain rules
    |
WorkspaceRepository
    |
Tauri commands
    |
Database service and SQLite
```

React never opens SQLite directly. The browser development mode implements the
same repository contract with local storage and seeded data.

## Source layout

- `src/components`: project dashboard and the four task visualizations.
- `src/domain`: shared types, validation, filtering, ordering, and derivation.
- `src/state`: the canonical workspace store and optimistic application state.
- `src/services`: the Tauri command adapter and browser-preview fallback.
- `src/config`: replaceable product and default project configuration.
- `src-tauri/src/commands.rs`: validated native command boundary.
- `src-tauri/src/database.rs`: migrations, transactions, and persistence.
- `src-tauri/migrations`: ordered SQLite schema migrations.

## Canonical state and synchronized views

`WorkspaceSnapshot` owns projects, columns, labels, local team members, tasks,
saved filters, and preferences. Board, Timeline, Matrix, and List receive
derived slices of the same snapshot. None of the views has a private task data
model.

Every interface mutation calls `WorkspaceStore`. The store clones the current
snapshot, applies one explicit update, publishes it synchronously, records an
undo snapshot when appropriate, and schedules persistence. This makes all
mounted views observe the same state during the same React update.

The drawer's "Sub-tasks" are persisted checklist records with an ID, one
editable title/text field, a completion flag, and a sort position. There
is no independent description, schedule, or assignee on these entries. The
store normalizes their manual order and derives task progress and completion
whenever a sub-task is added, changed, removed, or reordered. It also aligns
the parent with the configured completion column. Reopening a set from that
column returns the parent to the nearest preceding non-completion column.
Moving a completed parent out of that column reopens its final sub-task so the
workflow state, progress, and completion flag remain consistent.

Timeline hierarchy instead uses `Task.parentId` between full task records.
Hierarchy does not aggregate child progress, dates, or effort into parents.

Only the active task view normally mounts. View switching briefly retains
an inert outgoing layer for its exit transition. Filters are shared across
views and reset on project selection; List sorting and Timeline zoom are
component-local state. Matrix assignment updates classification flags,
not workflow status or a separate quadrant order.

Eisenhower quadrants are derived only from `isUrgent` and `isImportant`.
Priority is a separate stable rank from 1 through 5. Gantt dependencies and
hierarchy reference canonical task UUIDs.

## Autosave and error recovery

Workspace changes are optimistic and debounced for 350 milliseconds. Database
writes enter a serialized queue so an older, slower write cannot overwrite a
newer snapshot. Each queued save receives the last committed revision when
it executes; the native immediate transaction compares and increments it.
A stale revision fails without overwriting data, including on Retry or Undo.
A lifetime OS file lock limits the desktop data folder to one writable session. The interface displays saving, saved, and failed states. A
failed current write keeps the pending snapshot in memory and exposes Retry.

Undo retains the 30 most recent reversible snapshots. Project deletion is not
added to this stack and requires an explicit confirmation in the interface.
Archived projects and tasks remain restorable.

Load and rendering failures enter recovery mode, suspend edits and autosave,
and offer raw ZIP preservation, explicit backup replacement, reopen, and safe
closure. Recovery waits for already queued writes but never flushes an empty
or partial snapshot. The database is initialized by the load command after
the window opens so storage failures can reach these controls.

`src/config/workspace-defaults.json` is the shared source of frontend and
native defaults. Both boundaries fill legacy omissions and reject supplied
malformed nested configuration before it reaches project views or storage.

## Persistence

SQLite uses normalized tables for projects, workflow columns, labels, team
members, tasks, checklist items, task-label links, dependencies, saved filters,
and preferences. Entity IDs are UUIDs. User-controlled sequence fields use
explicit floating-point sort positions.

Foreign keys, cascades, indexes, WAL mode, and a busy timeout are enabled for
every connection. A complete workspace save is one transaction. Validation
rejects malformed UUIDs, duplicates, missing or cross-project references,
invalid dates, invalid ranges, dependency cycles, and hierarchy cycles before
the transaction starts.

Migration 1 runs inside a transaction and records its version only after the
schema succeeds. A database from a newer unsupported schema is rejected with a
readable error instead of being modified.

## Portable data

Project exports are versioned JSON. Import validates the envelope, enforces a
20 MB input limit, remaps project, column, label, member, task, checklist, and
saved-filter IDs, then saves the merged workspace transactionally.

Database backup uses the SQLite backup API to capture a consistent snapshot
into an exclusive staging file. That file must pass the same schema, integrity,
foreign-key, configuration, and capacity checks as Restore before replacing
the selected destination. Restore validates its staged input, rebuilds accepted
data into a clean database, and preserves the original bytes and sidecars in
`trolley.before-restore.zip` before replacement. This uncompressed raw archive
can preserve a physically unreadable database; it is not a SQLite backup or an
automatically extracted import. A later restore replaces this single archive.

Native persistence allows 256 MiB of serialized workspace data and 250,000
records, counting relationships and checklist entries. Restore accepts files
up to 1 GiB and bounds SQLite validation to 30 seconds. Configuration fields
have separate 20 MiB and aggregate one-million-token limits. JSON exports, as
well as imports, must fit the 20 MiB exchange limit.

`WorkspaceStore.runDataOperation` serializes the file-action lifecycle.
It cancels the debounce timer, flushes the latest snapshot through the save
queue, and starts the repository action only after writes succeed. Save
failure prevents the native action. The `dataOperation` flag blocks edits
and concurrent file actions while the interface exposes busy status.

Import and restore normalize the returned snapshot, clear undo history,
selection, and shared filters, choose a valid active project or dashboard,
and retain the revision returned by native persistence. Repository-mocked tests cover pending
and in-flight saves, failures, edit blocking, and snapshot replacement.
Real native dialogs and SQLite replacement still require desktop QA.

The browser fallback uses origin-scoped JSON in local storage under
`io.trolley.desktop.workspace.v1`. It seeds the demo when no data exists
and uses the shared frontend snapshot normalizer on load. Its revision
comparison is best effort across browser tabs. It does not provide native
SQLite validation, a storage lock, or database/file operations.

## Security and privacy

The shipped application is a local-only desktop client. It opens no HTTP
listener, uses no remote API, and includes no analytics. Native second-launch
activation uses operating-system facilities and never provides remote access. Vite development and preview
servers bind to `127.0.0.1`. Tauri's capability file grants only the core
window defaults and native dialog access. The content security policy permits
only local assets, data images, and the inline styles required for dynamic
layout values.

Markdown is rendered without raw HTML and passes through `rehype-sanitize`.
Import paths come from the native file picker and input size is bounded.
The JSON boundary checks file existence, size, parseability, and export
format/version; it does not enforce a filename extension. Native save
validation checks the merged workspace. Restore checks SQLite integrity,
schema version, and required tables before staging and loading the backup.

## Performance decisions

Task tickets are memoized and use browser rendering containment. Filtering and
sorting operate on memoized project slices. Drag state remains within the
active view. Timeline range, hierarchy, visible-day coordinates, and task maps
are memoized. Hierarchy traversal is iterative, with a 256-level validation
limit. Timeline windows contain at most 730 calendar days, with Earlier/Later,
date focus, and access to off-window schedules. Heavy Timeline, Matrix, List,
settings, and Markdown editor code
is loaded only when the user opens those surfaces, keeping the default Board
bundle smaller.

Drag previews share a viewport-level portal so transformed views cannot shift
their fixed positioning. Kanban hover order stays local to the drag session;
the release target determines the canonical destination. Card containment is
disabled only while a priority menu is open so its options remain interactive.

The store upgrades legacy column limits below the shared default of 20 on
initialization. A persisted preference records the one-time upgrade, preserving
unlimited lists, higher limits, and subsequent user-defined lower limits.

The automated suite exercises filtering and sorting with 1,000 tasks. Manual
QA should still include real drag and scroll interaction with a representative
large workspace on each supported platform.

## Focus and motion

`Modal` uses native `dialog.showModal()` for search and onboarding, with
Escape cancellation and restoration of a connected opening control.
Filters, Project setup, and task details use `usePanelFocus` to focus their
controls on entry and restore the trigger on exit while preserving access
to the background workspace. Escape blurs editable fields before dismissal.

`src/config/motion.ts` owns named durations for feedback, sorting, drop,
layout, settle, and completion. The entry point publishes these as CSS
variables; animation helpers share the same constants. Reduced-motion
view retention is shortened to 80 ms and outgoing content stays inert.

## Dependency choices

- Tauri 2 provides a small native shell and platform data directories.
- `rusqlite` with bundled SQLite avoids a separate database installation.
- Tauri single-instance activation uses session D-Bus on Linux and native
  Windows facilities. macOS uses AppKit activation after storage-lock failure,
  avoiding a temporary socket or transfer of launch arguments/local paths.
  AppKit/Foundation are target-specific direct dependencies already present in
  the Tauri dependency tree.
- `zip` writes standard uncompressed recovery archives atomically, preserving
  SQLite sidecars together without a custom archive format or extraction path.
- React 19 and TypeScript provide strict, component-based interface code.
- `dnd-kit` supplies pointer and keyboard drag-and-drop primitives.
- Lucide supplies one consistent icon vocabulary.
- `react-markdown`, `remark-gfm`, and `rehype-sanitize` provide safe Markdown.
- Manrope Variable is bundled through Fontsource under the SIL Open Font
  License 1.1 so the interface works offline.

The frontend uses no routing, form, date, or state-management framework. Those
concerns are small enough to keep explicit, which reduces the runtime and
maintenance surface.

## Public website and build automation

The `website/` surface is independent of the desktop app's Vite build.
`site:build` creates `dist-site/` with a static homepage and sanitized,
server-rendered Markdown docs. It reuses Vite, React, and the existing
Markdown dependencies without adding a framework. An explicit document
allowlist controls the public pages; only generated site files are uploaded.

GitHub Actions separates read-only checks and installer builds from the
write-enabled Pages and draft-release jobs. Installer builds use each OS's
native toolchain and committed lockfiles. Version tags must match the
manifests, and publication remains a maintainer action. See `RELEASING.md`.

## Desktop closure and edit history

The native exit handler routes Quit through the main window close request.
`src/services/closeProtection.ts` prevents immediate closure, blurs the focused
field, and asks the store to drain persistence before destroying the window.
The shared data-operation guard blocks edits until saving and destruction
finish. A write or close failure leaves the window open with feedback.
Only the main window receives the additional native destroy capability.
Forced process termination is outside this lifecycle.

Undo and redo availability is derived from the store's snapshot stacks.
Project navigation saves its last-project preference without changing those
stacks. History restoration retains that navigation preference. New edits
clear redo; deletion and workspace replacement clear both stacks.
