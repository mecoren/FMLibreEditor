//! The app updating itself (see app/src/update.ts): whether this copy can, installing the latest release, and starting
//! again as the new version.
//!
//! macOS runs an app opened where it was downloaded from a read-only copy of it, until the user moves it in the Finder
//! (App Translocation). The update then goes where the app really is, and the new version starts from there: it is not
//! marked as downloaded, so macOS runs it where it is from then on.

use serde::Serialize;
use tauri::AppHandle;
use tauri::ipc::Channel;
use tauri_plugin_updater::UpdaterExt;

/// How far `install_update` has got, told as the updater plugin's own `downloadAndInstall` tells it in the page.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all_fields = "camelCase")]
pub enum DownloadEvent {
    /// The download has begun; its size, when the server says it.
    Started { content_length: Option<u64> },
    /// So many more bytes have come.
    Progress { chunk_length: usize },
    /// It has all come and has been checked; installing follows.
    Finished,
}

/// Whether this copy of the app can update itself: download a new version, check its signature and put it in place.
/// On Windows, a copy the installer put in place, which has its uninstaller beside it; on macOS, the app run from its
/// bundle, wherever the bundle is (see `installed_bundle`). A portable copy and a development build open the release's
/// page instead.
#[tauri::command]
pub fn can_self_update() -> bool {
    if cfg!(windows) {
        std::env::current_exe()
            .is_ok_and(|exe| exe.parent().is_some_and(|folder| folder.join("uninstall.exe").is_file()))
    } else {
        installed_bundle().is_some()
    }
}

/// Downloads the latest release, checks it against the signing key the app was built with, and installs it in place
/// of this copy; `false` when no newer version is out. On Windows the installer runs and the app closes for it; on
/// macOS the new app takes the place of the one on disk (macOS asks for an administrator's password where the user may
/// not change it), and `restart_app` then starts it.
#[tauri::command]
pub async fn install_update(app: AppHandle, on_progress: Channel<DownloadEvent>) -> Result<bool, String> {
    let mut builder = app.updater_builder();
    if let Some(executable) = installed_executable() {
        builder = builder.executable_path(executable);
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !std::mem::replace(&mut started, true) {
                    let _ = on_progress.send(DownloadEvent::Started { content_length });
                }
                let _ = on_progress.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_progress.send(DownloadEvent::Finished);
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Starts the app again: on macOS, once an update has put the new version in place of this one, so that it runs. On
/// Windows the update's installer starts the new version itself (see app/src/update.ts).
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    // Run from a read-only copy, the app starting again would be that copy, of the old version: the one now on disk
    // is started instead.
    if let Some(bundle) = installed_bundle().filter(|bundle| running_bundle().as_ref() != Some(bundle)) {
        app.cleanup_before_exit();
        // As Tauri's own restart does: through LaunchServices, so that the new app is not a child of this one.
        let _ = std::process::Command::new("/usr/bin/open").arg("-n").arg(bundle).spawn();
        std::process::exit(0);
    }
    app.restart();
}

/// The macOS app bundle this copy runs from; none elsewhere, and for a development build.
fn running_bundle() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    crate::app_bundle(&exe).map(std::path::Path::to_path_buf)
}

/// The macOS app bundle this copy is on disk: the one it runs from, or, when macOS runs it from a read-only copy, the
/// bundle that was copied. None elsewhere, for a development build, and when macOS does not say where that bundle is.
#[cfg(target_os = "macos")]
fn installed_bundle() -> Option<std::path::PathBuf> {
    let bundle = running_bundle()?;
    if !translocation::is_copy(&bundle) {
        return Some(bundle);
    }
    translocation::original(&bundle).filter(|original| original.is_dir() && !translocation::is_copy(original))
}

#[cfg(not(target_os = "macos"))]
fn installed_bundle() -> Option<std::path::PathBuf> {
    None
}

/// The executable the updater is to replace, in the bundle on disk (see `installed_bundle`); none where it is the one
/// running, which the updater takes by itself.
fn installed_executable() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let running = running_bundle()?;
    let installed = installed_bundle()?;
    if installed == running {
        return None;
    }
    Some(installed.join(exe.strip_prefix(&running).ok()?))
}

/// macOS's App Translocation: an app opened where it was downloaded runs from a read-only copy, mounted in a folder of
/// its own, until the user moves it in the Finder.
#[cfg(target_os = "macos")]
mod translocation {
    use std::path::{Path, PathBuf};

    use core_foundation::base::TCFType;
    use core_foundation::error::CFErrorRef;
    use core_foundation::url::{CFURL, CFURLRef};

    /// Whether `bundle` is such a copy: those are all mounted in a folder of this name.
    pub fn is_copy(bundle: &Path) -> bool {
        bundle.to_string_lossy().contains("/AppTranslocation/")
    }

    /// The bundle that the copy `bundle` was made of, as the Security framework tells it. It is looked up when it is
    /// needed rather than linked, so that a macOS without it only means no answer.
    pub fn original(bundle: &Path) -> Option<PathBuf> {
        type CreateOriginalPath = unsafe extern "C" fn(CFURLRef, *mut CFErrorRef) -> CFURLRef;
        // SAFETY: a symbol looked up by name in the libraries already loaded (Tauri loads the Security framework).
        let symbol = unsafe { libc::dlsym(libc::RTLD_DEFAULT, c"SecTranslocateCreateOriginalPathForURL".as_ptr()) };
        if symbol.is_null() {
            return None;
        }
        // SAFETY: the function's signature, as Security/SecTranslocate.h declares it (macOS 10.12 and later).
        let create = unsafe { std::mem::transmute::<*mut libc::c_void, CreateOriginalPath>(symbol) };
        let url = CFURL::from_path(bundle, true)?;
        // SAFETY: a valid URL, and no error wanted; the URL it returns is ours to release (the Create rule).
        let original = unsafe { create(url.as_concrete_TypeRef(), std::ptr::null_mut()) };
        if original.is_null() {
            return None;
        }
        // SAFETY: as above, a URL just created for us.
        unsafe { CFURL::wrap_under_create_rule(original) }.to_path()
    }
}
