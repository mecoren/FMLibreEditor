// The standings page: a wall of league tables, as FM's competition centre shows them. Each card is one competition,
// picked from the game's own list in a dialog (see `CompetitionDialog`); a team's name opens its club's profile over the
// tables (see `ClubDialog`). A competition's table is not read yet, so on a connected build the cards say so (see
// `standings.rs`); the browser shows the fixture tables.

import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "./api";
import { rowMenuProps } from "./EntityRowMenu";
import { ClubDialog } from "./ClubProfile";
import { KnockoutBracket, StageTabs } from "./CompetitionStages";
import { CompetitionDialog, normalized } from "./CompetitionDialog";
import { describeError, formatDateRange, formatNumber } from "./format";
import { standingsText as text } from "./labels";
import { ClubLogo, CompetitionLogo, PICTURE_SIZE } from "./Picture";
import { isRecord, restored, useSnapshot } from "./restore";
import type {
  ClubSummary,
  Competition,
  CompetitionList,
  CompetitionStage,
  CompetitionStages,
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
  /** The stage a competition was pinned to, by its UID; absent or null follows the calendar. */
  stagePicks: Record<number, string | null>;
}

const readHeld = (value: unknown): Held => {
  const held = isRecord(value) ? value : {};
  const slots =
    Array.isArray(held.slots) && held.slots.length === SLOTS
      ? held.slots.map((slot) => (typeof slot === "number" && Number.isInteger(slot) && slot > 0 ? slot : null))
      : null;
  const size: Size = held.size === 9 || held.size === 12 ? held.size : 6;
  const page = typeof held.page === "number" && Number.isInteger(held.page) && held.page >= 0 ? held.page : 0;
  const stagePicks: Record<number, string | null> = {};
  if (isRecord(held.stagePicks)) {
    for (const [uid, id] of Object.entries(held.stagePicks)) {
      const key = Number(uid);
      if (Number.isInteger(key) && key > 0 && (typeof id === "string" || id === null)) {
        stagePicks[key] = id;
      }
    }
  }
  return { slots, size, page, stagePicks };
};

interface StandingsProps {
  /** Changes when the game data is read again. */
  version: number;
  /** Whether the page is on show: while it is away, its dialogs close and it stays hidden. */
  active: boolean;
}

/** The competitions read from the game, and whether this build's can be read at all. */
interface Found {
  readable: boolean;
  competitions: Competition[];
}

export function Standings({ version, active }: StandingsProps) {
  const [start] = useState(() => restored("standings", readHeld));
  // The competition of each card, by slot: null for a card waiting to be picked.
  const [slots, setSlots] = useState<(number | null)[] | null>(start.slots);
  const [size, setSize] = useState<Size>(start.size);
  const [page, setPage] = useState(start.page);
  // The stage a competition was pinned to by hand: absent or null follows the calendar Rust works out.
  const [stagePicks, setStagePicks] = useState<Record<number, string | null>>(start.stagePicks);
  useSnapshot("standings", () => ({ slots, size, page, stagePicks }));
  const [found, setFound] = useState<Found | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  // Whether the game's tables can be read, and the rows of each competition read: none while null or false.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Record<number, StandingRow[]>>({});
  // The stages of the competitions on show, and which of them the calendar is in.
  const [stageData, setStageData] = useState<CompetitionStages | null>(null);
  // The version whose competitions were asked for: a new one reads them again, whether the page is on show or not.
  const asked = useRef<number | null>(null);
  // The card whose competition is being picked (see `CompetitionDialog`), and the club whose profile is up as a dialog
  // over the tables (see `ClubDialog`). The control that opened either takes focus back once it closes.
  const [picking, setPicking] = useState<number | null>(null);
  const [opened, setOpened] = useState<ClubSummary | null>(null);

  // Leaving the tab leaves the dialogs too: coming back finds the tables as they were.
  useEffect(() => {
    if (!active) {
      setPicking(null);
      setOpened(null);
    }
  }, [active]);

  // The competitions are read when the game's data is read, not when the page is first shown, as the lists are (see
  // `ListBrowser`): the cards are ready by the time the tab is opened. Strict Mode runs this effect twice on mount,
  // so the answer is kept by version rather than cancelled: the second run asks for nothing, and the answer of the
  // first still fills the page.
  useEffect(() => {
    if (asked.current === version) {
      return;
    }
    asked.current = version;
    setFound(null);
    setReadError(null);
    call<CompetitionList>("list_competitions").then(
      (list) => {
        if (asked.current === version) {
          setFound(list);
        }
      },
      (e) => {
        if (asked.current === version) {
          setReadError(describeError(e));
        }
      },
    );
  }, [version]);

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

  // The tables of the cards on show, read in one call whenever the competitions picked change or the data is read
  // again, even while the page is away.
  useEffect(() => {
    if (asked.current !== version) {
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
    // The same competitions' stages, read in one call: a build whose layout places none leaves the cards showing the
    // tables they already have.
    call<CompetitionStages>("competition_stages", { competitions }).then(
      (answer) => {
        if (!cancelled) {
          setStageData(answer.supported ? answer : null);
        }
      },
      () => {
        if (!cancelled) {
          setStageData(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version, wanted]);

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
  const stagesByUid = useMemo(() => {
    const map = new Map<number, CompetitionStage[]>();
    for (const stage of stageData?.stages ?? []) {
      const of = map.get(stage.competitionUid) ?? [];
      of.push(stage);
      map.set(stage.competitionUid, of);
    }
    return map;
  }, [stageData]);
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
              rows={competition === undefined ? [] : (rows[competition.uid] ?? [])}
              supported={supported}
              stages={competition === undefined ? [] : (stagesByUid.get(competition.uid) ?? [])}
              currentStageId={competition === undefined ? null : (stageData?.current[competition.uid] ?? null)}
              selectedStageId={competition === undefined ? null : (stagePicks[competition.uid] ?? null)}
              onSelectStage={(id) => {
                if (competition !== undefined) {
                  setStagePicks((current) => ({ ...current, [competition.uid]: id }));
                }
              }}
              onPick={() => setPicking(slot)}
              onOpenClub={setOpened}
            />
          );
        })}
      </div>
      {picking !== null && (
        <CompetitionDialog
          competition={byUid.get(shown[picking] ?? -1)}
          competitions={found.competitions}
          shown={shown}
          onPick={(uid) => {
            choose(picking, uid);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {opened !== null && <ClubDialog club={opened} version={version} onClose={() => setOpened(null)} />}
    </div>
  );
}

interface StandingsCardProps {
  /** The competition the card shows; none for a card waiting to be picked. */
  competition: Competition | undefined;
  rows: StandingRow[];
  /** Whether the game's tables can be read at all; null while it is not known yet. */
  supported: boolean | null;
  /** The competition's stages; empty on a build whose layout places none. */
  stages: CompetitionStage[];
  /** The stage the calendar is in, as Rust worked out. */
  currentStageId: string | null;
  /** The stage picked by hand; null follows the calendar. */
  selectedStageId: string | null;
  onSelectStage: (id: string | null) => void;
  /** Opens the pick of a competition for this card (see `CompetitionDialog`). */
  onPick: () => void;
  /** Opens a club's profile over the page (see `ClubDialog`). */
  onOpenClub: (club: ClubSummary) => void;
}

/** One competition's stage: a table, a round of ties, or the card of one waiting to be picked. */
function StandingsCard({
  competition,
  rows,
  supported,
  stages,
  currentStageId,
  selectedStageId,
  onSelectStage,
  onPick,
  onOpenClub,
}: StandingsCardProps) {
  // A stage pinned in another save or another language may no longer be there: follow the calendar instead.
  const pinned = stages.some((stage) => stage.id === selectedStageId) ? selectedStageId : null;
  const activeStage =
    stages.length === 0
      ? undefined
      : (stages.find((stage) => stage.id === (pinned ?? currentStageId)) ?? stages[0]);
  // A league stage brings its own table; where no stage was read, the table of `league_tables` is shown as before.
  const shownRows = activeStage?.kind === "league" ? activeStage.rows : rows;
  const when = activeStage === undefined ? "" : formatDateRange(activeStage.startDate, activeStage.endDate);
  // The legend belongs to the table: a round of ties has no qualifying or relegation places.
  const showingTable = activeStage === undefined || activeStage.kind === "league";
  const zones =
    competition === undefined || !showingTable
      ? []
      : ZONES.filter((zone) => shownRows.some((row) => row.zone === zone));
  const note =
    competition === undefined
      ? text.empty
      : activeStage?.kind === "upcoming"
        ? text.noMatches
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
          {/* The card's title opens the pick too, as it did when the list hung under it. */}
          <button
            type="button"
            className="standings-pick"
            title={competition?.name ?? text.choose}
            aria-haspopup="dialog"
            aria-label={`${text.competition}: ${competition?.name ?? text.choose}`}
            onClick={onPick}
          >
            {competition === undefined ? text.choose : (competition.shortName ?? competition.name)}
          </button>
          {competition !== undefined && competition.name !== (competition.shortName ?? competition.name) && (
            <span className="standings-short" title={competition.name}>
              {competition.name}
            </span>
          )}
        </div>
        <button
          type="button"
          className="standings-choose"
          title={text.choose}
          aria-haspopup="dialog"
          aria-label={text.choose}
          onClick={onPick}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 5.5h12M4 10h12M4 14.5h8" />
          </svg>
          <span>{text.choose}</span>
        </button>
      </header>

      {/* One stage is still worth naming: a cup whose knockout rounds this build cannot read shows the league
          phase it is in, instead of hiding the whole row while the leagues beside it show theirs. */}
      {stages.length > 0 && activeStage !== undefined && (
        <div className="stage-panel">
          <StageTabs
            stages={stages}
            currentId={currentStageId}
            selectedId={pinned}
            onSelect={onSelectStage}
          />
          {when !== "" && (
            <p className="stage-when">
              {pinned === null && `${text.stage.auto} · `}
              {when}
            </p>
          )}
        </div>
      )}

      {activeStage?.kind === "knockout" ? (
        <KnockoutBracket stage={activeStage} onOpenClub={onOpenClub} />
      ) : competition !== undefined && shownRows.length > 0 ? (
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
            {shownRows.map((row, index) => (
              <tr key={row.clubUid} {...rowMenuProps("club", row.club, row.clubUid)}>
                <th scope="row" className={`standings-rank zone-${row.zone ?? "none"}`}>
                  <span className="standings-bar" aria-hidden="true" />
                  {formatNumber(index + 1)}
                </th>
                <td className="standings-club">
                  <button
                    type="button"
                    className="standings-club-name"
                    title={row.club}
                    // The name opens the club's profile as a dialog over the tables, as the players list opens a
                    // player's.
                    aria-haspopup="dialog"
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
