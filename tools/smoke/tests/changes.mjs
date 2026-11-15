// Searching, filtering and exporting the Changes view. A change of one attribute of a player and a mass edit of another
// over his club's players are made through the app's commands, and listed in the Changes tab: the search finds him by
// his UID and by his name (in capitals, without the accents), and the mass edit is listed with only his change under
// it; This session keeps them and Earlier sessions has none; his change, undone from outside, drops out of Not undone
// when the view reads the log again, with the search still in its box. Export writes the changes the list shows to a
// CSV file in the exports folder, with commas and then with semicolons, and the file has the rows the list showed, with
// what the log holds of each as stored and as the list shows it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SHOWN, VIS } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "changes";
export const writes = true;

const FIELD = "attribute.finishing";
const MASS_FIELD = "attribute.crossing";

const SEARCH = `${VIS}(".changes-filters .search input")`;
const ROWS = `[...document.querySelectorAll(".changes-grid tbody tr")].filter(${SHOWN})`;
const COUNT = `(document.querySelector(".changes .toolbar .count")?.textContent ?? "")`;
const SESSION = (label) =>
  `[...document.querySelectorAll(".change-session button")].find((b) => b.textContent === ${JSON.stringify(label)})`;
const CHECKBOX = (label) =>
  `[...document.querySelectorAll(".changes-filters label.filter-field")].find((l) => l.textContent === ${JSON.stringify(label)}).querySelector("input")`;
const DIALOG = `document.querySelector(".export-dialog")`;

/** The columns of the file, as export.rs writes them. */
const COLUMNS = [
  "time", "name", "uid", "entity", "field", "field_label", "old", "new", "old_shown", "new_shown", "notes", "mass_edit",
  "undone_at", "earlier", "in_game",
];

/** A moment as the window writes it to the file: ISO 8601 with the local offset. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

/** The rows of a CSV file as the exports write it: a byte order mark, quotes where a cell holds the separator. */
function parseCsv(text, separator) {
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === separator) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A row of the file by the names of the columns. */
const byColumn = (row) => Object.fromEntries(COLUMNS.map((column, at) => [column, row[at]]));

export async function run({ app, report, probe }) {
  // A club the other tests leave alone, so that his changes in the log are those of this test and what earlier tests
  // made and undid.
  const clubs = await topClubs(app, 14);
  const club = clubs[clubs.length - 1];
  const [player] = await clubPlayers(app, club, 3);
  report.note(`witness: ${player.name} (${player.uid}) and the players of ${club.name}`);

  // One attribute of his, on its own; and another of every player of his club, as one mass edit.
  const before = probe.get("player", player.uid, [FIELD])[FIELD];
  const value = before + 5 <= 100 ? before + 5 : before - 5;
  const edited = await app.must("apply_edits", { entity: "player", uid: player.uid, edits: [{ field: FIELD, value }] });
  const single = edited.applied[0];
  const preview = await app.must("plan_mass_edit", {
    entity: "player",
    query: "",
    filters: { playerFilter: { clubUid: club.uid } },
    operations: [{ field: MASS_FIELD, operation: { op: "add", amount: 3 } }],
  });
  const mass = await app.must("apply_mass_edit", { id: preview.id });
  report.check("a change and a mass edit are made", single !== undefined && mass.applied > 1 && mass.failed.length === 0,
    `${mass.applied} changes in mass edit ${mass.batch}`);

  // What the log holds of him now, which the search is to find.
  const his = (await app.must("change_log")).filter((change) => change.uid === player.uid);
  const total = his.length;
  const undoneBefore = his.filter((change) => change.undoneAt !== null).length;

  try {
    await app.openTab("Changes");
    await app.waitFor(SEARCH, "the search box");
    await app.shot("changes-list");
    await app.chord("f");
    report.check("Ctrl+F puts the caret in the Changes search", await app.js(`document.activeElement === ${SEARCH}`));

    // The search: his UID, and his name as it is typed in capitals without accents.
    await app.setInput(SEARCH, String(player.uid));
    await app.waitFor(`/^${total} of [\\d,]+ changes/.test(${COUNT})`, `his ${total} changes found by his UID`, 30000);
    const matching = await app.js(`${ROWS}.find((tr) => tr.classList.contains("batch-row"))?.querySelector(".batch-matching")?.textContent ?? ""`);
    const of = new Intl.NumberFormat("en-GB").format(mass.applied);
    const underBatch = await app.js(`!!${ROWS}.find((tr) => tr.classList.contains("in-batch") && tr.textContent.includes("Crossing") && tr.textContent.includes(${JSON.stringify(player.name)}))`);
    report.check("the mass edit is listed, opened on his one change", matching === `1 of ${of} match` && underBatch, matching);
    const alone = await app.js(`!!${ROWS}.find((tr) => !tr.classList.contains("in-batch") && tr.textContent.includes("Finishing") && tr.textContent.includes(${JSON.stringify(player.name)}))`);
    report.check("his change on its own is listed", alone);
    await app.shot("changes-search");

    const plain = player.name.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
    await app.setInput(SEARCH, plain);
    await app.waitFor(`/^${total} of [\\d,]+ changes/.test(${COUNT})`, "his changes found by his name", 30000);
    report.check("the search ignores case and accents",
      await app.js(`${ROWS}.every((tr) => tr.classList.contains("batch-row") || tr.textContent.includes(${JSON.stringify(player.name)}))`), plain);
    await app.setInput(SEARCH, String(player.uid));
    await app.waitFor(`/^${total} of /.test(${COUNT})`, "his UID again");

    // This session, and earlier ones.
    await app.click(SESSION("This session"), "This session");
    await app.waitFor(`/^${total} of /.test(${COUNT})`, "his changes of this session");
    await app.click(SESSION("Earlier sessions"), "Earlier sessions");
    await app.waitFor(`!!document.querySelector(".changes .empty")`, "the empty list");
    const none = await app.js(`document.querySelector(".changes .empty").textContent`);
    report.check("Earlier sessions has none of them", /^0 of /.test(await app.js(COUNT)) && /^No change matches/.test(none), none);
    await app.click(SESSION("All"), "All");
    await app.waitFor(`/^${total} of /.test(${COUNT})`, "his changes again");

    // His change on its own is undone from outside; the view reads the log again when it is shown, with the search kept.
    await app.must("undo_change", { id: single.id });
    await app.openTab("Players");
    await app.openTab("Changes");
    await app.waitFor(`/^${total} of [\\d,]+ changes · ${undoneBefore + 1} undone$/.test(${COUNT})`, "the log read again, one change more undone", 30000);
    report.check("the search stays while the log is read again", (await app.js(`${SEARCH}.value`)) === String(player.uid));
    const standing = total - undoneBefore - 1;
    await app.click(CHECKBOX("Not undone"), "Not undone");
    await app.waitFor(`/^${standing} of [\\d,]+ changes$/.test(${COUNT})`, "only the changes that stand");
    const shown = await app.js(`${ROWS}.map((tr) => tr.textContent).join("\\n")`);
    report.check("Not undone leaves the changes that stand", shown.includes("Crossing") && !shown.includes("Finishing"), `${standing} left`);

    // Export: the file has the rows the list shows.
    const logged = (await app.must("change_log")).find((change) => change.uid === player.uid && change.batch === mass.batch);
    const cell = await app.js(`${ROWS}.find((tr) => tr.classList.contains("in-batch")).querySelector(".change-value").firstChild.textContent`);
    const first = await exportFile(app, report, "csv", ",");
    report.check("the file has the header and the rows the list shows",
      JSON.stringify(first.header) === JSON.stringify(COLUMNS) && first.rows.length === standing, `${first.rows.length} rows in ${first.file}`);
    const row = first.rows.map(byColumn).find((r) => r.mass_edit === String(mass.batch));
    report.check("his row holds what the log holds, as stored",
      row?.uid === String(player.uid) && row.entity === "player" && row.field === MASS_FIELD && row.old === String(logged.old)
        && row.new === String(logged.new) && row.earlier === "false" && row.undone_at === "" && row.name === player.name,
      JSON.stringify(row));
    report.check("and as the list shows it",
      row !== undefined && `${row.old_shown} → ${row.new_shown}` === cell && row.field_label === "Crossing" && ISO_TIME.test(row.time),
      `${cell} | ${row?.field_label} | ${row?.time}`);

    // All of his changes, with semicolons: the one on its own was undone.
    await app.click(CHECKBOX("Not undone"), "Not undone");
    await app.waitFor(`/^${total} of [\\d,]+ changes · ${undoneBefore + 1} undone$/.test(${COUNT})`, "all his changes again");
    const second = await exportFile(app, report, "csvSemicolon", ";");
    report.check("a second export that day is a file of its own", second.file !== first.file && second.file.endsWith("-2.csv"), `${first.file}, ${second.file}`);
    report.check("the semicolon file has all the rows",
      JSON.stringify(second.header) === JSON.stringify(COLUMNS) && second.rows.length === total, `${second.rows.length} rows`);
    const own = second.rows.map(byColumn).find((r) => r.field === FIELD && r.old === String(single.old) && r.new === String(single.new));
    report.check("the change that was undone says when, and is part of no mass edit",
      own !== undefined && own.mass_edit === "" && ISO_TIME.test(own.undone_at) && ISO_TIME.test(own.time) && own.earlier === "false", JSON.stringify(own));

    // Clear filter takes the search and the choices away.
    await app.click(`document.querySelector(".changes-filters .filter-clear")`, "Clear filter");
    await app.waitFor(`/^\\d[\\d,]* changes( · \\d+ undone)?$/.test(${COUNT})`, "the whole list");
    report.check("Clear filter empties the search box", (await app.js(`${SEARCH}.value`)) === "");
  } finally {
    // The runner undoes what a test leaves, but only after this has had its say.
    const undone = await app.invoke("undo_batch", { batch: mass.batch });
    report.check("the mass edit is undone", undone.ok && undone.value.failed.length === 0, JSON.stringify(undone.error ?? undone.value.failed.slice(0, 3)));
    const back = probe.get("player", player.uid, [FIELD, MASS_FIELD]);
    report.check("the probe reads his old finishing", back[FIELD] === before, `${back[FIELD]} (was ${before})`);
  }
}

/**
 * Exports what the Changes view shows through its Export button as `format` (the radio's value, written with
 * `separator`), and reads the file the dialog names from the exports folder; the dialog is closed after.
 */
async function exportFile(app, report, format, separator) {
  await app.click(`document.querySelector(".changes .toolbar .export-toggle")`, "Export");
  await app.waitFor(DIALOG, "the export dialog");
  const offered = await app.js(`[...document.querySelectorAll(".export-dialog input[type=radio]")].map((r) => r.value).join()`);
  report.check(`the dialog offers the two kinds of CSV, and no JSON (${format})`, offered === "csv,csvSemicolon", offered);
  await app.click(`[...document.querySelectorAll(".export-dialog input[type=radio]")].find((r) => r.value === ${JSON.stringify(format)})`, format);
  await app.click(`document.querySelector(".export-dialog .modal-foot button.primary")`, "Export in the dialog");
  await app.waitFor(`/^Exported /.test(document.querySelector(".export-dialog .mass-result")?.textContent ?? "")`, "the report", 30000);
  const said = await app.js(`document.querySelector(".export-dialog .mass-result").textContent`);
  const file = said.match(/ to (\S+\.csv)/)?.[1] ?? "";
  const path = join(app.folder, "exports", file);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  report.check(`Export writes a ${format} file to the exports folder`, text.startsWith("﻿") && file.startsWith("changes-"),
    `${file}${text ? `, ${text.length} characters` : ", not there"}`);
  await app.shot(`changes-export-${format}`);
  await app.press("Escape");
  await app.waitFor(`!${DIALOG}`, "the dialog to close");
  const [header = [], ...rows] = parseCsv(text, separator);
  return { file, header, rows };
}
