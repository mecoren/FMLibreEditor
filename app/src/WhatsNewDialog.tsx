// What's new (`whatsNew.ts`): what a version brings, as a dialog. It opens by itself the first time the app starts after
// an update, and from the foot of the window or the palette when asked. All changes opens the release's notes in full.

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { whatsNewText as text } from "./labels";
import { openRelease, releasePageOf } from "./update";
import { useModal } from "./useModal";
import type { VersionNotes } from "./whatsNew";

interface WhatsNewDialogProps {
  /** The versions to tell about, newest first. */
  notes: VersionNotes[];
  /** Whether the dialog opened by itself, after an update. */
  updated: boolean;
  onClose: () => void;
}

export function WhatsNewDialog({ notes, updated, onClose }: WhatsNewDialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const latest = notes[0];

  useModal(dialog, true, onClose);

  // The dialog asks for nothing: focus waits on the button that closes it, so Enter does.
  useEffect(() => {
    close.current?.focus();
  }, []);

  return createPortal(
    // A click beside the dialog does nothing, and keeps focus where it is.
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal whats-new"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{text.title(latest.version)}</h2>
          {updated && <p className="mass-scope">{text.updated}</p>}
        </header>

        <div className="modal-body whats-new-body">
          {notes.map((version) => (
            <section key={version.version} className="whats-new-version">
              {notes.length > 1 && <h3>{text.version(version.version)}</h3>}
              <ul>
                {version.things.map((thing) => (
                  <li key={thing.title}>
                    <strong>{thing.title}</strong> {thing.text}
                  </li>
                ))}
              </ul>
              {version.thanks !== null && <p className="whats-new-thanks">{text.thanks(version.thanks)}</p>}
            </section>
          ))}
        </div>

        <footer className="modal-foot">
          <button
            type="button"
            title={text.allChangesTitle}
            onClick={() => openRelease({ version: latest.version, url: releasePageOf(latest.version) })}
          >
            {text.allChanges}
          </button>
          <span className="export-foot-gap" />
          <button ref={close} type="button" className="primary" onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
