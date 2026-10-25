# Security and data safety

Trolley stores work locally and has no account, telemetry, application HTTP
client, shell execution, or automatic cloud upload. This is a description of
application behavior, not a guarantee about every operating-system or WebView
connection. Browser development previews use separate localStorage.

## Dependency security update, 2026-10-24

- Vite is locked to 8.2.4 and Vitest, including its mocker, to 5.0.5.
  These updates address the development-tool advisories reported by npm.
- jsdom's Undici dependency is locked to 8.12.3, addressing
  GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, and
  GHSA-xjj6-f33q-929c in the test tooling.
- ZIP is locked to 9.0.5, addressing RUSTSEC-2026-0367,
  RUSTSEC-2026-0368, and RUSTSEC-2026-0369. Trolley writes recovery
  archives and does not extract ZIP inputs. Compression features remain
  disabled; the existing recovery format and validation are unchanged.
- Tokio is locked to 1.53.3, addressing the AsyncFd I/O safety advisory
  RUSTSEC-2026-0386 published on 2026-10-23.
- The stable Tauri single-instance plugin still depends on zbus 5.
  Its standalone zbus_names 4.3.4, zvariant 5.15.0, and
  zvariant_derive 5.15.0 crates are unmaintained following their merger
  into zbus 6. RUSTSEC-2026-0371, RUSTSEC-2026-0370, and
  RUSTSEC-2026-0372 are accepted maintenance warnings until 2027-01-07.
  They do not describe demonstrated exploits. Each exception matches
  one exact package, version, and advisory ID. A new advisory, changed
  version with a finding, or any expired exception fails the check.
  Remove these exceptions when a compatible stable plugin migrates
  to zbus 6. The earlier proc-macro-error exception retains its expiry.

## Security review remediation, 2026-10-07

- The locked source-map-js version is 1.2.2. The build-tool denial-of-service
  advisory GHSA-68fv-2mgg-jv7q is fixed; npm audit is checked in CI.
- Linux's GTK stack still requires GLib 0.18. Trolley vendors upstream GLib
  0.18.5 with the mutable out-pointer correction from
  [upstream PR 1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343).
  This backports the fix for
  [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  without an incompatible GTK upgrade. The original MIT license is preserved
  and bundled. An optimized iterator regression test covers iteration in
  both directions and nth(). The version remains honest: version-only
  scanners can still flag 0.18.5. Our check verifies the complete vendor
  hash, local Cargo patch, and known advisory IDs before recognizing the fix.
- Tauri 2.12.1 / tauri-utils 2.10.1 removes all five unmaintained unic crates.
  Linux GTK macros still use proc-macro-error 1.0.4. Its maintenance warning
  RUSTSEC-2024-0370 is explicitly accepted until review on 2027-01-07.
  It is not a demonstrated exploit. No broad advisory suppression is used;
  a new advisory or expired exception fails the Rust security check.
- Native file actions require a main-window native-dialog selection. Grants
  last for the application session; they are not single-use permissions.
  No general JavaScript filesystem permission is granted.
- JSON imports and exports are bounded to 20 MiB. Saves and backup validation
  share a 256 MiB serialized-workspace limit and a 250,000-record limit,
  including checklist and relationship rows. Restore files are bounded to
  1 GiB, with a 30-second SQLite validation budget. Configuration JSON fields
  are capped at 20 MiB each and one million structural tokens across the
  workspace. Large task descriptions remain supported within the workspace
  budget. Exact schema definitions, migration version, SQLite integrity,
  foreign keys, nested settings/preferences/filters, and task relationships
  are checked. Unexpected triggers, views, and orphan relationships are
  rejected. Accepted data is rebuilt into a clean database. Oversized data
  is rejected with recovery guidance rather than reported as a usable backup.
- Native and frontend boundaries complete omitted legacy configuration fields
  from shared defaults while rejecting supplied fields with invalid types or
  values. A load or rendering failure opens recovery controls and suspends
  autosave; closing recovery does not write a partial workspace.
- A lifetime operating-system storage lock prevents a second writable desktop
  session. Linux and Windows use Tauri native instance activation; macOS uses
  AppKit without a temporary socket or transfer of launch arguments/paths.
  Transactional revision checks reject stale saves. Frontend queued
  saves and Undo/Redo use the last successfully persisted revision. Browser
  preview revision checks are best effort, not a cross-tab atomic lock. Older
  Trolley builds do not participate in these protections: close them before
  running this version, and do not edit the live database with other tools.
- Parent hierarchy validation is linear and limited to 256 levels. Frontend
  traversal is iterative. Timeline rendering is bounded to 730 calendar days
  with navigation to other dates, preventing extreme date spans from building
  an unbounded grid.
- Exports and backups use unpredictable, exclusively created staging files,
  flushed before atomic replacement. Selected symlinks and special files
  are rejected. Unix input opens also reject last-component symlink races.
  Parent-folder replacement races and hostile processes under the same user
  are outside this protection; choose directories you control.
- Storage uses owner-only Unix directory/file permissions (0700/0600),
  SQLite FULL synchronous writes, secure_delete, and consistent SQLite
  backups. Windows uses the current profile's inherited access controls;
  the app does not install a custom Windows ACL. Shared export folders can
  expose exported files according to their operating-system permissions.
- Backup validates the staged SQLite copy with the restore checks before
  replacing the selected target. Restore builds a validated clean replacement
  before saving `trolley.before-restore.zip` and replacing the live database.
  The uncompressed ZIP preserves original database bytes and any WAL, shared
  memory, or rollback journal files, including physically unreadable databases.
  Raw recovery has a combined 1 GiB size limit and a 30-second copy budget.
  A ZIP recovery archive is not a validated backup and is not automatically
  extracted or accepted by Restore. Failed validation or archive creation
  leaves the live database and previous archive/target intact.
- Installer jobs, including tag-triggered builds, wait for the complete reusable
  Checks workflow on the exact source commit. Dependency audit, frontend and
  browser checks, and native checks on all three operating systems must pass
  before installer packaging. Security-policy changes also trigger Pages.
- Markdown links cannot navigate the privileged app window to remote pages.
  Copy a link to open it in your browser. Sanitization and the restrictive
  production CSP remain enabled; remote Markdown images are blocked.

## Recommended protection for your data

The database, JSON exports, backups, and recovery copies are **unencrypted**.
For the beta, enable FileVault on macOS, BitLocker/device encryption on
Windows, or encrypted storage on Linux. Use a separate OS account and lock
it when away. Disk encryption protects a locked or powered-off device; it
cannot protect data from malicious software running under your logged-in
account.

Keep dated backups on a second device or in an encrypted backup destination.
Make one before major upgrades and occasionally test restore using a separate
OS account. Retain multiple generations rather than relying only on the
single pre-restore copy. Autosave, Undo/Redo, and that copy do not protect
against loss of the computer or every corruption scenario.

App-level encryption and scheduled rotating backups are deliberately deferred.
Neither is implemented in this beta. Manual verified backups and recovery
archives are available now; retain independent dated copies when needed.

Deleting a project does not remove exported files or older backups.
SQLite secure_delete reduces remnants in reused pages; WAL files, snapshots,
SSD behavior, and external copies prevent a secure-erasure guarantee.

## Run the checks

```text
npm audit --audit-level=moderate
npm run test:security
npm run security:rust
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

The Rust check sends only dependency names and versions to the public OSV
API. It does not send source files, workspace contents, or local paths.
Network errors fail the check. Clippy uses --no-deps to lint Trolley rather
than the retained third-party vendor tree; compiler warnings in upstream
GLib remain visible. Review or remove the patch when GTK supports fixed GLib.

macOS Developer ID signing/notarization still requires maintainer credentials.
These changes do not notarize an installer or certify a downloaded binary.
The rebuilt Linux 0.3.2 Debian and AppImage contents were scanned on
2026-10-24 for builder identity and credential patterns. No original builder
home or checkout paths, hostname, machine ID, or personal credentials were
detected. Rust source paths use anonymous build prefixes. Credential-pattern
matches in bundled system libraries matched the installed libraries; those
libraries can retain upstream build paths. This scan does not cover Windows
or macOS installers. Runtime network capture and independent penetration
testing have not been performed.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature if enabled.
Otherwise contact the maintainer before disclosing an exploit publicly.
Do not attach real task databases or credentials to public issues.
