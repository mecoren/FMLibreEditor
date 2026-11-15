// The Changes view: everything written to the career the game has loaded, newest first: this connection's changes and
// the earlier ones the app keeps in its history. A change that can be taken back has an Undo, one that cannot (an
// earlier move, say) stays as history. A mass edit is one row, with an Undo of the whole mass edit and a toggle that
// opens its changes. One mass edit can log thousands of changes, so the list, and the changes of a mass edit that is
// open, are shown a page at a time. The history can grow long, so the list has a search and filters, and what they
// leave can be exported to a CSV file; a mass edit with a change they leave is listed, opened on those.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { call } from "./api";
import { changeWords, exportRow } from "./changeText";
import {
  type ChangeFilter,
  isFiltering,
  isNotInGame,
  isSearching,
  NO_CHANGE_FILTER,
  passingChanges,
  readChangeFilter,
  searchTexts,
  SESSION_CHOICES,
} from "./changeFilter";
import { changeLog, clearHistory, isStoredFiner, undoBatch, undoChange } from "./editing";
import { rowMenuProps } from "./EntityRowMenu";
import { CSV_FORMATS, ExportToggle, type ExportJob } from "./ExportDialog";
import { fieldTable } from "./fieldTables";
import { describeError, formatDateTime, formatTime } from "./format";
import { changesText as text, exportText, fieldLabel, massEditText, profileText, valueChange } from "./labels";
import { undoFailureLines } from "./massDraft";
import { restored, useSnapshot } from "./restore";
import type { EditField, Entity, ExportReport, LoggedChange } from "./types";

/**
 * The change log of the career the game has loaded: this connection's changes and the earlier ones from the app's
 * history. `reload` reads it again; when several reads overlap, the answer to the last one asked is the one kept.
 */
export function useChangeLog() {
  const [log, setLog] = useState<LoggedChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const entries = await changeLog();
      if (mine === asked.current) {
        setLog(entries);
        setError(null);
      }
    } catch (e) {
      if (mine === asked.current) {
        setError(describeError(e));
      }
    }
  }, []);

  return { log, error, reload };
}

/**
 * What the search box and the filters of the Changes view hold. They are kept while another view is shown, as a list's
 * search is, and when the log is read again; a switch of the language brings them back too.
 */
export function useChangeFilter() {
  const [filter, setFilter] = useState<ChangeFilter>(() => restored("changeFilter", readChangeFilter));
  useSnapshot("changeFilter", () => filter);
  return [filter, setFilter] as const;
}

/**
 * The editable fields of players, staff and clubs by `entity:key`, to turn stored values into shown ones and to
 * know what kind of value they are (a date, an amount of money); null until read.
 */
function useFieldIndex(): { fields: ReadonlyMap<string, EditField> | null; error: string | null } {
  const [fields, setFields] = useState<ReadonlyMap<string, EditField> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fieldTable("player"), fieldTable("staff"), fieldTable("club")]).then(
      (tables) => {
        if (!cancelled) {
          setFields(new Map(tables.flat().map((field) => [`${field.entity}:${field.key}`, field] as const)));
        }
      },
      (e) => {
        if (!cancelled) {
          setError(describeError(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { fields, error };
}

/** Rows shown at once: of the list, and of the changes of a mass edit that is open. */
const PAGE_SIZE = 100;

/** The columns of the table, for a cell that spans them all. */
const COLUMNS = 5;

/**
 * How many rows the mass edits of a page that open by themselves (see `autoOpened`) may put under their rows at the
 * most: a page may hold a hundred mass edits of a hundred changes each.
 */
const AUTO_OPEN_ROWS = 400;

/** How many pages `total` rows take. */
const pageCount = (total: number) => Math.ceil(total / PAGE_SIZE);

/** `page` (from 0), kept within the pages `total` rows take: the list may have become shorter than it was. */
const withinPages = (page: number, total: number) => Math.min(page, Math.max(0, pageCount(total) - 1));

/** The rows of `page` (from 0). */
function pageOf<T>(rows: readonly T[], page: number): T[] {
  return rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

/**
 * What the log says about one mass edit. The counts and the fields are those of the whole mass edit, which is what
 * Undo mass edit takes back, whatever the filter leaves of it.
 */
interface Batch {
  id: number;
  /** What it changed: a mass edit is made in one list. */
  entity: Entity;
  /** Its changes, newest first, as the log has them. */
  changes: LoggedChange[];
  /** The changes the search and the filters leave, in the same order: those shown when it is opened. */
  matching: LoggedChange[];
  /** How many of them are not undone. */
  remaining: number;
  /** How many of those not undone Undo can take back (an earlier move, say, it cannot). */
  undoable: number;
  /** How many of those not undone are earlier ones the game did not hold when the data was last read. */
  notInGame: number;
  /** The names of the fields it changed, each once, in the order they were written. */
  fields: string[];
}

/** A row of the list: a change that was made on its own, or a whole mass edit. */
type Entry = { kind: "change"; change: LoggedChange } | { kind: "batch"; batch: Batch };

/**
 * The mass edits among `entries`, the rows of the page on show, that are open until the user opens or closes them:
 * while a search or a filter is on, every one whose changes it leaves, as long as the rows of those open stay within
 * `AUTO_OPEN_ROWS`. A name finds a few changes in a mass edit, which then are right under its row; a filter that leaves
 * most of the changes of many big mass edits would put thousands of rows on the page, so those stay closed, one click
 * from open.
 */
function autoOpened(entries: readonly Entry[], filtering: boolean): ReadonlySet<number> {
  const open = new Set<number>();
  if (!filtering) {
    return open;
  }
  let room = AUTO_OPEN_ROWS;
  for (const entry of entries) {
    if (entry.kind === "batch") {
      const rows = Math.min(entry.batch.matching.length, PAGE_SIZE);
      if (rows <= room) {
        open.add(entry.batch.id);
        room -= rows;
      }
    }
  }
  return open;
}

/**
 * The rows of the list for `log` (newest change first, as the log is): the changes made on their own, and each mass
 * edit once, where its newest change is. `passes` says for each change of the log whether the search and the filters
 * leave it, or is null when they leave out none: a change that does not pass is not listed, and a mass edit none of
 * whose changes pass is not listed, while one with a change that passes is listed where its newest such change is.
 */
function entriesOf(log: readonly LoggedChange[], passes: readonly boolean[] | null): Entry[] {
  const entries: Entry[] = [];
  const batches = new Map<number, Batch>();
  log.forEach((change, at) => {
    const passed = passes === null || passes[at];
    if (change.batch === null) {
      if (passed) {
        entries.push({ kind: "change", change });
      }
      return;
    }
    let batch = batches.get(change.batch);
    if (batch === undefined) {
      batch = {
        id: change.batch,
        entity: change.entity,
        changes: [],
        matching: [],
        remaining: 0,
        undoable: 0,
        notInGame: 0,
        fields: [],
      };
      batches.set(change.batch, batch);
    }
    batch.changes.push(change);
    if (passed) {
      batch.matching.push(change);
      if (batch.matching.length === 1) {
        entries.push({ kind: "batch", batch });
      }
    }
    if (change.undoneAt === null) {
      batch.remaining++;
      if (change.undoable) {
        batch.undoable++;
      }
      if (change.earlier && change.inGame === false) {
        batch.notInGame++;
      }
    }
  });
  for (const batch of batches.values()) {
    batch.fields = fieldNames(batch);
  }
  return entries;
}

/** The names of the fields `batch` changed, each once, the oldest change first: the order the mass edit had them in. */
function fieldNames(batch: Batch): string[] {
  const names = new Set<string>();
  for (let at = batch.changes.length - 1; at >= 0; at--) {
    names.add(fieldLabel(batch.entity, batch.changes[at].field));
  }
  return [...names];
}

/** What undoing a whole mass edit came to: how many changes were taken back and what could not be, or why it failed. */
type BatchOutcome = { error: string } | { undone: number; problems: string[] };

interface ChangesViewProps {
  log: LoggedChange[];
  /** Why the log could not be read. */
  error: string | null;
  /** Reads the log again. */
  reload: () => void;
  /** Called after a change was undone: the game's data and the log are not what they were. */
  onUndone: () => void;
  /** What the search box and the filters hold, and what to call when they change (see `useChangeFilter`). */
  filter: ChangeFilter;
  onFilter: (filter: ChangeFilter) => void;
}

/**
 * How the user left the changes of a mass edit: opened or closed, and the page of them that is on show, from 0. A mass
 * edit that was neither opened nor closed is closed, unless a search or a filter is on: then it is open if it fits (see
 * `autoOpened`).
 */
interface BatchView {
  open: boolean;
  page: number;
}

/** The table of the career's changes, earlier ones included. It reads the log again whenever it is shown. */
export function ChangesView({ log, error, reload, onUndone, filter, onFilter }: ChangesViewProps) {
  const { fields, error: fieldsError } = useFieldIndex();
  const [undoing, setUndoing] = useState(false);
  // Whether the question before clearing the history is up, and whether the clearing is under way.
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Why clearing the history failed.
  const [clearError, setClearError] = useState<string | null>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  // Why an undo failed, by change id.
  const [failures, setFailures] = useState<Record<number, string>>({});
  // What undoing a whole mass edit did, by batch: it is shown on the row of the mass edit.
  const [outcomes, setOutcomes] = useState<Record<number, BatchOutcome>>({});
  // The page of the list that is on show, from 0.
  const [page, setPage] = useState(0);
  // How the mass edits were opened or closed, by batch.
  const [views, setViews] = useState<Partial<Record<number, BatchView>>>({});
  const tableWrap = useRef<HTMLDivElement>(null);

  const filtering = isFiltering(filter);
  const searching = isSearching(filter);
  // What a search looks through is worked out once for a log, not for each key typed.
  const texts = useMemo(() => (searching ? searchTexts(log) : null), [log, searching]);
  // Which changes of the log the search and the filters leave; null when they leave all.
  const passes = useMemo(() => passingChanges(log, texts, filter), [log, texts, filter]);
  const matching = useMemo(() => (passes === null ? log : log.filter((_, at) => passes[at])), [log, passes]);
  const entries = useMemo(() => entriesOf(log, passes), [log, passes]);
  const shownPage = withinPages(page, entries.length);
  const autoOpen = useMemo(() => autoOpened(pageOf(entries, shownPage), filtering), [entries, shownPage, filtering]);
  const undone = useMemo(() => matching.filter((change) => change.undoneAt !== null).length, [matching]);
  // The earlier changes of the whole log, whatever the filter leaves, for the note on what the history holds: how
  // many, and how many of those the game did not hold when the data was last read and that are still to be undone.
  const { earlierCount, missingCount } = useMemo(() => {
    const earlier = log.filter((change) => change.earlier);
    return { earlierCount: earlier.length, missingCount: earlier.filter(isNotInGame).length };
  }, [log]);

  useEffect(() => {
    reload();
  }, [reload]);

  const undo = async (change: LoggedChange) => {
    setUndoing(true);
    setFailures((old) => {
      const rest = { ...old };
      delete rest[change.id];
      return rest;
    });
    try {
      await undoChange(change.id);
      onUndone();
    } catch (e) {
      setFailures((old) => ({ ...old, [change.id]: describeError(e) }));
      // The log may be out of date, e.g. when the change was undone already.
      reload();
    } finally {
      setUndoing(false);
    }
  };

  const undoWholeBatch = async (batch: number) => {
    setUndoing(true);
    setOutcomes((old) => {
      const rest = { ...old };
      delete rest[batch];
      return rest;
    });
    try {
      const done = await undoBatch(batch);
      const problems = undoFailureLines(done.failed, log);
      setOutcomes((old) => ({ ...old, [batch]: { undone: done.undone, problems } }));
      if (done.undone > 0) {
        onUndone();
      } else {
        // The log may be out of date, e.g. when the changes were undone one by one already.
        reload();
      }
    } catch (e) {
      setOutcomes((old) => ({ ...old, [batch]: { error: describeError(e) } }));
      reload();
    } finally {
      setUndoing(false);
    }
  };

  // Keep has the focus when the question appears, so that the safe answer is the one at hand.
  useEffect(() => {
    if (confirming) {
      keepButton.current?.focus();
    }
  }, [confirming]);

  const clearAll = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await clearHistory();
      setFailures({});
      setOutcomes({});
      setViews({});
      setPage(0);
      reload();
    } catch (e) {
      setClearError(describeError(e));
    } finally {
      setConfirming(false);
      setClearing(false);
    }
  };

  const showPage = (next: number) => {
    setPage(next);
    // A page starts at its top.
    tableWrap.current?.scrollTo({ top: 0 });
  };

  /** A change of the search or the filters: the list starts again at its first page, its mass edits as the filter has them. */
  const changeFilter = (next: ChangeFilter) => {
    onFilter(next);
    setPage(0);
    setViews({});
    tableWrap.current?.scrollTo({ top: 0 });
  };

  /** Whether the changes of the mass edit are shown under its row. */
  const isOpen = (batch: number) => views[batch]?.open ?? autoOpen.has(batch);

  /** Opens the mass edit at the first page of its changes, or closes it. */
  const toggle = (batch: number) =>
    setViews((old) => ({ ...old, [batch]: { open: !(old[batch]?.open ?? autoOpen.has(batch)), page: 0 } }));

  const showBatchPage = (batch: number, next: number) =>
    setViews((old) => ({ ...old, [batch]: { open: old[batch]?.open ?? autoOpen.has(batch), page: next } }));

  // Stored values are turned into shown ones with the field tables, so the rows wait for them.
  const ready = fields !== null || fieldsError !== null;
  const problem = clearError ?? error ?? fieldsError;

  /** What the Export button writes: the changes the search and the filters leave, as the list was when it was pressed. */
  const exportJob = (): ExportJob => {
    const rows = matching.map((change) => exportRow(change, fields?.get(`${change.entity}:${change.field}`)));
    return {
      title: exportText.changes.title,
      scope: exportText.changes.scope(rows.length, filtering),
      total: rows.length,
      formats: CSV_FORMATS,
      hint: (format) => (format === "json" ? "" : exportText.formatHints[format]),
      contents: exportText.changes.contents,
      write: (format) => call<ExportReport>("export_changes", { rows, format }),
      done: (report) => exportText.changes.done(report.count, report.file),
    };
  };

  const changeRow = (change: LoggedChange, inBatch: boolean) => (
    <ChangeRow
      key={change.id}
      change={change}
      field={fields?.get(`${change.entity}:${change.field}`)}
      failure={failures[change.id]}
      undoing={undoing}
      onUndo={undo}
      inBatch={inBatch}
    />
  );

  return (
    <div className="workspace">
      <section className="players changes">
        <div className="toolbar">
          <h2 className="view-title">{text.title}</h2>
          {/* The count follows the search and the filters; read out when it changes. */}
          <span className="count" role="status">
            {filtering && log.length > 0
              ? text.filteredCount(matching.length, log.length, undone)
              : text.count(log.length, undone)}
          </span>
          {confirming ? (
            <>
              <span className="clear-question">{text.confirmClear}</span>
              <button
                type="button"
                ref={keepButton}
                disabled={clearing}
                onClick={() => setConfirming(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setConfirming(false);
                  }
                }}
              >
                {text.keepHistory}
              </button>
              <button
                type="button"
                className="danger"
                disabled={clearing}
                onClick={() => void clearAll()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setConfirming(false);
                  }
                }}
              >
                {text.clearConfirm}
              </button>
            </>
          ) : (
            <>
              <ExportToggle
                title={exportText.changes.buttonTitle}
                disabled={!ready || log.length === 0}
                job={exportJob}
              />
              <button
                type="button"
                className="clear-history"
                title={text.clearHistoryTitle}
                disabled={log.length === 0 || undoing || clearing}
                onClick={() => setConfirming(true)}
              >
                {text.clearHistory}
              </button>
            </>
          )}
        </div>
        <p className="view-note">{text.hint}</p>
        <p className="view-note">{text.continueHint}</p>
        {earlierCount > 0 && <p className="view-note">{text.earlierNote(earlierCount, missingCount)}</p>}

        <div className="toolbar changes-filters">
          <label className="search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4.5 4.5" />
            </svg>
            <input
              ref={searchBox}
              value={filter.query}
              onChange={(e) => changeFilter({ ...filter, query: e.currentTarget.value })}
              placeholder={text.searchPlaceholder}
              aria-label={text.searchPlaceholder}
              spellCheck={false}
            />
          </label>
          <div className="change-session" role="group" aria-label={text.sessionGroup}>
            {SESSION_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={filter.session === choice}
                onClick={() => changeFilter({ ...filter, session: choice })}
              >
                {text.sessions[choice]}
              </button>
            ))}
          </div>
          <label className="filter-field" title={text.notUndoneTitle}>
            <input
              type="checkbox"
              checked={filter.notUndone}
              onChange={(e) => changeFilter({ ...filter, notUndone: e.currentTarget.checked })}
            />
            <span>{text.notUndone}</span>
          </label>
          <label className="filter-field" title={text.notInGameFilterTitle}>
            <input
              type="checkbox"
              checked={filter.notInGame}
              onChange={(e) => changeFilter({ ...filter, notInGame: e.currentTarget.checked })}
            />
            <span>{text.notInGame}</span>
          </label>
          {filtering && (
            <button
              type="button"
              className="filter-clear"
              onClick={() => {
                changeFilter(NO_CHANGE_FILTER);
                // This button goes away with the filter: keep keyboard focus on the search box.
                searchBox.current?.focus();
              }}
            >
              {text.clearFilter}
            </button>
          )}
        </div>
        {problem && (
          <div className="banner" role="alert">
            {problem}
          </div>
        )}

        <div className="table-wrap" ref={tableWrap}>
          <table className="grid changes-grid">
            <thead>
              <tr>
                <th>{text.columns.time}</th>
                <th>{text.columns.name}</th>
                <th>{text.columns.field}</th>
                <th>{text.columns.change}</th>
                <th>{text.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {ready &&
                pageOf(entries, shownPage).map((entry) => {
                  if (entry.kind === "change") {
                    return changeRow(entry.change, false);
                  }
                  const { batch } = entry;
                  const opened = isOpen(batch.id);
                  const batchPage = withinPages(views[batch.id]?.page ?? 0, batch.matching.length);
                  return (
                    <Fragment key={`batch-${batch.id}`}>
                      <BatchRow
                        batch={batch}
                        open={opened}
                        filtering={filtering}
                        undoing={undoing}
                        outcome={outcomes[batch.id]}
                        onToggle={toggle}
                        onUndo={undoWholeBatch}
                      />
                      {opened && (
                        <>
                          {pageCount(batch.matching.length) > 1 && (
                            <tr className="batch-pager">
                              <td colSpan={COLUMNS}>
                                <Pager
                                  label={text.batchPages}
                                  page={batchPage}
                                  total={batch.matching.length}
                                  onPage={(next) => showBatchPage(batch.id, next)}
                                />
                              </td>
                            </tr>
                          )}
                          {pageOf(batch.matching, batchPage).map((change) => changeRow(change, true))}
                        </>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
          {ready && log.length === 0 && <p className="empty">{text.empty}</p>}
          {ready && log.length > 0 && entries.length === 0 && <p className="empty">{text.noMatches}</p>}
        </div>
        {ready && pageCount(entries.length) > 1 && (
          <div className="pager-bar">
            <Pager label={text.pages} page={shownPage} total={entries.length} onPage={showPage} />
          </div>
        )}
      </section>
    </div>
  );
}

interface PagerProps {
  /** What the buttons page through, for assistive technology. */
  label: string;
  /** The page that is on show, from 0, and how many rows there are in all. */
  page: number;
  total: number;
  onPage: (page: number) => void;
}

/** Previous and Next with the rows on show between them ("101–200 of 450"); nothing while the rows fit one page. */
function Pager({ label, page, total, onPage }: PagerProps) {
  const box = useRef<HTMLDivElement>(null);
  const pages = pageCount(total);

  // A disabled button cannot keep focus: when the button that was pressed has reached the first or the last page, focus
  // goes to the other one.
  useEffect(() => {
    const active = document.activeElement;
    if (box.current?.contains(active) && active instanceof HTMLElement && active.matches(":disabled")) {
      box.current.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    }
  }, [page]);

  if (pages <= 1) {
    return null;
  }
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(total, first + PAGE_SIZE - 1);

  return (
    <div ref={box} className="pager" role="group" aria-label={label}>
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>
        {text.previous}
      </button>
      {/* A live region, so that the new range is read out when a page changes. */}
      <span className="pager-range" role="status">
        {text.range(first, last, total)}
      </span>
      <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        {text.next}
      </button>
    </div>
  );
}

interface BatchRowProps {
  batch: Batch;
  /** Whether its changes are shown under it. */
  open: boolean;
  /** Whether a search or a filter is on: the row then says how many of its changes they leave. */
  filtering: boolean;
  /** Whether any undo is under way: one at a time. */
  undoing: boolean;
  /** What undoing the whole mass edit did. */
  outcome: BatchOutcome | undefined;
  onToggle: (batch: number) => void;
  onUndo: (batch: number) => void;
}

/** A mass edit as one row: what it changed, how much of it is still in place, its Undo and the toggle for its changes. */
function BatchRow({ batch, open, filtering, undoing, outcome, onToggle, onUndo }: BatchRowProps) {
  // The newest change gives the time: the mass edit is as old as its last write.
  const newest = batch.changes[0];
  // A mass edit made before this connection is dated as an old one is: it may be days old.
  const earlier = batch.changes.every((change) => change.earlier);

  return (
    <tr className={batch.remaining === 0 ? "batch-row undone" : "batch-row"}>
      <td className="date" title={formatDateTime(newest.at)}>
        {earlier ? formatDateTime(newest.at) : formatTime(newest.at)}
      </td>
      <td className="col-person col-batch" colSpan={3}>
        <div className="name">
          {batch.fields.join(", ")}
          <span className="tag kind">{text.kinds[batch.entity]}</span>
          <span className="tag batch">{text.batch}</span>
          {earlier && (
            <span className="tag earlier" title={text.earlierTitle}>
              {text.earlierTag}
            </span>
          )}
        </div>
        <div className="sub">{text.batchCount(batch.changes.length, batch.remaining)}</div>
        {filtering && (
          <div className="sub batch-matching">{text.batchMatching(batch.matching.length, batch.changes.length)}</div>
        )}
        {batch.notInGame > 0 && <div className="sub in-game missing">{text.batchNotInGame(batch.notInGame)}</div>}
      </td>
      <td className="col-status">
        <div className="row-actions">
          {batch.undoable > 0 && (
            <button
              type="button"
              className="batch-undo"
              disabled={undoing}
              title={text.undoBatchTitle(batch.undoable)}
              onClick={() => onUndo(batch.id)}
            >
              {text.undoBatch}
            </button>
          )}
          <button type="button" className="batch-toggle" aria-expanded={open} onClick={() => onToggle(batch.id)}>
            {open ? text.hideChanges : text.showChanges}
          </button>
        </div>
        {outcome !== undefined && <BatchOutcomeNote outcome={outcome} />}
      </td>
    </tr>
  );
}

interface ChangeRowProps {
  change: LoggedChange;
  /**
   * The field's entry in the field table, for the conversion of its values and to tell a date or an amount of
   * money from a plain number; none when the table lacks it.
   */
  field: EditField | undefined;
  /** Why the last try to undo it failed. */
  failure: string | undefined;
  /** Whether any undo is under way: one at a time. */
  undoing: boolean;
  onUndo: (change: LoggedChange) => void;
  /** Whether it is shown under the row of the mass edit it is part of. */
  inBatch: boolean;
}

function ChangeRow({ change, field, failure, undoing, onUndo, inBatch }: ChangeRowProps) {
  const label = fieldLabel(change.entity, change.field);
  // An attribute or a percentage is stored on a finer scale than it is shown: its hover text has the values as stored.
  const storedNote = isStoredFiner(field) ? text.stored(valueChange(change.old, change.new)) : undefined;
  const className = [change.undoneAt !== null && "undone", inBatch && "in-batch"].filter(Boolean).join(" ");
  // What the row says of the change: its values as shown, and the notes under them (see `changeWords`).
  const words = changeWords(change, field);

  return (
    <tr className={className || undefined} {...rowMenuProps(change.entity, change.name, change.uid)}>
      <td className="date" title={formatDateTime(change.at)}>
        {change.earlier ? formatDateTime(change.at) : formatTime(change.at)}
      </td>
      <td className="col-person">
        <div className="name">
          {change.name}
          <span className="tag kind">{text.kinds[change.entity]}</span>
          {change.earlier && (
            <span className="tag earlier" title={text.earlierTitle}>
              {text.earlierTag}
            </span>
          )}
        </div>
        <div className="sub uid">
          {change.entity === "staff" ? profileText.id : profileText.uid} {change.uid}
        </div>
      </td>
      <td>{label}</td>
      <td className="change-value" title={storedNote}>
        {words.text}
        {words.notes.map((note) => (
          <div key={note} className="sub">
            {note}
          </div>
        ))}
      </td>
      <td className="col-status">
        <div className="row-actions">
          {change.undoneAt === null ? (
            change.undoable ? (
              <button type="button" disabled={undoing} title={text.undoTitle(label)} onClick={() => onUndo(change)}>
                {text.undo}
              </button>
            ) : (
              <span className="history-only" title={text.historyOnlyTitle}>
                {text.historyOnly}
              </span>
            )
          ) : (
            // An earlier change may have been undone days ago.
            text.undone(change.earlier ? formatDateTime(change.undoneAt) : formatTime(change.undoneAt))
          )}
        </div>
        {change.undoneAt === null && change.earlier && change.inGame !== undefined && (
          <div
            className={change.inGame ? "in-game" : "in-game missing"}
            title={change.inGame ? text.inGameTitle : text.notInGameTitle}
          >
            {change.inGame ? text.inGame : text.notInGame}
          </div>
        )}
        {change.undoneAt === null && failure !== undefined && (
          <span className="row-error" role="alert">
            {failure}
          </span>
        )}
      </td>
    </tr>
  );
}

/** What undoing a whole mass edit did: how many changes were taken back and which could not be, or why it failed. */
function BatchOutcomeNote({ outcome }: { outcome: BatchOutcome }) {
  if ("error" in outcome) {
    return (
      <span className="row-error" role="alert">
        {outcome.error}
      </span>
    );
  }
  return (
    <div className="row-note" role="status">
      <p>{massEditText.undone(outcome.undone)}</p>
      {outcome.problems.length > 0 && (
        <ul className="edit-problems">
          {outcome.problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
