// The pages of a player's profile under its tabs: his profile as FM prints it, and the seasons and milestones the
// editor does not read yet. They are for reading only: what he is edited in is the overview, whose inputs stay there.

import { Ability } from "./Ability";
import { converts } from "./currency";
import { formatDate, formatMoney } from "./format";
import { ATTRIBUTE_LABELS, editText, playerListText, playerPagesText, positionLabel, profileText } from "./labels";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact, personalityRows, RatingGroup, ReputationBars, type PanelIds } from "./ProfileParts";
import type { PlayerDetails, Tie } from "./types";

const text = playerPagesText;

/** The names of the ties of `kinds`, in the order the game keeps them: his other nationalities, or where he trained. */
function tieNames(ties: Tie[], ...kinds: Tie["tie"][]): string[] {
  return ties.filter((tie) => kinds.includes(tie.tie) && tie.name !== null).map((tie) => tie.name ?? "");
}

/**
 * The foot he plays with, as FM names it: either, when both are rated 12 or more of FM's 20, otherwise the better one.
 * Both ratings are the figures the overview shows, for the hover text.
 */
function foot(details: PlayerDetails): { value: string; title: string } {
  const left = details.attributes.left_foot?.value ?? 0;
  const right = details.attributes.right_foot?.value ?? 0;
  const value =
    left === 0 && right === 0
      ? profileText.none
      : left >= 12 && right >= 12
        ? text.about.bothFeet
        : left > right
          ? ATTRIBUTE_LABELS.left_foot
          : ATTRIBUTE_LABELS.right_foot;
  return { value, title: `${ATTRIBUTE_LABELS.left_foot} ${left} · ${ATTRIBUTE_LABELS.right_foot} ${right}` };
}

/** Who he is, where and when he was born, and what he plays with: the profile as FM prints it, read only. */
export function PlayerAboutPage({ details, panel }: { details: PlayerDetails; panel: PanelIds }) {
  const about = text.about;
  const contract = details.contract;
  const secondary = tieNames(details.ties, "nationality");
  const trained = tieNames(details.ties, "trainedInNation", "trainedAtClub");
  const playingFoot = foot(details);
  const yesNo = (on: boolean) => (on ? editText.yes : editText.no);

  return (
    <div className="profile-split player-about" role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
      <div className="profile-stack">
        <section className="profile-group">
          <h3>{about.identity}</h3>
          <dl className="stats">
            <Fact label={about.fullName}>{details.fullName ?? details.name}</Fact>
            {details.dateOfBirth && (
              <Fact label={profileText.born}>
                {formatDate(details.dateOfBirth)}
                {details.age !== null && ` (${profileText.age(details.age)})`}
              </Fact>
            )}
            <Fact label={about.cityOfBirth}>
              {details.birthCity === null ? (
                profileText.none
              ) : (
                <WithPicture inline picture={<NationFlag uid={details.birthCity.nationUid} />}>
                  {details.birthCity.name}
                </WithPicture>
              )}
            </Fact>
            <Fact label={about.nationality}>
              {details.nation === null ? (
                profileText.none
              ) : (
                <WithPicture inline picture={<NationFlag uid={details.nationUid} />}>
                  {details.nation}
                </WithPicture>
              )}
            </Fact>
            {secondary.length > 0 && <Fact label={about.otherNationalities}>{secondary.join(" · ")}</Fact>}
            {trained.length > 0 && <Fact label={about.trainedAt}>{trained.join(" · ")}</Fact>}
            <Fact label={about.height}>
              {details.heightCm > 0 ? profileText.height(details.heightCm) : profileText.none}
            </Fact>
            <Fact label={about.foot} title={playingFoot.title}>
              {playingFoot.value}
            </Fact>
            <Fact label={profileText.positions}>
              {details.positions.length === 0
                ? profileText.none
                : details.positions.map((position) => positionLabel(position)).join(" · ")}
            </Fact>
            <Fact label={profileText.currentAbility}>
              <Ability value={details.currentAbility} />
            </Fact>
            <Fact label={profileText.potentialAbility}>
              <Ability value={details.potentialAbility} />
            </Fact>
          </dl>
        </section>

        <section className="profile-group">
          <h3>{profileText.career}</h3>
          <dl className="stats">
            <Fact label={profileText.internationalCaps}>{details.international.caps}</Fact>
            <Fact label={profileText.internationalGoals}>{details.international.goals}</Fact>
            <Fact label={profileText.u21Caps}>{details.international.u21Caps}</Fact>
            <Fact label={profileText.u21Goals}>{details.international.u21Goals}</Fact>
          </dl>
        </section>
      </div>

      <div className="profile-stack">
        <section className="profile-group">
          <h3>{about.status}</h3>
          <dl className="stats">
            <Fact label={playerListText.columns.club}>
              {details.club === null ? (
                <span className="muted">{profileText.freeAgent}</span>
              ) : (
                <WithPicture inline picture={<ClubLogo uid={details.clubUid} name={details.club} size={PICTURE_SIZE.textLogo} />}>
                  {details.club}
                </WithPicture>
              )}
            </Fact>
            {contract && (
              <>
                {contract.squadNumber !== null && <Fact label={profileText.squadNumber}>{contract.squadNumber}</Fact>}
                <Fact label={profileText.squadStatus}>{profileText.squadStatusName(contract.squadStatus)}</Fact>
                {contract.contractType !== null && (
                  <Fact label={profileText.contractType}>{profileText.contractTypeName(contract.contractType)}</Fact>
                )}
                <Fact label={profileText.wage}>{formatMoney(contract.wage)}</Fact>
                <Fact label={profileText.joined}>{formatDate(contract.joined) || profileText.none}</Fact>
                <Fact label={profileText.signed}>{formatDate(contract.signed) || profileText.none}</Fact>
                <Fact label={profileText.expires}>{formatDate(contract.expires) || profileText.none}</Fact>
                <Fact label={profileText.transferListed}>{yesNo(contract.transferListed)}</Fact>
                <Fact label={profileText.loanListed}>{yesNo(contract.loanListed)}</Fact>
              </>
            )}
            {details.retirementKnown && details.retires && (
              <Fact label={profileText.retires}>{formatDate(details.retires)}</Fact>
            )}
            <Fact label={profileText.askingPrice}>
              {details.askingPrice === null ? profileText.notSet : formatMoney(details.askingPrice)}
            </Fact>
          </dl>
          {contract && <p className="note">{profileText.wageNote(converts)}</p>}
        </section>

        <section className="profile-group">
          <h3>{profileText.reputation}</h3>
          <ReputationBars reputation={details.reputation} />
        </section>

        <RatingGroup title={profileText.personality} rows={personalityRows(details.personality)} />

        <section className="profile-group">
          <h3>{profileText.traits}</h3>
          {details.traits.length === 0 ? (
            <p className="note">{profileText.noTraits}</p>
          ) : (
            <div className="tags">
              {details.traits.map((bit) => (
                <span key={bit} className="tag">
                  {profileText.traitName(bit)}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The page under the Career tab: what the editor will list of his seasons once it reads them, and that it does not yet.
 * No table and no figures: empty ones read as a player who never played.
 */
export function PlayerCareerPage({ panel }: { panel: PanelIds }) {
  return (
    <PendingPage
      panel={panel}
      title={text.tabs.career}
      pending={text.career.pending}
      explain={text.career.explain}
      detail={text.career.columns}
    />
  );
}

/** The page under the Milestones tab: the awards and honours, which come with the records of his seasons. */
export function PlayerMilestonesPage({ panel }: { panel: PanelIds }) {
  return (
    <PendingPage
      panel={panel}
      title={text.tabs.milestones}
      pending={text.milestones.pending}
      explain={text.milestones.explain}
      detail={text.milestones.entries}
    />
  );
}

interface PendingPageProps {
  panel: PanelIds;
  title: string;
  /** What the editor does not read yet. */
  pending: string;
  /** Why not, and where it will come from. */
  explain: string;
  /** What the page will list, or the entries it will hold, as one line. */
  detail: string;
}

/** A page of the profile whose data the editor does not read yet: said plainly, with what it will show. */
function PendingPage({ panel, title, pending, explain, detail }: PendingPageProps) {
  return (
    <div className="player-pending" role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
      <section className="profile-group">
        <h3>{title}</h3>
        <p className="player-pending-state">{pending}</p>
        <p className="note player-pending-note">{explain}</p>
        <p className="player-pending-detail">{detail}</p>
      </section>
    </div>
  );
}
