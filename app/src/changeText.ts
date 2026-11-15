// What a logged change says, worded for the Changes view: the text of its Change column, the value before and the value
// written as shown, and the notes under them. The rows of the list and the export of the log both read it, so that the
// file holds what the list shows.

import { clauseLine } from "./ClauseList";
import { valueText } from "./editDraft";
import { dateFromNumber, shownValue } from "./editing";
import { formatDate, formatIsoLocal, formatMoney, formatNumber } from "./format";
import {
  changesText as text,
  editText,
  fieldLabel,
  jobLabel,
  profileText,
  swapNote,
  teamLabel,
  valueChange,
} from "./labels";
import { ruleLabel } from "./TiesGroup";
import type { ChangeExportRow, Clause, EditField, LoggedChange } from "./types";

/** What the Changes view says of one change. */
export interface ChangeWords {
  /** What the Change column says: "17 → 20", "Arsenal → Chelsea", "Healed 2 injuries". */
  text: string;
  /** The value before and the value written, as shown: "17" and "20", "Arsenal" and "Chelsea". */
  from: string;
  to: string;
  /** What is said under it: the other player of a swap, a fee, the team of a captaincy. */
  notes: string[];
}

/** One side of a change to a player's tie: the nation or club, and a training's rule; "None" for no tie. */
function tieEnd(end: { name: string; rule: number | null } | null): string {
  if (end === null) {
    return profileText.none;
  }
  return end.rule === null ? end.name : `${end.name} · ${ruleLabel(end.rule)}`;
}

/** One side of a change to a contract clause: its name, what it depends on and its amount; "None" for no clause. */
function clauseEnd(clause: Clause | null): string {
  return clause === null ? profileText.none : clauseLine(clause);
}

/**
 * What a captaincy says under its values: the team, unless it is the first one, and when the two captains swapped, who
 * holds the other role now. The log knows the team only by its place in the club's list, so it is named by that.
 */
function captaincyNotes({ captaincy, field }: LoggedChange): string[] {
  if (!captaincy) {
    return [];
  }
  const notes: string[] = [];
  if (captaincy.team !== 0) {
    notes.push(teamLabel({ index: captaincy.team, kind: captaincy.kind, ageLimit: captaincy.ageLimit }));
  }
  if (captaincy.swapped) {
    notes.push(swapNote(field === "captain" ? "captain" : "viceCaptain", captaincy.from));
  }
  return notes;
}

/** What is said under a change's values: a swap, a release made to make room, a fee, an option taken away, a captaincy's team. */
function notesOf(change: LoggedChange): string[] {
  const { moved, recall } = change;
  const notes: string[] = [];
  if (moved?.with !== undefined) {
    notes.push(text.swappedWith(moved.with));
  }
  if (moved?.released !== undefined) {
    notes.push(text.released(moved.released));
  }
  if (moved?.fee !== undefined) {
    notes.push(text.fee(formatMoney(moved.fee)));
  }
  if (recall !== undefined) {
    notes.push(text.optionRemoved(formatMoney(recall.optionFee)));
  }
  return [...notes, ...captaincyNotes(change)];
}

/**
 * The words of `change`; `field` is its entry in the field table, to turn stored values into shown ones and to tell a
 * date or an amount of money from a plain number (none when the table lacks it, or has not been read yet).
 *
 * A move to another club is logged with the clubs' UIDs as its values: their names say more (a release has no new
 * club: he became a free agent), and so do the players' for a captaincy. A heal is logged as a change of his injuries
 * from how many he had to none, and lifting his bans as one of his bans: "Healed 2 injuries" says it better than
 * "2 → 0". Keeping him from retiring is logged with the date he was to retire on, which it names. No club is a free
 * agent's for a player, and unemployed for a member of staff.
 */
export function changeWords(change: LoggedChange, field: EditField | undefined): ChangeWords {
  const notes = notesOf(change);
  const sides = (from: string, to: string): ChangeWords => ({ text: valueChange(from, to), from, to, notes });
  const noClub = change.entity === "staff" ? profileText.unemployed : profileText.freeAgent;
  const unknownObject = change.field === "nation" ? editText.unknownNation : editText.unknownCity;
  const shown = (stored: number) => (field ? shownValue(field, stored) : stored);

  if (change.moved) {
    return sides(change.moved.from ?? noClub, change.moved.to ?? noClub);
  }
  if (change.captaincy) {
    return sides(change.captaincy.from ?? profileText.none, change.captaincy.to);
  }
  if (change.tie) {
    return sides(tieEnd(change.tie.from), tieEnd(change.tie.to));
  }
  if (change.clause) {
    return sides(clauseEnd(change.clause.from), clauseEnd(change.clause.to));
  }
  if (change.stadium) {
    return sides(change.stadium.from, change.stadium.to);
  }
  if (change.personName) {
    return sides(change.personName.from ?? profileText.none, change.personName.to ?? profileText.none);
  }
  if (change.objects) {
    return sides(change.objects.from ?? unknownObject, change.objects.to ?? unknownObject);
  }
  switch (change.field) {
    case "injuries":
      return { ...sides(formatNumber(change.old), formatNumber(change.new)), text: text.healed(change.old) };
    case "bans":
      return { ...sides(formatNumber(change.old), formatNumber(change.new)), text: text.lifted(change.old) };
    case "retirement": {
      const day = (value: number) => (value === 0 ? null : formatDate(dateFromNumber(value)));
      return {
        ...sides(day(change.old) ?? profileText.none, day(change.new) ?? profileText.none),
        text: text.keptPlaying(day(change.old)),
      };
    }
    case "contract.job":
      return sides(jobLabel(change.old), jobLabel(change.new));
    default:
      return sides(valueText(field, shown(change.old)), valueText(field, shown(change.new)));
  }
}

/** `change` as a row of the export of the log: the values as stored, and the texts as the list shows them. */
export function exportRow(change: LoggedChange, field: EditField | undefined): ChangeExportRow {
  const words = changeWords(change, field);
  return {
    time: formatIsoLocal(change.at),
    name: change.name,
    uid: change.uid,
    entity: change.entity,
    field: change.field,
    fieldLabel: fieldLabel(change.entity, change.field),
    old: change.old,
    new: change.new,
    oldShown: words.from,
    newShown: words.to,
    notes: words.notes.join(" | "),
    batch: change.batch,
    undoneAt: change.undoneAt === null ? null : formatIsoLocal(change.undoneAt),
    earlier: change.earlier,
    inGame: change.inGame,
  };
}
