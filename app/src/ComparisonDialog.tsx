// The comparison of players: a dialog with one column per player and the rows grouped like the profile (attributes,
// hidden ratings, feet, personality, then positions and contract). The best value of a row is highlighted.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ability } from "./Ability";
import { rowMenuProps } from "./EntityRowMenu";
import { call } from "./api";
import { describeError, formatDate, formatMoney } from "./format";
import {
  ATTRIBUTE_LABELS,
  comparisonText as text,
  fieldLabel,
  positionLabel,
  profileText,
  type AttributeKey,
} from "./labels";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { FEET, GOALKEEPING, HIDDEN, isGoalkeeper, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { tierOf } from "./PositionPitch";
import {
  attributeRow,
  LOWER_IS_BETTER,
  personalityRows,
  ReputationMeter,
  tierClass,
  type Loaded,
  type RatingRow,
} from "./ProfileParts";
import type { PlayerDetails } from "./types";
import type { ComparedPlayer } from "./useComparison";
import { useModal } from "./useModal";

/** A column of the table: a player, and what the game says about them, or why it could not say. */
export type Column = { player: ComparedPlayer } & Loaded<PlayerDetails>;

/**
 * What the game says about each player, all asked at once. Null until every answer is in; one that failed is the
 * error of its own column only. Nothing is asked for fewer than two players.
 */
function useColumns(players: readonly ComparedPlayer[]): Column[] | null {
  const [columns, setColumns] = useState<Column[] | null>(null);

  useEffect(() => {
    if (players.length < 2) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      players.map(async (player): Promise<Column> => {
        try {
          return { player, details: await call<PlayerDetails>("player_details", { uid: player.uid }) };
        } catch (e) {
          return { player, error: describeError(e) };
        }
      }),
    ).then((loaded) => {
      if (!cancelled) {
        setColumns(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [players]);

  return columns;
}

interface ComparisonDialogProps {
  /** The players as they were when the dialog was opened: the list cannot change while it is up. */
  players: readonly ComparedPlayer[];
  onClose: () => void;
}

/** The dialog: the players side by side in a table, or a note that it takes two players at least. */
export function ComparisonDialog({ players, onClose }: ComparisonDialogProps) {
  const titleId = useId();
  const noteId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const columns = useColumns(players);
  const enough = players.length >= 2;

  useModal(dialog, true, onClose);

  useEffect(() => {
    dialog.current?.focus();
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
        className="modal compare-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        aria-busy={(enough && columns === null) || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{text.title}</h2>
          {enough && (
            <p id={noteId} className="compare-hint">
              {text.hint}
            </p>
          )}
        </header>

        <div className="modal-body">
          {!enough && (
            <p id={noteId} className="compare-status">
              {text.tooFew}
            </p>
          )}
          {enough && columns === null && (
            <p className="compare-status" role="status">
              {text.loading}
            </p>
          )}
          {enough && columns !== null && (
            <div className="compare-wrap" role="region" aria-label={text.tableLabel} tabIndex={0}>
              <ComparisonTable columns={columns} />
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="compare-close" onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** One row of ratings: the same rating of every column; nothing for a column whose player could not be read. */
interface RatingLine {
  key: string;
  label: string;
  /** A low value is the good one (see `LOWER_IS_BETTER`): the colours and the highlight run the other way. */
  lowerIsBetter: boolean;
  cells: (RatingRow | undefined)[];
}

/** A group of rating rows under a heading. */
interface RatingSection {
  id: string;
  title: string;
  lines: RatingLine[];
}

function attributeLines(columns: readonly Column[], keys: readonly AttributeKey[]): RatingLine[] {
  return keys.map((key) => {
    const lowerIsBetter = LOWER_IS_BETTER.has(key);
    const label = ATTRIBUTE_LABELS[key];
    return {
      key,
      label,
      lowerIsBetter,
      cells: columns.map(
        (column) => column.details && attributeRow(key, label, column.details.attributes[key], { lowerIsBetter }),
      ),
    };
  });
}

function personalityLines(columns: readonly Column[]): RatingLine[] {
  const rows = columns.map((column) => column.details && personalityRows(column.details.personality));
  // Every player has the same rows in the same order: an empty record gives their keys and names.
  return personalityRows({}).map((row, index) => ({
    key: row.key,
    label: row.label,
    lowerIsBetter: row.lowerIsBetter ?? false,
    cells: rows.map((own) => own?.[index]),
  }));
}

/**
 * The rating groups of the table, as the profile has them. Goalkeeping is there when any of the players is a goalkeeper
 * (by the rule of the profile, see `isGoalkeeper`), and takes the place of Technical when all of them are. With both
 * kinds of player side by side the two groups are both there, and Goalkeeping leaves out the two attributes that
 * Technical already shows.
 */
function ratingSections(columns: readonly Column[]): RatingSection[] {
  const loaded = columns.flatMap((column) => (column.details ? [column.details] : []));
  const keepers = loaded.filter(isGoalkeeper).length;
  const onlyKeepers = loaded.length > 0 && keepers === loaded.length;
  const goalkeeping = onlyKeepers ? GOALKEEPING : GOALKEEPING.filter((key) => !TECHNICAL.includes(key));

  const sections: RatingSection[] = [];
  if (!onlyKeepers) {
    sections.push({ id: "technical", title: profileText.technical, lines: attributeLines(columns, TECHNICAL) });
  }
  if (keepers > 0) {
    sections.push({ id: "goalkeeping", title: profileText.goalkeeping, lines: attributeLines(columns, goalkeeping) });
  }
  sections.push(
    { id: "mental", title: profileText.mental, lines: attributeLines(columns, MENTAL) },
    { id: "physical", title: profileText.physical, lines: attributeLines(columns, PHYSICAL) },
    { id: "hidden", title: profileText.hidden, lines: attributeLines(columns, HIDDEN) },
    { id: "feet", title: profileText.feet, lines: attributeLines(columns, FEET) },
    { id: "personality", title: profileText.personality, lines: personalityLines(columns) },
  );
  return sections;
}

const NO_COLUMNS: ReadonlySet<number> = new Set();

/**
 * The columns that have the best value of a row: the highest, or the lowest where lower is better. A column without a
 * value does not count; nobody is marked unless two columns have one and the values are not all the same.
 */
export function bestColumns(values: readonly (number | undefined)[], lowerIsBetter = false): ReadonlySet<number> {
  const known = values.flatMap((value, column) =>
    value === undefined ? [] : [{ column, score: lowerIsBetter ? -value : value }],
  );
  if (known.length < 2) {
    return NO_COLUMNS;
  }
  const top = Math.max(...known.map((entry) => entry.score));
  if (known.every((entry) => entry.score === top)) {
    return NO_COLUMNS;
  }
  return new Set(known.filter((entry) => entry.score === top).map((entry) => entry.column));
}

/** What the highlight of a row says for assistive technology: the highest value, or the lowest if lower is better. */
type Mark = "highest" | "lowest";

/** A cell of a row; the best one of the row is marked with the accent colour, and says so to assistive technology. */
function Cell({ mark, title, children }: { mark?: Mark; title?: string; children: ReactNode }) {
  return (
    <td className={mark ? "compare-cell best" : "compare-cell"} title={title}>
      {children}
      {mark && <span className="sr-only"> ({text[mark]})</span>}
    </td>
  );
}

const missing = <span className="muted">{profileText.none}</span>;

/** The heading of a group of rows: one cell across the whole table, which names the rows below it. */
function SectionHeading({ title, span }: { title: string; span: number }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={span} className="compare-group">
        {title}
      </th>
    </tr>
  );
}

/** A group of ratings: its heading, and a row for each rating with the best value of the row marked. */
function RatingBody({ section, columns }: { section: RatingSection; columns: readonly Column[] }) {
  return (
    <tbody>
      <SectionHeading title={section.title} span={columns.length + 1} />
      {section.lines.map((line) => {
        const best = bestColumns(
          line.cells.map((cell) => cell?.value),
          line.lowerIsBetter,
        );
        return (
          <tr key={line.key}>
            <th scope="row" title={line.lowerIsBetter ? profileText.lowerIsBetter : undefined}>
              {line.label}
            </th>
            {line.cells.map((cell, index) => (
              <Cell
                key={columns[index].player.uid}
                mark={best.has(index) ? (line.lowerIsBetter ? "lowest" : "highest") : undefined}
                title={cell?.title}
              >
                <span
                  className={cell?.value === undefined ? "value" : `value ${tierClass(cell.value, line.lowerIsBetter)}`}
                >
                  {cell?.value ?? profileText.none}
                </span>
              </Cell>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

/** The positions a player can play (rated 15 or more), best first, each with its rating and the colour of its band. */
function PositionList({ details }: { details: PlayerDetails }) {
  if (details.positions.length === 0) {
    return missing;
  }
  return (
    <ul className="compare-positions">
      {details.positions.map((key) => {
        const rating = details.positionRatings[key] ?? 0;
        const tier = tierOf(rating);
        const label = positionLabel(key);
        return (
          <li
            key={key}
            className={`pos-${tier}`}
            title={profileText.positionTooltip(label, rating, profileText.positionTiers[tier])}
          >
            {label} <span className="compare-rating">{rating}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface NumberRowProps {
  label: string;
  columns: readonly Column[];
  /** The number of each column, which is also what the highest of them is picked from; nothing where there is none. */
  values: readonly (number | undefined)[];
  show: (value: number) => ReactNode;
}

/** A row of one number per player, the highest of them marked. */
function NumberRow({ label, columns, values, show }: NumberRowProps) {
  const best = bestColumns(values);
  return (
    <tr>
      <th scope="row">{label}</th>
      {values.map((value, index) => (
        <Cell key={columns[index].player.uid} mark={best.has(index) ? "highest" : undefined}>
          {value === undefined ? missing : show(value)}
        </Cell>
      ))}
    </tr>
  );
}

/** Positions, height, reputation and contract: the rows that are not ratings out of 20. */
function ProfileBody({ columns }: { columns: readonly Column[] }) {
  const details = columns.map((column) => column.details);
  return (
    <tbody>
      <SectionHeading title={text.profile} span={columns.length + 1} />
      <tr>
        <th scope="row">{profileText.positions}</th>
        {columns.map((column) => (
          <td key={column.player.uid} className="compare-cell">
            {column.details ? <PositionList details={column.details} /> : missing}
          </td>
        ))}
      </tr>
      <NumberRow
        label={fieldLabel("player", "height")}
        columns={columns}
        // The game has no height for some players: it stores 0.
        values={details.map((own) => (own && own.heightCm > 0 ? own.heightCm : undefined))}
        show={(value) => <span className="compare-figure">{value}</span>}
      />
      <NumberRow
        label={fieldLabel("player", "reputation.current")}
        columns={columns}
        values={details.map((own) => own?.reputation.current)}
        show={(value) => <ReputationMeter value={value} />}
      />
      <NumberRow
        label={fieldLabel("player", "contract.wage")}
        columns={columns}
        values={details.map((own) => own?.contract?.wage)}
        show={(value) => <span className="compare-figure">{formatMoney(value)}</span>}
      />
      <tr>
        <th scope="row">{fieldLabel("player", "contract.expires")}</th>
        {columns.map((column) => (
          <td key={column.player.uid} className="compare-cell">
            {formatDate(column.details?.contract?.expires ?? null) || missing}
          </td>
        ))}
      </tr>
    </tbody>
  );
}

/** What heads a column: the face, name, club, age and abilities; or, when the player could not be read, the error. */
function ColumnHead({ column }: { column: Column }) {
  const { player, details, error } = column;
  const name = details?.name ?? player.name;
  return (
    <th scope="col" className="compare-head" {...rowMenuProps("player", player.name, player.uid)}>
      <div className="compare-head-box">
        <PersonFace uid={player.uid} name={name} size={PICTURE_SIZE.columnFace} />
        <div
          className="compare-name"
          title={details?.fullName && details.fullName !== name ? `${name}\n${details.fullName}` : undefined}
        >
          {name}
        </div>
        {details ? (
          <>
            <div className="compare-club">
              {details.club === null ? (
                <span className="muted">{profileText.freeAgent}</span>
              ) : (
                <WithPicture
                  inline
                  picture={<ClubLogo uid={details.clubUid} name={details.club} size={PICTURE_SIZE.textLogo} />}
                >
                  {details.club}
                </WithPicture>
              )}
            </div>
            <div className="compare-age">{details.age === null ? profileText.none : profileText.age(details.age)}</div>
            <div className="compare-abilities">
              <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
              <Ability value={details.currentAbility} />
              <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
              <Ability value={details.potentialAbility} />
            </div>
          </>
        ) : (
          <div className="compare-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </th>
  );
}

/**
 * The players side by side: a table with the players as its columns, and the ratings, positions and contract as its
 * rows. A player whose profile could not be read has an error for a head and dashes under it; the others are shown.
 */
export function ComparisonTable({ columns }: { columns: readonly Column[] }) {
  return (
    <table className="compare-grid" style={{ "--columns": columns.length } as CSSProperties}>
      <thead>
        <tr>
          {/* The corner: it heads nothing, so it is a plain cell. */}
          <td className="compare-corner" />
          {columns.map((column) => (
            <ColumnHead key={column.player.uid} column={column} />
          ))}
        </tr>
      </thead>
      {ratingSections(columns).map((section) => (
        <RatingBody key={section.id} section={section} columns={columns} />
      ))}
      <ProfileBody columns={columns} />
    </table>
  );
}
