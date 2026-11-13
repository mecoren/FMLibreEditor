// "Similar players": players like one player, as signings: the attributes his position's roles lean on are compared,
// mostly their shape and less their level. The player is picked by name, from the club's own best players, or from
// any list of the tab (the ≈ action, "Find a replacement").

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { toPounds } from "./currency";
import { currencySymbol, describeError, formatMoney, formatNumber } from "./format";
import { InfoTip } from "./InfoTip";
import { positionLabel, scoutingText } from "./labels";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { scoutingSimilar } from "./scoutApi";
import { FoundTable } from "./ScoutFoundTable";
import { type CompareAsk, FitBar, type ReportAsk, type ScoutPick } from "./ScoutParts";
import { type FoundSort, SCOUT_ORDER, sortFound } from "./scoutSort";
import type { ColumnOrder } from "./SortHeader";
import type { PlayerPage, PlayerSummary, ScoutingOverview, Similar, SimilarPlayer, SimilarRequest } from "./types";

const text = scoutingText.similar;

/** What the user asks for: the player, where to compare, and the filters as typed. */
export interface SimilarBrief {
  uid: number | null;
  /** His name, to show before the answer comes. */
  name: string;
  /** A position key; empty for the one he plays best. */
  position: string;
  cheaper: boolean;
  younger: boolean;
  /** In the shown currency. */
  maxFee: string;
}

export const DEFAULT_SIMILAR_BRIEF: SimilarBrief = {
  uid: null,
  name: "",
  position: "",
  cheaper: false,
  younger: false,
  maxFee: "",
};

const DEBOUNCE_MS = 250;
const PAGE = 50;
const MOST = 200;
/** How many players the name search offers. */
const MATCHES = 8;

function wholeNumber(typed: string): number | null {
  const number = typed.trim() === "" ? NaN : Number(typed);
  return Number.isFinite(number) ? Math.round(number) : null;
}

const pickOf = (item: SimilarPlayer, position: string): ScoutPick => ({
  suggestion: item,
  position,
  similarity: item.similarity,
});

interface Props {
  overview: ScoutingOverview;
  version: number;
  brief: SimilarBrief;
  onBrief: (patch: Partial<SimilarBrief>) => void;
  onOpen: (player: PlayerSummary) => void;
  onCompare: (ask: CompareAsk) => void;
  onReport: (ask: ReportAsk) => void;
  hidden: boolean;
}

export function ScoutSimilar({ overview, version, brief, onBrief, onOpen, onCompare, onReport, hidden }: Props) {
  const choose = (player: PlayerSummary) => onBrief({ uid: player.uid, name: player.name, position: "" });

  const briefKey = JSON.stringify(brief);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [briefKey]);
  const request: SimilarRequest | null = useMemo(() => {
    if (brief.uid === null) {
      return null;
    }
    const fee = wholeNumber(brief.maxFee);
    return {
      uid: brief.uid,
      position: brief.position || null,
      cheaper: brief.cheaper,
      younger: brief.younger,
      maxFee: fee === null ? null : toPounds(Math.max(0, fee)),
      limit,
    };
  }, [brief, limit]);
  const requestKey = JSON.stringify(request);

  const [result, setResult] = useState<Similar | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (hidden || request === null) {
      return;
    }
    const mine = ++seq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      scoutingSimilar(request).then(
        (found) => {
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
  // An answer about another player than the one asked for now is not shown.
  const current = result !== null && result.player.uid === brief.uid ? result : null;
  const items = current?.items ?? [];
  const rows = useMemo(() => sortFound(items, order), [items, order]);
  const more = current !== null && items.length >= limit && limit < MOST && current.candidates > limit;

  return (
    <div className="scout-similar" hidden={hidden}>
      {brief.uid === null && <PlayerPicker overview={overview} onChoose={choose} />}

      {brief.uid !== null && (
        <section className="scout-reference" aria-label={text.reference}>
          {current ? (
            <ReferenceCard similar={current} onOpen={onOpen} />
          ) : (
            <p className="muted">{searching ? scoutingText.searching : brief.name}</p>
          )}
          <div className="scout-reference-side">
            <button
              type="button"
              className="scout-picker-change"
              onClick={() => onBrief({ uid: null, name: "", position: "" })}
            >
              {text.change}
            </button>
          <div className="scout-reference-options">
            {current && current.positions.length > 0 && (
              <div className="scout-field">
                <span id="scout-similar-at">{text.position}</span>
                <div className="scout-segmented" role="group" aria-labelledby="scout-similar-at">
                  {current.positions.map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={current.position === key}
                      onClick={() => onBrief({ position: key })}
                    >
                      {positionLabel(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="scout-check" title={text.cheaperTitle}>
              <input type="checkbox" checked={brief.cheaper} onChange={(e) => onBrief({ cheaper: e.currentTarget.checked })} />
              {text.cheaper}
            </label>
            <label className="scout-check" title={text.youngerTitle}>
              <input type="checkbox" checked={brief.younger} onChange={(e) => onBrief({ younger: e.currentTarget.checked })} />
              {text.younger}
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
          </div>
          </div>
        </section>
      )}

      {error && <div className="banner scout-banner">{error}</div>}

      {brief.uid !== null && (
        <>
          <div className="scout-toolbar">
            <span className="scout-summary muted" aria-live="polite">
              {current
                ? text.summary(formatNumber(current.candidates), formatNumber(items.length), positionLabel(current.position))
                : searching
                  ? scoutingText.searching
                  : ""}
              {current && searching && ` · ${scoutingText.searching}`}
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
          {current &&
            (items.length === 0 ? (
              <p className="empty">{text.empty}</p>
            ) : (
              <FoundTable
                rows={rows}
                order={order}
                onOrder={setOrder}
                onOpen={onOpen}
                middle={[
                  {
                    key: "similarity",
                    label: text.columns.similarity,
                    sort: "similarity",
                    cell: (item: SimilarPlayer) => <FitBar fit={item.similarity} title={text.similarityTitle(item.similarity)} />,
                  },
                ]}
                end={[
                  {
                    key: "value",
                    label: text.columns.value,
                    className: "num",
                    cell: (item: SimilarPlayer) => (item.value === null ? scoutingText.none : formatMoney(item.value)),
                  },
                ]}
                actions={(item: SimilarPlayer) => ({
                  onCompare: () =>
                    onCompare({
                      position: current.position,
                      starter: current.starter,
                      picks: [pickOf(item, current.position)],
                      pool: items.map((other) => pickOf(other, current.position)),
                    }),
                  onSimilar: () => choose(item.player),
                  onReport: () => onReport({ pick: pickOf(item, current.position) }),
                })}
              />
            ))}
          {more && (
            <button type="button" className="scout-more" onClick={() => setLimit(Math.min(MOST, limit + PAGE))}>
              {scoutingText.showMore(PAGE)}
            </button>
          )}
          <p className="scout-note muted">{scoutingText.note}</p>
        </>
      )}
    </div>
  );
}

/** The player they are like: face, name, club, age, abilities and value. */
function ReferenceCard({ similar, onOpen }: { similar: Similar; onOpen: (player: PlayerSummary) => void }) {
  const { player } = similar;
  return (
    <div className="scout-reference-card">
      <PersonFace uid={player.uid} name={player.name} size={PICTURE_SIZE.face} />
      <div className="scout-reference-text">
        <span className="scout-reference-label">{text.reference}</span>
        <button type="button" className="name-link scout-reference-name" aria-haspopup="dialog" onClick={() => onOpen(player)}>
          {player.name}
        </button>
        <span className="scout-reference-club">
          {player.club === null || player.clubUid === null ? (
            scoutingText.freeAgent
          ) : (
            <WithPicture inline picture={<ClubLogo uid={player.clubUid} name={player.club} size={PICTURE_SIZE.textLogo} />}>
              {player.club}
            </WithPicture>
          )}
          {player.age !== null && <span className="muted"> · {scoutingText.compare.age(player.age)}</span>}
        </span>
        {similar.reference === null && (
          <span className="muted">{text.doesNotPlay(positionLabel(similar.position))}</span>
        )}
      </div>
      <dl className="scout-reference-figures">
        <div>
          <dt>{scoutingText.columns.ca}</dt>
          <dd>
            <Ability value={player.currentAbility} />
          </dd>
        </div>
        <div>
          <dt>{scoutingText.columns.pa}</dt>
          <dd>
            <Ability value={player.potentialAbility} />
          </dd>
        </div>
        <div>
          <dt>{text.value}</dt>
          <dd>{similar.notForSale ? text.notForSale : similar.value === null ? scoutingText.none : formatMoney(similar.value)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** The name search that picks the player, with the club's best player of each line to start from. */
function PlayerPicker({
  overview,
  onChoose,
}: {
  overview: ScoutingOverview;
  onChoose: (player: PlayerSummary) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PlayerSummary[] | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 2) {
      setMatches(null);
      return;
    }
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      call<PlayerPage>("search_players", { query: typed, limit: MATCHES }).then(
        (page) => {
          if (mine === seq.current) {
            setMatches(page.rows);
            setActive(0);
            setFailed(null);
          }
        },
        (e) => mine === seq.current && setFailed(describeError(e)),
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // The club's best player of each line, the goalkeeper first: a quick way to look for a replacement.
  const own = overview.report.lines.flatMap((line) =>
    line.players.slice(0, 1).map((d) => ({ position: line.positions[0] ?? "", player: d.player })),
  );

  const pick = (player: PlayerSummary) => {
    setQuery("");
    setMatches(null);
    onChoose(player);
  };

  return (
    <div className="scout-picker">
      <p className="scout-intro">{text.intro}</p>
      <div className="scout-picker-box">
        <input
          type="search"
          role="combobox"
          aria-expanded={matches !== null && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={text.search}
          placeholder={text.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (!matches || matches.length === 0) {
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((active + step + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === "Escape") {
              setMatches(null);
            }
          }}
        />
        {matches !== null && (
          <ul id={listId} className="scout-picker-list" role="listbox" aria-label={text.search}>
            {matches.length === 0 && <li className="muted scout-picker-none">{text.noMatch}</li>}
            {matches.map((player, i) => (
              <li
                key={player.uid}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(player);
                }}
              >
                <WithPicture picture={<PersonFace uid={player.uid} name={player.name} size={PICTURE_SIZE.rowFace} />}>
                  <span className="name">{player.name}</span>
                  <span className="sub muted">
                    {[player.club ?? scoutingText.freeAgent, player.positions.map(positionLabel).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </WithPicture>
              </li>
            ))}
          </ul>
        )}
        {failed && <p className="muted">{failed}</p>}
      </div>
      {own.length > 0 && (
        <div className="scout-quick">
          <span className="scout-label">{text.quickPicks}</span>
          <div className="scout-quick-list">
            {own.map(({ position, player }) => (
              <button key={player.uid} type="button" className="scout-quick-pick" onClick={() => pick(player)}>
                <span className="scout-quick-name">{player.name}</span>
                <span className="muted">{positionLabel(position)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
