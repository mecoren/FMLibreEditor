// The filter bar of the club list: which clubs (men's or women's), the nation they are from, the league their first
// team plays in this season and their reputation. Mass edit and Export take the clubs it shows, as they do in the player
// list. The league select offers the leagues the other filters leave, grouped by their nation (see `club_leagues`).

import { useEffect, useId, useRef, useState } from "react";
import { call } from "./api";
import { FilterBar, isNumberText, TextInput, textOr, whole } from "./FilterBar";
import { formatNumber } from "./format";
import { clubListText, playerListText } from "./labels";
import type { ClubFilter, League } from "./types";

const text = clubListText.filters;

/** Reputation as the game keeps it. */
const REPUTATION_RANGE = { min: 0, max: 10000 };

/** How long typing in the nation waits before the leagues are asked for again. */
const LEAGUES_DELAY_MS = 200;

/** Which clubs the list shows. */
export type ClubKind = "all" | "men" | "women";

/** What the filter inputs hold, as typed: an empty string is no filter. */
export interface ClubFilterFields {
  kind: ClubKind;
  nation: string;
  /** A league's UID, as the select holds it. */
  league: string;
  minReputation: string;
  maxReputation: string;
}

export const NO_CLUB_FILTERS: ClubFilterFields = {
  kind: "all",
  nation: "",
  league: "",
  minReputation: "",
  maxReputation: "",
};

/** The filter the inputs ask for, or `undefined` while none is in effect. */
export function toClubFilter(fields: ClubFilterFields): ClubFilter | undefined {
  const filter: ClubFilter = {
    women: fields.kind === "all" ? undefined : fields.kind === "women",
    nation: fields.nation.trim() || undefined,
    leagueUid: fields.league === "" ? undefined : Number(fields.league),
    minReputation: whole(fields.minReputation, REPUTATION_RANGE),
    maxReputation: whole(fields.maxReputation, REPUTATION_RANGE),
  };
  return countClubFilters(filter) > 0 ? filter : undefined;
}

/** How many filters are in effect; the two ends of the reputation range count as one. */
export function countClubFilters(filter: ClubFilter | undefined): number {
  if (!filter) {
    return 0;
  }
  return [filter.women, filter.nation, filter.leagueUid, filter.minReputation ?? filter.maxReputation].filter(
    (value) => value !== undefined,
  ).length;
}

/**
 * The fields from a stored value (the bar before the language was switched): a field that is missing or is not what
 * the bar holds is empty. A stored kind of clubs alone, as the list kept it before it had a filter bar, is read too.
 */
export function readClubFields(value: unknown): ClubFilterFields {
  const given = (typeof value === "object" && value !== null ? value : { kind: value }) as Record<string, unknown>;
  const none = NO_CLUB_FILTERS;
  return {
    kind: given.kind === "men" || given.kind === "women" ? given.kind : none.kind,
    nation: textOr(given.nation, none.nation),
    league: textOr(given.league, none.league, (league) => /^\d*$/.test(league)),
    minReputation: textOr(given.minReputation, none.minReputation, isNumberText),
    maxReputation: textOr(given.maxReputation, none.maxReputation, isNumberText),
  };
}

/**
 * The leagues the clubs `filter` selects play in, asked for again when the filter changes (typing in the nation waits a
 * moment) and when the clubs are read again (`version`). None while the app cannot answer, e.g. before it connects.
 */
function useLeagues(filter: ClubFilter | undefined, version: number): League[] {
  const [leagues, setLeagues] = useState<League[]>([]);
  const key = JSON.stringify(filter ?? {});
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      call<League[]>("club_leagues", { filter: JSON.parse(key) as ClubFilter })
        .then((found) => current && setLeagues(found))
        .catch(() => current && setLeagues([]));
    }, LEAGUES_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [key, version]);
  return leagues;
}

/** `leagues` by their nation, in their order; the leagues of no known nation come last, on their own. */
function byNation(leagues: League[]): { nation: string | null; leagues: League[] }[] {
  const groups: { nation: string | null; leagues: League[] }[] = [];
  for (const league of leagues) {
    const last = groups[groups.length - 1];
    if (last && last.nation === league.nation) {
      last.leagues.push(league);
    } else {
      groups.push({ nation: league.nation, leagues: [league] });
    }
  }
  return groups;
}

/** A league as the select names it: with how many clubs play in it. */
const leagueOption = (league: League) => `${league.name} (${formatNumber(league.clubs)})`;

interface ClubFilterBarProps {
  fields: ClubFilterFields;
  onChange: (fields: ClubFilterFields) => void;
  /** How many filters are in effect, from `countClubFilters`. */
  active: number;
  /** Changes when the clubs are read again: the leagues are asked for again with them. */
  version: number;
}

/** The filter bar of the club list: a button with the number of filters in effect, and the inputs behind it. */
export function ClubFilterBar({ fields, onChange, active, version }: ClubFilterBarProps) {
  const set = <K extends keyof ClubFilterFields>(key: K, value: ClubFilterFields[K]) =>
    onChange({ ...fields, [key]: value });
  // Every league its other filters allow: the league picked is not one of them.
  const leagues = useLeagues(toClubFilter({ ...fields, league: "" }), version);
  // The leagues seen so far, so that the one picked keeps its name when another nation's leagues are offered.
  const seen = useRef(new Map<number, League>());
  for (const league of leagues) {
    seen.current.set(league.uid, league);
  }
  const picked = fields.league === "" ? undefined : Number(fields.league);
  const pickedElsewhere = picked !== undefined && !leagues.some((league) => league.uid === picked);
  const reputation = useId();

  return (
    <FilterBar active={active} onClear={() => onChange(NO_CLUB_FILTERS)} className="club-filter-bar">
      <label className="filter-field">
        <span>{text.kind}</span>
        <select value={fields.kind} onChange={(e) => set("kind", e.currentTarget.value as ClubKind)}>
          <option value="all">{text.all}</option>
          <option value="men">{text.men}</option>
          <option value="women">{text.women}</option>
        </select>
      </label>
      <TextInput label={text.nation} value={fields.nation} onChange={(nation) => set("nation", nation)} />
      <label className="filter-field" title={text.leagueTitle}>
        <span>{text.league}</span>
        <select className="league-select" value={fields.league} onChange={(e) => set("league", e.currentTarget.value)}>
          <option value="">{text.anyLeague}</option>
          {pickedElsewhere && (
            <option value={fields.league}>
              {seen.current.has(picked) ? leagueOption(seen.current.get(picked) as League) : fields.league}
            </option>
          )}
          {byNation(leagues).map((group) =>
            group.nation === null ? (
              group.leagues.map((league) => (
                <option key={league.uid} value={String(league.uid)}>
                  {leagueOption(league)}
                </option>
              ))
            ) : (
              <optgroup key={group.nation} label={group.nation}>
                {group.leagues.map((league) => (
                  <option key={league.uid} value={String(league.uid)}>
                    {leagueOption(league)}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      </label>
      <div className="filter-field" role="group" aria-labelledby={reputation} title={text.reputationTitle}>
        <span id={reputation}>{text.reputation}</span>
        <input
          type="number"
          min={REPUTATION_RANGE.min}
          max={REPUTATION_RANGE.max}
          step={100}
          placeholder={playerListText.filters.minPlaceholder}
          aria-label={text.minReputation}
          value={fields.minReputation}
          onChange={(e) => set("minReputation", e.currentTarget.value)}
        />
        <span aria-hidden="true">–</span>
        <input
          type="number"
          min={REPUTATION_RANGE.min}
          max={REPUTATION_RANGE.max}
          step={100}
          placeholder={playerListText.filters.maxPlaceholder}
          aria-label={text.maxReputation}
          value={fields.maxReputation}
          onChange={(e) => set("maxReputation", e.currentTarget.value)}
        />
      </div>
    </FilterBar>
  );
}
