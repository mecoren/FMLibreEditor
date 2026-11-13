// "Opportunities": lists of players the market makes easier to sign than their ability says, near the club's level:
// Bosmans, release clauses below a player's value, unhappy players, clubs in the red, the transfer and loan lists, and
// wonderkids. One answer counts every list, so the cards show how many each holds; the one picked fills the table.

import { useEffect, useMemo, useRef, useState } from "react";
import { toPounds } from "./currency";
import { currencySymbol, describeError, formatNumber } from "./format";
import { InfoTip } from "./InfoTip";
import { positionLabel, scoutingText } from "./labels";
import { scoutingOpportunities } from "./scoutApi";
import { FoundTable } from "./ScoutFoundTable";
import type { CompareAsk, ReportAsk, ScoutPick } from "./ScoutParts";
import { whyText } from "./ScoutParts";
import { type FoundSort, SCOUT_ORDER, sortFound } from "./scoutSort";
import type { ColumnOrder } from "./SortHeader";
import type {
  Fitting,
  Opportunities,
  Opportunity,
  OpportunityKind,
  OpportunityRequest,
  PlayerSummary,
  ScoutingOverview,
} from "./types";

const text = scoutingText.opportunities;

export const OPPORTUNITY_KINDS: OpportunityKind[] = [
  "bosman",
  "releaseClause",
  "unhappy",
  "inTheRed",
  "listed",
  "loanListed",
  "wonderkid",
];

/** What the user asks the lists for; the fields typed into are kept as typed. */
export interface OpportunityBrief {
  kind: OpportunityKind;
  /** A position key; empty for any. */
  position: string;
  maxAge: string;
  /** In the shown currency. */
  maxFee: string;
  betterOnly: boolean;
}

export const DEFAULT_OPPORTUNITY_BRIEF: OpportunityBrief = {
  kind: "bosman",
  position: "",
  maxAge: "",
  maxFee: "",
  betterOnly: false,
};

const DEBOUNCE_MS = 250;
const PAGE = 50;
const MOST = 200;

/** A whole number from what was typed, or null when it is empty or not a number. */
function wholeNumber(typed: string): number | null {
  const number = typed.trim() === "" ? NaN : Number(typed);
  return Number.isFinite(number) ? Math.round(number) : null;
}

export const pickOfOpportunity = (o: Opportunity): ScoutPick => ({ suggestion: o, position: o.position, why: o.why });

interface Props {
  overview: ScoutingOverview;
  version: number;
  brief: OpportunityBrief;
  onBrief: (patch: Partial<OpportunityBrief>) => void;
  onOpen: (player: PlayerSummary) => void;
  onCompare: (ask: CompareAsk) => void;
  onSimilar: (player: PlayerSummary) => void;
  onReport: (ask: ReportAsk) => void;
  hidden: boolean;
}

export function ScoutOpportunities({
  overview,
  version,
  brief,
  onBrief,
  onOpen,
  onCompare,
  onSimilar,
  onReport,
  hidden,
}: Props) {
  const briefKey = JSON.stringify(brief);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [briefKey]);
  const request: OpportunityRequest = useMemo(() => {
    const fee = wholeNumber(brief.maxFee);
    return {
      kind: brief.kind,
      position: brief.position || null,
      maxAge: wholeNumber(brief.maxAge),
      maxFee: fee === null ? null : toPounds(Math.max(0, fee)),
      betterOnly: brief.betterOnly,
      limit,
    };
  }, [brief, limit]);
  const requestKey = JSON.stringify(request);

  // Answers are kept for the data version they were read at, so going back to a list is at once.
  const cache = useRef(new Map<string, Opportunities>());
  const cachedVersion = useRef(version);
  if (cachedVersion.current !== version) {
    cache.current.clear();
    cachedVersion.current = version;
  }
  const [result, setResult] = useState<Opportunities | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (hidden) {
      return;
    }
    const mine = ++seq.current;
    const known = cache.current.get(requestKey);
    if (known) {
      setResult(known);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      scoutingOpportunities(request).then(
        (found) => {
          cache.current.set(requestKey, found);
          if (mine === seq.current) {
            setResult(found);
            setError(null);
            setSearching(false);
          }
        },
        (e) => {
          if (mine === seq.current) {
            setResult(null);
            setError(describeError(e));
            setSearching(false);
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `requestKey` stands for `request`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, overview, version, hidden]);

  const [order, setOrder] = useState<ColumnOrder<FoundSort>>(SCOUT_ORDER);
  useEffect(() => setOrder(SCOUT_ORDER), [briefKey]);
  // The items shown are those of the list asked for: while another one loads, the last answer's own list stays.
  const items = result?.items ?? [];
  const rows = useMemo(() => sortFound(items, order), [items, order]);
  const counts = new Map(result?.counts.map((c) => [c.kind, c]) ?? []);
  const starters = new Map<string, Fitting>(result?.starters.map((s) => [s.position, s]) ?? []);
  const starterAt = (position: string) => starters.get(position) ?? null;
  const shownKind = result?.kind ?? brief.kind;
  const count = counts.get(shownKind);
  const more = result !== null && items.length >= limit && limit < MOST && (count?.more || (count?.count ?? 0) > limit);

  return (
    <div className="scout-opportunities" hidden={hidden}>
      <div className="scout-kinds" role="group" aria-label={text.kindsLabel}>
        {OPPORTUNITY_KINDS.map((kind) => {
          const c = counts.get(kind);
          return (
            <button
              key={kind}
              type="button"
              className="scout-kind"
              data-kind={kind}
              aria-pressed={brief.kind === kind}
              onClick={() => onBrief({ kind })}
            >
              <span className="scout-kind-top">
                <span className="scout-kind-name">{text.kinds[kind]}</span>
                <span className="scout-kind-count" aria-label={text.countLabel}>
                  {c ? text.count(c.count, c.more) : "…"}
                </span>
              </span>
              <span className="scout-kind-hint">{text.hints[kind]}</span>
            </button>
          );
        })}
      </div>

      <div className="scout-filterbar">
        <label className="scout-field">
          <span>{text.position}</span>
          <select value={brief.position} onChange={(e) => onBrief({ position: e.currentTarget.value })}>
            <option value="">{text.anyPosition}</option>
            {overview.positions.map((p) => (
              <option key={p.key} value={p.key}>
                {positionLabel(p.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="scout-field scout-field-short">
          <span>{text.maxAge}</span>
          <input
            type="number"
            min={15}
            max={45}
            value={brief.maxAge}
            onChange={(e) => onBrief({ maxAge: e.currentTarget.value })}
          />
        </label>
        <label className="scout-field">
          <span>
            {text.maxFee} ({currencySymbol})
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={brief.maxFee}
            onChange={(e) => onBrief({ maxFee: e.currentTarget.value })}
          />
        </label>
        <label className="scout-check" title={text.betterOnlyTitle}>
          <input
            type="checkbox"
            checked={brief.betterOnly}
            onChange={(e) => onBrief({ betterOnly: e.currentTarget.checked })}
          />
          {text.betterOnly}
        </label>
      </div>

      {error && <div className="banner scout-banner">{error}</div>}

      <div className="scout-toolbar">
        <span className="scout-summary muted" aria-live="polite">
          {result
            ? text.summary(
                text.kinds[shownKind],
                formatNumber(result.lowest),
                formatNumber(result.highest),
                formatNumber(result.pool),
              )
            : searching
              ? scoutingText.searching
              : ""}
          {result && searching && ` · ${scoutingText.searching}`}
        </span>
        <span className="scout-how">
          <InfoTip label={text.how.label} note={text.how.note} />
          <span className="muted">{text.how.label}</span>
        </span>
        {order.by !== "rank" && (
          <button type="button" className="scout-reset-order" onClick={() => setOrder(SCOUT_ORDER)}>
            {scoutingText.backToScoutOrder}
          </button>
        )}
      </div>

      {result &&
        (items.length === 0 ? (
          <p className="empty">{shownKind === "wonderkid" ? text.emptyWonderkids : text.empty}</p>
        ) : (
          <FoundTable
            rows={rows}
            order={order}
            onOrder={setOrder}
            onOpen={onOpen}
            middle={[
              {
                key: "position",
                label: text.columns.position,
                className: "scout-col-position",
                cell: (o: Opportunity) => (
                  <span className="scout-pos" title={o.better ? text.better : undefined}>
                    {positionLabel(o.position)}
                    {o.better && <span className="scout-better" aria-label={text.better} />}
                  </span>
                ),
              },
            ]}
            end={[
              {
                key: "why",
                label: text.columns.why,
                className: "scout-note-cell",
                cell: (o: Opportunity) => (
                  <span className="tag scout-why" data-why={o.why.code} title={whyText(o.why)}>
                    {whyText(o.why)}
                  </span>
                ),
              },
            ]}
            actions={(o: Opportunity) => ({
              onCompare: () =>
                onCompare({
                  position: o.position,
                  starter: starterAt(o.position),
                  picks: [pickOfOpportunity(o)],
                  pool: items.filter((other) => other.position === o.position).map(pickOfOpportunity),
                }),
              onSimilar: () => onSimilar(o.player),
              onReport: () => onReport({ pick: pickOfOpportunity(o) }),
            })}
          />
        ))}
      {more && (
        <button type="button" className="scout-more" onClick={() => setLimit(Math.min(MOST, limit + PAGE))}>
          {scoutingText.showMore(PAGE)}
        </button>
      )}
      <p className="scout-note muted">{scoutingText.note}</p>
    </div>
  );
}
