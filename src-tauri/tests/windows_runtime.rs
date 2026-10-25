//! Verify the Windows activation context used by native dialog dependencies.

#![cfg(target_os = "windows")]

/// Require the Common Controls v6 dialog entry point without opening a UI.
#[test]
fn native_dialog_entry_point_is_available() {
    #[link(name = "comctl32")]
    unsafe extern "system" {
        fn TaskDialogIndirect(
            configuration: *const std::ffi::c_void,
            button: *mut i32,
            radio_button: *mut i32,
            verification: *mut i32,
        ) -> i32;
    }

    // Retain the import even if other dialog code is optimized away.
    // Without the v6 manifest, Windows fails before this test can run.
    let entry_point = std::hint::black_box(TaskDialogIndirect as *const ());
    assert!(
        !entry_point.is_null(),
        "The Windows loader must resolve the native dialog entry point"
    );
}
