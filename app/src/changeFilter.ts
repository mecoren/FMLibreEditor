// What the Changes view filters by, and which changes of the log pass: a search text, and three more choices (this
// session or earlier ones, only what is not undone, only what the game does not hold). The search looks for whose
// change it is (a name, a UID), the field it changed, and the names the change involves (the clubs of a move, the
// names of a rename); it ignores case and accents, as the lists' searches do.

import { fold } from "./format";
import { fieldLabel } from "./labels";
import { isRecord } from "./restore";
import type { LoggedChange, SessionChoice } from "./types";

export const SESSION_CHOICES: readonly SessionChoice[] = ["all", "this", "earlier"];

/** What the filter inputs of the view hold. */
export interface ChangeFilter {
  /** What was typed in the search box. */
  query: string;
  session: SessionChoice;
  /** Only changes that are not undone. */
  notUndone: boolean;
  /** Only earlier changes that are not undone and that the game did not hold when the data was last read. */
  notInGame: boolean;
}

export const NO_CHANGE_FILTER: ChangeFilter = { query: "", session: "all", notUndone: false, notInGame: false };

/** The most a search text holds, however a stored value got there. */
const MAX_QUERY = 200;

/** A filter from a stored value (what the reload for another language left); what is missing or wrong is no filter. */
export function readChangeFilter(value: unknown): ChangeFilter {
  if (!isRecord(value)) {
    return NO_CHANGE_FILTER;
  }
  return {
    query: typeof value.query === "string" ? value.query.slice(0, MAX_QUERY) : "",
    session: SESSION_CHOICES.find((choice) => choice === value.session) ?? "all",
    notUndone: value.notUndone === true,
    notInGame: value.notInGame === true,
  };
}

/** Whether the search box holds something to look for: spaces are nothing. */
export const isSearching = (filter: ChangeFilter): boolean => filter.query.trim() !== "";

/** Whether the filter leaves out any change. */
export const isFiltering = (filter: ChangeFilter): boolean =>
  isSearching(filter) || filter.session !== "all" || filter.notUndone || filter.notInGame;

/** Whether the game did not hold what an earlier change wrote when the data was last read, and the change stands. */
export const isNotInGame = (change: LoggedChange): boolean =>
  change.earlier && change.undoneAt === null && change.inGame === false;

/**
 * What a search looks through for `change`, folded: the name, the field's name and its key, and the names the change
 * involves: the clubs of a move (and the other player of a swap, the one released to make room), the players of a
 * captaincy, the nations and clubs of a tie, a stadium's, a person's or a nation's or city's names. Not its values.
 * Separate names are apart by a line break, which a word of the search never holds.
 */
function searchTextOf(change: LoggedChange): string {
  const { moved, captaincy, tie, stadium, personName, objects } = change;
  const parts = [
    change.name,
    fieldLabel(change.entity, change.field),
    change.field,
    moved?.from,
    moved?.to,
    moved?.with,
    moved?.released,
    captaincy?.from,
    captaincy?.to,
    tie?.from?.name,
    tie?.to?.name,
    stadium?.from,
    stadium?.to,
    personName?.from,
    personName?.to,
    objects?.from,
    objects?.to,
  ];
  return fold(parts.filter((part) => part !== undefined && part !== null && part !== "").join("\n"));
}

/**
 * What a search looks through for each change of `log`, in its order. Worked out once for a log, not for each key
 * typed: a log may hold many thousands of changes.
 */
export function searchTexts(log: readonly LoggedChange[]): string[] {
  return log.map(searchTextOf);
}

/**
 * Which changes of `log` pass `filter`, in the order of the log; null where the filter leaves none out. A search text
 * is words that each must be in the text of the change, or a whole number that is the UID of the person or club, as
 * in the lists. `texts` are those of `searchTexts` for the same log, needed only while a search text is in effect.
 */
export function passingChanges(
  log: readonly LoggedChange[],
  texts: readonly string[] | null,
  filter: ChangeFilter,
): boolean[] | null {
  if (!isFiltering(filter)) {
    return null;
  }
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  const uid = /^\d+$/.test(filter.query.trim()) ? Number(filter.query.trim()) : null;
  return log.map((change, at) => {
    if (filter.session !== "all" && (filter.session === "earlier") !== change.earlier) {
      return false;
    }
    if (filter.notUndone && change.undoneAt !== null) {
      return false;
    }
    if (filter.notInGame && !isNotInGame(change)) {
      return false;
    }
    if (words.length === 0 || (uid !== null && change.uid === uid)) {
      return true;
    }
    const text = texts?.[at] ?? searchTextOf(change);
    return words.every((word) => text.includes(word));
  });
}
