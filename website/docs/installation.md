# Install the beta

Trolley currently targets Linux x64, Windows x64, and macOS on Apple Silicon
and Intel. Check the [release page](https://github.com/mbagagli/trolley/releases)
for the packages that have actually been published and their testing notes.
A successful build does not establish native usability on every platform.

## Linux

Choose an AppImage for a standalone launch, or the Debian package for a
Debian/Ubuntu installation. An AppImage may require executable permission and
the FUSE support appropriate for your distribution. Use your system's
standard package installer for the Debian package.

## Windows

Choose the x64 `.exe` installer and follow its setup instructions. The
installer includes the Microsoft WebView2 offline installer, so setup does
not need an internet connection to obtain the runtime. This adds roughly
127 MB to the installer. Once installed, Trolley runs offline; users do not
need Node.js, Rust, or a development server.

Early beta
installers are unsigned, so Windows may display an unrecognized-publisher or
SmartScreen warning. Confirm the file came from the project release page;
public distribution signing is still future work.

## macOS

Choose the `.dmg` matching your processor: Apple Silicon (`aarch64`) or
Intel (`x64`). Open it and copy Trolley into Applications.

Early beta builds use ad-hoc signing, not Apple Developer ID signing or
notarization. macOS may prevent opening a downloaded build. Use the normal
system security controls according to your testing policy, or wait for a
signed and notarized release. The workflow does not bypass system security.

## Before testing

Use a disposable project first. If you already have a workspace, keep an
external database backup before installing a new beta. Report your operating
system, processor, Trolley version, and the steps needed to reproduce a
problem in [GitHub Issues](https://github.com/mbagagli/trolley/issues).

Updates are manual for now. Trolley does not check for updates or download
new versions automatically. The website lists target platforms and links to
published releases; it does not imply every package is already available.
