// The standings page: a wall of league tables, as FM's competition centre shows them. Each card is one competition,
// picked from the game's own list; a team's name opens its club in the Clubs tab. A competition's table is not read
// yet, so on a connected build the cards say so (see `standings.rs`); the browser shows the fixture tables.

import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "./api";
import { describeError, formatNumber } from "./format";
import { standingsText as text } from "./labels";
import { ClubLogo, CompetitionLogo, PICTURE_SIZE } from "./Picture";
import { isRecord, restored, useSnapshot } from "./restore";
import { SelectField } from "./SelectField";
import type {
  ClubSummary,
  Competition,
  CompetitionList,
  LeagueTables,
  StandingRow,
  StandingZone,
} from "./types";

/** The cards the page keeps: the first eight start with a competition, the last four wait to be picked. */
const SLOTS = 12;

/** How many cards a screen shows: three columns of two, three or four. */
type Size = 6 | 9 | 12;

const SIZES: Size[] = [6, 9, 12];

/** The order the qualifying and relegation places are listed in, wherever they are in the table. */
const ZONES: StandingZone[] = ["champions", "europa", "conference", "relegation"];

/**
 * The competitions shown first, by the names and short names the game may have for them: the five leagues most
 * watched, then the three European competitions, in English and in Chinese. A fixed list of names, matched once
 * against the game's: a save that has none of a name leaves its card empty, to be picked by hand.
 */
const FIRST: readonly (readonly string[])[] = [
  ["English Premier League", "English Premier Division", "Premier League", "英格兰超级联赛", "英超"],
  ["Spanish First Division", "Spanish La Liga", "LaLiga", "西班牙足球甲级联赛", "西班牙甲级联赛", "西甲"],
  ["Italian Serie A", "Serie A", "意大利足球甲级联赛", "意大利甲级联赛", "意甲"],
  ["German Bundesliga", "Bundesliga", "德国足球甲级联赛", "德国甲级联赛", "德甲"],
  ["French Ligue 1", "Ligue 1", "法国足球甲级联赛", "法国甲级联赛", "法甲"],
  ["UEFA Champions League", "European Champions Cup", "欧洲冠军联赛", "欧冠"],
  ["UEFA Europa League", "European Cup Winners Cup", "欧洲联赛", "欧联"],
  ["UEFA Conference League", "UEFA Europa Conference League", "European Conference Cup", "欧洲协会联赛", "欧协联"],
];

/** A name as it is matched: lower case, and only its letters and figures, so "Süper Lig" and "SÜPER LIG" agree. */
const normalized = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The cards the page starts with: the competitions of `FIRST` this save has, then empty ones. */
function firstSlots(competitions: readonly Competition[]): (number | null)[] {
  const taken = new Set<number>();
  const first = FIRST.map((names) => {
    const wanted = names.map(normalized);
    const found = competitions.find(
      (competition) =>
        !taken.has(competition.uid) &&
        [competition.name, competition.shortName ?? ""].some((name) => wanted.includes(normalized(name))),
    );
    if (found === undefined) {
      return null;
    }
    taken.add(found.uid);
    return found.uid;
  });
  return [...first, null, null, null, null].slice(0, SLOTS);
}

/** What the page held before the language was switched (see `restore.ts`). */
interface Held {
  slots: (number | null)[] | null;
  size: Size;
  page: number;
}

const readHeld = (value: unknown): Held => {
  const held = isRecord(value) ? value : {};
  const slots =
    Array.isArray(held.slots) && held.slots.length === SLOTS
      ? held.slots.map((slot) => (typeof slot === "number" && Number.isInteger(slot) && slot > 0 ? slot : null))
      : null;
  const size: Size = held.size === 9 || held.size === 12 ? held.size : 6;
  const page = typeof held.page === "number" && Number.isInteger(held.page) && held.page >= 0 ? held.page : 0;
  return { slots, size, page };
};

interface StandingsProps {
  /** Changes when the game data is read again. */
  version: number;
  /** Whether the page is on show: its competitions are read the first time it is. */
  active: boolean;
  /** Opens a club in the Clubs tab. */
  onOpenClub: (club: ClubSummary) => void;
}

/** The competitions read from the game, and whether this build's can be read at all. */
interface Found {
  readable: boolean;
  competitions: Competition[];
}

export function Standings({ version, active, onOpenClub }: StandingsProps) {
  const [start] = useState(() => restored("standings", readHeld));
  // The competition of each card, by slot: null for a card waiting to be picked.
  const [slots, setSlots] = useState<(number | null)[] | null>(start.slots);
  const [size, setSize] = useState<Size>(start.size);
  const [page, setPage] = useState(start.page);
  useSnapshot("standings", () => ({ slots, size, page }));
  const [found, setFound] = useState<Found | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  // Whether the game's tables can be read, and the rows of each competition read: none while null or false.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Record<number, StandingRow[]>>({});
  // The version whose competitions were asked for: the page reads them once, when it is first shown.
  const asked = useRef<number | null>(null);

  useEffect(() => {
    if (!active || asked.current === version) {
      return;
    }
    asked.current = version;
    let cancelled = false;
    setFound(null);
    setReadError(null);
    call<CompetitionList>("list_competitions").then(
      (list) => {
        if (!cancelled) {
          setFound(list);
        }
      },
      (e) => {
        if (!cancelled) {
          setReadError(describeError(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, version]);

  // The first eight cards show the competitions most watched, once the game's list is there: only where nothing was
  // picked before, as the cards of a language switched window keep what they held.
  useEffect(() => {
    if (found?.readable && slots === null) {
      setSlots(firstSlots(found.competitions));
    }
  }, [found, slots]);

  const shown = useMemo(() => slots ?? (Array(SLOTS).fill(null) as (number | null)[]), [slots]);
  const filled = shown.filter((uid) => uid !== null).length;
  // The page stays mounted while another one is shown, so its cards, its page and its scroll position are kept: it is
  // laid out and hidden, as the lists are (see `.standings.inactive`).
  const root = active ? "standings" : "standings inactive";
  const wanted = shown.filter((uid): uid is number => uid !== null).join(",");

  // The tables of the cards on show, read in one call whenever the competitions picked change.
  useEffect(() => {
    if (!active || asked.current !== version) {
      return;
    }
    let cancelled = false;
    const competitions = wanted === "" ? [] : wanted.split(",").map(Number);
    call<LeagueTables>("league_tables", { competitions }).then(
      (answer) => {
        if (cancelled) {
          return;
        }
        setSupported(answer.supported);
        setRows(Object.fromEntries((answer.tables ?? []).map((table) => [table.competitionUid, table.rows])));
      },
      () => {
        if (!cancelled) {
          setSupported(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, version, wanted]);

  /** Puts `uid` on the card at `slot`, taking it off the card that had it: a competition is shown once. */
  const choose = (slot: number, uid: number) => {
    setSlots((current) => {
      const next = [...(current ?? Array(SLOTS).fill(null))];
      for (let i = 0; i < next.length; i++) {
        if (i !== slot && next[i] === uid) {
          next[i] = null;
        }
      }
      next[slot] = uid === 0 ? null : uid;
      return next;
    });
  };

  const byUid = new Map((found?.competitions ?? []).map((competition) => [competition.uid, competition]));
  const pages = Math.ceil(SLOTS / size);
  const pageNow = Math.min(page, pages - 1);
  const first = pageNow * size;

  if (readError !== null) {
    return (
      <div className={root}>
        <p className="standings-note" role="alert">
          {readError}
        </p>
      </div>
    );
  }
  if (found === null) {
    return (
      <div className={root}>
        <p className="standings-note">{text.loading}</p>
      </div>
    );
  }
  if (!found.readable) {
    return (
      <div className={root}>
        <p className="standings-note">{text.competitionsUnavailable}</p>
      </div>
    );
  }

  return (
    <div className={root}>
      <div className="standings-controls">
        <div className="standings-heading">
          <h1>{text.nav}</h1>
          <p>{text.summary(filled)}</p>
        </div>
        <div className="standings-tools">
          <div className="standings-sizes" role="group" aria-label={text.perScreen}>
            {SIZES.map((each) => (
              <button
                key={each}
                type="button"
                className={each === size ? "active" : undefined}
                aria-pressed={each === size}
                onClick={() => {
                  setSize(each);
                  setPage(0);
                }}
              >
                {each}
              </button>
            ))}
          </div>
          {pages > 1 && (
            <div className="standings-pager">
              <button
                type="button"
                aria-label={text.previous}
                title={text.previous}
                disabled={pageNow === 0}
                onClick={() => setPage(pageNow - 1)}
              >
                ‹
              </button>
              <span>{text.page(pageNow + 1, pages)}</span>
              <button
                type="button"
                aria-label={text.next}
                title={text.next}
                disabled={pageNow === pages - 1}
                onClick={() => setPage(pageNow + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`standings-grid size-${size}`}>
        {shown.slice(first, first + size).map((uid, index) => {
          const slot = first + index;
          const competition = uid === null ? undefined : byUid.get(uid);
          return (
            <StandingsCard
              key={slot}
              competition={competition}
              competitions={found.competitions}
              shown={shown}
              slot={slot}
              rows={competition === undefined ? [] : (rows[competition.uid] ?? [])}
              supported={supported}
              onChoose={choose}
              onOpenClub={onOpenClub}
            />
          );
        })}
      </div>
    </div>
  );
}

interface StandingsCardProps {
  /** The competition the card shows; none for a card waiting to be picked. */
  competition: Competition | undefined;
  competitions: readonly Competition[];
  /** The competition of every card on the page, so that one on another card cannot be picked again. */
  shown: readonly (number | null)[];
  slot: number;
  rows: StandingRow[];
  /** Whether the game's tables can be read at all; null while it is not known yet. */
  supported: boolean | null;
  onChoose: (slot: number, uid: number) => void;
  onOpenClub: (club: ClubSummary) => void;
}

/** One competition's table, or the card of one waiting to be picked. */
function StandingsCard({
  competition,
  competitions,
  shown,
  slot,
  rows,
  supported,
  onChoose,
  onOpenClub,
}: StandingsCardProps) {
  const options = competitions.map((each) => ({
    value: String(each.uid),
    label: each.shortName ?? each.name,
    // A competition the page already shows, on another card: it moves there rather than being shown twice.
    disabled: each.uid !== competition?.uid && shown.includes(each.uid),
  }));
  const pick = (
    <SelectField
      label={`${text.competition}: ${competition?.name ?? text.choose}`}
      className="standings-pick"
      value={competition === undefined ? "" : String(competition.uid)}
      options={[{ value: "", label: text.choose }, ...options]}
      onChange={(value) => onChoose(slot, value === "" ? 0 : Number(value))}
    />
  );

  const zones = competition === undefined ? [] : ZONES.filter((zone) => rows.some((row) => row.zone === zone));
  const note =
    competition === undefined
      ? text.empty
      : supported === null
        ? text.loading
        : supported
          ? text.noMatches
          : text.unavailable;
  return (
    <section
      className={`standings-card${competition === undefined ? " standings-card-empty" : ""}`}
      aria-label={competition?.name ?? text.choose}
    >
      <header className="standings-head">
        {competition === undefined ? (
          <span className="standings-logo" aria-hidden="true" />
        ) : (
          <CompetitionLogo uid={competition.uid} size={PICTURE_SIZE.competitionLogo} />
        )}
        <div className="standings-face">
          {/* The pick of the card is its title: the competition it shows, which another card cannot show too. */}
          {pick}
          {competition !== undefined && competition.name !== (competition.shortName ?? competition.name) && (
            <span className="standings-short" title={competition.name}>
              {competition.name}
            </span>
          )}
        </div>
      </header>

      {competition !== undefined && rows.length > 0 ? (
        <table className="standings-table">
          <caption className="sr-only">{text.caption(competition.name)}</caption>
          <thead>
            <tr>
              <th scope="col" className="standings-rank">
                {text.columns.rank}
              </th>
              <th scope="col" className="standings-club">
                {text.columns.club}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.played}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.won}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.drawn}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.lost}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.goalDifference}
              </th>
              <th scope="col" className="standings-num">
                {text.columns.points}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.clubUid}>
                <th scope="row" className={`standings-rank zone-${row.zone ?? "none"}`}>
                  <span className="standings-bar" aria-hidden="true" />
                  {formatNumber(index + 1)}
                </th>
                <td className="standings-club">
                  <button
                    type="button"
                    className="standings-club-name"
                    title={row.club}
                    aria-label={text.openClub(row.club, index + 1, row.points)}
                    onClick={() =>
                      onOpenClub({
                        uid: row.clubUid,
                        name: row.club,
                        shortName: row.shortName,
                        women: false,
                        reputation: null,
                        founded: null,
                      })
                    }
                  >
                    <ClubLogo uid={row.clubUid} name={row.club} size={PICTURE_SIZE.rowLogo} />
                    <span>{row.shortName ?? row.club}</span>
                  </button>
                </td>
                <td className="standings-num">{formatNumber(row.played)}</td>
                <td className="standings-num">{formatNumber(row.won)}</td>
                <td className="standings-num">{formatNumber(row.drawn)}</td>
                <td className="standings-num">{formatNumber(row.lost)}</td>
                <td className="standings-num">{difference(row)}</td>
                <td className="standings-num standings-points">{formatNumber(row.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="standings-note">{note}</p>
      )}

      {zones.length > 0 && (
        <footer className="standings-legend">
          {zones.map((zone) => (
            <span key={zone} className={`standings-legend-item zone-${zone}`}>
              <span className="standings-bar" aria-hidden="true" />
              {text.legend[zone]}
            </span>
          ))}
        </footer>
      )}
    </section>
  );
}

/** A club's goal difference, with a plus for a positive one: "+12", "0", "-7". */
function difference(row: StandingRow): string {
  const value = row.goalsFor - row.goalsAgainst;
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}
