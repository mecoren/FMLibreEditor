import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./api";
import { appText } from "./labels";

/**
 * Whether the app draws the window's own title bar. It does on Windows, where `tauri.windows.conf.json` turns the
 * frame off, so the masthead reaches the top edge of the window and carries the buttons the frame would have drawn.
 * The other platforms keep the frame, and with it the title bar, so the masthead sits below it as it always has.
 */
export const undecorated = inTauri && navigator.userAgent.includes("Windows");

/** Runs a window command: one that fails has nothing to undo, as the window is gone or not ours to move. */
function ignore(command: Promise<unknown>): void {
  void command.catch(() => {});
}

/** The buttons of the title bar the frame would have drawn, at the right end of the masthead (see `undecorated`). */
export function WindowButtons() {
  // One handle for the life of the window: a new one on every render would put the resize listener up again.
  const [frame] = useState(getCurrentWindow);
  const [maximised, setMaximised] = useState(false);

  // The middle button always offers the opposite of where the window is, which the window reports when it is resized.
  useEffect(() => {
    let live = true;
    const read = () => {
      void frame
        .isMaximized()
        .then((value) => live && setMaximised(value))
        .catch(() => {});
    };
    read();
    const listener = frame.onResized(read);
    return () => {
      live = false;
      void listener.then((stop) => stop()).catch(() => {});
    };
  }, [frame]);

  return (
    <div className="window-buttons">
      <button
        type="button"
        aria-label={appText.titlebar.minimize}
        onClick={() => ignore(frame.minimize())}
      >
        <MinimiseIcon />
      </button>
      <button
        type="button"
        aria-label={maximised ? appText.titlebar.restore : appText.titlebar.maximize}
        onClick={() => ignore(frame.toggleMaximize())}
      >
        {maximised ? <RestoreIcon /> : <MaximiseIcon />}
      </button>
      <button
        type="button"
        className="window-close"
        aria-label={appText.titlebar.close}
        onClick={() => ignore(frame.close())}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/** The frame's glyphs, as Windows draws them: hairlines, a pixel wide. */
function MinimiseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5h10" />
    </svg>
  );
}

function MaximiseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="6.5" width="6" height="6" />
      <path d="M6.5 6.5v-3h6v6h-3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
    </svg>
  );
}
