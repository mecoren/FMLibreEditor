// Extending contracts: a player's and a member of staff's run five years longer through the app's command, read back by
// the probe and undone, and refused without an end or with no years; then through the player's profile, Extend undone
// from the Changes tab; and a mass edit that moves a club's players' contracts on by a year, undone as one batch.
import { SHOWN, VIS } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "contract";
export const writes = true;

const FIELD = "contract.expires";

/** The stored date `years` after `value` (a number like 20280630), as the editor moves a contract's end. */
function plusYears(value, years) {
  const year = Math.floor(value / 10000) + years;
  const month = Math.floor(value / 100) % 100;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year * 10000 + month * 100 + Math.min(value % 100, days);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What `read` gives once it gives `wanted`, or after about five seconds what it gives then. */
async function settle(read, wanted) {
  for (let i = 0; i < 20; i++) {
    const value = read();
    if (value === wanted) return value;
    await sleep(250);
  }
  return read();
}

export async function run({ app, report, probe }) {
  const [, , , club] = await topClubs(app, 4);
  const [player] = await clubPlayers(app, club, 1);
  const uid = player.uid;
  const readPlayer = () => probe.get("player", uid, [FIELD])[FIELD];
  const ends = readPlayer();
  report.note(`witness: ${player.name} (${uid}) of ${club.name}, contract to ${ends}`);

  // Through the command, as the profile's button calls it.
  const extended = await app.must("extend_contract", { entity: "player", uid, years: 5 });
  const longer = readPlayer();
  report.check("extends a player's contract by five years",
    extended.old === ends && extended.new === plusYears(ends, 5) && longer === extended.new, `${ends} → ${longer}`);
  const undone = await app.must("undo_change", { id: extended.id });
  report.check("the undo puts the old end back", undone.undoneAt != null && readPlayer() === ends);
  const none = await app.invoke("extend_contract", { entity: "player", uid, years: 0 });
  report.check("refuses no years", !none.ok && none.error?.code === "edit.outOfRange", JSON.stringify(none.error));

  // A member of staff of the same club, which no human manages: one with an end is extended, one without (a basic
  // contract, as most doctors have) is refused, and nothing is written.
  const staff = (await app.must("search_staff", { query: "", limit: 200, filter: { club: club.name } })).rows
    .filter((member) => member.clubUid === club.uid);
  let dated = null;
  let undated = null;
  for (const member of staff) {
    const values = await app.must("read_values", { entity: "staff", uid: member.uid });
    if (values[FIELD] !== undefined) dated ??= member;
    else if (values["contract.wage"] !== undefined) undated ??= member;
    if (dated && undated) break;
  }
  if (!dated) {
    report.skip("extends a member of staff's contract", `no member of staff of ${club.name} has a contract with an end`);
  } else {
    const readStaff = () => probe.get("staff", dated.uid, [FIELD])[FIELD];
    const was = readStaff();
    const done = await app.must("extend_contract", { entity: "staff", uid: dated.uid, years: 5 });
    const read = readStaff();
    report.check("extends a member of staff's contract by five years", read === plusYears(was, 5),
      `${dated.name}: ${was} → ${read}`);
    await app.must("undo_change", { id: done.id });
    report.check("and the undo puts it back", readStaff() === was);
  }
  if (!undated) {
    report.skip("refuses a contract without an end", `no member of staff of ${club.name} has one`);
  } else {
    const before = probe.get("staff", undated.uid, ["contract.wage"])["contract.wage"];
    const refused = await app.invoke("extend_contract", { entity: "staff", uid: undated.uid, years: 5 });
    const after = probe.get("staff", undated.uid, ["contract.wage"])["contract.wage"];
    report.check("refuses a contract without an end", !refused.ok && refused.error?.code === "edit.unset" && after === before,
      `${undated.name}: ${JSON.stringify(refused.error)}`);
  }

  // Through his profile: Extend, then Undo in the Changes tab.
  await app.openTab("Players");
  await app.setInput(`${VIS}(".search input")`, String(uid));
  const rows = `[...document.querySelectorAll("table.grid tbody tr")].filter(${SHOWN})`;
  await app.waitFor(`${rows}.length === 1 && ${rows}[0].textContent.includes(${JSON.stringify(player.name)})`, "his row");
  await app.click(`${rows}[0]`, "his row");
  const profile = `${VIS}(".profile:not(.popup)")`;
  await app.waitFor(`${profile} && ${profile}.getAttribute("aria-busy") === "false"`, "his profile", 30000);
  const button = `${profile}.querySelector(".contract-extend button")`;
  await app.waitFor(button, "Extend under his contract's dates");
  await app.click(button, "Extend");
  const viaProfile = await settle(readPlayer, plusYears(ends, 5));
  report.check("Extend in his profile writes five years more", viaProfile === plusYears(ends, 5), `${ends} → ${viaProfile}`);
  await app.waitFor(`!${button}?.hasAttribute("aria-busy")`, "Extend to be done");
  await app.shot("contract-extended");

  await app.openTab("Changes");
  const undo = `document.querySelector("table.changes-grid tbody tr td.col-status button")`;
  await app.waitFor(undo, "the change in the Changes tab");
  await app.click(undo, "Undo");
  await app.waitFor(`/Undone/.test(document.querySelector("table.changes-grid tbody tr td.col-status")?.textContent ?? "")`, "Undone");
  report.check("the Changes tab undoes it", readPlayer() === ends, `back to ${readPlayer()}`);
  await app.openTab("Players");
  await app.press("Escape");

  // A mass edit: a year more on the contracts of the club's players, undone as one batch.
  const page = await app.must("search_players", { query: "", limit: 3, filter: { clubUid: club.uid } });
  const sample = page.rows;
  const before = sample.map((p) => probe.get("player", p.uid, [FIELD])[FIELD]);
  const preview = await app.must("plan_mass_edit", {
    entity: "player",
    query: "",
    filters: { playerFilter: { clubUid: club.uid } },
    operations: [{ field: FIELD, operation: { op: "addYears", years: 1 } }],
  });
  report.check(`plans a year more on ${club.name}'s contracts`,
    preview.changes > 0 && preview.rows.every((row) => row.new === plusYears(row.old, 1)),
    `${preview.targets} players, ${preview.changes} changes, ${preview.skippedCount} left alone`);
  const applied = await app.must("apply_mass_edit", { id: preview.id });
  report.check("applies it", applied.applied === preview.changes && applied.failed.length === 0, JSON.stringify(applied.failed.slice(0, 3)));
  const after = sample.map((p) => probe.get("player", p.uid, [FIELD])[FIELD]);
  report.check("the probe reads a year more", after.every((value, i) => value === plusYears(before[i], 1)),
    `${before.join(", ")} → ${after.join(", ")}`);
  const batch = await app.must("undo_batch", { batch: applied.batch });
  report.check("undoes the batch", batch.undone === applied.applied && batch.failed.length === 0, JSON.stringify(batch.failed.slice(0, 3)));
  const back = sample.map((p) => probe.get("player", p.uid, [FIELD])[FIELD]);
  report.check("the probe reads the old ends again", back.every((value, i) => value === before[i]), back.join(", "));
}
