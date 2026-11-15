// The Staff tab of a club's profile: the club's staff, by department, and Release all staff, which releases every one
// of them the editor can release after a dialog that asks first. Each leaves the club at once with no contract, as the
// game's own staff without a club; you and the board stay, as do those the club holds in another way. The releases
// are logged as one batch, which Undo here, or in the Changes view, takes back.

import { useContext, useEffect, useId, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Ability } from "./Ability";
import { changeLog, clubStaff, releaseClubStaff, undoBatch } from "./editing";
import { describeError } from "./format";
import { intlLocale } from "./i18n";
import { clubStaffText as text, jobLabel, massEditText, profileText, staffListText } from "./labels";
import { undoFailureLines } from "./massDraft";
import { ClubLine } from "./MoveDialog";
import type { Loaded, PanelIds } from "./ProfileParts";
import { HumanBadge } from "./StaffProfile";
import type { BatchUndo, ClubStaffRow, Failure, MassReport } from "./types";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** The club's staff, read again whenever `version` changes: the game data was read or written. */
function useClubStaff(club: number, version: number): Loaded<ClubStaffRow[]> | null {
  const [loaded, setLoaded] = useState<Loaded<ClubStaffRow[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    clubStaff(club).then(
      (details) => !cancelled && setLoaded({ details }),
      (e) => !cancelled && setLoaded({ error: describeError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [club, version]);

  return loaded;
}

/**
 * The jobs in the order the table lists them: the manager and the coaches, then the analysts and the director of
 * football, the scouts, the medical staff, and the board last. A job not here comes after them all.
 */
const JOB_ORDER: readonly number[] = [
  16, 20, 2, 34, 26, 22, 64, 62, 60, 10, 88, 44, 14, 58, 86, 50, 12, 40, 48, 38, 46, 70, 66, 4, 6, 8, 24, 1,
];

const collator = new Intl.Collator(intlLocale);

/** The staff in the table's order: you first, then by job (see `JOB_ORDER`), the best first in each job. */
function inOrder(rows: readonly ClubStaffRow[]): ClubStaffRow[] {
  const place = (job: number | null) => {
    const at = job === null ? -1 : JOB_ORDER.indexOf(job);
    return at < 0 ? JOB_ORDER.length : at;
  };
  return [...rows].sort(
    (a, b) =>
      Number(b.isHuman) - Number(a.isHuman) ||
      place(a.job) - place(b.job) ||
      b.currentAbility - a.currentAbility ||
      collator.compare(a.name, b.name),
  );
}

/** Why a member of staff stays when the rest are released, short, from the code of the game's answer. */
function staysLabel(stays: Failure): string {
  switch (stays.code) {
    case "staff.you":
      return text.stays.you;
    case "staff.job":
      return text.stays.board;
    case "move.playerCoach":
      return text.stays.player;
    case "staff.role":
      return text.stays.held;
    default:
      return text.stays.other;
  }
}

/** Takes back what a result says was written. */
type Undo = () => Promise<BatchUndo>;

/** What Release all or its undo came to, for the line under the button. */
interface Result {
  message: string;
  /** Whether the message is why it did not happen. */
  failed: boolean;
  /** Under the message: what the game refused, as lines of text. */
  problems: string[];
  /** Null for what there is nothing to take back, or what was taken back already. */
  undo: Undo | null;
}

/** Most refusals the line under the button lists. */
const PROBLEMS_SHOWN = 5;

/** The releases the game refused: whose and why; the first few, then how many more. */
function refusalLines(failed: MassReport["failed"]): string[] {
  const lines = failed.slice(0, PROBLEMS_SHOWN).map(({ name, error }) => text.refused(name, describeError(error)));
  return failed.length > PROBLEMS_SHOWN ? [...lines, massEditText.more(failed.length - PROBLEMS_SHOWN)] : lines;
}

interface ClubStaffTabProps {
  club: { uid: number; name: string; women: boolean };
  /** Changes when the game data is read again, so the staff are too. */
  version: number;
  /** The tab it is the panel of. */
  panel: PanelIds;
}

/** The staff of the club, with Release all staff above them. */
export function ClubStaffTab({ club, version, panel }: ClubStaffTabProps) {
  const { editable, onEdited, readOnlyNote } = useContext(EditorContext);
  const loaded = useClubStaff(club.uid, version);
  // Whether a write is under way, or done and waiting for the staff to be read again.
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [asking, setAsking] = useState(false);
  const alive = useRef(true);
  const resultBox = useRef<HTMLDivElement>(null);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  // Set while a write may take the button that has focus out of play.
  const refocus = useRef(false);

  const rows = loaded?.details ? inOrder(loaded.details) : null;
  const leaving = rows?.filter((row) => row.stays === null) ?? [];
  const staying = rows?.filter((row) => row.stays !== null) ?? [];

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A write stays busy until the staff have been read again: pressed in between, the button would work from rows that
  // are out of date.
  useEffect(() => {
    setBusy(false);
  }, [loaded]);

  // Once the dialog is gone, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasAsking.current && !asking) {
      releaseButton.current?.focus();
    }
    wasAsking.current = asking;
  }, [asking]);

  // A write can take the button that had focus out of play: Release all once nobody is left to release, Undo once it
  // is done. Focus then goes to the line under the button, so that someone using the keyboard stays in the tab.
  useEffect(() => {
    if (busy || !refocus.current) {
      return;
    }
    refocus.current = false;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body || focused.matches(":disabled")) {
      resultBox.current?.focus();
    }
  });

  /** Writes, busy until the staff are read again, with the result shown under the button. */
  const write = async (task: () => Promise<Result>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    refocus.current = true;
    try {
      const done = await task();
      if (alive.current) {
        setResult(done);
      }
      // The game has changed: the lists, the profile and the change log read it again, and so do the staff.
      onEdited();
    } catch (e) {
      if (alive.current) {
        setResult({ message: describeError(e), failed: true, problems: [], undo: null });
        setBusy(false);
      }
    }
  };

  const releaseAll = () =>
    write(async () => {
      const report = await releaseClubStaff(club.uid);
      return {
        message: text.released(report.applied),
        failed: false,
        problems: refusalLines(report.failed),
        // A release that wrote nothing has nothing to take back.
        undo: report.applied > 0 ? () => undoBatch(report.batch) : null,
      };
    });

  const undo = (take: Undo) =>
    write(async () => {
      const done = await take();
      // The log names the staff behind the changes that could not be taken back.
      const log = done.failed.length > 0 ? await changeLog().catch(() => []) : [];
      return {
        message: massEditText.undone(done.undone),
        failed: false,
        problems: undoFailureLines(done.failed, log),
        undo: null,
      };
    });

  // What the button's hover text says: why it waits, or else what it does.
  const title = !editable ? readOnlyNote : leaving.length === 0 ? text.releaseNone : text.releaseAllTitle;

  return (
    <div
      className="squad-tab club-staff-tab"
      role="tabpanel"
      id={panel.id}
      aria-labelledby={panel.labelledBy}
      aria-busy={loaded === null || undefined}
    >
      {loaded === null && (
        <p className="profile-status" role="status">
          {text.loading}
        </p>
      )}
      {loaded?.error !== undefined && (
        <div className="banner" role="alert">
          {loaded.error}
        </div>
      )}

      {rows && (
        <>
          <div className="squad-summary">
            {/* Who would stay is worth saying while there is someone to release. */}
            <p className="squad-count">{text.count(rows.length, leaving.length > 0 ? staying.length : 0)}</p>
          </div>

          <div className="squad-actions">
            <div className="squad-buttons" role="group" aria-label={text.actionsLabel}>
              <button
                ref={releaseButton}
                type="button"
                className="squad-action"
                disabled={!editable || leaving.length === 0}
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                aria-haspopup="dialog"
                title={title}
                onClick={() => !busy && setAsking(true)}
              >
                {text.releaseAll(leaving.length)}
              </button>
            </div>
            <p className="note squad-hint">{text.hint}</p>
          </div>

          <ResultLine ref={resultBox} result={result} busy={busy} onUndo={(take) => void undo(take)} />

          {rows.length === 0 ? (
            <p className="empty">{text.empty}</p>
          ) : (
            <div className="squad-table-wrap">
              <table className="grid squad-grid club-staff-grid" aria-label={text.tableLabel}>
                <thead>
                  <tr>
                    <th className="col-name">{staffListText.columns.name}</th>
                    <th>{staffListText.columns.job}</th>
                    <th className="num">{staffListText.columns.age}</th>
                    <th className="num">{staffListText.columns.currentAbility}</th>
                    <th className="num">{staffListText.columns.potentialAbility}</th>
                    <th>{text.staysColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <StaffRow key={row.uid} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {asking && (
        <ReleaseAllDialog
          club={club}
          leaving={leaving}
          staying={staying}
          onRelease={async () => {
            await releaseAll();
            setAsking(false);
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

/** One member of staff: name, job, age, abilities, and why they stay when the rest are released. */
function StaffRow({ row }: { row: ClubStaffRow }) {
  const fullName = row.fullName !== null && row.fullName !== row.name ? row.fullName : null;
  return (
    // One who stays is dimmed, as a player of another team is in the squad.
    <tr className={row.stays === null ? undefined : "away"}>
      <td className="col-name" title={fullName === null ? row.name : `${row.name}\n${fullName}`}>
        <div className="squad-name">
          <span className="name">{row.name}</span>
          {row.isHuman && <HumanBadge />}
        </div>
      </td>
      <td>{row.job === null ? <span className="muted">{profileText.none}</span> : jobLabel(row.job)}</td>
      <td className="num">{row.age ?? profileText.none}</td>
      <td className="num">
        <Ability value={row.currentAbility} />
      </td>
      <td className="num">
        <Ability value={row.potentialAbility} />
      </td>
      <td title={row.stays ? describeError(row.stays) : undefined}>{row.stays && staysLabel(row.stays)}</td>
    </tr>
  );
}

interface ResultLineProps {
  result: Result | null;
  busy: boolean;
  onUndo: (take: Undo) => void;
  /** The line takes focus when the button that had it is gone. */
  ref: Ref<HTMLDivElement>;
}

/**
 * What the last write came to, with the button that takes it back and what the game refused. A live region that is
 * always there, so that it is read out when it fills; it takes no room while it is empty.
 */
function ResultLine({ result, busy, onUndo, ref }: ResultLineProps) {
  return (
    <div ref={ref} className="squad-result" role="status" tabIndex={-1}>
      {result && (
        <>
          <div className="squad-result-line">
            <p className={result.failed ? "error" : undefined}>{result.message}</p>
            {result.undo && (
              <button
                type="button"
                className="squad-action"
                aria-disabled={busy || undefined}
                title={text.undoTitle}
                onClick={() => !busy && result.undo && onUndo(result.undo)}
              >
                {text.undo}
              </button>
            )}
          </div>
          {result.problems.length > 0 && (
            <ul className="edit-problems">
              {result.problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** How many names of those who leave the dialog shows; the rest it counts. */
const NAMES_SHOWN = 8;

interface ReleaseAllDialogProps {
  club: { uid: number; name: string; women: boolean };
  /** Those Release all releases, and those it leaves at the club, with why. */
  leaving: readonly ClubStaffRow[];
  staying: readonly ClubStaffRow[];
  /** Releases them; the dialog is closed once it is done, and the tab says what came of it. */
  onRelease: () => Promise<void>;
  onClose: () => void;
}

/**
 * The dialog that asks before Release all: the club, who leaves it and who stays (and why), and what a release does.
 * It stays up, busy, while the staff are released; then the tab says what came of it.
 */
function ReleaseAllDialog({ club, leaving, staying, onRelease, onClose }: ReleaseAllDialogProps) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [releasing, setReleasing] = useState(false);

  useModal(dialog, !releasing, onClose);

  // Focus starts on Cancel: releasing a whole staff takes a second press.
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  const shown = leaving.slice(0, NAMES_SHOWN);
  const person = (row: ClubStaffRow) => (row.job === null ? row.name : `${row.name} (${jobLabel(row.job)})`);

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
        className="modal move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        aria-describedby={id("club")}
        aria-busy={releasing || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{text.title}</h2>
          <p id={id("club")} className="move-player">
            {club.name}
          </p>
        </header>

        <div className="modal-body">
          <section className="move-section" aria-labelledby={id("from")}>
            <h3 id={id("from")}>{text.from}</h3>
            <div className="move-club">
              <ClubLine uid={club.uid} name={club.name} women={club.women} />
            </div>
          </section>

          <section className="move-section" aria-labelledby={id("leaving")}>
            <h3 id={id("leaving")}>{text.leaving(leaving.length)}</h3>
            <ul className="move-facts">
              {shown.map((row) => (
                <li key={row.uid}>{person(row)}</li>
              ))}
              {leaving.length > shown.length && <li>{text.more(leaving.length - shown.length)}</li>}
            </ul>
          </section>

          {staying.length > 0 && (
            <section className="move-section" aria-labelledby={id("staying")}>
              <h3 id={id("staying")}>{text.staying(staying.length)}</h3>
              <ul className="move-facts">
                {staying.map((row) => (
                  <li key={row.uid} title={row.stays ? describeError(row.stays) : undefined}>
                    {person(row)}: {row.stays && staysLabel(row.stays)}
                  </li>
                ))}
              </ul>
            </section>
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

        <footer className="modal-foot">
          <span className="move-foot-note">{text.dialogHint}</span>
          <button
            type="button"
            className="primary"
            disabled={leaving.length === 0 || releasing}
            onClick={() => {
              setReleasing(true);
              void onRelease();
            }}
          >
            {releasing ? text.releasing : text.release}
          </button>
          <button ref={cancelButton} type="button" disabled={releasing} onClick={onClose}>
            {text.cancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
