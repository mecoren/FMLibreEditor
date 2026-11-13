// How the tables of players the scout found sort: by the scout's own order, or by one of their columns. A missing
// value sorts last either way, and a tie keeps the scout's order.

import { fold } from "./format";
import { intlLocale } from "./i18n";
import type { ColumnOrder } from "./SortHeader";
import type { Suggestion } from "./types";

/** The columns a table of found players can be sorted by; `rank` is the scout's own order, best first. */
export type FoundSort = "rank" | "name" | "age" | "ca" | "pa" | "fit" | "probability" | "fee" | "similarity";

/** The columns that sort from the lowest first when picked; the others start with the highest. */
const ASCENDING_FIRST: ReadonlySet<FoundSort> = new Set(["rank", "name", "age", "fee"]);

export const SCOUT_ORDER: ColumnOrder<FoundSort> = { by: "rank", ascending: true };

/** The order after a click on the column `by`: the other way round when it is the column sorted by already. */
export const nextOrder = (order: ColumnOrder<FoundSort>, by: FoundSort): ColumnOrder<FoundSort> => ({
  by,
  ascending: order.by === by ? !order.ascending : ASCENDING_FIRST.has(by),
});

/** A found player and his place in the scout's own order. */
export interface Ranked<T> {
  row: T;
  rank: number;
}

function sortValue(entry: Ranked<Suggestion & { similarity?: number }>, by: FoundSort): number | string | null {
  const s = entry.row;
  switch (by) {
    case "rank":
      return entry.rank;
    case "name":
      return fold(s.player.name);
    case "age":
      return s.player.age;
    case "ca":
      return s.player.currentAbility;
    case "pa":
      return s.player.potentialAbility;
    case "fit":
      return s.fit;
    case "probability":
      return s.probability;
    case "fee":
      return s.fee;
    case "similarity":
      return s.similarity ?? null;
  }
}

/** The rows in the scout's order, sorted as `order` says. */
export function sortFound<T extends Suggestion & { similarity?: number }>(
  rows: readonly T[],
  order: ColumnOrder<FoundSort>,
): Ranked<T>[] {
  const ranked = rows.map((row, i) => ({ row, rank: i + 1 }));
  const direction = order.ascending ? 1 : -1;
  return ranked.sort((a, b) => {
    const x = sortValue(a, order.by);
    const y = sortValue(b, order.by);
    if (x === null || y === null) {
      return x === y ? a.rank - b.rank : x === null ? 1 : -1;
    }
    const compared =
      typeof x === "string" && typeof y === "string" ? x.localeCompare(y, intlLocale) : Number(x) - Number(y);
    return compared === 0 ? a.rank - b.rank : compared * direction;
  });
}
