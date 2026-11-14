// The pick of a competition on a standings card, under the heads the page reads the game's competitions by: the
// Champions League first, then the leagues whose clubs are the most famous, then each nation's leagues, men's and
// women's apart (see `Standings.tsx`).
//
// It is the app's picker of a long list (see `SelectField`): a Popover from Radix with a box at the head of a list,
// the arrows moving through it, Enter picking, Escape closing, and the box narrowing every head at once — "turkiye"
// finds a league by its nation's name as well as by its own.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { fold } from "./format";
import { pickerText, standingsText as text } from "./labels";
import { cn } from "./lib/utils";
import type { Competition } from "./types";

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

interface CompetitionPickerProps {
  /** The competition the card shows; undefined for a card waiting to be picked. */
  competition: Competition | undefined;
  competitions: readonly Competition[];
  /** The competition of every card on the page, so one on another card is not picked twice. */
  shown: readonly (number | null)[];
  /** The competition picked, or 0 for none. */
  onChange: (uid: number) => void;
  /** What the pick is called, where the card has no <label> for it. */
  label: string;
  className?: string;
}

export function CompetitionPicker({ competition, competitions, shown, onChange, label, className }: CompetitionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const base = useId();
  const lineId = (index: number) => `${base}-row-${index}`;

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

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const pick = (index: number) => {
    const line = lines[index];
    if (!pickable(index)) {
      return;
    }
    if (line?.none) {
      onChange(0);
    } else if (line?.row !== undefined) {
      onChange(line.row.competition.uid);
    }
    close();
  };

  // Opening puts the highlight on the choice in hand; typing puts it on the first the search leaves.
  useEffect(() => {
    if (!open) {
      return;
    }
    const inHand = query === "" ? lines.findIndex((line) => line.row?.competition.uid === competition?.uid) : -1;
    const first = lines.findIndex((_, index) => pickable(index));
    const next = inHand >= 0 ? inHand : first;
    setActive(next >= 0 ? next : 0);
    // Only the opening of the list and the text of the search move the highlight: `lines` follows those.
  }, [open, query]);

  useEffect(() => {
    if (open) {
      list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active, open]);

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
    } else if (event.key === "Escape") {
      // Only the list goes: the page around it stays, as it does with the app's other searches (see `useModal`).
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      // Tab leaves the list, and the list goes with it, as a native one does.
      close();
    }
  };

  const shownLabel = competition === undefined ? text.choose : (competition.shortName ?? competition.name);

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild aria-haspopup="listbox">
        <button
          type="button"
          className={cn("picker standings-pick flex w-fit items-center justify-between gap-2 whitespace-nowrap", className)}
          title={competition?.name ?? text.choose}
          aria-label={label}
          // The slot keeps the app's legacy rules for a plain button off it (see `button:not([data-slot])` in App.css).
          data-slot="picker-trigger"
        >
          <span className="picker-value">{shownLabel}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 8 5 5 5-5" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="picker-popover standings-picker-popover"
        onOpenAutoFocus={(event) => {
          // The search is what the list opened for: the caret goes to its box, not to the first choice.
          event.preventDefault();
          box.current?.focus();
        }}
      >
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
            aria-controls={`${base}-list`}
            aria-activedescendant={lines.length > 0 ? lineId(active) : undefined}
            value={query}
            placeholder={pickerText.search}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={keys}
          />
        </label>
        <ul ref={list} id={`${base}-list`} className="picker-list standings-picker-list" role="listbox" aria-label={label}>
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
      </PopoverContent>
    </Popover>
  );
}
