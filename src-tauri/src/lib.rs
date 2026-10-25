pub mod commands;
pub mod config;
pub mod database;
pub mod file_safety;
pub mod model;
pub mod session_lock;

use std::io;

use config::{DATABASE_FILE, PRODUCT_NAME};
use database::Database;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |application, _, _| {
            if let Some(window) = application.get_webview_window("main") {
                for operation in [
                    window.show(),
                    window.unminimize(),
                    window.set_focus(),
                ] {
                    if let Err(error) = operation {
                        log::warn!(
                            "Could not focus the existing Trolley window: {error}"
                        );
                    }
                }
            }
        },
    ));
    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|application| {
            let data_directory = application
                .path()
                .app_data_dir()
                .map_err(|error| io::Error::other(error.to_string()))?;
            let ownership =
                match session_lock::SessionLock::acquire(&data_directory) {
                    Ok(ownership) => ownership,
                    Err(error) => {
                        #[cfg(target_os = "macos")]
                        if focus_existing_application(
                            &application.config().identifier,
                        ) {
                            application.handle().exit(0);
                            return Ok(());
                        }
                        return Err(io::Error::other(error).into());
                    }
                };
            application.manage(ownership);
            // Load initializes storage after the window opens, so failures
            // can show recovery controls instead of aborting startup.
            let database = Database::new(data_directory.join(DATABASE_FILE));
            application.manage(database);
            let configuration =
                application.config().app.windows.first().ok_or_else(|| {
                    io::Error::other("Missing main window configuration")
                })?;
            let development = if cfg!(debug_assertions) {
                application.config().build.dev_url.clone()
            } else {
                None
            };
            tauri::WebviewWindowBuilder::from_config(
                application,
                configuration,
            )?
            .on_navigation(move |url| {
                local_navigation(url, development.as_ref())
            })
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_workspace,
            commands::save_workspace,
            commands::export_project,
            commands::import_project,
            commands::backup_database,
            commands::restore_database,
            commands::recover_database,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| {
            panic!("{PRODUCT_NAME} encountered an unrecoverable error: {error}")
        })
        .run(|application, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event
                && let Some(window) = application.get_webview_window("main")
            {
                // Route menu Quit through the same guarded window closure.
                // After destruction no main window remains, so exit proceeds.
                api.prevent_exit();
                if let Err(error) = window.close() {
                    application
                        .dialog()
                        .message(format!(
                            "Could not request safe closure: {error}. \
                            Keep the app open until your changes are saved."
                        ))
                        .title("Unable to quit Trolley")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            }
        });
}

/// Activate another bundled Trolley process without sending launch metadata.
#[cfg(target_os = "macos")]
fn focus_existing_application(identifier: &str) -> bool {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    use objc2_foundation::NSString;

    let bundle = NSString::from_str(identifier);
    let applications =
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&bundle);
    for application in applications.iter() {
        if application.processIdentifier() as u32 == std::process::id()
            || application.isTerminated()
        {
            continue;
        }
        application.unhide();
        if !application.activateWithOptions(
            NSApplicationActivationOptions::ActivateAllWindows,
        ) {
            log::warn!("macOS did not activate the existing Trolley window");
        }
        return true;
    }
    false
}

/// Keep the privileged application window on bundled or development content.
fn local_navigation(
    url: &tauri::Url,
    development: Option<&tauri::Url>,
) -> bool {
    if development.is_some_and(|local| url.origin() == local.origin()) {
        return true;
    }
    url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (matches!(url.scheme(), "http" | "https")
                && url.host_str() == Some("tauri.localhost")))
}

#[cfg(test)]
mod navigation_tests {
    use super::*;

    #[test]
    fn prevents_external_navigation_even_to_similarly_named_hosts() {
        for address in [
            "https://example.com",
            "https://tauri.localhost.evil.test",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://tauri.localhost:444",
        ] {
            assert!(!local_navigation(&address.parse().unwrap(), None));
        }
        assert!(local_navigation(
            &"tauri://localhost/index.html".parse().unwrap(),
            None
        ));
        assert!(local_navigation(
            &"http://tauri.localhost/".parse().unwrap(),
            None
        ));
        let dev = "http://127.0.0.1:1420".parse().unwrap();
        assert!(local_navigation(
            &"http://127.0.0.1:1420/".parse().unwrap(),
            Some(&dev)
        ));
        assert!(!local_navigation(
            &"http://127.0.0.1:1421/".parse().unwrap(),
            Some(&dev)
        ));
    }
}
