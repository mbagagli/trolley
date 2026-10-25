//! Hold exclusive ownership of a writable workspace for the app session.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::path::Path;

use crate::file_safety;

/// Keep an OS-backed lock alive until the owning application exits.
pub struct SessionLock {
    _file: File,
}

impl SessionLock {
    /// Acquire storage ownership without waiting on another process.
    pub fn acquire(directory: &Path) -> Result<Self, String> {
        if fs::symlink_metadata(directory)
            .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            return Err(
                "The application-data folder cannot be a symbolic link.".into(),
            );
        }
        fs::create_dir_all(directory).map_err(|error| {
            format!("Could not create local storage: {error}")
        })?;
        file_safety::make_private(directory, true)?;
        let path = directory.join(".trolley-session.lock");
        file_safety::reject_link(&path)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let file = options.open(&path).map_err(|error| {
            format!("Could not open the workspace lock: {error}")
        })?;
        match file.try_lock() {
            Ok(()) => {
                file_safety::make_private(&path, false)?;
                Ok(Self { _file: file })
            }
            Err(TryLockError::WouldBlock) => Err(
                "Trolley already has this workspace open. Use the existing window or close it before trying again.".into()
            ),
            Err(TryLockError::Error(error)) => Err(
                format!("Could not protect the workspace from concurrent writes: {error}")
            ),
        }
    }
}

impl Drop for SessionLock {
    /// Release ownership explicitly, even if a fork briefly inherited the file.
    fn drop(&mut self) {
        if let Err(error) = self._file.unlock() {
            log::warn!("Could not release the workspace lock: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_second_owner_and_releases_after_drop() {
        let directory = tempfile::tempdir().unwrap();
        let first = SessionLock::acquire(directory.path()).unwrap();
        assert!(SessionLock::acquire(directory.path()).is_err());
        drop(first);
        assert!(SessionLock::acquire(directory.path()).is_ok());
    }

    #[test]
    fn cross_process_lock_probe() {
        let Some(directory) = std::env::var_os("TROLLEY_LOCK_TEST_DIRECTORY")
        else {
            return;
        };
        let acquired = SessionLock::acquire(Path::new(&directory)).is_ok();
        assert_eq!(
            acquired,
            std::env::var_os("TROLLEY_LOCK_EXPECT_ACQUIRED").is_some()
        );
    }

    #[test]
    fn prevents_another_process_until_the_session_ends() {
        let directory = tempfile::tempdir().unwrap();
        let owner = SessionLock::acquire(directory.path()).unwrap();
        let executable = std::env::current_exe().unwrap();
        let probe = |expected: bool| {
            let mut child = std::process::Command::new(&executable);
            child
                .args([
                    "--exact",
                    "session_lock::tests::cross_process_lock_probe",
                ])
                .env("TROLLEY_LOCK_TEST_DIRECTORY", directory.path())
                .env_remove("TROLLEY_LOCK_EXPECT_ACQUIRED");
            if expected {
                child.env("TROLLEY_LOCK_EXPECT_ACQUIRED", "1");
            }
            assert!(child.status().unwrap().success());
        };
        probe(false);
        drop(owner);
        probe(true);
    }

    #[test]
    fn independent_workspaces_can_be_owned_at_the_same_time() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let _first = SessionLock::acquire(first.path()).unwrap();
        let _second = SessionLock::acquire(second.path()).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_an_attacker_controlled_lock_link() {
        use std::os::unix::fs::symlink;
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        symlink(
            outside.path(),
            directory.path().join(".trolley-session.lock"),
        )
        .unwrap();
        assert!(SessionLock::acquire(directory.path()).is_err());
    }
}
