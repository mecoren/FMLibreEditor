// Editing a player: fields written through the app's commands, read back by the probe, and undone from the change
// log; his city of birth set to another city of his nation and back, and refused a nation in its place; then one
// attribute through his profile's Edit mode, undone from the Changes tab.
import { SHOWN, VIS } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "edit";
export const writes = true;

const FIELDS = ["attribute.finishing", "attribute.passing", "contract.wage"];

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
