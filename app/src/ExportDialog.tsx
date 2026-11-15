// Exporting players, staff, clubs or changes: the button in the toolbar of the player, staff and club lists and of the
// Changes view, and the dialog it opens. The dialog writes what the list's search and filters select, in its order, to a
// CSV or JSON file in the exports folder (the Changes view: to a CSV file). It only reads the game.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { describeError } from "./format";
import { locale } from "./i18n";
import { exportText as text } from "./labels";
import type { ListState } from "./ListBrowser";
import type { ExportEntity, ExportFormat, ExportReport } from "./types";
import { useModal } from "./useModal";

const FORMATS: readonly ExportFormat[] = ["csv", "csvSemicolon", "json"];

/** What the change log is written as: it has no JSON. */
export const CSV_FORMATS: readonly ExportFormat[] = ["csv", "csvSemicolon"];

/** Where the format chosen last is kept. */
const STORAGE_KEY = "fmlibre.exportFormat";

/**
 * The format chosen last, if `formats` offers it; at first, CSV with semicolons in a language whose Excel writes decimals
 * with a comma (Turkish, Spanish, German, French, Indonesian, Italian and Russian), and with commas in English, Japanese,
 * Korean and Chinese, whose Excel writes them with a point.
 */
function startFormat(formats: readonly ExportFormat[]): ExportFormat {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const known = formats.find((format) => format === saved);
    if (known !== undefined) {
      return known;
    }
  } catch {
    // No storage: the language decides.
  }
  const byLanguage = locale === "en" || locale === "ja" || locale === "ko" || locale === "zh-CN" ? "csv" : "csvSemicolon";
  return formats.includes(byLanguage) ? byLanguage : formats[0];
}

/** The command that writes each kind of list. */
const COMMANDS: Record<ExportEntity, string> = {
  player: "export_players",
  staff: "export_staff",
  club: "export_clubs",
};

/** What a dialog exports: a list as it was when the button was pressed, and how it is written to a file. */
export interface ExportJob {
  title: string;
  /** What the export covers, said under the title. */
  scope: string;
  /** How many rows it writes: with none, Export is out of reach. */
  total: number;
  /** The formats it offers, in order, and what to say under each. */
  formats: readonly ExportFormat[];
  hint: (format: ExportFormat) => string;
  /** What a file holds, said under the formats. */
  contents: string;
  /** Writes the file as `format`. */
  write: (format: ExportFormat) => Promise<ExportReport>;
  /** What the report says once the file is written, and what was left out of it where that can happen. */
  done: (report: ExportReport) => string;
  skipped?: (count: number) => string;
}

/** What an export of a player, staff or club list writes: the list as it was when the button was pressed. */
interface ExportScope {
  entity: ExportEntity;
  query: string;
  /** The list's filter and order, as its command takes them. */
  args: Record<string, unknown>;
  /** How many players, staff or clubs the search and the filters select. */
  total: number;
}

/** The job of the Export button of a list. */
function listJob({ entity, query, args, total }: ExportScope): ExportJob {
  return {
    title: text.title[entity],
    scope: text.scope(entity, total),
    total,
    formats: FORMATS,
    hint: (format) => (format === "json" ? text.formatHints.json[entity] : text.formatHints[format]),
    contents: text.contents[entity],
    write: (format) => call<ExportReport>(COMMANDS[entity], { ...args, query, format }),
    done: (report) => text.done(entity, report.count, report.file),
    skipped: (count) => text.skipped(entity, count),
  };
}

interface ExportButtonProps {
  /** Which list it exports. */
  entity: ExportEntity;
  /** The search text and the total of the list, from its toolbar. */
  list: ListState;
  /**
   * The list's filter and, for players and staff, its order, as the list sends them to its search: none of either when nothing
   * is chosen.
   */
  args: Record<string, unknown>;
}

/**
 * The Export button of the player, staff or club list, and the dialog it opens. It reads only, so it is there read-only too.
 */
export function ExportButton({ entity, list, args }: ExportButtonProps) {
  // The total is null while the list is still asking for the search and filters it shows.
  const { total } = list;
  return (
    <ExportToggle
      title={text.buttonTitle[entity]}
      disabled={total === null}
      job={() => listJob({ entity, query: list.query, args, total: total ?? 0 })}
    />
  );
}

interface ExportToggleProps {
  /** Hover text of the button. */
  title: string;
  /** Whether the button is out of reach: the list is still asking, or the log is empty. */
  disabled: boolean;
  /** What the dialog exports, asked for when the button is pressed: the list as it is then. */
  job: () => ExportJob;
}

/** The Export button, and the dialog it opens for `job`. */
export function ExportToggle({ title, disabled, job }: ExportToggleProps) {
  const [open, setOpen] = useState<ExportJob | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && open === null) {
      button.current?.focus();
    }
    wasOpen.current = open !== null;
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="export-toggle"
        aria-haspopup="dialog"
        disabled={disabled}
        title={title}
        onClick={() => setOpen(job())}
      >
        {text.button}
      </button>
      {open && <ExportDialog job={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * The format, what a file holds, and Export; once written, the file and its folder, with Open and Show in folder. Each
 * Export writes a new file, so another format can follow.
 */
function ExportDialog({ job, onClose }: { job: ExportJob; onClose: () => void }) {
  const titleId = useId();
  const scopeId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const [format, setFormat] = useState<ExportFormat>(() => startFormat(job.formats));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useModal(dialog, !busy, onClose);

  useEffect(() => {
    alive.current = true;
    dialog.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // What was written is read out, and the line takes focus: the buttons for the file are beside it.
  useEffect(() => {
    if (report !== null) {
      result.current?.focus();
    }
  }, [report]);

  const choose = (next: ExportFormat) => {
    setFormat(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not kept for next time; this export still uses it.
    }
  };

  const run = async () => {
    if (busy || job.total === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const done = await job.write(format);
      if (alive.current) {
        setReport(done);
      }
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
      }
    } finally {
      if (alive.current) {
        setBusy(false);
      }
    }
  };

  const reveal = async (command: "open_export" | "show_export") => {
    if (report === null) {
      return;
    }
    setError(null);
    try {
      await call(command, { path: report.path });
    } catch (e) {
      setError(describeError(e));
    }
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
        className="modal export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={scopeId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{job.title}</h2>
          <p id={scopeId} className="mass-scope">
            {job.scope}
          </p>
        </header>

        <div className="modal-body">
          <fieldset className="export-formats" disabled={busy}>
            <legend>{text.formatLabel}</legend>
            {job.formats.map((option) => (
              <label key={option} className="export-format">
                <input
                  type="radio"
                  name="export-format"
                  value={option}
                  checked={format === option}
                  onChange={() => choose(option)}
                />
                <span>
                  <span className="export-format-name">{text.formats[option]}</span>
                  <span className="export-format-hint">{job.hint(option)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="export-contents">{job.contents}</p>
        </div>

        {/* What the export wrote: a live region that is always there, and a Tab stop once it has something to say. */}
        <div ref={result} className="mass-result" role="status" aria-live="polite" tabIndex={report ? 0 : -1}>
          {report !== null && (
            <>
              <p>{job.done(report)}</p>
              <p className="export-folder">{text.folder(report.folder)}</p>
              {report.skipped > 0 && job.skipped && <p>{job.skipped(report.skipped)}</p>}
            </>
          )}
        </div>
        {error !== null && (
          <div className="banner mass-error" role="alert">
            {error}
          </div>
        )}

        <footer className="modal-foot">
          {report !== null && (
            <>
              <button type="button" className="primary" title={text.openTitle} onClick={() => void reveal("open_export")}>
                {text.open}
              </button>
              <button type="button" title={text.showTitle} onClick={() => void reveal("show_export")}>
                {text.show}
              </button>
            </>
          )}
          <span className="export-foot-gap" />
          <button
            type="button"
            className={report === null ? "primary" : undefined}
            disabled={busy || job.total === 0}
            onClick={() => void run()}
          >
            {busy ? text.exporting : text.export}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
