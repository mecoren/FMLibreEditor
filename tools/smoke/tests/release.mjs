// Releasing staff (issue #170): a coach released from his club, as the probe reads it (no club, no contract), and the
// undo that puts him back on the same contract; the human manager, the board and one with no club refused; then the
// whole staff of a club whose leagues are played released as one batch (the board stays, the manager's place is left
// empty), and the batch undone. Then the same through the app: Release in a coach's profile, the club's Staff tab with
// Release all staff, its dialog (Cancel first, then Release all) and the Undo under the button.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHOWN, VIS, sleep } from "../lib/app.mjs";
import { humanClubs, topClubs } from "../lib/witness.mjs";

export const name = "release";
export const writes = true;

/** Coaching jobs the editor releases (see STAFF_JOBS in staff_move.rs). */
const COACHING = [2, 20, 22, 26, 34, 60, 64];
/** The board's jobs, which a release leaves alone: chairperson, director, owner, president. */
const BOARD = [4, 6, 66, 70];

/** The line the probe lists the member of staff `id` on: his name, job and club. */
function probedLine(probe, id) {
  const line = probe.run(["staff", id]).split(/\r?\n/).find((l) => l.trimStart().startsWith(String(id)));
  return line?.replace(/\s+/g, " ").trim() ?? "";
}

/** The club and contract lines `staff-member` prints for the member of staff `id`. */
function probedTies(probe, id) {
  const out = probe.run(["staff-member", id]);
  const field = (key) => out.match(new RegExp(`^\\s+${key}\\s+(.*)$`, "m"))?.[1]?.trim() ?? "";
  return { club: field("club"), contract: field("contract") };
}

/**
 * Of the members of staff `ids`, those the probe reads at the club named `club`, from its export of every member of
 * staff, by id. The export names clubs, and two clubs can share a name (Barcelona's staff and another Barcelona's), so
 * the staff are the ones the app lists for the club.
 */
function probedAt(probe, folder, club, ids) {
  const file = join(folder, `staff-${Date.now()}.json`);
  probe.run(["staff", "--limit", "1", "--export", file]);
  const clubs = new Map(JSON.parse(readFileSync(file, "utf8")).staff.map((row) => [row.uid, row.club]));
  return ids.filter((id) => clubs.get(id) === club).sort((a, b) => a - b);
}

/** The ids of `rows`, in order. */
const idsOf = (rows) => rows.map((row) => row.uid).sort((a, b) => a - b);

/** Who the probe reads as the manager of the club `uid`: "Name (id)", "no one", or "" when it reads none. */
function probedManager(probe, uid) {
  return probe.run(["club", uid]).match(/^\s+manager\s+(.*)$/m)?.[1]?.trim() ?? "";
}

export async function run({ app, report, probe }) {
  const human = await humanClubs(app);
  const best = (await app.must("search_staff", { query: "", limit: 400 })).rows;
  const coach = best.find((m) => !m.isHuman && m.clubUid != null && !human.includes(m.clubUid) && COACHING.includes(m.job));
  if (!coach) {
    report.skip("releases a coach", "no coach at a club no human manages among the best staff");
    return;
  }
  report.note(`witness: ${coach.name} (${coach.uid}), ${coach.club}`);
  const before = probedTies(probe, coach.uid);
  report.check("the probe reads him at his club, under a contract", before.club === coach.club && before.contract !== "none", JSON.stringify(before));

  const plan = await app.invoke("plan_staff_release", { uid: coach.uid });
  report.check("the release is offered, naming his club", plan.ok && plan.value.name === coach.club, plan.ok ? plan.value.name : plan.error.code);
  if (!plan.ok) return;
  const released = await app.must("release_staff", { uid: coach.uid });
  report.check(
    "logged as a change of his club to none",
    released.field === "club" && released.new === 0 && released.old === coach.clubUid && released.moved?.from === coach.club && released.moved?.to === undefined,
    JSON.stringify({ field: released.field, old: released.old, new: released.new, moved: released.moved }),
  );
  const gone = probedTies(probe, coach.uid);
  report.check("the probe reads him with no club and no contract", gone.club === "-" && gone.contract === "none", JSON.stringify(gone));
  const row = (await app.must("search_staff", { query: String(coach.uid), limit: 1 })).rows[0];
  report.check("his row in the list says unemployed", row?.club === null && row?.job === null, JSON.stringify({ club: row?.club, job: row?.job }));
  const again = await app.invoke("plan_staff_release", { uid: coach.uid });
  report.check("released again: refused, he has no club", !again.ok && again.error.code === "staff.unemployed", again.ok ? "offered" : again.error.code);
  await app.must("undo_change", { id: released.id });
  const back = probedTies(probe, coach.uid);
  report.check("the undo puts him back on the same contract", JSON.stringify(back) === JSON.stringify(before), JSON.stringify(back));

  await refusals(app, report, best, human);
  const club = (await topClubs(app, 3)).find((c) => c.uid !== coach.clubUid) ?? (await topClubs(app, 1))[0];
  await releaseAll(app, report, probe, club);
  await throughTheApp(app, report, probe, coach, club);
}

/** The human manager, a member of the board and one with no club: each refused, with nothing written. */
async function refusals(app, report, staff, human) {
  const you = staff.find((m) => m.isHuman);
  if (you) {
    const r = await app.invoke("plan_staff_release", { uid: you.uid });
    report.check("the human manager is refused", !r.ok && r.error.code === "staff.you", r.ok ? "offered" : r.error.code);
  }
  const board = (await app.must("search_staff", { query: "", limit: 3000 })).rows.find(
    (m) => m.clubUid != null && !human.includes(m.clubUid) && BOARD.includes(m.job),
  );
  if (board) {
    const r = await app.invoke("plan_staff_release", { uid: board.uid });
    report.check(`the board is refused (${board.name}, job ${board.job})`, !r.ok && r.error.code === "staff.job", r.ok ? "offered" : r.error.code);
  } else {
    report.skip("the board is refused", "no member of a board among the first staff");
  }
  const free = (await app.must("search_staff", { query: "", limit: 50, filter: { unemployed: true } })).rows.find((m) => !m.isHuman);
  if (free) {
    const r = await app.invoke("plan_staff_release", { uid: free.uid });
    report.check("one with no club is refused", !r.ok && r.error.code === "staff.unemployed", r.ok ? "offered" : r.error.code);
  }
}

/** The whole staff of `club` released as one batch, as the probe reads it, and the batch undone. */
async function releaseAll(app, report, probe, club) {
  report.note(`club: ${club.name} (${club.uid})`);
  const rows = await app.must("club_staff", { club: club.uid });
  const leaving = rows.filter((r) => r.stays === null);
  const staying = rows.filter((r) => r.stays !== null);
  report.check("the club's staff are listed, the board among those who stay", leaving.length > 0 && rows.every((r) => r.clubUid === club.uid), `${rows.length} staff, ${staying.length} stay: ${staying.map((r) => `${r.name} ${r.stays.code}`).slice(0, 6).join(", ")}`);
  report.check("those who stay are the board and the like, not refusals of another kind", staying.every((r) => ["staff.you", "staff.job", "move.playerCoach", "staff.role"].includes(r.stays.code)), staying.map((r) => r.stays.code).join(", "));
  const ids = idsOf(rows);
  const read = probedAt(probe, app.folder, club.name, ids);
  report.check("the probe reads every one of them at the club", read.length === ids.length, `${read.length} of ${ids.length}`);
  const manager = probedManager(probe, club.uid);

  const done = await app.must("release_club_staff", { club: club.uid });
  report.check("releases every one the list offers, as one batch", done.applied === leaving.length && done.failed.length === 0, JSON.stringify({ applied: done.applied, failed: done.failed.slice(0, 3) }));
  const after = probedAt(probe, app.folder, club.name, ids);
  report.check("the probe reads only those who stay at the club", JSON.stringify(after) === JSON.stringify(idsOf(staying)), `${after.length} left`);
  if (leaving.some((r) => r.job === 16)) {
    report.check("the senior team's place for a manager left empty", probedManager(probe, club.uid) === "no one", probedManager(probe, club.uid));
  }
  const logged = (await app.must("change_log")).filter((c) => c.batch === done.batch);
  report.check("logged as one batch of club changes", logged.length === done.applied && logged.every((c) => c.field === "club" && c.new === 0), `${logged.length} logged`);

  const undone = await app.must("undo_batch", { batch: done.batch });
  report.check("the batch undone", undone.undone === done.applied && undone.failed.length === 0, JSON.stringify(undone).slice(0, 200));
  report.check("every one back at the club", JSON.stringify(probedAt(probe, app.folder, club.name, ids)) === JSON.stringify(ids), "");
  report.check("the manager back in his place", probedManager(probe, club.uid) === manager, probedManager(probe, club.uid));
}

/**
 * Through the app: Release in the coach's profile (released, then undone from the log); the club's Staff tab, Release
 * all staff, its dialog, Cancel, then Release all and the Undo under the button.
 */
async function throughTheApp(app, report, probe, coach, club) {
  const before = probedTies(probe, coach.uid);
  await app.openTab("Staff");
  await app.setInput(`${VIS}(".search input")`, String(coach.uid));
  const rows = `[...document.querySelectorAll("table.grid tbody tr")].filter(${SHOWN})`;
  await app.waitFor(`${rows}.length === 1 && ${rows}[0].textContent.includes(${JSON.stringify(coach.name)})`, "his row");
  await app.click(`${rows}[0]`, "his row");
  const profile = `${VIS}(".profile:not(.popup)")`;
  await app.waitFor(`${profile} && ${profile}.getAttribute("aria-busy") === "false"`, "his profile", 30000);
  const button = `${profile}.querySelector(".release-toggle:not(.rename-toggle)")`;
  await app.waitFor(button, "the Release button of his profile");
  await app.click(button, "Release");
  const dialog = `document.querySelector(".move-dialog")`;
  await app.waitFor(`${dialog}?.querySelector(".move-plan.ok")`, "the plan of the release", 20000);
  const planText = await app.js(`${dialog}.querySelector(".move-plan").textContent`);
  report.check("the dialog names his club and says unemployed", planText.includes(coach.club) && /unemployed/i.test(planText), planText);
  await app.shot("release-staff-dialog");
  await app.click(`${dialog}.querySelector(".modal-foot .primary")`, "Release");
  await app.waitFor(`!${dialog}`, "the dialog to close", 30000);
  report.check("Release releases him, as the probe reads it", probedTies(probe, coach.uid).club === "-", probedLine(probe, coach.uid));
  await app.waitFor(`!${profile}.querySelector(".release-toggle:not(.rename-toggle)")`, "the Release button gone, as he has no club");
  const logged = (await app.must("change_log")).find((c) => c.uid === coach.uid && c.field === "club" && c.undoneAt == null);
  if (logged) await app.must("undo_change", { id: logged.id });
  report.check("undone from the log", JSON.stringify(probedTies(probe, coach.uid)) === JSON.stringify(before), probedLine(probe, coach.uid));

  // The club's Staff tab.
  await app.openClub(club.name, club.uid);
  const tab = `[...document.querySelectorAll(".profile-tabs [role=tab]")].filter(${SHOWN}).find((t) => t.textContent.trim() === "Staff")`;
  await app.click(tab, "the Staff tab");
  const staffTab = `${VIS}(".club-staff-tab")`;
  await app.waitFor(`${staffTab}?.querySelector("table.club-staff-grid tbody tr")`, "the club's staff", 30000);
  const listed = await app.js(`${staffTab}.querySelectorAll("table.club-staff-grid tbody tr").length`);
  const releaseAll = `${staffTab}.querySelector(".squad-buttons button")`;
  const label = await app.js(`${releaseAll}.textContent`);
  const leaving = Number(label.match(/\((\d+)\)/)?.[1] ?? 0);
  report.check("the tab lists the staff, and Release all says how many it releases", listed > 0 && leaving > 0 && leaving <= listed, `${listed} listed, "${label}"`);
  await app.shot("release-staff-tab");
  const rowsNow = await app.must("club_staff", { club: club.uid });
  const ids = idsOf(rowsNow);
  const staying = idsOf(rowsNow.filter((row) => row.stays !== null));

  await app.click(releaseAll, "Release all staff");
  const ask = `document.querySelector(".modal[role=dialog]")`;
  await app.waitFor(ask, "the dialog that asks first");
  const asked = await app.js(`${ask}.textContent`);
  report.check("the dialog says how many leave and who stays", asked.includes(`${leaving} leave the club`) || asked.includes("1 leaves the club"), asked.slice(0, 160));
  await app.shot("release-all-dialog");
  await app.click(`[...${ask}.querySelectorAll(".modal-foot button")].find((b) => b.textContent === "Cancel")`, "Cancel");
  await app.waitFor(`!${ask}`, "the dialog to close");
  report.check("Cancel changes nothing", JSON.stringify(probedAt(probe, app.folder, club.name, ids)) === JSON.stringify(ids), "");

  await app.click(releaseAll, "Release all staff");
  await app.waitFor(ask, "the dialog again");
  await app.click(`${ask}.querySelector(".modal-foot .primary")`, "Release all");
  await app.waitFor(`!${ask}`, "the dialog to close", 60000);
  const result = `${staffTab}.querySelector(".squad-result")`;
  await app.waitFor(`${result}?.textContent.includes("released") && !${staffTab}.querySelector(".squad-buttons button[aria-disabled=true]")`, "the line under the button", 60000);
  const said = await app.js(`${result}.textContent`);
  report.check("the line under the button says how many were released", said.includes(`${leaving} member`) || said.includes("1 member"), said);
  const left = probedAt(probe, app.folder, club.name, ids);
  report.check("the probe reads them gone, but those who stay", JSON.stringify(left) === JSON.stringify(staying), `${left.length} left`);
  await app.shot("release-all-done");
  await sleep(300);
  await app.click(`${result}.querySelector("button")`, "Undo");
  await app.waitFor(`${result}?.textContent.includes("Undid")`, "the undo", 60000);
  const back = probedAt(probe, app.folder, club.name, ids);
  report.check("Undo under the button brings them all back", JSON.stringify(back) === JSON.stringify(ids), await app.js(`${result}.textContent`));
}
