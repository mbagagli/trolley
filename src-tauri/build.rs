//! Embed native resources in the application and Windows test harnesses.

/// Build Tauri resources and select Common Controls v6 for MSVC targets.
fn main() {
    let mut attributes = tauri_build::Attributes::new();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Resource manifests reach application binaries but not lib tests.
        // Use the linker for both, without a duplicate RT_MANIFEST resource.
        attributes = attributes.windows_attributes(
            tauri_build::WindowsAttributes::new_without_app_manifest(),
        );
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:\
             type='win32' name='Microsoft.Windows.Common-Controls' \
             version='6.0.0.0' processorArchitecture='*' \
             publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
    tauri_build::try_build(attributes)
        .expect("Could not build Tauri resources");
}
