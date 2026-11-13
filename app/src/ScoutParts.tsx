// Small pieces the sections of the Scouting tab share: a player's name and face, the fit bar, the chips of
// reasons, the colours of the depth statuses, the actions on a player found, and the texts that turn the core's codes
// into words.

import { type ReactNode } from "react";
import { formatMoney } from "./format";
import { InfoTip } from "./InfoTip";
import { profileText, scoutingText as text } from "./labels";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { tierOf } from "./PositionPitch";
import type {
  DepartureReason,
  DepthStatus,
  Fitting,
  Phase,
  PlayerSummary,
  Reason,
  Role,
  ScoutPosition,
  Suggestion,
  Why,
} from "./types";

/** The squad line each position belongs to, as the dots on the pitch need it. */
export const LINE_OF_POSITION: Record<string, string> = {
  gk: "gk",
  dc: "dc",
  dr: "rightBack",
  wbr: "rightBack",
  dl: "leftBack",
  wbl: "leftBack",
  dm: "dm",
  mc: "mc",
  amr: "rightWing",
  mr: "rightWing",
  aml: "leftWing",
  ml: "leftWing",
  amc: "amc",
  st: "st",
};

export const roleName = (key: string) => text.roles[key] ?? key.toUpperCase();

/** "IFB", or "?" for a role the editor does not know. */
export const roleAbbreviation = (key: string | null) => (key === null ? "?" : key.toUpperCase());

/** The reasons whose value is an amount of money; the others' is a number of days. */
const MONEY_REASONS: ReadonlySet<string> = new Set(["releaseClause", "overBudget", "stretch", "wageHigh"]);

export function reasonText(reason: Reason): string {
  const say = text.reasons[reason.code];
  if (!say) {
    return reason.code;
  }
  const { value } = reason;
  return say(value === null ? "" : MONEY_REASONS.has(reason.code) ? formatMoney(value) : String(Math.round(value)));
}

export function departureReasonText({ code, value }: DepartureReason): string {
  const say = text.departureReasons[code];
  if (!say) {
    return code;
  }
  const shown = value === null ? "" : code === "highWage" ? formatMoney(value) : String(Math.round(value));
  return say(shown);
}

export const signed = (points: number) => (points > 0 ? `+${points}` : String(points));

/** An amount in pounds, short, in the chosen currency: "£38.6M", "£36K". */
export const shortMoney = (pounds: number) => formatMoney(pounds, { notation: "compact", maximumFractionDigits: 1 });

/** How well a player plays a position, in the words of his profile ("Natural", "Competent"). */
export const familiarity = (rating: number) => profileText.positionTiers[tierOf(Math.round(rating))];

/** The line's name in the plural, or the key for one the editor has no name for. */
export const depthLineName = (key: string) => text.depthLines[key] ?? key;

/** A face and the name that opens the player's profile; `sub` is the line under the name. */
export function PlayerName({
  player,
  onOpen,
  sub,
}: {
  player: PlayerSummary;
  onOpen: (player: PlayerSummary) => void;
  sub?: ReactNode;
}) {
  return (
    <WithPicture picture={<PersonFace uid={player.uid} name={player.name} size={PICTURE_SIZE.rowFace} />}>
      <button
        type="button"
        className="name name-link"
        aria-haspopup="dialog"
        title={text.openProfile}
        onClick={() => onOpen(player)}
      >
        {player.name}
      </button>
      {sub !== undefined && <div className="sub">{sub}</div>}
    </WithPicture>
  );
}

/**
 * The player's club under his name: its logo and name, or "Free agent". For a player on loan, or in a club's second
 * team, `owner` is the club his contract is with, which would sell him; the club he plays for follows it.
 */
export function ClubLine({ player, owner }: { player: PlayerSummary; owner?: { uid: number; name: string } | null }) {
  if (owner) {
    const title = player.club === null ? owner.name : `${owner.name} · ${text.playsFor(player.club)}`;
    return (
      <span className="scout-club-line" title={title}>
        <ClubLogo uid={owner.uid} name={owner.name} size={PICTURE_SIZE.textLogo} />
        <span className="name-text">
          {owner.name}
          {player.club !== null && <span className="muted"> · {text.playsFor(player.club)}</span>}
        </span>
      </span>
    );
  }
  if (player.club === null || player.clubUid === null) {
    return <span className="scout-club-line muted">{text.freeAgent}</span>;
  }
  return (
    <span className="scout-club-line" title={player.club}>
      <ClubLogo uid={player.clubUid} name={player.club} size={PICTURE_SIZE.textLogo} />
      <span className="name-text">{player.club}</span>
    </span>
  );
}

/** A small bar and the number it stands for. */
export function FitBar({ fit, title }: { fit: number; title?: string }) {
  const level = fit >= 70 ? "good" : fit >= 50 ? "ok" : "poor";
  return (
    <div className="scout-fit" title={title}>
      <span className="scout-bar" aria-hidden="true">
        <span className={level} style={{ width: `${Math.max(0, Math.min(100, fit))}%` }} />
      </span>
      <span className="num">{Math.round(fit)}</span>
    </div>
  );
}

/** "IFB / PFB", each with its full name on hover. */
export function RoleAbbreviations({ inPossession, outOfPossession }: { inPossession: string | null; outOfPossession: string | null }) {
  const one = (key: string | null) => (
    <span title={key === null ? undefined : roleName(key)}>{roleAbbreviation(key)}</span>
  );
  return (
    <span className="scout-roles-pair">
      {one(inPossession)} / {one(outOfPossession)}
    </span>
  );
}

/** The (i) beside the Probability column's title, which says what the probability is. */
export function ProbabilityInfo() {
  return (
    <span className="scout-th-info">
      <InfoTip label={text.probabilityInfoLabel} note={text.probabilityInfo} />
    </span>
  );
}

/** The dot that says how a squad line stands. */
export function StatusDot({ status }: { status: DepthStatus }) {
  return <span className="scout-dot" data-status={status} aria-hidden="true" />;
}

/** A player the scout found, with what a comparison and a report need beside him. */
export interface ScoutPick {
  suggestion: Suggestion;
  /** The position he was measured for. */
  position: string;
  /** What makes him an opportunity, in the lists of opportunities. */
  why?: Why | null;
  /** How alike he is to the player asked about (0–100), among the players like one. */
  similarity?: number | null;
}

/** What opens the comparison: the club's best player at the position, the players to compare, and those to add. */
export interface CompareAsk {
  position: string;
  starter: Fitting | null;
  picks: ScoutPick[];
  /** The other players of the same list at the same position, which the comparison can add. */
  pool: ScoutPick[];
}

/** What opens a scout report: the player as the scout found him. */
export interface ReportAsk {
  pick: ScoutPick;
}

/** What the three actions of a row of found players do; one left out is not offered. */
export interface RowHandlers {
  onCompare?: () => void;
  onSimilar?: () => void;
  onReport?: () => void;
}

/** The roles of one phase that are played at a position (a position key), its own line first. */
export function rolesFor(roles: Role[], positions: ScoutPosition[], position: string, phase: Phase): Role[] {
  const lines = positions.find((p) => p.key === position)?.lines ?? [];
  return lines.flatMap((line) => roles.filter((role) => role.phase === phase && role.line === line));
}

/** The reasons whose value is an amount of money. */
const MONEY_WHY: ReadonlySet<string> = new Set(["releaseClause", "inTheRed"]);

/** What makes a player an opportunity, in words: "Contract ends in 169 days", "Release clause £6.1M (value £7.3M)". */
export function whyText(why: Why): string {
  const say = text.why[why.code];
  if (!say) {
    return why.code;
  }
  const shown = (value: number | null) =>
    value === null ? "" : MONEY_WHY.has(why.code) ? shortMoney(value) : String(Math.round(value));
  return say(shown(why.value), why.against === null ? null : shortMoney(why.against));
}

/** "Better than your no. 1", "Close to your no. 1", "Below your no. 1", or nothing when the club has no one there. */
export function verdictOf(fit: number, starter: Fitting | null): "better" | "close" | "below" | null {
  if (starter === null) {
    return null;
  }
  return fit > starter.fit ? "better" : fit >= starter.fit - 8 ? "close" : "below";
}

/** "Likely to join", "Could join", "Hard to sign", by the probability (0–100). */
export const chanceOf = (probability: number): "likely" | "possible" | "hard" =>
  probability >= 70 ? "likely" : probability >= 50 ? "possible" : "hard";

function CompareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 7h12m-3.5-3.5L15.5 7 12 10.5M16.5 13h-12M8 9.5 4.5 13 8 16.5" />
    </svg>
  );
}

function SimilarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="7.5" cy="10" r="4.5" />
      <circle cx="12.5" cy="10" r="4.5" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 2.5h6.5l3 3v12h-9.5zM12 2.5v3h3M8 9.5h4.5M8 12.5h4.5M8 15.5h2.5" />
    </svg>
  );
}

/**
 * The actions at the end of a row of players the scout found: compare him with the club's best player at his
 * position, find players like him, and his scout report. Each says whom it is about to assistive technology.
 */
export function RowActions({ name, onCompare, onSimilar, onReport }: RowHandlers & { name: string }) {
  return (
    <div className="scout-row-actions">
      {onCompare && (
        <button
          type="button"
          className="icon-button"
          data-action="compare"
          aria-haspopup="dialog"
          aria-label={text.actions.compareLabel(name)}
          title={text.actions.compare}
          onClick={onCompare}
        >
          <CompareIcon />
        </button>
      )}
      {onSimilar && (
        <button
          type="button"
          className="icon-button"
          data-action="similar"
          aria-label={text.actions.similarLabel(name)}
          title={text.actions.similar}
          onClick={onSimilar}
        >
          <SimilarIcon />
        </button>
      )}
      {onReport && (
        <button
          type="button"
          className="icon-button"
          data-action="report"
          aria-haspopup="dialog"
          aria-label={text.actions.reportLabel(name)}
          title={text.actions.report}
          onClick={onReport}
        >
          <ReportIcon />
        </button>
      )}
    </div>
  );
}

/** The "Find a replacement" button of a player the scout would let go: players like him. */
export function ReplacementButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="scout-replace"
      aria-label={text.actions.replacementLabel(name)}
      title={text.actions.replacementTitle}
      onClick={onClick}
    >
      <SimilarIcon />
      {text.actions.replacement}
    </button>
  );
}
