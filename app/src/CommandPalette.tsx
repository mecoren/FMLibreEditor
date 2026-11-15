// The command palette: one box over the window that finds players, staff and clubs all at once, and the app's commands
// with them. It opens with Ctrl+K (Command+K on macOS) or the Search button of the masthead. The arrows move through
// what it found, Enter or a click opens it, and Escape closes the box. Focus stays in the box throughout.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { rowMenuProps } from "./EntityRowMenu";
import { describeError, fold } from "./format";
import {
  clubListText,
  jobLabel,
  paletteText,
  playerListText,
  positionLabel,
  profileText,
  staffListText,
} from "./labels";
import { ClubLogo, PersonFace, PICTURE_SIZE } from "./Picture";
import { isMac, shortcutKeys, type Shortcut } from "./shortcuts";
import type { ClubPage, ClubSummary, PlayerPage, PlayerSummary, StaffPage, StaffSummary } from "./types";
import { useModal } from "./useModal";

const text = paletteText;

/** How many players, members of staff and clubs the box shows each. */
const RESULT_LIMIT = 5;

/** How long the search waits after the last key, so that a burst of keys asks the game once. */
const SEARCH_DELAY = 150;

/** How many positions a player's line shows. */
const POSITIONS_SHOWN = 3;

/** Something the app can do, as the palette lists it. */
export interface Command {
  id: string;
  label: string;
  /** The keys that do the same without the palette. */
  shortcut?: Shortcut;
  run: () => void;
}

/** A player, a member of staff or a club the palette found, as the row its list would have for it. */
export type Found =
  | { kind: "player"; row: PlayerSummary }
  | { kind: "staff"; row: StaffSummary }
  | { kind: "club"; row: ClubSummary };

/** The lists the palette searches. */
export type FoundKind = Found["kind"];

/** The names of the lists, as their tabs have them. */
const LIST_NAMES: Record<FoundKind, string> = {
  player: playerListText.nav,
  staff: staffListText.nav,
  club: clubListText.nav,
};

/** What the three searches answered for the text they were asked with; a search that failed left null. */
interface Answer {
  query: string;
  players: PlayerPage | null;
  staff: StaffPage | null;
  clubs: ClubPage | null;
  /** Why the first of the failed searches failed. */
  error: string | null;
}

/** One line of the box. */
type Item =
  | { type: "command"; key: string; command: Command }
  | { type: "found"; key: string; found: Found }
  /** The line under the people or clubs found that opens their list with the same search. */
  | { type: "all"; key: string; kind: FoundKind; total: number };

interface Section {
  key: string;
  heading: string;
  items: Item[];
}

/** Scripts written without spaces between words: what is typed is looked for anywhere in a command's name. */
const UNSPACED = /[぀-ヿ㐀-鿿가-힯]/;

/**
 * Whether a command called `label` matches what is typed: every word typed starts one of the label's words, whatever
 * the case and the accents. "sta" finds "Go to Staff", and "st" does not find "Search this list".
 */
function matchesCommand(label: string, query: string): boolean {
  const name = fold(label);
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => (UNSPACED.test(part) ? name.includes(part) : words.some((word) => word.startsWith(part))));
}

/** The keys of a shortcut, each in its own key cap. */
export function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="keys">
      {shortcutKeys(shortcut).map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}

/** The magnifying glass of the search boxes. */
export function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4.5 4.5" />
    </svg>
  );
}

/** The mark before a command: an arrow in the box a face or a logo takes in the other lines. */
function CommandMark() {
  return (
    <span className="palette-mark" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <path d="M5 10h10m-4-4.5 4.5 4.5-4.5 4.5" />
      </svg>
    </span>
  );
}

/** A club at the end of a person's line: its logo and its name; with no club, `none` if there is something to say. */
function ClubNote({ uid, name, none }: { uid: number | null; name: string | null; none: string | null }) {
  if (name === null) {
    return none === null ? null : <span className="palette-note">{none}</span>;
  }
  return (
    <span className="palette-note">
      <ClubLogo uid={uid} name={name} size={PICTURE_SIZE.rowLogo} />
      <span className="palette-note-text">{name}</span>
    </span>
  );
}

/** A name with a quieter line under it, when there is one. */
function NameLines({ name, sub }: { name: ReactNode; sub?: string }) {
  return (
    <span className="palette-lines">
      <span className="palette-name">{name}</span>
      {sub && <span className="palette-sub">{sub}</span>}
    </span>
  );
}

/** What a line shows. */
function ItemLine({ item }: { item: Item }) {
  if (item.type === "command") {
    return (
      <>
        <CommandMark />
        <NameLines name={item.command.label} />
        {item.command.shortcut && <Keys shortcut={item.command.shortcut} />}
      </>
    );
  }
  if (item.type === "all") {
    return (
      <>
        <CommandMark />
        <NameLines name={text.showAll(item.total, LIST_NAMES[item.kind])} />
      </>
    );
  }
  const { found } = item;
  if (found.kind === "player") {
    const player = found.row;
    return (
      <>
        <PersonFace uid={player.uid} name={player.name} size={PICTURE_SIZE.rowFace} />
        <NameLines name={player.name} sub={player.positions.slice(0, POSITIONS_SHOWN).map(positionLabel).join(", ")} />
        <ClubNote uid={player.clubUid} name={player.club} none={profileText.freeAgent} />
      </>
    );
  }
  if (found.kind === "staff") {
    const member = found.row;
    return (
      <>
        <PersonFace uid={member.uid} name={member.name} size={PICTURE_SIZE.rowFace} />
        <NameLines name={member.name} sub={member.job === null ? undefined : jobLabel(member.job)} />
        {/* As the staff list has it: "Unemployed" with no job at all, and nothing for a job at a club that is unknown. */}
        <ClubNote
          uid={member.clubUid}
          name={member.club}
          none={member.job === null ? profileText.unemployed : null}
        />
      </>
    );
  }
  const club = found.row;
  return (
    <>
      <ClubLogo uid={club.uid} name={club.name} size={PICTURE_SIZE.rowFace} />
      <NameLines
        name={
          <>
            {club.name}
            {club.women && <span className="tag women">{clubListText.women}</span>}
          </>
        }
      />
    </>
  );
}

interface CommandPaletteProps {
  /** What the app can do at the moment, in the order the box lists it. */
  commands: readonly Command[];
  /** Whether the game's people and clubs can be searched: without a connection, the box finds commands only. */
  connected: boolean;
  /** A command was picked. The box does not close itself: whoever runs the command closes it first. */
  onRun: (command: Command) => void;
  /** A player, a member of staff or a club was picked. */
  onOpen: (found: Found) => void;
  /** The line that opens a list with what is typed as its search was picked. */
  onShowAll: (kind: FoundKind, query: string) => void;
  onClose: () => void;
}

export function CommandPalette({ commands, connected, onRun, onOpen, onShowAll, onClose }: CommandPaletteProps) {
  const base = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const keyboardMoved = useRef(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [active, setActive] = useState(0);
  const term = query.trim();
  const searching = connected && term !== "";

  useModal(box, true, onClose);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // The three lists are asked a moment after the last key; an answer that comes after the text changed is dropped.
  useEffect(() => {
    if (!searching) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ask = { query: term, limit: RESULT_LIMIT };
      const [players, staff, clubs] = await Promise.allSettled([
        call<PlayerPage>("search_players", ask),
        call<StaffPage>("search_staff", ask),
        call<ClubPage>("search_clubs", ask),
      ]);
      if (cancelled) {
        return;
      }
      const failed = [players, staff, clubs].find((result) => result.status === "rejected");
      setAnswer({
        query: term,
        players: players.status === "fulfilled" ? players.value : null,
        staff: staff.status === "fulfilled" ? staff.value : null,
        clubs: clubs.status === "fulfilled" ? clubs.value : null,
        error: failed ? describeError(failed.reason) : null,
      });
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searching, term]);

  // The answer on show while the search has not answered for what is typed now: it stays, dimmed, as a list does.
  const shown = searching ? answer : null;
  const settled = !searching || answer?.query === term;

  const sections = useMemo(() => {
    const built: Section[] = [];
    const matching = commands.filter((command) => matchesCommand(command.label, term));
    if (matching.length > 0) {
      built.push({
        key: "commands",
        heading: text.commands,
        items: matching.map((command) => ({ type: "command", key: command.id, command })),
      });
    }
    const people = <Row extends { uid: number }>(
      kind: FoundKind,
      page: { total: number; rows: Row[] } | null,
      wrap: (row: Row) => Found,
    ) => {
      if (page === null || page.rows.length === 0) {
        return;
      }
      const items: Item[] = page.rows.map((row) => ({ type: "found", key: `${kind}-${row.uid}`, found: wrap(row) }));
      if (page.total > page.rows.length) {
        items.push({ type: "all", key: `${kind}-all`, kind, total: page.total });
      }
      built.push({ key: kind, heading: LIST_NAMES[kind], items });
    };
    if (shown !== null) {
      people("player", shown.players, (row) => ({ kind: "player", row }));
      people("staff", shown.staff, (row) => ({ kind: "staff", row }));
      people("club", shown.clubs, (row) => ({ kind: "club", row }));
    }
    return built;
  }, [commands, term, shown]);

  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  // The line Enter picks: the one the arrows or the pointer chose, or the last one when the list has grown shorter.
  const current = Math.min(active, items.length - 1);
  const optionId = (index: number) => `${base}-option-${index}`;

  useEffect(() => {
    if (keyboardMoved.current) {
      keyboardMoved.current = false;
      list.current?.querySelector(`[id="${base}-option-${current}"]`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [base, current]);

  const pick = (item: Item) => {
    if (item.type === "command") {
      onRun(item.command);
    } else if (item.type === "found") {
      onOpen(item.found);
    } else {
      onShowAll(item.kind, term);
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows move through the lines, not the caret.
      event.preventDefault();
      if (items.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        keyboardMoved.current = true;
        setActive((current + step + items.length) % items.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[current];
      // Enter waits for the search to answer for what is typed: the first line is then the best match of it. A
      // command needs no search.
      if (item && (settled || item.type === "command")) {
        pick(item);
      }
    }
  };

  const note = !connected
    ? text.notConnected
    : !searching
      ? ""
      : shown === null
        ? text.searching
        : !settled
          ? ""
          : shown.error !== null
            ? text.failed(shown.error)
            : items.length === 0
              ? text.empty(term)
              : "";
  const noteIsError = connected && searching && settled && shown !== null && shown.error !== null;

  let index = 0;
  return createPortal(
    // A click beside the box closes it, as Escape does.
    <div
      className="modal-backdrop palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div ref={box} className="palette" role="dialog" aria-modal="true" aria-label={text.title}>
        <label className="palette-search">
          <SearchIcon />
          <input
            ref={input}
            role="combobox"
            aria-label={text.title}
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
            aria-controls={`${base}-list`}
            aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
            value={query}
            placeholder={connected ? text.placeholder : text.placeholderCommands}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={keyDown}
          />
        </label>
        <div ref={list} className="palette-body">
          <div
            id={`${base}-list`}
            className="palette-list"
            role="listbox"
            aria-label={text.title}
            aria-busy={!settled || undefined}
          >
            {sections.map((section) => (
              <div
                key={section.key}
                className="palette-section"
                role="group"
                aria-labelledby={`${base}-${section.key}`}
              >
                <div id={`${base}-${section.key}`} className="palette-heading" role="presentation">
                  {section.heading}
                </div>
                {section.items.map((item) => {
                  const at = index++;
                  return (
                    <div
                      key={item.key}
                      {...(item.type === "found"
                        ? rowMenuProps(item.found.kind, item.found.row.name, item.found.row.uid)
                        : {})}
                      id={optionId(at)}
                      className={at === current ? "palette-option active" : "palette-option"}
                      role="option"
                      aria-selected={at === current}
                      // Focus stays in the search box: a click only picks.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => setActive(at)}
                      onClick={() => pick(item)}
                    >
                      <ItemLine item={item} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className={noteIsError ? "palette-status error" : "palette-status"} role="status">
            {note}
          </p>
        </div>
        <footer className="palette-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {text.hintMove}
          </span>
          <span>
            <kbd>{isMac ? "↵" : text.keys.enter}</kbd>
            {text.hintOpen}
          </span>
          <span>
            <kbd>{isMac ? "esc" : text.keys.escape}</kbd>
            {text.hintClose}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
