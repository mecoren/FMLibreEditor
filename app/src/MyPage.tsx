// "Me": the page about the user rather than about the save's clubs and players. It has who they manage, what the save
// they have open is, and the players they marked as favorites, with the star that takes a mark away. It is where later
// pages of their own would go (a watchlist, notes, a training plan), so it is a stack of cards, each about one thing.

import { useEffect, useState } from "react";
import { Ability } from "./Ability";
import { rowMenuProps } from "./EntityRowMenu";
import { call } from "./api";
import { FavoriteButton, FavoriteStar } from "./FavoriteButton";
import { describeError, describeGame, formatDate, formatNumber } from "./format";
import { meText as text, playerListText, profileText } from "./labels";
import { PlayerPage } from "./PlayerProfile";
import type { ConnectionInfo, PlayerPage as PlayerRows, PlayerSummary, StaffPage, StaffSummary } from "./types";
import type { Favorites } from "./useFavorites";

/** How many members of staff are asked for to find the user's managers: the search lists them first. */
const MANAGERS_ASKED = 20;

/** The most favorite players the page shows: a save that has marked more says how many there are. */
const FAVORITES_SHOWN = 200;

/** What the page read when the game data was read; `null` while it is being read. */
type Found<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

/**
 * The manager the user runs, read again whenever `version` changes: in a save with several of them, the first the game's
 * staff search lists, which is the one with the lowest UID (see `StaffSummary::sort_key`).
 */
function useManager(version: number): Found<StaffSummary | null> | null {
  const [found, setFound] = useState<Found<StaffSummary | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Without an order the search lists the managers the user controls first.
    call<StaffPage>("search_staff", { query: "", limit: MANAGERS_ASKED }).then(
      (page) => {
        if (!cancelled) {
          setFound({ value: page.rows.find((member) => member.isHuman) ?? null });
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
  }, [version]);

  return found;
}

/**
 * The players the user marked as favorites, read again when the game data is (`version`) or a mark is (`revision`). The
 * game orders them by name, as the marks have no order of their own yet.
 */
function useFavoriteRows(version: number, revision: number): Found<PlayerRows> | null {
  const [found, setFound] = useState<Found<PlayerRows> | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<PlayerRows>("search_players", {
      query: "",
      limit: FAVORITES_SHOWN,
      filter: { favorite: true },
      order: { by: "name", ascending: true },
    }).then(
      (page) => {
        if (!cancelled) {
          setFound({ value: page });
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
  }, [version, revision]);

  return found;
}

interface MyPageProps {
  /** Changes when the game data is read again, so the page is too. */
  version: number;
  /** The save the app is connected to: its date and what it holds. */
  connection: ConnectionInfo;
  /** The marks the user made, which the star of each row changes. */
  favorites: Favorites;
  /** Opens the Players tab, where a player is marked. */
  onOpenPlayers: () => void;
}

export function MyPage({ version, connection, favorites, onOpenPlayers }: MyPageProps) {
  const manager = useManager(version);
  const list = useFavoriteRows(version, favorites.revision);
  // The player whose profile is on show over the page, if any.
  const [open, setOpen] = useState<PlayerSummary | null>(null);
  const human = manager?.value;
  const rows = list?.value?.rows ?? [];
  const total = list?.value?.total ?? 0;
  const error = manager?.error ?? list?.error;
  const busy = manager === null || list === null;

  return (
    <div className="workspace">
      <section className="me" aria-label={text.nav} aria-busy={busy || undefined}>
        {error !== undefined && (
          <div className="banner" role="alert">
            {text.failed(error)}
          </div>
        )}

        <header className="me-head">
          <div className="me-id">
            <h2 className={human ? undefined : "me-none"}>{human ? human.name : busy ? text.loading : text.noManager}</h2>
            {human && (
              <>
                <p>{human.club ?? text.noClub}</p>
                {(human.age !== null || human.nation !== null) && (
                  <p className="me-who">{text.who(human.age, human.nation)}</p>
                )}
              </>
            )}
          </div>

          <dl className="me-facts">
            <div>
              <dt>{text.facts.gameDate}</dt>
              <dd>{formatDate(connection.gameDate) || profileText.none}</dd>
            </div>
            <div>
              <dt>{text.facts.game}</dt>
              <dd>{describeGame(connection.game)}</dd>
            </div>
            <div>
              <dt>{text.facts.players}</dt>
              <dd className="figure">{formatNumber(connection.players)}</dd>
            </div>
            <div>
              <dt>{text.facts.staff}</dt>
              <dd className="figure">{formatNumber(connection.staff)}</dd>
            </div>
            <div>
              <dt>{text.facts.clubs}</dt>
              <dd className="figure">{formatNumber(connection.clubs)}</dd>
            </div>
          </dl>
        </header>

        <section className="me-card" aria-labelledby="me-favorites">
          <div className="me-card-head">
            <h3 id="me-favorites">{text.favorites.title}</h3>
            <span className="figure" title={text.favorites.countTitle}>
              {formatNumber(total)}
            </span>
          </div>

          {list?.value !== undefined &&
            (rows.length === 0 ? (
              <div className="me-empty">
                <p className="muted">{text.favorites.none}</p>
                <button type="button" onClick={onOpenPlayers}>
                  {text.favorites.open}
                </button>
              </div>
            ) : (
              <>
                <table className="grid me-favorites-grid">
                  <thead>
                    <tr>
                      <th className="col-favorite" title={text.favorites.column}>
                        <span className="sr-only">{text.favorites.column}</span>
                        <FavoriteStar marked={false} />
                      </th>
                      <th>{playerListText.columns.name}</th>
                      <th>{playerListText.columns.club}</th>
                      <th className="num">{playerListText.columns.currentAbility}</th>
                      <th className="num">{playerListText.columns.potentialAbility}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.uid} {...rowMenuProps("player", p.name, p.uid)}>
                        <td className="col-favorite">
                          <FavoriteButton favorites={favorites} uid={p.uid} name={p.name} compact />
                        </td>
                        <td className="col-name">
                          <button
                            type="button"
                            className="name-link"
                            aria-haspopup="dialog"
                            title={playerListText.openProfile}
                            onClick={() => setOpen(p)}
                          >
                            {p.name}
                          </button>
                        </td>
                        <td className="col-club" title={p.club ?? undefined}>
                          {p.club ?? <span className="muted">{profileText.freeAgent}</span>}
                        </td>
                        <td className="num">
                          <Ability value={p.currentAbility} />
                        </td>
                        <td className="num">
                          <Ability value={p.potentialAbility} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {total > rows.length && <p className="me-more muted">{text.favorites.more(rows.length, total)}</p>}
              </>
            ))}
        </section>
      </section>

      {open && <PlayerPage player={open} version={version} onClose={() => setOpen(null)} />}
    </div>
  );
}
