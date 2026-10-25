//! Keep local file operations bounded, private, and atomic.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use tempfile::NamedTempFile;

/// Reject links and special files before operating on an existing path.
pub fn reject_link(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("Choose a regular file, not a symbolic link.".into())
        }
        Ok(metadata) if !metadata.is_file() => {
            Err("The selected path is not a regular file.".into())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not inspect the file: {error}")),
    }
}

/// Open a regular input file without following its final Unix symlink.
pub fn open_input(path: &Path, maximum: u64) -> Result<File, String> {
    reject_link(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(|error| {
        format!("Could not open the selected file: {error}")
    })?;
    let metadata = file.metadata().map_err(|error| {
        format!("Could not inspect the selected file: {error}")
    })?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(format!(
            "Select a regular file no larger than {} MB.",
            maximum / (1024 * 1024)
        ));
    }
    Ok(file)
}

/// Read at most the configured byte limit, even if the file grows.
pub fn read_bounded(path: &Path, maximum: u64) -> Result<Vec<u8>, String> {
    let file = open_input(path, maximum)?;
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            format!("Could not read the selected file: {error}")
        })?;
    if bytes.len() as u64 > maximum {
        return Err("The selected file exceeds the size limit.".into());
    }
    Ok(bytes)
}

/// Resolve a destination's existing parent and reject symbolic links.
pub fn destination(path: &Path) -> Result<PathBuf, String> {
    reject_link(path)?;
    let name = path.file_name().ok_or("Choose a file name.")?;
    let parent = path.parent().ok_or("Choose an existing folder.")?;
    let parent = parent.canonicalize().map_err(|error| {
        format!("Could not open the destination folder: {error}")
    })?;
    if !parent.is_dir() {
        return Err("The destination folder does not exist.".into());
    }
    Ok(parent.join(name))
}

/// Allocate a private, unpredictable staging file beside its destination.
pub fn staging(path: &Path) -> Result<NamedTempFile, String> {
    let target = destination(path)?;
    NamedTempFile::new_in(target.parent().ok_or("Choose a folder.")?)
        .map_err(|error| format!("Could not stage the file: {error}"))
}

/// Flush a staged file before replacing the destination atomically.
pub fn persist(file: NamedTempFile, path: &Path) -> Result<(), String> {
    let target = destination(path)?;
    file.as_file()
        .sync_all()
        .map_err(|error| format!("Could not flush the staged file: {error}"))?;
    file.persist(&target).map_err(|error| {
        format!("Could not finalize the file: {}", error.error)
    })?;
    #[cfg(unix)]
    File::open(target.parent().ok_or("Choose a folder.")?)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| {
            format!("Could not flush the destination folder: {error}")
        })?;
    Ok(())
}

/// Write an export without predictable staging names or partial output.
pub fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = staging(path)?;
    file.write_all(contents)
        .map_err(|error| format!("Could not write the file: {error}"))?;
    persist(file, path)
}

/// Restrict owned application files to the current Unix user.
pub fn make_private(path: &Path, directory: bool) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
        )
        .map_err(|error| format!("Could not protect local storage: {error}"))?;
    }
    #[cfg(not(unix))]
    let _ = (path, directory);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_input_and_preserves_old_output() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("export.json");
        fs::write(&path, b"existing").unwrap();
        assert!(read_bounded(&path, 3).is_err());
        atomic_write(&path, b"replacement").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_output_links_and_ignores_old_predictable_staging_links() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let folder = tempfile::tempdir().unwrap();
        let victim = folder.path().join("victim");
        fs::write(&victim, b"keep").unwrap();
        let output = folder.path().join("export.json");
        symlink(&victim, output.with_extension("trolley-write-in-progress"))
            .unwrap();
        atomic_write(&output, b"safe export").unwrap();
        assert_eq!(fs::read(&victim).unwrap(), b"keep");
        assert_eq!(
            fs::metadata(&output).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let link = folder.path().join("link.json");
        symlink(&victim, &link).unwrap();
        assert!(atomic_write(&link, b"bad").is_err());
        assert!(read_bounded(&link, 100).is_err());
        assert_eq!(fs::read(&victim).unwrap(), b"keep");
    }
}
