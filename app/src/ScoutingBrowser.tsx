// The Scouting tab: an assistant scout. It advises on signings for a position and roles, keeps lists of the market's
// opportunities, finds players like a given one, shows how deep the squad is line by line, lists the players it
// would let go, and the players of the club's youth intakes, who can be edited there. Any player it finds can be compared with the club's best player at his position, or written up in a
// scout report. The overview of the club is read when the tab is first shown and again when the data changed; the
// lists are asked for as their briefs change.

import { useCallback, useEffect, useRef, useState } from "react";
import { scoutingOverview } from "./editing";
import { describeError, formatMoney, formatNumber } from "./format";
import { scoutingText as text } from "./labels";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { PlayerDialog } from "./PlayerProfile";
import { isRecord, restored, useSnapshot } from "./restore";
import { ScoutCompare } from "./ScoutCompare";
import { ScoutDepartures, DEPARTURE_FILTERS, type DepartureFilter } from "./ScoutDepartures";
import { DEPTH_VIEWS, type DepthView, ScoutDepth } from "./ScoutDepth";
import {
  DEFAULT_OPPORTUNITY_BRIEF,
  OPPORTUNITY_KINDS,
  type OpportunityBrief,
  ScoutOpportunities,
} from "./ScoutOpportunities";
import type { CompareAsk, ReportAsk } from "./ScoutParts";
import {
  type Brief,
  DEFAULT_BRIEF,
  defaultPosition,
  PURPOSES,
  ScoutRecommendations,
} from "./ScoutRecommendations";
import { ScoutReport } from "./ScoutReport";
import { DEFAULT_SIMILAR_BRIEF, ScoutSimilar, type SimilarBrief } from "./ScoutSimilar";
import { ScoutYouth } from "./ScoutYouth";
import type { FmDate, PlayerSummary, ScoutingOverview } from "./types";

type ScoutTab = "recommend" | "opportunities" | "similar" | "depth" | "departures" | "youth";

const TABS: ScoutTab[] = ["recommend", "opportunities", "similar", "depth", "departures", "youth"];

/** What was saved before the language was switched; a start from scratch for what is missing or wrong. */
interface Saved {
  tab: ScoutTab;
  brief: Brief;
  departures: DepartureFilter;
  opportunities: OpportunityBrief;
  similar: SimilarBrief;
  depthView: DepthView;
}

const readText = (value: unknown): string => (typeof value === "string" ? value : "");

function readSaved(value: unknown): Saved {
  const saved = isRecord(value) ? value : {};
  const brief = isRecord(saved.brief) ? saved.brief : {};
  const opportunities = isRecord(saved.opportunities) ? saved.opportunities : {};
  const similar = isRecord(saved.similar) ? saved.similar : {};
  return {
    tab: TABS.find((tab) => tab === saved.tab) ?? "recommend",
    departures: DEPARTURE_FILTERS.find((filter) => filter === saved.departures) ?? "all",
    depthView: DEPTH_VIEWS.find((view) => view === saved.depthView) ?? "pitch",
    brief: {
      position: readText(brief.position),
      inPossession: readText(brief.inPossession),
      outOfPossession: readText(brief.outOfPossession),
      purpose: PURPOSES.find((purpose) => purpose === brief.purpose) ?? DEFAULT_BRIEF.purpose,
      minAge: readText(brief.minAge),
      maxAge: readText(brief.maxAge),
      maxFee: readText(brief.maxFee),
      minProbability: readText(brief.minProbability),
      noFreeAgents: brief.noFreeAgents === true,
    },
    opportunities: {
      kind: OPPORTUNITY_KINDS.find((kind) => kind === opportunities.kind) ?? DEFAULT_OPPORTUNITY_BRIEF.kind,
      position: readText(opportunities.position),
      maxAge: readText(opportunities.maxAge),
      maxFee: readText(opportunities.maxFee),
      betterOnly: opportunities.betterOnly === true,
    },
    similar: {
      uid: typeof similar.uid === "number" ? similar.uid : null,
      name: readText(similar.name),
      position: readText(similar.position),
      cheaper: similar.cheaper === true,
      younger: similar.younger === true,
      maxFee: readText(similar.maxFee),
    },
  };
}

export function ScoutingBrowser({
  version,
  active,
  gameDate,
}: {
  version: number;
  active: boolean;
  /** The in-game date, for the scout reports. */
  gameDate: FmDate | null;
}) {
  const [saved] = useState(() => restored("scouting", readSaved));
  const [overview, setOverview] = useState<ScoutingOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ScoutTab>(saved.tab);
  const [chosen, setChosen] = useState<Brief>(saved.brief);
  const [departureFilter, setDepartureFilter] = useState<DepartureFilter>(saved.departures);
  const [opportunities, setOpportunities] = useState<OpportunityBrief>(saved.opportunities);
  const [similar, setSimilar] = useState<SimilarBrief>(saved.similar);
  const [depthView, setDepthView] = useState<DepthView>(saved.depthView);
  const [shown, setShown] = useState<PlayerSummary | null>(null);
  const [comparing, setComparing] = useState<CompareAsk | null>(null);
  const [reporting, setReporting] = useState<ReportAsk | null>(null);
  useSnapshot("scouting", () => ({
    tab,
    brief: chosen,
    departures: departureFilter,
    opportunities,
    similar,
    depthView,
  }));

  // The data version the club was read at; it is read again when the tab is shown after the data changed.
  const loadedVersion = useRef<number | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    loadedVersion.current = version;
    setLoading(true);
    setError(null);
    try {
      const read = await scoutingOverview();
      if (seq === loadSeq.current) {
        setOverview(read);
      }
    } catch (e) {
      if (seq === loadSeq.current) {
        setError(describeError(e));
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [version]);

  useEffect(() => {
    if (active && loadedVersion.current !== version) {
      void load();
    }
  }, [active, version, load]);

  // A section opens at its top, whatever the one before was scrolled to.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [tab]);

  /** Looks for players like `player`, in the Similar players section. */
  const findSimilar = useCallback((player: PlayerSummary) => {
    setSimilar((old) => ({ ...DEFAULT_SIMILAR_BRIEF, cheaper: old.cheaper, younger: old.younger, uid: player.uid, name: player.name }));
    setTab("similar");
  }, []);

  const className = ["workspace", "scouting", !active && "inactive"].filter(Boolean).join(" ");

  if (overview === null) {
    return (
      <div className={className}>
        <div className="scout-main">
          {error && <div className="banner scout-banner">{error}</div>}
          {loading ? (
            <p className="empty">{text.reading}</p>
          ) : (
            error && (
              <div className="scout-header">
                <button type="button" onClick={() => void load()}>
                  {text.refresh}
                </button>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  // A position the editor does not list (after an update, say) falls back to where the squad needs a player most.
  const position = overview.positions.some((p) => p.key === chosen.position)
    ? chosen.position
    : defaultPosition(overview);
  const brief: Brief = { ...chosen, position };
  const { report } = overview;
  const wage = overview.wageRoom ?? overview.wageBudget;

  return (
    <div className={className}>
      <div className="scout-main">
        <div className="scout-header">
          <span className="scout-club">
            <WithPicture
              picture={<ClubLogo uid={overview.club.uid} name={overview.club.name} size={PICTURE_SIZE.clubRowLogo} />}
            >
              <span className="name-text">{overview.club.name}</span>
            </WithPicture>
          </span>
          <dl className="scout-figures">
            <div>
              <dt>{text.header.transferBudget}</dt>
              <dd>{overview.transferBudget === null ? text.none : formatMoney(overview.transferBudget)}</dd>
            </div>
            <div>
              <dt>{overview.wageRoom !== null ? text.header.wageRoom : text.header.wageBudget}</dt>
              <dd>{wage === null ? text.none : `${formatMoney(wage)}${text.perWeek}`}</dd>
            </div>
            <div>
              <dt>{text.header.squad}</dt>
              <dd>{text.header.players(report.size)}</dd>
            </div>
            <div>
              <dt>{text.header.averageAge}</dt>
              <dd>
                {report.averageAge === null ? text.none : formatNumber(report.averageAge, { maximumFractionDigits: 1 })}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="scout-refresh"
            title={text.refreshTitle}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? text.reading : text.refresh}
          </button>
        </div>

        {error && <div className="banner scout-banner">{error}</div>}

        <div className="scout-subtabs" role="tablist" aria-label={text.tabs.label}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-tab={id}
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (step !== 0) {
                  const next = TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length];
                  setTab(next);
                  e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
                }
              }}
            >
              {text.tabs[id]}
              {id === "departures" && <span className="scout-badge">{report.departures.length}</span>}
            </button>
          ))}
        </div>

        <div ref={panel} className="scout-panel" role="tabpanel">
          <ScoutRecommendations
            overview={overview}
            version={version}
            brief={brief}
            onBrief={(patch) => setChosen({ ...brief, ...patch })}
            onOpen={setShown}
            onCompare={setComparing}
            onSimilar={findSimilar}
            onReport={setReporting}
            hidden={tab !== "recommend"}
          />
          <ScoutOpportunities
            overview={overview}
            version={version}
            brief={opportunities}
            onBrief={(patch) => setOpportunities((old) => ({ ...old, ...patch }))}
            onOpen={setShown}
            onCompare={setComparing}
            onSimilar={findSimilar}
            onReport={setReporting}
            hidden={tab !== "opportunities"}
          />
          <ScoutSimilar
            overview={overview}
            version={version}
            brief={similar}
            onBrief={(patch) => setSimilar((old) => ({ ...old, ...patch }))}
            onOpen={setShown}
            onCompare={setComparing}
            onReport={setReporting}
            hidden={tab !== "similar"}
          />
          {tab === "depth" && (
            <ScoutDepth
              report={report}
              view={depthView}
              onView={setDepthView}
              onOpen={setShown}
              onAdvice={(key) => {
                setChosen({ ...brief, position: key, inPossession: "", outOfPossession: "" });
                setTab("recommend");
              }}
            />
          )}
          <ScoutYouth version={version} hidden={tab !== "youth"} onOpen={setShown} />
          {tab === "departures" && (
            <ScoutDepartures
              departures={report.departures}
              filter={departureFilter}
              onFilter={setDepartureFilter}
              onOpen={setShown}
              onReplace={findSimilar}
            />
          )}
        </div>
      </div>

      {shown && <PlayerDialog player={shown} version={version} onClose={() => setShown(null)} />}
      {comparing && (
        <ScoutCompare
          {...comparing}
          roles={overview.roles}
          positions={overview.positions}
          onClose={() => setComparing(null)}
        />
      )}
      {reporting && (
        <ScoutReport
          {...reporting}
          roles={overview.roles}
          gameDate={gameDate}
          onSimilar={findSimilar}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}
