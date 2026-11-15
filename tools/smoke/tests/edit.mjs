// Editing a player: fields written through the app's commands, read back by the probe, and undone from the change
// log; his city of birth set to another city of his nation and back, and refused a nation in its place; the squad
// numbers of two players of one team, where the undo that would give both one number is refused; then one attribute
// through his profile's Edit mode, undone from the Changes tab.
import { SHOWN, VIS } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "edit";
export const writes = true;

const FIELDS = ["attribute.finishing", "attribute.passing", "contract.wage"];
const NUMBER = "contract.squad_number";

export async function run({ app, report, probe }) {
  const [, club] = await topClubs(app, 2);
  const [player] = await clubPlayers(app, club, 1);
  const uid = player.uid;
  report.note(`witness: ${player.name} (${uid}) of ${club.name}`);
  const before = await app.must("read_values", { entity: "player", uid });
  const seen = probe.get("player", uid, FIELDS);
  report.check("the probe reads what the app reads", FIELDS.every((field) => seen[field] === before[field]), JSON.stringify(seen));

  const nudge = (value, step, top) => (value + step <= top ? value + step : value - step);
  const edits = [
    { field: "attribute.finishing", value: nudge(before["attribute.finishing"], 5, 100) },
    { field: "attribute.passing", value: nudge(before["attribute.passing"], 5, 100) },
    { field: "contract.wage", value: before["contract.wage"] + 1000 },
  ];
  const applied = await app.must("apply_edits", { entity: "player", uid, edits });
  report.check("applies three edits", applied.applied.length === 3 && applied.failed.length === 0, JSON.stringify(applied.failed));
  const written = probe.get("player", uid, FIELDS);
  report.check("the probe reads the new values", edits.every((edit) => written[edit.field] === edit.value), JSON.stringify(written));

  for (const change of [...applied.applied].reverse()) {
    const undone = await app.must("undo_change", { id: change.id });
    report.check(`undoes ${change.field}`, undone.undoneAt != null);
  }
  const twice = await app.invoke("undo_change", { id: applied.applied[0].id });
  report.check("refuses to undo twice", !twice.ok);
  const restored = probe.get("player", uid, FIELDS);
  report.check("the probe reads the old values again", FIELDS.every((field) => restored[field] === seen[field]), JSON.stringify(restored));

  await cityOfBirth({ app, report, probe, club });
  await squadNumbers({ app, report, probe, club });

  // The same through his profile.
  await app.openTab("Players");
  await app.setInput(`${VIS}(".search input")`, String(uid));
  const rows = `[...document.querySelectorAll("table.grid tbody tr")].filter(${SHOWN})`;
  await app.waitFor(`${rows}.length === 1 && ${rows}[0].textContent.includes(${JSON.stringify(player.name)})`, "his row");
  await app.click(`${rows}[0]`, "his row");
  const profile = `${VIS}(".profile:not(.popup)")`;
  await app.waitFor(`${profile} && ${profile}.getAttribute("aria-busy") === "false"`, "his profile", 30000);
  await app.click(`${profile}.querySelector("button.edit-toggle")`, "Edit");
  const input = `${profile}.querySelector('.edit-input[data-field="attribute.finishing"]')`;
  await app.waitFor(input, "the Finishing input");
  const shown = Number(await app.js(`${input}.value`));
  await app.setInput(input, shown < 20 ? shown + 1 : shown - 1);
  await app.waitFor(`${profile}.querySelector(".edit-count.pending")`, "one change to apply");
  await app.click(`${profile}.querySelector(".edit-footer button.primary")`, "Apply");
  await app.waitFor(`!${profile}.classList.contains("editing") && ${profile}.querySelector(".edit-report")?.textContent`, "the report");
  const viaProfile = probe.get("player", uid, ["attribute.finishing"])["attribute.finishing"];
  report.check("Edit mode writes the attribute", viaProfile !== seen["attribute.finishing"], `${seen["attribute.finishing"]} → ${viaProfile}`);
  await app.shot("edit-applied");

  await app.openTab("Changes");
  const undo = `document.querySelector("table.changes-grid tbody tr td.col-status button")`;
  await app.waitFor(undo, "the change in the Changes tab");
  await app.click(undo, "Undo");
  await app.waitFor(`/Undone/.test(document.querySelector("table.changes-grid tbody tr td.col-status")?.textContent ?? "")`, "Undone");
  const back = probe.get("player", uid, ["attribute.finishing"])["attribute.finishing"];
  report.check("the Changes tab undoes it", back === seen["attribute.finishing"], `back to ${back}`);
  await app.openTab("Players");
  await app.press("Escape");
}

/** The city of birth of one of `club`'s players: set to another city of his nation, refused a nation, and undone. */
async function cityOfBirth({ app, report, probe, club }) {
  const cities = await app.must("birth_cities");
  let found = null;
  for (const player of await clubPlayers(app, club, 20)) {
    const values = await app.must("read_values", { entity: "player", uid: player.uid });
    const current = cities.find((city) => city.address === values.city_of_birth);
    const other = current && cities.find((city) => city.nationUid === current.nationUid && city.address !== current.address);
    if (other) {
      found = { player, values, current, other };
      break;
    }
  }
  if (found === null) {
    report.skip("the city of birth", `no player of ${club.name} was born in a city another city of his nation is offered beside`);
    return;
  }
  const { player, values, current, other } = found;
  const uid = player.uid;
  report.note(`city of birth: ${player.name} (${uid}), ${current.name} → ${other.name}`);
  const set = await app.must("apply_edits", { entity: "player", uid, edits: [{ field: "city_of_birth", value: other.address }] });
  report.check(
    "sets his city of birth to another city of his nation",
    set.applied.length === 1 && set.failed.length === 0,
    JSON.stringify(set.failed),
  );
  const written = probe.get("player", uid, ["city_of_birth"]).city_of_birth;
  report.check("the probe reads the new city", written === other.address, `${written}`);
  const nation = await app.must("apply_edits", { entity: "player", uid, edits: [{ field: "city_of_birth", value: values.nation }] });
  report.check(
    "refuses a nation as his city of birth",
    nation.applied.length === 0 && nation.failed[0]?.error.code === "edit.unsupported",
    nation.failed[0]?.error.code ?? "written",
  );
  for (const change of set.applied) {
    await app.must("undo_change", { id: change.id });
  }
  const back = probe.get("player", uid, ["city_of_birth"]).city_of_birth;
  report.check("undoing it puts his city back", back === current.address, `${back}`);
}

/**
 * The squad numbers of two players of one team of `club`: the first goes to a number nobody wears, the second takes the
 * number the first left, and the first's undo, which would put that number back beside the second, is refused with
 * nothing written (`edit.taken`, naming the second). The second's undo and then the first's go through, and the probe
 * reads both numbers as they were.
 */
async function squadNumbers({ app, report, probe, club }) {
  const [senior] = await app.must("club_squads", { uid: club.uid });
  const team = senior.players.filter((player) => player.playsHere);
  const numbers = new Map();
  for (const player of team) {
    numbers.set(player.uid, (await app.must("read_values", { entity: "player", uid: player.uid }))[NUMBER]);
  }
  // Numbers of their own: one player of the team wears each, as the game's own data has it for nearly every team.
  const wearing = (number) => [...numbers.values()].filter((worn) => worn === number).length;
  const [first, second] = team.filter((player) => numbers.get(player.uid) <= 99 && wearing(numbers.get(player.uid)) === 1);
  const free = Array.from({ length: 99 }, (_, i) => i + 1).find((number) => wearing(number) === 0);
  if (second === undefined || free === undefined) {
    report.skip("the squad numbers", `${club.name}'s first team has no two players with a number of their own to change`);
    return;
  }
  const [was, took] = [numbers.get(first.uid), numbers.get(second.uid)];
  report.note(`squad numbers: ${first.name} (${first.uid}) ${was} → ${free}, then ${second.name} (${second.uid}) ${took} → ${was}`);
  const edit = (player, value) =>
    app.must("apply_edits", { entity: "player", uid: player.uid, edits: [{ field: NUMBER, value }] });
  const read = (player) => probe.get("player", player.uid, [NUMBER])[NUMBER];
  const numbersNow = () => `${first.name} ${read(first)}, ${second.name} ${read(second)}`;

  const gone = await edit(first, free);
  const given = await edit(second, was);
  const written = [gone, given].every((edited) => edited.applied.length === 1 && edited.failed.length === 0);
  report.check(
    "gives one player a free number and his team-mate the number he left",
    written,
    JSON.stringify([gone.failed, given.failed]),
  );
  if (!written) return;
  report.check("the probe reads the new numbers", read(first) === free && read(second) === was, numbersNow());

  const [goneId, givenId] = [gone.applied[0].id, given.applied[0].id];
  const refused = await app.invoke("undo_change", { id: goneId });
  report.check(
    "refuses to put the first player's number back while his team-mate wears it",
    !refused.ok && refused.error.code === "edit.taken" && refused.error.params?.uid === String(second.uid),
    JSON.stringify(refused),
  );
  report.check("the refusal names him", refused.error?.params?.name === second.name, JSON.stringify(refused.error?.params));
  const log = await app.must("change_log");
  report.check(
    "nothing was written, and his change is still there to undo",
    read(first) === free && read(second) === was && log.find((change) => change.id === goneId)?.undoneAt == null,
    numbersNow(),
  );

  const undoneGiven = await app.invoke("undo_change", { id: givenId });
  const undoneGone = await app.invoke("undo_change", { id: goneId });
  report.check(
    "undoes the team-mate's change, and then the first player's",
    undoneGiven.ok && undoneGone.ok,
    JSON.stringify([undoneGiven.error, undoneGone.error]),
  );
  report.check("the probe reads both numbers as they were", read(first) === was && read(second) === took, numbersNow());
}
