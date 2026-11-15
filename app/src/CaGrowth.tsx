// The CA growth tab: the players watched, each climbing along a natural curve (f(t) = t * (2 - t)) towards the
// potential his current ability allows, a day at a time and by hand. Only the current ability is written; FM spends it
// on training over the following days. Every write goes through the same checks as a hand edit and can be undone.

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ClubSearch } from "./ClubSearch";
import { clubSquads } from "./editing";
import { describeError } from "./format";
import { growthText as text } from "./labels";
import { useModal } from "./useModal";
import { useGrowthWatchContext } from "./useGrowthWatch";
import type { ClubSummary, ClubTeam, GrowthRow } from "./types";

/** The seasons a climb may be spread over, as the game's own growth of a youngster looks. */
const SEASONS = [1, 2, 3, 4, 5];

interface CaGrowthProps {
  /** Changes when the game data is read again, so the club's squad is too. */
  version: number;
}

/** One row of the table: a player of the chosen club, or of the watch. */
interface Shown {
  uid: number;
  name: string;
  club: string | null;
  age: number | null;
  currentAbility: number;
  potentialAbility: number;
  /** What the watch holds of him, when he is watched. */
  watched: GrowthRow | null;
}

export function CaGrowth({ version }: CaGrowthProps) {
  const watch = useGrowthWatchContext();
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [squad, setSquad] = useState<ClubTeam[] | null>(null);
  const [squadError, setSquadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (club === null) {
      setSquad(null);
      return;
    }
    let cancelled = false;
    setSquad(null);
    clubSquads(club.uid).then(
      (teams) => {
        if (!cancelled) {
          setSquad(teams);
        }
      },
      (e) => {
        if (!cancelled) {
          setSquadError(describeError(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [club, version]);

  if (watch === null) {
    return null;
  }
  const rows = watch.rows;
  const editable = rows?.editable ?? false;
  const byUid = new Map((rows?.rows ?? []).map((row) => [row.uid, row]));

  // The club's players, across its teams and without a player twice.
  const roster: Shown[] = [];
  const seen = new Set<number>();
  for (const team of squad ?? []) {
    for (const player of team.players) {
      if (seen.has(player.uid)) {
        continue;
      }
      seen.add(player.uid);
      roster.push({
        uid: player.uid,
        name: player.name,
        club: player.club,
        age: player.age,
        currentAbility: player.currentAbility,
        potentialAbility: player.potentialAbility,
        watched: byUid.get(player.uid) ?? null,
      });
    }
  }
  const listed: Shown[] = (rows?.rows ?? []).map((row) => ({
    uid: row.uid,
    name: row.name,
    club: row.club,
    age: row.age,
    currentAbility: row.currentAbility,
    potentialAbility: row.potentialAbility,
    watched: row,
  }));
  const shown = club === null ? listed : roster;
  const squadUids = roster.map((row) => row.uid);
  const active = (rows?.rows ?? []).filter((row) => !row.done).length;
  const watching = rows?.rows.length ?? 0;
  const seasons = rows?.seasons ?? 2;
  const busy = watch.busy;

  return (
    <div className="workspace">
      <section className="home" aria-label={text.nav} aria-busy={rows === null || undefined}>
        {rows === null && (
          <p className="profile-status" role="status">
            {text.reading}
          </p>
        )}
        {(watch.error ?? squadError) !== null && (
          <div className="banner" role="alert">
            {watch.error ?? squadError}
          </div>
        )}
        {rows !== null && !rows.editable && <p className="note">{text.readOnly}</p>}

        {picking && (
          <div className="home-pick card">
            <ClubSearch
              label={text.clubSearch}
              onPick={(picked) => {
                setClub(picked);
                setSquadError(null);
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          </div>
        )}

        <div className="squad-actions">
          <button type="button" onClick={() => setPicking((open) => !open)}>
            {club?.name ?? text.clubSearch}
          </button>
          <span className="note squad-hint">{text.clubHint}</span>
        </div>

        <div className="squad-actions" role="group" aria-label={text.actionsLabel}>
          <label className="filter-field">
            <span>{text.seasons}</span>
            <select
              value={seasons}
              disabled={!editable || busy}
              title={text.seasonsTitle}
              onChange={(e) => watch.setSeasons(Number(e.currentTarget.value))}
            >
              {SEASONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <Ghost
            label={text.watchTeam}
            title={text.watchTeamTitle}
            waiting={!editable || busy || squadUids.length === 0}
            onPress={() => watch.watch(squadUids)}
          />
          <Ghost
            label={text.unwatchTeam}
            title={text.unwatchTeamTitle}
            waiting={!editable || busy || squadUids.length === 0}
            onPress={() => watch.unwatch(squadUids)}
          />
          <Ghost
            label={text.clear}
            title={text.clearTitle}
            waiting={!editable || busy || watching === 0}
            onPress={watch.clear}
          />
          <Ghost
            label={text.step}
            title={text.stepTitle}
            waiting={!editable || busy || active === 0}
            onPress={watch.step}
          />
          <button
            type="button"
            className="primary"
            disabled={!editable || busy || active === 0}
            title={text.fillTitle}
            onClick={() => setFilling(true)}
          >
            {text.fill}
          </button>
        </div>

        <p className="note squad-hint">{text.watching(watching, active, seasons, rows?.span ?? seasons * 365)}</p>
        {watch.report !== null && (
          <p className="note" role="status">
            {text.report(watch.report.written, watch.report.reached, watch.report.stopped, watch.report.skipped)}
          </p>
        )}

        <div className="squad-table-wrap">
          <table className="grid" aria-label={text.nav}>
            <thead>
              <tr>
                <th className="num col-grow">
                  <span className="sr-only">{text.watchColumn}</span>
                </th>
                <th>{text.columns.name}</th>
                {club === null && <th>{text.columns.club}</th>}
                <th className="num">{text.columns.age}</th>
                <th className="num">{text.columns.currentAbility}</th>
                <th className="num">{text.columns.potentialAbility}</th>
                <th className="num">{text.columns.gap}</th>
                <th className="num">{text.columns.added}</th>
                <th className="num">{text.columns.progress}</th>
                <th>{text.columns.note}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const held = row.watched;
                return (
                  <tr key={row.uid}>
                    <td className="num col-grow">
                      <input
                        type="checkbox"
                        checked={held !== null}
                        disabled={!editable || busy}
                        aria-label={held === null ? text.watchPlayerTitle(row.name) : text.unwatchPlayerTitle(row.name)}
                        onChange={() => watch.toggle(row.uid)}
                      />
                    </td>
                    <td>{row.name}</td>
                    {club === null && <td>{row.club ?? "—"}</td>}
                    <td className="num">{row.age ?? "—"}</td>
                    <td className="num">{row.currentAbility}</td>
                    <td className="num" title={rangeTitle(row.potentialAbility)}>
                      {row.potentialAbility}
                    </td>
                    <td className="num">{held === null ? "—" : held.gap}</td>
                    <td className="num">{held === null ? "—" : held.added}</td>
                    <td className="num">
                      {held === null ? (
                        "—"
                      ) : (
                        <Progress elapsed={held.elapsed} span={held.span} done={held.done && held.note !== "growing"} />
                      )}
                    </td>
                    <td>{held === null ? "" : text.notes[held.note]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">{text.empty}</p>}
        </div>

        <p className="note squad-hint">{text.hint}</p>
      </section>

      {filling && (
        <FillDialog
          count={active}
          onConfirm={() => {
            setFilling(false);
            watch.fill();
          }}
          onClose={() => setFilling(false)}
        />
      )}
    </div>
  );
}

/** A button of the growth actions, disabled while there is nothing it can do. */
function Ghost({
  label,
  title,
  waiting,
  onPress,
}: {
  label: string;
  title: string;
  waiting: boolean;
  onPress: () => void;
}) {
  return (
    <button type="button" disabled={waiting} title={title} onClick={onPress}>
      {label}
    </button>
  );
}

/** The progress of a climb: a hairline bar and the game days paid for of its span, or that he is at his potential. */
function Progress({ elapsed, span, done }: { elapsed: number; span: number; done: boolean }) {
  if (done) {
    return <>{text.atPotential}</>;
  }
  const fill = span > 0 ? Math.min(100, (elapsed / span) * 100) : 0;
  return (
    <>
      <span className="bar" style={{ "--fill": `${fill}%` } as CSSProperties} aria-hidden="true" />
      <span>{text.progress(elapsed, span)}</span>
    </>
  );
}

/** The hover text of a potential the game stores as a random range: the range it stands for. */
function rangeTitle(pa: number): string | undefined {
  return pa < 0 ? text.rangeTitle(Math.max(1, -2 * pa - 30), Math.min(200, -2 * pa)) : undefined;
}

/** The confirmation before filling every watched player to his potential. */
function FillDialog({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(box, true, onClose);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal-head">
          <h2 id={titleId}>{text.fill}</h2>
        </header>
        <div className="modal-body">
          <p>{text.fillAsk(count)}</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="primary" onClick={onConfirm}>
            {text.fillYes}
          </button>
          <button type="button" onClick={onClose}>
            {text.fillCancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
