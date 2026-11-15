// The CA growth tab: the players watched, each climbing along a natural curve (f(t) = t * (2 - t)) towards the
// potential his current ability allows, a day at a time and by hand. Only the current ability is written; FM spends it
// on training over the following days. Every write goes through the same checks as a hand edit and can be undone.

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClubSearch } from "./ClubSearch";
import { clubSquads } from "./editing";
import { rowMenuProps } from "./EntityRowMenu";
import { describeError } from "./format";
import { intlLocale } from "./i18n";
import { growthText as text } from "./labels";
import { PlayerDialog } from "./PlayerProfile";
import { SelectField } from "./SelectField";
import { SortHeader, type ColumnOrder } from "./SortHeader";
import { useModal } from "./useModal";
import { useGrowthWatchContext } from "./useGrowthWatch";
import type { ClubSummary, ClubTeam, GrowthRow, PlayerSummary } from "./types";

/** The seasons a climb may be spread over, as the game's own growth of a youngster looks. */
const SEASONS = [1, 2, 3, 4, 5];

/** The columns the table is sorted by, as a header click asks (see `SortHeader`). */
type GrowthSort =
  | "name"
  | "club"
  | "age"
  | "currentAbility"
  | "potentialAbility"
  | "gap"
  | "added"
  | "progress"
  | "note";

/** What the table is in until a column header is clicked: the best players first, as the players list has it. */
const DEFAULT_ORDER: ColumnOrder<GrowthSort> = { by: "currentAbility", ascending: false };

/** The columns whose first click sorts from A to Z; the numbers start with the highest. */
const FIRST_ASCENDING: ReadonlySet<GrowthSort> = new Set<GrowthSort>(["name", "club", "note"]);

const collator = new Intl.Collator(intlLocale);

interface CaGrowthProps {
  /** Changes when the game data is read again, so the club's squad is too. */
  version: number;
}

/** One row of the table: a player of the chosen club, or of the watch. */
interface Shown {
  uid: number;
  name: string;
  club: string | null;
  clubUid: number | null;
  age: number | null;
  currentAbility: number;
  potentialAbility: number;
  /** The row of a club's squad he came from, which fills his profile while it loads; none in the watch's list. */
  player: PlayerSummary | null;
  /** What the watch holds of him, when he is watched. */
  watched: GrowthRow | null;
}

/** What the row is sorted by in the column `by`; null for what the game does not give: no age, or not watched. */
function sortValue(row: Shown, by: GrowthSort): string | number | null {
  const held = row.watched;
  switch (by) {
    case "name":
      return row.name;
    case "club":
      return row.club;
    case "age":
      return row.age;
    case "currentAbility":
      return row.currentAbility;
    case "potentialAbility":
      return row.potentialAbility;
    case "gap":
      return held?.gap ?? null;
    case "added":
      return held?.added ?? null;
    case "progress":
      // At his potential is a climb of one, as the last day of a span is.
      if (held === null) return null;
      return held.done ? 1 : held.span > 0 ? held.elapsed / held.span : 0;
    case "note":
      return held === null ? null : text.notes[held.note];
  }
}

/** The rows in the order `order` asks for; equals keep the names in order, and what is not known goes last. */
function sorted(rows: readonly Shown[], { by, ascending }: ColumnOrder<GrowthSort>): Shown[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, by);
    const y = sortValue(b, by);
    if (x === null || y === null) {
      if (x !== y) {
        return x === null ? 1 : -1;
      }
    } else if (x !== y) {
      const order = typeof x === "string" ? collator.compare(x, String(y)) : x - Number(y);
      return ascending ? order : -order;
    }
    return collator.compare(a.name, b.name);
  });
}

/** The row as a profile's head takes it, while the full profile loads. */
function summaryOf(row: Shown): PlayerSummary {
  return (
    row.player ?? {
      uid: row.uid,
      name: row.name,
      fullName: null,
      dateOfBirth: null,
      age: row.age,
      nation: null,
      nationUid: null,
      club: row.club,
      clubUid: row.clubUid,
      positions: [],
      contractExpires: null,
      currentAbility: row.currentAbility,
      potentialAbility: row.potentialAbility,
    }
  );
}

export function CaGrowth({ version }: CaGrowthProps) {
  const watch = useGrowthWatchContext();
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [squad, setSquad] = useState<ClubTeam[] | null>(null);
  const [squadError, setSquadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [filling, setFilling] = useState(false);
  const [order, setOrder] = useState<ColumnOrder<GrowthSort>>(DEFAULT_ORDER);
  // The player whose profile is up over the table, and the row that opened it.
  const [opened, setOpened] = useState<PlayerSummary | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpened = useRef(false);
  // Names the label over the seasons picker, which is a button rather than a select a <label> can wrap.
  const seasonsLabel = useId();

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

  // Once his profile is closed, focus goes back to the row that opened it, if the table still has him.
  useEffect(() => {
    if (wasOpened.current && opened === null && opener.current?.isConnected) {
      opener.current.focus();
    }
    wasOpened.current = opened !== null;
  }, [opened]);

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
        clubUid: player.clubUid,
        age: player.age,
        currentAbility: player.currentAbility,
        potentialAbility: player.potentialAbility,
        player,
        watched: byUid.get(player.uid) ?? null,
      });
    }
  }
  const listed: Shown[] = (rows?.rows ?? []).map((row) => ({
    uid: row.uid,
    name: row.name,
    club: row.club,
    clubUid: row.clubUid,
    age: row.age,
    currentAbility: row.currentAbility,
    potentialAbility: row.potentialAbility,
    player: null,
    watched: row,
  }));
  const shown = sorted(club === null ? listed : roster, order);
  const squadUids = roster.map((row) => row.uid);
  const active = (rows?.rows ?? []).filter((row) => !row.done).length;
  const watching = rows?.rows.length ?? 0;
  const seasons = rows?.seasons ?? 2;
  const busy = watch.busy;
  /** Opens a player's profile over the table, from the row that asked for it. */
  const open = (row: Shown, from: HTMLElement) => {
    opener.current = from;
    setOpened(summaryOf(row));
  };
  const sortBy = (by: GrowthSort) =>
    setOrder({ by, ascending: order.by === by ? !order.ascending : FIRST_ASCENDING.has(by) });

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
          <Button type="button" variant="outline" onClick={() => setPicking((open) => !open)}>
            {club?.name ?? text.clubSearch}
          </Button>
          <span className="note squad-hint">{text.clubHint}</span>
        </div>

        <div className="squad-actions" role="group" aria-label={text.actionsLabel}>
          <div className="filter-field">
            <span id={seasonsLabel}>{text.seasons}</span>
            <SelectField
              value={String(seasons)}
              options={SEASONS.map((count) => ({ value: String(count), label: String(count) }))}
              onChange={(next) => watch.setSeasons(Number(next))}
              labelledBy={seasonsLabel}
              disabled={!editable || busy}
              title={text.seasonsTitle}
              className="w-full"
            />
          </div>
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
          <Button
            type="button"
            disabled={!editable || busy || active === 0}
            title={text.fillTitle}
            onClick={() => setFilling(true)}
          >
            {text.fill}
          </Button>
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
                <SortHeader
                  by="name"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.name}
                  title={text.sortBy(text.columns.name)}
                />
                {club === null && (
                  <SortHeader
                    by="club"
                    order={order}
                    onSort={sortBy}
                    label={text.columns.club}
                    title={text.sortBy(text.columns.club)}
                  />
                )}
                <SortHeader
                  by="age"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.age}
                  title={text.sortBy(text.columns.age)}
                />
                <SortHeader
                  by="currentAbility"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.currentAbility}
                  title={text.sortBy(text.columns.currentAbility)}
                />
                <SortHeader
                  by="potentialAbility"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.potentialAbility}
                  title={text.sortBy(text.columns.potentialAbility)}
                />
                <SortHeader
                  by="gap"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.gap}
                  title={text.sortBy(text.columns.gap)}
                />
                <SortHeader
                  by="added"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.added}
                  title={text.sortBy(text.columns.added)}
                />
                <SortHeader
                  by="progress"
                  className="num"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.progress}
                  title={text.sortBy(text.columns.progress)}
                />
                <SortHeader
                  by="note"
                  order={order}
                  onSort={sortBy}
                  label={text.columns.note}
                  title={text.sortBy(text.columns.note)}
                />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const held = row.watched;
                return (
                  <tr
                    key={row.uid}
                    {...rowMenuProps("player", row.name, row.uid)}
                    tabIndex={0}
                    onClick={(event) => {
                      // The box and the row's own controls act on the watch: only the rest of the row opens him.
                      if ((event.target as HTMLElement).closest("input, button, [role='checkbox']")) return;
                      open(row, event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.target === event.currentTarget) {
                        open(row, event.currentTarget);
                      }
                    }}
                  >
                    <td className="num col-grow">
                      <Checkbox
                        className="align-middle"
                        checked={held !== null}
                        disabled={!editable || busy}
                        aria-label={held === null ? text.watchPlayerTitle(row.name) : text.unwatchPlayerTitle(row.name)}
                        onCheckedChange={() => watch.toggle(row.uid)}
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

      {opened && <PlayerDialog player={opened} version={version} onClose={() => setOpened(null)} />}
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
    <Button type="button" variant="outline" disabled={waiting} title={title} onClick={onPress}>
      {label}
    </Button>
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
