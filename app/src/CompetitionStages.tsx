// A competition's stages on the standings page: the tabs that follow the calendar or pick a stage by hand, and the
// knockout rounds shown as one club against another. The league phase keeps the table `StandingsCard` already draws;
// only the rounds of ties live here. Every string comes from `strings`, and the tabs are ordinary buttons so the
// keyboard reaches them in the order they are read and focus stays where it was.

import { rowMenuProps } from "./EntityRowMenu";
import { formatDate, formatDateRange, formatNumber } from "./format";
import { standingsText as text } from "./labels";
import { ClubLogo, PICTURE_SIZE } from "./Picture";
import type { ClubSummary, CompetitionStage, KnockoutTie, StageClub } from "./types";

/**
 * What a stage's tab says. The game's own name wins; where it has none, the number of ties names the round, as the
 * European cups' draws do (8, 8, 4, 2, 1). A stage with no ties read yet is just called a knockout stage. A
 * competition can hold several unnamed league stages, one a season or a group each, or cup rounds whose ties
 * cannot be read yet: those are numbered in the order they were read, or their tabs would all read alike.
 */
export function stageLabel(stage: CompetitionStage, all: readonly CompetitionStage[]): string {
  if (stage.name !== null) {
    return stage.name;
  }
  const words = text.stage;
  if (stage.kind === "league") {
    const unnamed = all.filter((each) => each.kind === "league" && each.name === null);
    if (unnamed.length > 1) {
      return `${words.league} ${formatNumber(unnamed.findIndex((each) => each.id === stage.id) + 1)}`;
    }
    return words.league;
  }
  if (stage.kind === "upcoming") {
    return words.upcoming;
  }
  switch (stage.ties.length) {
    case 1:
      return words.final;
    case 2:
      return words.semiFinals;
    case 4:
      return words.quarterFinals;
    case 8: {
      const eights = all.filter((each) => each.kind === "knockout" && each.ties.length === 8);
      return eights.length > 1 && eights[0].id === stage.id ? words.playoffs : words.roundOf16;
    }
    case 0: {
      // A round the game has no ties read for has no name of its own: number the rounds that read alike.
      const unnamed = all.filter((each) => each.kind === "knockout" && each.ties.length === 0 && each.name === null);
      if (unnamed.length > 1) {
        return `${words.knockout} ${formatNumber(unnamed.findIndex((each) => each.id === stage.id) + 1)}`;
      }
      return words.knockout;
    }
    default:
      return words.round(stage.ties[0].round || 1);
  }
}

interface StageTabsProps {
  /** The stages of the card's competition, in the order the game plays them. */
  stages: CompetitionStage[];
  /** The stage Rust says the calendar is in; null while it is not known. */
  currentId: string | null;
  /** The stage picked by hand, or null while the card follows the calendar. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** The row over a card's stage: "Auto" follows the calendar, the others pin a stage to look at. */
export function StageTabs({ stages, currentId, selectedId, onSelect }: StageTabsProps) {
  return (
    <div className="stage-tabs" role="group" aria-label={text.stage.label}>
      <button
        type="button"
        className={`stage-tab stage-tab-auto${selectedId === null ? " active" : ""}`}
        aria-pressed={selectedId === null}
        title={text.stage.autoTitle}
        onClick={() => onSelect(null)}
      >
        {text.stage.auto}
      </button>
      {stages.map((stage) => {
        const when = formatDateRange(stage.startDate, stage.endDate);
        const label = stageLabel(stage, stages);
        return (
          <button
            key={stage.id}
            type="button"
            className={`stage-tab${selectedId === stage.id ? " active" : ""}${stage.id === currentId ? " current" : ""}`}
            aria-pressed={selectedId === stage.id}
            aria-current={stage.id === currentId ? "true" : undefined}
            title={when === "" ? label : `${label} · ${when}`}
            onClick={() => onSelect(stage.id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface KnockoutBracketProps {
  stage: CompetitionStage;
  /** Opens a club's profile over the page, as a club's name in the table does. */
  onOpenClub: (club: ClubSummary) => void;
}

/** The ties of a knockout stage, in the order their rounds are played: one club against another, with the score
 * where the game gave one. */
export function KnockoutBracket({ stage, onOpenClub }: KnockoutBracketProps) {
  if (stage.ties.length === 0) {
    return <p className="standings-note">{text.stage.noTies}</p>;
  }
  const rounds = new Map<number, KnockoutTie[]>();
  for (const tie of stage.ties) {
    const ofRound = rounds.get(tie.round) ?? [];
    ofRound.push(tie);
    rounds.set(tie.round, ofRound);
  }
  return (
    <div className="bracket">
      {[...rounds.entries()].map(([round, ties]) => (
        <section className="bracket-round" key={round} aria-label={stageLabel(stage, [stage])}>
          {rounds.size > 1 && <h3 className="bracket-round-name">{text.stage.round(round)}</h3>}
          <ol className="bracket-ties">
            {ties.map((tie, index) => (
              <li
                className="bracket-tie"
                key={`${round}-${index}-${tie.home.clubUid}-${tie.away.clubUid}`}
                aria-label={text.stage.versus(tie.home.club, tie.away.club)}
              >
                {tie.date !== null && <span className="bracket-date">{formatDate(tie.date)}</span>}
                <TieClub club={tie.home} goals={tie.homeGoals} other={tie.awayGoals} onOpenClub={onOpenClub} />
                <TieClub club={tie.away} goals={tie.awayGoals} other={tie.homeGoals} onOpenClub={onOpenClub} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

interface TieClubProps {
  club: StageClub;
  goals: number | null;
  other: number | null;
  onOpenClub: (club: ClubSummary) => void;
}

/** One side of a tie: its name opens the club's profile, and its score is a dash where the match is not played. */
function TieClub({ club, goals, other, onOpenClub }: TieClubProps) {
  const winner = goals !== null && other !== null && goals > other;
  return (
    <div className={`bracket-club${winner ? " bracket-club-winner" : ""}`} {...rowMenuProps("club", club.club, club.clubUid)}>
      <button
        type="button"
        className="bracket-club-name"
        title={club.club}
        aria-haspopup="dialog"
        aria-label={club.club}
        onClick={() =>
          onOpenClub({
            uid: club.clubUid,
            name: club.club,
            shortName: club.shortName,
            women: false,
            reputation: null,
            founded: null,
          })
        }
      >
        <ClubLogo uid={club.clubUid} name={club.club} size={PICTURE_SIZE.rowLogo} />
        <span>{club.shortName ?? club.club}</span>
      </button>
      <span className="bracket-score" aria-label={goals === null ? text.stage.notPlayed : undefined}>
        {goals ?? "–"}
      </span>
    </div>
  );
}
