# Keep your work local and portable

The desktop app stores the workspace in SQLite inside your operating system's
application-data directory. The app needs no server or account.

## Autosave

Edits appear immediately and are saved after a short delay. Watch **Saving**,
**Saved locally**, or **Save failed**. A failed save keeps your current work in
memory and offers Retry. Resolve save errors before closing the application.

Undo retains up to 30 reversible workspace changes. Permanently deleting a
project is not undoable; archive it when you may need it again.

## Export a project

Open a project, then **Project setup > Portable data > Export project**.
The versioned JSON file includes the project's task data. Import remaps
identifiers so the imported records are independent of the originals.

Use JSON exchange to move a project between computers. Trolley does not
synchronize devices or merge their changes automatically.

## Back up the workspace

**Back up database** creates a copy of the complete local database. Keep an
external copy in a location you control. A project export is useful for
transfer; a database backup preserves the whole workspace.

File actions flush pending saves and wait for writes before starting.
Edits are blocked temporarily. If saving fails, the file action stops.

## Restore carefully

**Restore database** replaces the complete local workspace after confirmation
and validation. Trolley preserves the previous database and any journal files in
`trolley.before-restore.zip` beside the live database. This recovery archive
is for troubleshooting and is not directly accepted by Restore. A later
restore replaces it, so keep a separate copy if you need that older state.

Import and restore clear prior undo history and selection. Keep an external
backup before testing restore, especially during the beta.

## Where the database lives

The database is named `trolley.sqlite3`, under the `io.trolley.desktop`
application-data directory:

- Linux: the XDG data directory, usually `~/.local/share/io.trolley.desktop`.
- macOS: `~/Library/Application Support/io.trolley.desktop`.
- Windows: the `io.trolley.desktop` directory under roaming application data.

Do not edit the live database while Trolley is running.

## Browser preview

Development previews use separate browser-local storage. They do not share
or alter the desktop database. Native file exchange and database recovery
require the installed desktop app.

## Closing safely

Normal desktop window closure and Quit commit the focused field and wait
for pending saves. If saving fails, the app remains open with the error so
you can fix the problem and retry. During import, export, backup, or restore,
finish the file action before trying to close again. Forced termination or
power loss cannot flush pending edits.

## Private by staying local

Trolley does not require an account, send your workspace to a cloud service,
or collect analytics. Projects, tasks, notes, and local team records remain
in the database on your computer. You can use the app offline. Export and
backup create files where you choose; sharing those files is your decision.

## Protect sensitive data

Local storage is not encryption. The database, exports, backups, and the
pre-restore copy are unencrypted. Enable your operating system's disk
protection (FileVault, BitLocker, or encrypted Linux storage), and keep backup
copies on a second device in an encrypted destination you control. Use dated
copies and periodically test a restore under a separate OS account.

Unix application storage is restricted to its owner. Windows storage relies
on your profile's inherited access controls. Backups use consistent SQLite
snapshots and atomic replacement, and are verified with the restore checks
before success is reported. Workspace saves allow up to 256 MiB of serialized
data and 250,000 records, including checklist and relationship entries.
Restore inputs allow up to 1 GiB, subject to validation and a 30-second
SQLite operation budget. Nested configuration has additional resource limits.
Oversized or malformed backups are rejected before replacing your workspace.
Project imports and exports allow up to 20 MiB. Select regular files in the app's native file dialogs; symbolic
links and exports into Trolley's storage folder are rejected.

Deleting work does not erase older exports or backups, and cannot promise
forensic secure erasure. Autosave and the single pre-restore copy are not a
replacement for independent backups.

Task-description links remain readable. Copy a link to open it in your
browser; the privileged desktop window stays on local application content.


## If your workspace will not open

Trolley opens recovery controls and pauses editing and autosave. Start with
**Save recovery copy**: it preserves the original database and journal files
in a ZIP, even when SQLite cannot read the database. Keep this archive private;
it may contain all your projects and notes. It is not a verified backup.

If you have a known-good SQLite backup, choose **Restore a backup**, review
the replacement confirmation, and restore. The selected file is validated
before replacement, and the previous files are preserved in the local safety
archive. A failed restore leaves recovery controls available. **Reopen
workspace** retries loading, and **Close Trolley** exits without saving a
partial workspace.

Only one desktop session may write the workspace. A second launch activates
the existing app where platform support is available. A revision conflict
blocks a stale save rather than replacing newer work; Retry retains that
protection. Browser previews offer only best-effort conflict detection.

Encryption and automatic rotating backups are not included. Use manual
verified backups and your operating system's disk protection when needed.
