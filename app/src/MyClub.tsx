// "My club": the page the app opens on once it is connected. It is about the club the user manages in the save: the
// club and its money at the head, then its squad as the Squad tab of a club's profile has it (the teams, the actions on
// a whole team, the boxes that freeze it, the table), with cards between the two that say who in the shown team needs a
// look: the injured, the banned, those with low morale, the tired, those teammates are unhappy about, and those whose
// contracts are about to end. A manager with no club picks a club to follow instead, which the app remembers.

import { useEffect, useId, useState } from "react";
import { call } from "./api";
import { ClubSearch } from "./ClubSearch";
import { rowMenuProps } from "./EntityRowMenu";
import { describeError, formatDate, formatMoney } from "./format";
import { clubProfileText, homeText as text, profileText, squadText } from "./labels";
import { percentText } from "./MedicalGroup";
import { ClubLogo, PICTURE_SIZE } from "./Picture";
import { ReputationMeter, useProfileDetails } from "./ProfileParts";
import { SquadTab } from "./SquadTab";
import type { ClubDetails, ClubPage, ClubSummary, ClubTeam, FmDate, SquadPlayer, StaffPage, StaffSummary } from "./types";

/** Where the club picked to follow is kept: its UID. */
const FOLLOW_KEY = "fmlibre.homeClub";

/** How many members of staff are asked for to find the user's managers: the search lists them first. */
const MANAGERS_ASKED = 20;

/** Morale below this, of 20, is low: 10 is what the game calls content. */
const LOW_MORALE = 10;

/** Energy below this is tired, as stored: 80%. */
const TIRED = 8000;

/** A contract that ends within this many months of the game's date is about to end. */
const CONTRACT_MONTHS = 6;

/** How many players a card names before it says how many more there are. */
const NAMES_SHOWN = 4;

/** The UID of the club picked to follow; null when none is, or the storage cannot be read. */
function followedUid(): number | null {
  try {
    const saved = Number(window.localStorage.getItem(FOLLOW_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
}

/** Remembers the club picked to follow; where it cannot be saved, it is followed until the app closes. */
function rememberFollowed(uid: number): void {
  try {
    window.localStorage.setItem(FOLLOW_KEY, String(uid));
  } catch {
    // Nothing to do: the page follows the club all the same.
  }
}

/** A club the page can be about: one the user manages, with the manager, or one picked to follow. */
interface Subject {
  uid: number;
  name: string;
  manager: StaffSummary | null;
}

/** Whose clubs the save has: the user's managers that have a club, and the club picked to follow, if it is there. */
type Found = { subjects: Subject[]; error?: undefined } | { subjects?: undefined; error: string };

/**
 * The clubs the page can be about, read again whenever `version` changes: the user's managers may have changed clubs.
 * The club picked to follow counts only while no manager has a club.
 */
function useSubjects(version: number, followed: number | null): Found | null {
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    let cancelled = false;
    const look = async (): Promise<Subject[]> => {
      // Without an order the search lists the managers the user controls first.
      const staff = await call<StaffPage>("search_staff", { query: "", limit: MANAGERS_ASKED });
      const own = staff.rows.flatMap((member) =>
        member.isHuman && member.clubUid !== null && member.club !== null
          ? [{ uid: member.clubUid, name: member.club, manager: member }]
          : [],
      );
      if (own.length > 0 || followed === null) {
        return own;
      }
      const clubs = await call<ClubPage>("search_clubs", { query: String(followed), limit: 5 });
      const club = clubs.rows.find((row) => row.uid === followed);
      return club ? [{ uid: club.uid, name: club.name, manager: null }] : [];
    };
    look().then(
      (subjects) => {
        if (!cancelled) {
          setFound({ subjects });
        }
      },
      (e) => {
        if (!cancelled) {
          setFound({ error: describeError(e) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version, followed]);

  return found;
}

interface MyClubProps {
  /** Changes when the game data is read again, so the page is too. */
  version: number;
  /** The game's date, for the contracts that are about to end; null when it could not be read. */
  gameDate: FmDate | null;
  /** Opens a club in the Clubs tab. */
  onOpenClub: (club: ClubSummary) => void;
  /** Called when the save has no club for the page: the app then opens on the players instead. */
  onEmpty: () => void;
}

export function MyClub({ version, gameDate, onOpenClub, onEmpty }: MyClubProps) {
  const [followed, setFollowed] = useState(followedUid);
  const found = useSubjects(version, followed);
  // Which of the user's clubs is shown, in a save with several managers; and whether the search for a club is open.
  const [chosen, setChosen] = useState(0);
  const [picking, setPicking] = useState(false);
  const subjects = found?.subjects;
  const subject = subjects?.[chosen] ?? subjects?.[0];
  const empty = subjects !== undefined && subjects.length === 0;

  useEffect(() => {
    if (empty) {
      onEmpty();
    }
    // Only when the save turns out to have no club: the caller's function is a new one on every render.
  }, [empty]);

  const follow = (club: ClubSummary) => {
    rememberFollowed(club.uid);
    setFollowed(club.uid);
    setPicking(false);
  };

  return (
    <div className="workspace">
      <section className="home" aria-label={text.nav} aria-busy={found === null || undefined}>
        {found === null && (
          <p className="profile-status" role="status">
            {text.loading}
          </p>
        )}
        {found?.error !== undefined && (
          <div className="banner" role="alert">
            {text.failed(found.error)}
          </div>
        )}

        {(empty || picking) && (
          <div className="home-pick card">
            {empty && (
              <>
                <h2>{text.noClubTitle}</h2>
                <p className="muted">{text.noClubText}</p>
              </>
            )}
            <ClubSearch label={text.searchLabel} onPick={follow} onCancel={() => setPicking(false)} />
          </div>
        )}

        {subject && !picking && (
          <>
            <ClubHead
              key={subject.uid}
              subject={subject}
              subjects={subjects ?? []}
              version={version}
              onSubject={(uid) => setChosen(Math.max(0, (subjects ?? []).findIndex((other) => other.uid === uid)))}
              onOpenClub={onOpenClub}
              onPick={() => setPicking(true)}
            />
            <SquadTab
              key={`squad-${subject.uid}`}
              clubUid={subject.uid}
              version={version}
              label={text.squad}
              overview={(team, open) => <Attention team={team} gameDate={gameDate} onOpen={open} />}
            />
          </>
        )}
      </section>
    </div>
  );
}

interface ClubHeadProps {
  subject: Subject;
  /** All the clubs the page can be about: more than one in a save with several managers of the user's. */
  subjects: readonly Subject[];
  version: number;
  onSubject: (uid: number) => void;
  onOpenClub: (club: ClubSummary) => void;
  /** Opens the search for a club to follow. */
  onPick: () => void;
}

/**
 * The head of the page: the club's logo and name, who manages it, its reputation and its money, and the button that
 * opens it in the Clubs tab. The name is there at once; the rest once the club has been read.
 */
function ClubHead({ subject, subjects, version, onSubject, onOpenClub, onPick }: ClubHeadProps) {
  const loaded = useProfileDetails<ClubDetails>("club_details", subject.uid, version);
  const details = loaded?.details;
  const finances = details?.finances ?? null;

  return (
    <header className="home-head">
      <ClubLogo uid={subject.uid} name={subject.name} size={PICTURE_SIZE.clubLogo} />
      <div className="home-id">
        <h2>
          {details?.name ?? subject.name}
          {details?.women && <span className="tag women">{clubProfileText.womensClub}</span>}
        </h2>
        <p>{subject.manager ? text.manager(subject.manager.name) : text.following}</p>
        {subjects.length > 1 && (
          <div className="squad-teams" role="group" aria-label={text.clubsLabel}>
            {subjects.map((other) => (
              <button
                key={other.uid}
                type="button"
                aria-pressed={other.uid === subject.uid}
                onClick={() => onSubject(other.uid)}
              >
                {other.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {details && (
        <dl className="home-facts">
          <div>
            <dt>{clubProfileText.reputationTitle}</dt>
            <dd>
              <ReputationMeter value={details.reputation} />
            </dd>
          </div>
          {finances && (
            <>
              <div>
                <dt>{clubProfileText.balance}</dt>
                <dd className={finances.balance < 0 ? "negative" : undefined}>{formatMoney(finances.balance)}</dd>
              </div>
              <div>
                <dt>{clubProfileText.transferBudget}</dt>
                {/* FM stores -1 when the board has not set a transfer budget. */}
                <dd>{finances.transferBudget < 0 ? profileText.notSet : formatMoney(finances.transferBudget)}</dd>
              </div>
              <div>
                <dt>{clubProfileText.totalWageBudget}</dt>
                <dd>
                  {formatMoney(finances.totalWageBudget)}
                  <span className="home-unit">{clubProfileText.perWeek}</span>
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
      {loaded?.error !== undefined && <p className="home-error error">{loaded.error}</p>}

      <div className="home-buttons">
        <button type="button" disabled={!details} title={text.openProfileTitle} onClick={() => details && onOpenClub(details)}>
          {text.openProfile}
        </button>
        {subject.manager === null && (
          <button type="button" onClick={onPick}>
            {text.chooseAnother}
          </button>
        )}
      </div>
    </header>
  );
}

/** A date as one number that sorts by time, e.g. 20260718. */
const dayNumber = (date: FmDate) => date.year * 10000 + date.month * 100 + date.day;

/** The date `months` months after `date`, as one number (see `dayNumber`). */
function monthsAfter(date: FmDate, months: number): number {
  const month = date.month - 1 + months;
  return dayNumber({ year: date.year + Math.floor(month / 12), month: (month % 12) + 1, day: date.day });
}

/** One card: what it is about, the players it counts in the order it names them, and what it says beside each. */
interface Card {
  key: string;
  title: string;
  /** Hover text of the title: what the card counts. */
  hint: string;
  players: SquadPlayer[];
  value: (player: SquadPlayer) => string | null;
  /** Whether what it counts is something to keep an eye on rather than something wrong. */
  mild?: boolean;
}

/** The cards of the shown team. The one about contracts needs the game's date, and is left out without it. */
function cardsOf(team: ClubTeam, gameDate: FmDate | null): Card[] {
  const players = team.players;
  const pick = (wanted: (player: SquadPlayer) => boolean, order: (a: SquadPlayer, b: SquadPlayer) => number) =>
    players.filter(wanted).sort(order);
  const several = (count: number) => (count > 1 ? `×${count}` : null);
  const cards: Card[] = [
    {
      key: "injured",
      title: squadText.injured,
      hint: text.cards.injuredHint,
      players: pick(
        (player) => player.injuries > 0,
        (a, b) => b.currentAbility - a.currentAbility,
      ),
      value: (player) => several(player.injuries),
    },
    {
      key: "banned",
      title: squadText.banned,
      hint: text.cards.bannedHint,
      players: pick(
        (player) => player.bans > 0,
        (a, b) => b.currentAbility - a.currentAbility,
      ),
      value: (player) => several(player.bans),
    },
    {
      key: "morale",
      title: text.cards.lowMorale,
      hint: text.cards.lowMoraleHint(profileText.morale(LOW_MORALE)),
      players: pick(
        (player) => player.morale < LOW_MORALE,
        (a, b) => a.morale - b.morale,
      ),
      value: (player) => profileText.morale(player.morale),
    },
    {
      key: "tired",
      title: text.cards.tired,
      hint: text.cards.tiredHint(percentText(TIRED)),
      players: pick(
        (player) => player.condition < TIRED,
        (a, b) => a.condition - b.condition,
      ),
      value: (player) => percentText(player.condition),
    },
    {
      key: "unrest",
      title: squadText.unrest,
      hint: text.cards.unrestHint,
      players: pick(
        (player) => player.concernedTeammates > 0,
        (a, b) => b.concernedTeammates - a.concernedTeammates,
      ),
      value: (player) => several(player.concernedTeammates),
    },
  ];
  if (gameDate !== null) {
    const limit = monthsAfter(gameDate, CONTRACT_MONTHS);
    const ends = (player: SquadPlayer) => (player.contractExpires ? dayNumber(player.contractExpires) : Infinity);
    cards.push({
      key: "contracts",
      title: text.cards.contracts,
      hint: text.cards.contractsHint(CONTRACT_MONTHS),
      // A player here on loan has his contract with another club.
      players: pick(
        (player) => player.loan !== "in" && ends(player) <= limit,
        (a, b) => ends(a) - ends(b),
      ),
      value: (player) => formatDate(player.contractExpires),
      mild: true,
    });
  }
  return cards;
}

interface AttentionProps {
  team: ClubTeam;
  gameDate: FmDate | null;
  /** Opens a player's profile over the page; `from` takes focus back once it is closed. */
  onOpen: (player: SquadPlayer, from: HTMLElement) => void;
}

/**
 * The cards between the team's summary and its actions: for each thing that needs a look, how many of the shown team's
 * players it is about and who they are, the worst first. A name opens the player's profile over the page.
 */
function Attention({ team, gameDate, onOpen }: AttentionProps) {
  const base = useId();
  return (
    <div className="home-cards" role="group" aria-label={text.cards.label}>
      {cardsOf(team, gameDate).map((card) => {
        const count = card.players.length;
        const more = count - NAMES_SHOWN;
        const tone = count === 0 ? "calm" : card.mild ? "mild" : "alert";
        return (
          <section key={card.key} className={`home-card ${tone}`} aria-labelledby={`${base}-${card.key}`}>
            <div className="home-card-head">
              <h3 id={`${base}-${card.key}`} title={card.hint}>
                {card.title}
              </h3>
              <span className="home-card-count figure">{count}</span>
            </div>
            {count === 0 ? (
              <p className="home-card-none">{text.cards.none}</p>
            ) : (
              <ul>
                {card.players.slice(0, NAMES_SHOWN).map((player) => {
                  const value = card.value(player);
                  return (
                    <li key={player.uid} {...rowMenuProps("player", player.name, player.uid)}>
                      <button
                        type="button"
                        className="name-link"
                        aria-haspopup="dialog"
                        title={squadText.openProfile}
                        onClick={(event) => onOpen(player, event.currentTarget)}
                      >
                        {player.name}
                      </button>
                      {value !== null && <span className="home-card-value">{value}</span>}
                    </li>
                  );
                })}
                {more > 0 && <li className="home-card-more">{text.cards.more(more)}</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
