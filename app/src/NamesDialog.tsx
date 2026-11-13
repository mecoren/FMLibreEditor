// Renaming a player: the button beside Release in the header of his profile, and the dialog it opens. The dialog reads
// the player's four names from the game (first, last, common and full), lets them be changed, and writes each name that
// changed on its own: the game keeps one name in each of its tables, so each is logged as its own change, and one undo
// from the Changes view puts that name back. The game takes a new first, last or common name into its tables of names
// only while they have room, which the dialog asks for before it offers to write.

import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { playerNames, renamePlayer } from "./editing";
import { describeError } from "./format";
import { renameText as text } from "./labels";
import type { NameKind, PersonNames } from "./types";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** The player the dialog renames. */
interface RenamingPlayer {
  uid: number;
  name: string;
}

/** The names in the order the dialog shows them and writes them. */
const KINDS: readonly NameKind[] = ["first", "last", "common", "full"];

/** The hint under a name that can be left empty. */
const HINTS: Partial<Record<NameKind, string>> = { common: text.commonHint, full: text.fullHint };

/** A name's value as typed, by kind. */
type Values = Record<NameKind, string>;

/** The names the game holds as the fields show them: no name is an empty field. */
function valuesOf(names: PersonNames): Values {
  return {
    first: names.first ?? "",
    last: names.last ?? "",
    common: names.common ?? "",
    full: names.full ?? "",
  };
}

/** The Rename button of a player's profile, and the dialog it opens. */
export function RenameButton({ player }: { player: RenamingPlayer }) {
  const { onEdited } = useContext(EditorContext);
  // The player the dialog was opened for: the profile behind it cannot change while it is up.
  const [opened, setOpened] = useState<RenamingPlayer | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it. Doing it earlier, with the dialog still
  // up, would only make the dialog take focus back.
  useEffect(() => {
    if (wasOpen.current && opened === null) {
      button.current?.focus();
    }
    wasOpen.current = opened !== null;
  }, [opened]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="release-toggle rename-toggle"
        aria-haspopup="dialog"
        title={text.buttonTitle}
        onClick={() => setOpened(player)}
      >
        {text.button}
      </button>
      {opened && <NamesDialog player={opened} onRenamed={onEdited} onClose={() => setOpened(null)} />}
    </>
  );
}

interface NamesDialogProps {
  player: RenamingPlayer;
  /** Called once a name is changed: the game has changed, so the lists and the profile read it again. */
  onRenamed: () => void;
  onClose: () => void;
}

function NamesDialog({ player, onRenamed, onClose }: NamesDialogProps) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const running = useRef(false);
  // Set when a rename failed: once the inputs are enabled again, the first one takes focus.
  const pendingFocus = useRef(false);

  // What the game holds, until it answers: null. A refused read leaves the names null and the reason in `loadFailure`.
  const [names, setNames] = useState<PersonNames | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({ first: "", last: "", common: "", full: "" });
  const [renaming, setRenaming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useModal(dialog, !renaming, onClose);

  // Focus starts on Cancel; the first name takes it once the names are in.
  useEffect(() => {
    alive.current = true;
    cancelButton.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    playerNames(player.uid).then(
      (read) => {
        if (alive.current) {
          setNames(read);
          setValues(valuesOf(read));
        }
      },
      (e) => alive.current && setLoadFailure(describeError(e)),
    );
  }, [player.uid]);

  const unavailable = names !== null && names.room === null;

  // Once the names are in, the first name takes focus (unless the game cannot be renamed in, where it stays on Cancel).
  const read = names !== null;
  useEffect(() => {
    if (read && !unavailable) {
      firstInput.current?.focus();
    }
  }, [read, unavailable]);

  useEffect(() => {
    if (pendingFocus.current && !renaming) {
      pendingFocus.current = false;
      firstInput.current?.focus();
    }
  });

  /** What the name was in the game, "" for none. */
  const original = (kind: NameKind) => (names?.[kind] ?? "");
  /** The name as it would be written: what was typed without the spaces around it. */
  const written = (kind: NameKind) => values[kind].trim();
  const changed = (kind: NameKind) => names !== null && written(kind) !== original(kind);

  /** Why a name cannot be written, or null. Only a name that was changed is judged: the game's own stays as it is. */
  const problem = (kind: NameKind): string | null => {
    if (names === null || !changed(kind)) {
      return null;
    }
    const value = written(kind);
    if (value === "" && (kind === "first" || kind === "last")) {
      return text.required;
    }
    if (new TextEncoder().encode(value).length > names.longest) {
      return text.tooLong(names.longest);
    }
    // A name taken away needs no room; a new first, last or common name takes an entry of the game's tables.
    const index = kind === "first" ? 0 : kind === "last" ? 1 : kind === "common" ? 2 : null;
    if (value !== "" && index !== null && names.room?.[index] === 0) {
      return text.noRoom;
    }
    return null;
  };

  const anyChanged = KINDS.some(changed);
  const anyProblem = KINDS.some((kind) => problem(kind) !== null);
  const canRename = names !== null && !unavailable && !renaming && anyChanged && !anyProblem;

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!canRename || running.current) {
      return;
    }
    running.current = true;
    setRenaming(true);
    setFailure(null);
    const wrote: NameKind[] = [];
    try {
      // One name at a time, in the order they are shown: each is its own change in the log, and the first one the game
      // refuses stops the rest.
      for (const kind of KINDS) {
        if (changed(kind)) {
          const value = written(kind);
          await renamePlayer(player.uid, kind, value === "" ? null : value);
          wrote.push(kind);
        }
      }
      // The game has changed: the lists, the profile and the change log read it again.
      onRenamed();
      onClose();
    } catch (e) {
      if (wrote.length > 0) {
        onRenamed();
      }
      if (alive.current) {
        setFailure(describeError(e));
        pendingFocus.current = true;
        // The names written before the failure are the game's now; the others keep what was typed, to be tried again.
        try {
          const now = await playerNames(player.uid);
          if (alive.current) {
            const game = valuesOf(now);
            setNames(now);
            setValues((typed) => {
              const kept = { ...typed };
              for (const kind of wrote) {
                kept[kind] = game[kind];
              }
              return kept;
            });
          }
        } catch {
          // The names stay as they were typed: the failure above is what there is to say.
        }
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setRenaming(false);
      }
    }
  };

  // What the dialog has to say about the names: the wait, the refusal to read them, or that the game cannot rename.
  const status: { tone: "pending" | "refused"; message: string } | null =
    loadFailure !== null
      ? { tone: "refused", message: loadFailure }
      : names === null
        ? { tone: "pending", message: text.loading }
        : unavailable
          ? { tone: "refused", message: text.unavailable }
          : null;

  const labels: Record<NameKind, string> = {
    first: text.first,
    last: text.last,
    common: text.common,
    full: text.full,
  };

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
        className="modal move-dialog names-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        aria-describedby={id("player")}
        aria-busy={renaming || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{text.title}</h2>
          <p id={id("player")} className="move-player">
            {player.name}
          </p>
        </header>

        <div className="modal-body">
          <p className={`move-plan ${status?.tone ?? "pending"}`} role="status" hidden={status === null}>
            {status?.message}
          </p>

          {names !== null && (
            <form id={id("form")} className="name-form" onSubmit={(event) => void rename(event)}>
              {KINDS.map((kind) => {
                const error = problem(kind);
                const hint = HINTS[kind];
                const describedBy = [hint && id(`${kind}-hint`), error && id(`${kind}-error`)]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={kind} className="name-field">
                    <label htmlFor={id(kind)}>{labels[kind]}</label>
                    <input
                      ref={kind === "first" ? firstInput : undefined}
                      id={id(kind)}
                      name={kind}
                      type="text"
                      className={`name-input${changed(kind) ? " changed" : ""}${error ? " invalid" : ""}`}
                      value={values[kind]}
                      placeholder={hint ? text.none : undefined}
                      readOnly={unavailable || renaming}
                      spellCheck={false}
                      autoComplete="off"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy || undefined}
                      onChange={(event) => setValues((current) => ({ ...current, [kind]: event.target.value }))}
                    />
                    {hint && (
                      <p id={id(`${kind}-hint`)} className="name-hint">
                        {hint}
                      </p>
                    )}
                    {error && (
                      <p id={id(`${kind}-error`)} className="name-error">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </form>
          )}

          <section className="move-section" aria-labelledby={id("does")}>
            <h3 id={id("does")}>{text.doesHeading}</h3>
            <ul className="move-facts">
              {text.does.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>

        {failure !== null && (
          <div className="banner move-error" role="alert">
            {failure}
          </div>
        )}

        <footer className="modal-foot">
          <span className="move-foot-note">{text.hint}</span>
          <button type="submit" form={id("form")} className="primary" disabled={!canRename}>
            {renaming ? text.renaming : text.rename}
          </button>
          <button ref={cancelButton} type="button" disabled={renaming} onClick={onClose}>
            {text.cancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
