// The table of players the scout found, as the lists of opportunities and the players like one show them: the scout's
// order, the player and his club, his age and abilities, what the list adds of its own, his fit, how likely he is to
// join and what he would cost, and the actions on him. Any column with a title sorts it.

import type { ReactNode } from "react";
import { formatMoney, formatPercent } from "./format";
import { scoutingText as text } from "./labels";
import { ClubLine, FitBar, PlayerName, ProbabilityInfo, reasonText, RowActions, type RowHandlers, shortMoney, signed } from "./ScoutParts";
import { type FoundSort, nextOrder, type Ranked } from "./scoutSort";
import { type ColumnOrder, SortHeader } from "./SortHeader";
import type { PlayerSummary, Suggestion } from "./types";

/** A column a list adds of its own. */
export interface ExtraColumn<T> {
  key: string;
  label: ReactNode;
  /** The column it sorts by, when it sorts. */
  sort?: FoundSort;
  title?: string;
  className?: string;
  cell: (row: T) => ReactNode;
}

interface FoundTableProps<T extends Suggestion> {
  rows: Ranked<T>[];
  order: ColumnOrder<FoundSort>;
  onOrder: (order: ColumnOrder<FoundSort>) => void;
  onOpen: (player: PlayerSummary) => void;
  /** The columns after the abilities, and after the money. */
  middle?: ExtraColumn<T>[];
  end?: ExtraColumn<T>[];
  actions: (row: T) => RowHandlers;
  className?: string;
}

const level = (probability: number) => (probability >= 70 ? "good" : probability >= 50 ? "ok" : "poor");

/** The hover of the fee and wage: the amounts in full, and his transfer value. */
const moneyTitle = (s: Suggestion) =>
  [
    s.fee !== null && `${text.columns.fee}: ${formatMoney(s.fee)}`,
    s.wage !== null && `${text.columns.wage}: ${formatMoney(s.wage)}${text.perWeek}`,
    s.value !== null && `${text.columns.value}: ${formatMoney(s.value)}`,
  ]
    .filter(Boolean)
    .join("\n") || undefined;

export function FoundTable<T extends Suggestion>({
  rows,
  order,
  onOrder,
  onOpen,
  middle = [],
  end = [],
  actions,
  className,
}: FoundTableProps<T>) {
  const header = (by: FoundSort, label: string, headClass?: string, extra?: ReactNode) => (
    <SortHeader
      key={by}
      by={by}
      order={order}
      onSort={(column) => onOrder(nextOrder(order, column))}
      label={label}
      title={text.sortBy(text.sortNames[by])}
      className={headClass}
    >
      {extra}
    </SortHeader>
  );
  const extraHeader = (column: ExtraColumn<T>) =>
    column.sort && typeof column.label === "string" ? (
      header(column.sort, column.label, column.className)
    ) : (
      <th key={column.key} className={column.className} title={column.title}>
        {column.label}
      </th>
    );

  return (
    <table className={["grid", "scout-grid", "scout-found-grid", className].filter(Boolean).join(" ")}>
      <thead>
        <tr>
          {header("rank", text.columns.rank, "num scout-col-rank")}
          {header("name", text.columns.player, "col-name")}
          {header("age", text.columns.age, "num")}
          {header("ca", text.columns.ca, "num")}
          {header("pa", text.columns.pa, "num")}
          {middle.map(extraHeader)}
          {header("fit", text.columns.fit)}
          {header("probability", text.columns.probability, "num scout-col-probability", <ProbabilityInfo />)}
          {header("fee", text.columns.money, "num")}
          {end.map(extraHeader)}
          <th className="scout-col-actions">
            <span className="sr-only">{text.actions.column}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ row: s, rank }) => {
          const owner =
            s.ownerClub !== null && s.ownerClubUid !== null ? { uid: s.ownerClubUid, name: s.ownerClub } : null;
          const all = s.reasons.map((r) => `${reasonText(r)} (${signed(r.points)})`).join("\n");
          return (
            <tr key={s.player.uid}>
              <td className="num muted scout-col-rank">{rank}</td>
              <td className="col-name">
                <PlayerName player={s.player} onOpen={onOpen} sub={<ClubLine player={s.player} owner={owner} />} />
              </td>
              <td className="num">{s.player.age ?? text.none}</td>
              <td className="num scout-ca">{s.player.currentAbility}</td>
              <td className="num muted">{s.player.potentialAbility}</td>
              {middle.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.cell(s)}
                </td>
              ))}
              <td>
                <FitBar fit={s.fit} />
              </td>
              <td className={`num scout-probability ${level(s.probability)}`} title={all || undefined}>
                {formatPercent(s.probability)}
              </td>
              <td className="num scout-money" title={moneyTitle(s)}>
                <span className="scout-fee">{s.fee === null ? text.none : shortMoney(s.fee)}</span>
                <span className="sub">{s.wage === null ? text.none : `${shortMoney(s.wage)}${text.perWeek}`}</span>
              </td>
              {end.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.cell(s)}
                </td>
              ))}
              <td className="scout-col-actions">
                <RowActions name={s.player.name} {...actions(s)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
