// A transfer: a player moved to another club's senior team through the app's commands, then moved back with an undo.
// The pair is the first the app itself agrees to (no loans or human clubs; a full list the app grows on Windows).
// Between the two, a team-mate at his old club is given the squad number he left there, and the undo, which would put
// two players of that team on one number, is refused (`edit.taken`, naming the team-mate) with nothing written; it goes
// through once the team-mate's change is undone, and the probe reads both numbers as they were. The same for a swap
// with a player of the other club and for a release.
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "move";
export const writes = true;

const NUMBER = "contract.squad_number";

export async function run({ app, report, probe }) {
  const clubs = await topClubs(app, 12);
  let found = null;
  let refusals = 0;
  search: for (const from of clubs.slice(3)) {
    for (const player of (await clubPlayers(app, from, 6)).slice(2)) {
      // He wears a number of his own, as does a team-mate, so that one can be given the number the other leaves.
      const picked = pair(await teamNumbers(app, from.uid, player.uid), player.uid);
      if (picked === null) continue;
      for (const to of clubs.slice(0, 8).filter((club) => club.uid !== from.uid)) {
        const plan = await app.invoke("plan_club_move", { uid: player.uid, club: to.uid, terms: {}, fee: null, release: null });
        if (plan.ok) {
          found = { player, from, to, picked };
          break search;
        }
        refusals++;
      }
    }
  }
  if (!found) {
    report.check("finds a move the app agrees to", false, `${refusals} refused`);
    return;
  }
  const { player, from, to, picked } = found;
  report.note(`${player.name} (${player.uid}): ${from.name} → ${to.name}, after ${refusals} refused`);
  const clubOf = async (uid = player.uid) => (await app.must("player_details", { uid })).clubUid;
  const read = (who) => probe.get("player", who.uid, [NUMBER])[NUMBER];

  const moved = await app.must("move_player", { uid: player.uid, club: to.uid, terms: {}, fee: null, release: null });
  report.check("moves him", (await clubOf()) === to.uid, `logged as ${moved.field}: ${moved.moved?.from} → ${moved.moved?.to}`);
  report.check("the probe sees him at the new club", probe.run(["player", player.uid]).includes(to.name));
  report.check("and reads him with no number there", read(player) === 255, `${read(player)}`);

  // His old team's number is free now: a team-mate takes it.
  const given = await giveNumber(app, picked.mate, picked.number);
  report.check(
    `gives ${picked.mate.name} the number ${picked.number}, which ${player.name} left`,
    given !== null && read(picked.mate) === picked.number,
    `${read(picked.mate)}`,
  );
  if (given === null) {
    await app.must("undo_change", { id: moved.id });
    return;
  }
  await refusedUntilFree({ app, report, what: "transfer", change: moved, given, mate: picked.mate, stillOut: async () => (await clubOf()) === to.uid });
  const undone = await app.must("undo_change", { id: moved.id });
  report.check("the undo moves him back", undone.undoneAt != null && (await clubOf()) === from.uid);
  report.check("the probe sees him back", probe.run(["player", player.uid]).includes(from.name));
  report.check(
    "with his number, and his team-mate with the one he had",
    read(player) === picked.number && read(picked.mate) === picked.mateNumber,
    `${read(player)} (was ${picked.number}), ${read(picked.mate)} (was ${picked.mateNumber})`,
  );

  await swap({ app, report, probe, player, from, to, clubOf, read });
  await release({ app, report, probe, player, from, clubOf, read });
}

/**
 * The players who play for the team `uid` plays for at the club `club`, each with the number he wears, read now; null
 * when `uid` is in none of its teams.
 */
async function teamNumbers(app, club, uid) {
  const team = (await app.must("club_squads", { uid: club })).find((t) => t.players.some((p) => p.uid === uid && p.playsHere));
  if (team === undefined) return null;
  const worn = [];
  for (const player of team.players.filter((p) => p.playsHere)) {
    worn.push({ player, number: (await app.must("read_values", { entity: "player", uid: player.uid }))[NUMBER] });
  }
  return worn;
}

/**
 * The number `uid` wears alone in his team, from 1 to 99, and a team-mate who has a number of his own too; null where
 * there is no such pair.
 */
function pair(worn, uid) {
  if (worn === null) return null;
  const alone = (entry) => entry.number >= 1 && entry.number <= 99 && worn.filter((other) => other.number === entry.number).length === 1;
  const mine = worn.find((entry) => entry.player.uid === uid);
  // One on loan here wears the number of his own club's contract: not the one to give a number.
  const mate = worn.find((entry) => entry.player.uid !== uid && entry.player.loan == null && alone(entry));
  if (!mine || !alone(mine) || !mate) return null;
  return { number: mine.number, mate: mate.player, mateNumber: mate.number };
}

/** The logged change of `mate`'s squad number set to `number`, or null when the app refused it. */
async function giveNumber(app, mate, number) {
  const edited = await app.must("apply_edits", { entity: "player", uid: mate.uid, edits: [{ field: NUMBER, value: number }] });
  return edited.applied.length === 1 && edited.failed.length === 0 ? edited.applied[0] : null;
}

/**
 * The undo of `change`, which took a player out of his team, once `mate` was given the number he wore there (`given` is
 * that change): refused with `edit.taken` naming `mate`, and nothing is written (`stillOut` tells that he is still out).
 * Then `given` is undone, which frees the number.
 */
async function refusedUntilFree({ app, report, what, change, given, mate, stillOut }) {
  const refused = await app.invoke("undo_change", { id: change.id });
  const params = refused.error?.params;
  report.check(
    `${what}: the undo is refused while ${mate.name} wears the number he left`,
    !refused.ok && refused.error.code === "edit.taken" && params?.uid === String(mate.uid) && params?.name === mate.name,
    JSON.stringify(refused),
  );
  const log = await app.must("change_log");
  report.check(
    `${what}: nothing was written, and the change is still there to undo`,
    (await stillOut()) && log.find((entry) => entry.id === change.id)?.undoneAt == null,
  );
  const freed = await app.invoke("undo_change", { id: given.id });
  report.check(`${what}: the team-mate's change is undone`, freed.ok, JSON.stringify(freed.error));
}

/** A swap with a player of the other club the app agrees to, taken through the same steps; skipped where it agrees to none. */
async function swap({ app, report, probe, player, from, to, clubOf, read }) {
  let other = null;
  for (const candidate of await clubPlayers(app, to, 6)) {
    if ((await app.invoke("plan_club_swap", { uid: player.uid, other: candidate.uid })).ok) {
      other = candidate;
      break;
    }
  }
  const picked = pair(await teamNumbers(app, from.uid, player.uid), player.uid);
  if (other === null || picked === null) {
    report.skip("swap: the number he left", `${other === null ? `no player of ${to.name} he can swap with` : "no number to give"}`);
    return;
  }
  const kept = read(other);
  report.note(`swap: ${player.name} and ${other.name} (${other.uid})`);
  const swapped = await app.must("swap_players", { uid: player.uid, other: other.uid });
  report.check("swap: the two change clubs", (await clubOf()) === to.uid && (await clubOf(other.uid)) === from.uid);
  const given = await giveNumber(app, picked.mate, picked.number);
  report.check(`swap: ${picked.mate.name} is given the number ${picked.number}`, given !== null);
  if (given === null) {
    await app.must("undo_change", { id: swapped.id });
    return;
  }
  await refusedUntilFree({ app, report, what: "swap", change: swapped, given, mate: picked.mate, stillOut: async () => (await clubOf()) === to.uid });
  const undone = await app.must("undo_change", { id: swapped.id });
  report.check("swap: the undo puts both back", undone.undoneAt != null && (await clubOf()) === from.uid && (await clubOf(other.uid)) === to.uid);
  report.check(
    "swap: all four numbers as they were",
    read(player) === picked.number && read(picked.mate) === picked.mateNumber && read(other) === kept,
    `${read(player)} (was ${picked.number}), ${read(picked.mate)} (was ${picked.mateNumber}), ${read(other)} (was ${kept})`,
  );
}

/** A release, taken through the same steps; skipped where the app does not agree to it. */
async function release({ app, report, probe, player, from, clubOf, read }) {
  const planned = await app.invoke("plan_release", { uid: player.uid });
  const picked = pair(await teamNumbers(app, from.uid, player.uid), player.uid);
  if (!planned.ok || picked === null) {
    report.skip("release: the number he left", planned.ok ? "no number to give" : JSON.stringify(planned.error));
    return;
  }
  const released = await app.must("release_player", { uid: player.uid });
  report.check("release: he has no club", (await clubOf()) == null);
  const given = await giveNumber(app, picked.mate, picked.number);
  report.check(`release: ${picked.mate.name} is given the number ${picked.number}`, given !== null);
  if (given === null) {
    await app.must("undo_change", { id: released.id });
    return;
  }
  await refusedUntilFree({ app, report, what: "release", change: released, given, mate: picked.mate, stillOut: async () => (await clubOf()) == null });
  const undone = await app.must("undo_change", { id: released.id });
  report.check("release: the undo puts him back at his club", undone.undoneAt != null && (await clubOf()) === from.uid);
  report.check(
    "release: both numbers as they were",
    read(player) === picked.number && read(picked.mate) === picked.mateNumber,
    `${read(player)} (was ${picked.number}), ${read(picked.mate)} (was ${picked.mateNumber})`,
  );
}
