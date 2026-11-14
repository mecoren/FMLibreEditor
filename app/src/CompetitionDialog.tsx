// The pick of a competition for one card of the standings page, as a dialog over it: the game's competitions under the
// heads the page reads them by — the Champions League first, then the leagues whose clubs are the most famous, then each
// nation's leagues, men's and women's apart (see `Standings.tsx`).
//
// A dialog rather than a list under a card: the names are long, and a card is the width of a table column, so a list
// under one either cuts them or covers the tables beside it. The box is the app's own (see `MoveDialog`): a head, a
// search box under it, a list that scrolls, and the way out; Tab and Escape stay inside it (see `useModal`), and the
// arrows move through the list from the search box as they do in the pickers of the lists.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { fold } from "./format";
import { pickerText, standingsText as text } from "./labels";
import type { Competition } from "./types";
import { useModal } from "./useModal";

/** How many of the most famous competitions are offered under a head of their own. */
const TOP = 6;

/** A name as it is matched: lower case, and only its letters and figures, so "Süper Lig" and "SÜPER LIG" agree. */
export function normalized(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The names the game may give the Champions League, in English and in Chinese: the first pick of the list. */
const CHAMPIONS = ["UEFA Champions League", "European Champions Cup", "欧洲冠军联赛", "欧冠"].map(normalized);

/** Whether `competition` is the Champions League, by any of the names the game may give it. */
function isChampions(competition: Competition): boolean {
  return [competition.name, competition.shortName ?? ""].some((name) => CHAMPIONS.includes(normalized(name)));
}

/** The order within a head: the most famous football first, then by name, so the list reads the same on every run. */
function byFame(a: Competition, b: Competition): number {
  return (b.reputation ?? -1) - (a.reputation ?? -1) || a.name.localeCompare(b.name);
}

/** A choice of the list, and the heads over it, widest first: the nation it belongs to, and the men's or women's list. */
interface Row {
  competition: Competition;
  heads: readonly string[];
}

/** The choices under one head of the list: a shortcut at its top, or a nation's leagues. */
interface Section {
  /** The head over them; none for the Champions League, which the page offers first. */
  label?: string;
  rows: Row[];
}

/** A line of the list: a head, or a choice — the row that empties the card among them. */
interface Line {
  head?: string;
  sub?: string;
  row?: Row;
  none?: boolean;
  /** Beside a choice the search left: the nation and the list it belongs to. */
  hint?: string;
}

/** The heads the page offers, with the competitions under each. */
function sectionsOf(competitions: readonly Competition[]): Section[] {
  const sections: Section[] = [];
  const champions = competitions.find(isChampions);
  if (champions !== undefined) {
    sections.push({ rows: [{ competition: champions, heads: [] }] });
  }
  const rest = competitions.filter((competition) => competition !== champions);
  const famous = rest
    .filter((competition) => !competition.women && competition.nation != null && competition.reputation != null)
    .sort(byFame)
    .slice(0, TOP);
  if (famous.length > 0) {
    sections.push({ label: text.topLeagues, rows: famous.map((competition) => ({ competition, heads: [] })) });
  }
  const nations = new Map<string, Competition[]>();
  for (const competition of rest) {
    const nation = competition.nation ?? text.international;
    const held = nations.get(nation);
    if (held === undefined) {
      nations.set(nation, [competition]);
    } else {
      held.push(competition);
    }
  }
  // By name, the competitions that belong to no nation — the continental and the international ones — last.
  const named = [...nations.keys()].sort((a, b) => a.localeCompare(b));
  named.sort((a, b) => Number(a === text.international) - Number(b === text.international));
  for (const nation of named) {
    const held = nations.get(nation) ?? [];
    const rows: Row[] = [];
    for (const [women, head] of [
      [false, text.men],
      [true, text.women],
    ] as const) {
      rows.push(
        ...held
          .filter((competition) => competition.women === women)
          .sort(byFame)
          .map((competition) => ({ competition, heads: [nation, head] })),
      );
    }
    sections.push({ label: nation, rows });
  }
  return sections;
}

interface CompetitionDialogProps {
  /** The competition the card shows; undefined for a card waiting to be picked. */
  competition: Competition | undefined;
  competitions: readonly Competition[];
  /** The competition of every card on the page, so one on another card is not picked twice. */
  shown: readonly (number | null)[];
  /** The competition picked, or 0 for none. */
  onPick: (uid: number) => void;
  onClose: () => void;
}

/** The dialog a card's choose button opens: a competition, under the heads the page reads them by. */
export function CompetitionDialog({ competition, competitions, shown, onPick, onClose }: CompetitionDialogProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const lineId = (index: number) => `${base}-row-${index}`;

  // Escape closes the dialog, Tab stays in it, and focus never leaves it while it is up.
  useModal(dialog, true, onClose);
  // The search is what the dialog opened for: the caret goes to its box, and the list is read from there. The button
  // that opened it has focus back once the dialog has gone, after its listener has stopped holding focus in the box.
  const opener = useRef<Element | null>(null);
  useLayoutEffect(() => {
    opener.current = document.activeElement;
  }, []);
  useEffect(() => {
    box.current?.focus();
    return () => {
      const element = opener.current;
      if (element instanceof HTMLElement && element.isConnected) {
        element.focus();
      }
    };
  }, []);

  const sections = useMemo(() => sectionsOf(competitions), [competitions]);
  const searching = fold(query).trim() !== "";

  // What the search leaves: every competition, with the nation and the list it belongs to beside it.
  const found = useMemo<Row[]>(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [];
    }
    return competitions
      .map((competition) => ({
        competition,
        heads: [competition.nation ?? text.international, competition.women ? text.women : text.men],
      }))
      .filter((row) =>
        words.every((word) =>
          fold(`${row.competition.name} ${row.competition.shortName ?? ""} ${row.heads[0]}`).includes(word),
        ),
      );
  }, [competitions, query]);

  // The lines the list shows: the heads and their choices, or the flat answer of the search.
  const lines = useMemo<Line[]>(() => {
    if (searching) {
      return found.map((row) => ({ row, hint: row.heads.join(" · ") }));
    }
    const lines: Line[] = [{ none: true }];
    for (const section of sections) {
      if (section.label !== undefined) {
        lines.push({ head: section.label });
      }
      let sub: string | undefined;
      for (const row of section.rows) {
        const next = row.heads[1];
        if (next !== undefined && next !== sub) {
          sub = next;
          lines.push({ sub });
        }
        lines.push({ row });
      }
    }
    return lines;
  }, [found, searching, sections]);

  /** Whether the choice at `index` can be picked: a competition another card shows moves there instead. */
  const pickable = (index: number): boolean => {
    const line = lines[index];
    if (line?.none) {
      return true;
    }
    const row = line?.row;
    return row !== undefined && !(row.competition.uid !== competition?.uid && shown.includes(row.competition.uid));
  };

  /** The line `step` away from `index` that can be picked, round the list. */
  const reachable = (index: number, step: 1 | -1): number => {
    let at = index;
    for (let moved = 0; moved < lines.length; moved++) {
      at = (at + step + lines.length) % lines.length;
      if (pickable(at)) {
        return at;
      }
    }
    return index;
  };

  const pick = (index: number) => {
    const line = lines[index];
    if (!pickable(index)) {
      return;
    }
    if (line?.none) {
      onPick(0);
    } else if (line?.row !== undefined) {
      onPick(line.row.competition.uid);
    }
    onClose();
  };

  // The choice in hand is where the highlight starts; typing puts it on the first the search leaves.
  useEffect(() => {
    const inHand = query === "" ? lines.findIndex((line) => line.row?.competition.uid === competition?.uid) : -1;
    const first = lines.findIndex((_, index) => pickable(index));
    const next = inHand >= 0 ? inHand : first;
    setActive(next >= 0 ? next : 0);
    // Only the text of the search moves the highlight: `lines` follows it.
  }, [query]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows move through the choices, not the caret.
      event.preventDefault();
      if (lines.length > 0) {
        setActive((index) => reachable(index, event.key === "ArrowDown" ? 1 : -1));
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    }
    // Escape is the dialog's (see `useModal`), and so is Tab.
  };

  return createPortal(
    // A click beside the dialog does nothing, and keeps focus where it is, as for the other dialogs.
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
        className="modal competition-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{text.choose}</h2>
          {competition !== undefined && <p className="competition-dialog-current">{competition.name}</p>}
        </header>

        <div className="modal-body competition-dialog-body">
          <label className="picker-search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4.5 4.5" />
            </svg>
            <input
              ref={box}
              role="combobox"
              aria-label={pickerText.search}
              aria-autocomplete="list"
              aria-expanded={lines.length > 0}
              aria-controls={id("list")}
              aria-activedescendant={lines.length > 0 ? lineId(active) : undefined}
              value={query}
              placeholder={pickerText.search}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={keys}
            />
          </label>
          <ul ref={list} id={id("list")} className="picker-list" role="listbox" aria-label={text.choose}>
            {searching && found.length === 0 && (
              <li className="picker-empty" role="presentation">
                {pickerText.empty(query)}
              </li>
            )}
            {lines.map((line, index) => {
              // A competition is listed under a shortcut and again under its nation: the line, not the competition, is
              // what a key names, as the list is rebuilt whole on every keystroke anyway.
              if (line.head !== undefined) {
                return (
                  <li key={index} className="picker-group" role="presentation">
                    {line.head}
                  </li>
                );
              }
              if (line.sub !== undefined) {
                return (
                  <li key={index} className="standings-picker-head" role="presentation">
                    {line.sub}
                  </li>
                );
              }
              const uid = line.none ? 0 : (line.row?.competition.uid ?? 0);
              const chosen = line.none ? competition === undefined : uid === competition?.uid;
              const name = line.none ? text.choose : (line.row?.competition.shortName ?? line.row?.competition.name ?? "");
              const full = line.none ? text.choose : (line.row?.competition.name ?? "");
              return (
                <li
                  key={index}
                  id={lineId(index)}
                  className="picker-option"
                  role="option"
                  data-index={index}
                  aria-selected={chosen}
                  aria-disabled={!pickable(index) || undefined}
                  aria-label={line.hint === undefined ? undefined : `${full} — ${line.hint}`}
                  data-active={index === active || undefined}
                  data-current={chosen || undefined}
                  // The caret stays in the search box while the pointer picks, as in the app's other searches.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(index)}
                >
                  <span className="picker-tick" aria-hidden="true">
                    {chosen && (
                      <svg viewBox="0 0 20 20">
                        <path d="m4 10 4 4 8-9" />
                      </svg>
                    )}
                  </span>
                  <span className="picker-label">{name}</span>
                  {line.hint !== undefined && <span className="standings-picker-hint">{line.hint}</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="modal-foot">
          <span className="export-foot-gap" />
          <button type="button" onClick={onClose}>
            {pickerText.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
