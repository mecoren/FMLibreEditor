// The squad on a pitch: the ten lines where they play, each with how it stands, its best players and who else can
// play there. A line picked on the pitch shows in full beside it, with a way to ask for advice there.

import { type CSSProperties, useState } from "react";
import { formatNumber } from "./format";
import { positionLabel, scoutingText as text } from "./labels";
import { depthLineName, familiarity, PlayerName, StatusDot } from "./ScoutParts";
import type { DepthLine, PlayerSummary, SquadReport } from "./types";

/** Where each line stands on the pitch, attack at the top: [grid column, first row, rows]. */
const PLACES: Record<string, readonly [number, number, number]> = {
  st: [2, 1, 1],
  leftWing: [1, 2, 2],
  amc: [2, 2, 1],
  rightWing: [3, 2, 2],
  mc: [2, 3, 1],
  leftBack: [1, 4, 2],
  dm: [2, 4, 1],
  rightBack: [3, 4, 2],
  dc: [2, 5, 1],
  gk: [2, 6, 1],
};

/** How many of a line's players a spot on the pitch names. */
const NAMED = 3;

/** Whether a line needs a look: missing, thin or crowded, or weak or ageing. */
export const needsLook = (line: DepthLine) => line.status !== "fine" || line.weak || line.ageing;

/** The short name of a line on the pitch: its positions ("DR / WBR"). */
const shortName = (line: DepthLine) => line.positions.map(positionLabel).join(" / ");

export function ScoutDepthPitch({
  report,
  onOpen,
  onAdvice,
}: {
  report: SquadReport;
  onOpen: (player: PlayerSummary) => void;
  onAdvice: (position: string) => void;
}) {
  const placed = report.lines.filter((line) => PLACES[line.key] !== undefined);
  const [picked, setPicked] = useState<string>(() => (placed.find(needsLook) ?? placed[placed.length - 1])?.key ?? "");
  const line = placed.find((l) => l.key === picked) ?? placed[0];

  return (
    <div className="scout-depth-pitch">
      <div className="scout-big-pitch" role="group" aria-label={text.depth.pitchLabel}>
        <svg className="scout-pitch-lines" viewBox="0 0 300 420" preserveAspectRatio="none" aria-hidden="true">
          <rect x="6" y="6" width="288" height="408" rx="2" />
          <line x1="6" y1="210" x2="294" y2="210" />
          <circle cx="150" cy="210" r="34" />
          <rect x="70" y="6" width="160" height="58" />
          <rect x="112" y="6" width="76" height="22" />
          <rect x="70" y="356" width="160" height="58" />
          <rect x="112" y="392" width="76" height="22" />
        </svg>
        {placed.map((l) => {
          const [column, row, rows] = PLACES[l.key];
          return (
            <button
              key={l.key}
              type="button"
              className="scout-line-spot"
              data-line={l.key}
              data-status={l.status}
              aria-pressed={l.key === line?.key}
              title={text.positionTip(depthLineName(l.key), l.players.length, l.target, text.status[l.status])}
              style={{ gridColumn: column, gridRow: `${row} / span ${rows}` } as CSSProperties}
              onClick={() => setPicked(l.key)}
            >
              <span className="scout-spot-head">
                <StatusDot status={l.status} />
                <span className="scout-spot-name">{shortName(l)}</span>
                <span className="scout-spot-count">
                  {l.players.length}/{l.target}
                </span>
              </span>
              <span className="scout-spot-players">
                {l.players.length === 0 ? (
                  <span className="muted">{text.depth.empty}</span>
                ) : (
                  l.players.slice(0, NAMED).map((d) => (
                    <span key={d.player.uid} className="scout-spot-player">
                      <span className="scout-spot-player-name">{d.player.name}</span>
                      <span className="scout-spot-ability">{d.player.currentAbility}</span>
                    </span>
                  ))
                )}
              </span>
              {(l.weak || l.ageing || l.cover.length > 0) && (
                <span className="scout-spot-foot">
                  {[
                    l.weak && text.depth.weak,
                    l.ageing && text.depth.ageing,
                    l.cover.length > 0 && text.depth.coverCount(l.cover.length),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {line && <LineDetail line={line} onOpen={onOpen} onAdvice={onAdvice} />}
    </div>
  );
}

/** A line in full: its status, its players best first, who else can play there, and the advice for it. */
function LineDetail({
  line,
  onOpen,
  onAdvice,
}: {
  line: DepthLine;
  onOpen: (player: PlayerSummary) => void;
  onAdvice: (position: string) => void;
}) {
  const position = line.positions[0];
  return (
    <section className="scout-line-detail" aria-label={depthLineName(line.key)} data-status={line.status}>
      <header className="scout-line-detail-head">
        <h3>{depthLineName(line.key)}</h3>
        <span className="scout-status" data-status={line.status} title={text.depth.statusHelp[line.status]}>
          {text.status[line.status]}
        </span>
        {line.weak && <span className="tag scout-flag">{text.depth.weak}</span>}
        {line.ageing && <span className="tag scout-flag">{text.depth.ageing}</span>}
      </header>
      <p className="muted scout-line-detail-count">{text.depth.countTitle(line.players.length, line.target)}</p>

      <h4 className="scout-detail-heading">{text.depth.columns.players}</h4>
      {line.players.length === 0 ? (
        <p className="muted">{text.depth.empty}</p>
      ) : (
        <ul className="scout-detail-list">
          {line.players.map((d) => (
            <li key={d.player.uid}>
              <PlayerName player={d.player} onOpen={onOpen} />
              <span className="num muted">{d.player.age ?? text.none}</span>
              <span className="num scout-detail-ability" title={text.depth.ability}>
                {d.player.currentAbility}
              </span>
              <span className="muted scout-detail-rating">
                {familiarity(d.rating)}
                {d.onLoan && <span className="tag loan">{text.loan}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="scout-detail-heading">{text.depth.columns.cover}</h4>
      {line.cover.length === 0 ? (
        <p className="muted">{text.none}</p>
      ) : (
        <p className="scout-detail-cover">
          {line.cover.map((d, i) => (
            <span key={d.player.uid}>
              {i > 0 && ", "}
              <button type="button" className="name-link" aria-haspopup="dialog" onClick={() => onOpen(d.player)}>
                {d.player.name}
              </button>{" "}
              <span className="muted">{formatNumber(d.player.currentAbility)}</span>
            </span>
          ))}
        </p>
      )}

      {position !== undefined && (
        <button type="button" className="primary scout-detail-advice" onClick={() => onAdvice(position)}>
          {text.depth.adviceFor(positionLabel(position))}
        </button>
      )}
    </section>
  );
}
