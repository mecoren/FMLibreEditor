// Renaming a player: names that are not names refused, and nothing written; a new first name, a common name given or
// taken away and a new full name, each read back by the probe, found by the player list's search and undone; then a new
// last name through the Rename dialog of his profile. A new first, last or common name takes one place of the room the
// game's list of that table has, which the undo leaves taken (see docs/recon/fm27-names.md).
import { SHOWN, VIS, sleep } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "names";
export const writes = true;

/** One of the names `fmlibre-probe rename` prints: `None`, or `Some("text")` with Rust's escapes. */
function parseName(line, kind) {
  const match = line.match(new RegExp(`\\b${kind} (None|Some\\("((?:[^"\\\\]|\\\\.)*)"\\))`));
  if (!match) return undefined;
  return match[1] === "None" ? null : JSON.parse(`"${match[2]}"`);
}

/** The player's names as the probe reads them, apart from the app. */
function probedNames(probe, uid) {
  const line = probe.run(["rename", uid]).split(/\r?\n/).find((l) => l.startsWith("names:")) ?? "";
  return { first: parseName(line, "first"), last: parseName(line, "last"), common: parseName(line, "common"), full: parseName(line, "full") };
}

const same = (a, b) => a.first === b.first && a.last === b.last && a.common === b.common && a.full === b.full;
const shown = (names) => `${names.first} / ${names.last} / ${names.common} / ${names.full}`;

/** Whether the player list's search for `query` finds the player `uid`. */
async function found(app, query, uid) {
  return (await app.must("search_players", { query, limit: 50, filter: {} })).rows.some((row) => row.uid === uid);
}

/** Gives the player `kind` `to` through the command, checks it with the probe, the list and the room, and undoes it. */
async function renameAndUndo(app, report, probe, uid, kind, to, before) {
  const what = to === null ? `${kind} name taken away` : `${kind} name ${JSON.stringify(to)}`;
  const room = (await app.must("player_names", { uid })).room;
  const renamed = await app.must("rename_player", { uid, kind, name: to });
  const now = probedNames(probe, uid);
  report.check(
    `${what}: written, as the probe reads it`,
    now[kind] === to && renamed.personName?.from === before[kind] && renamed.personName?.to === to && renamed.field === `name.${kind}`,
    shown(now),
  );
  const table = ["first", "last", "common"].indexOf(kind);
  const after = (await app.must("player_names", { uid })).room;
  const used = table >= 0 && to !== null ? 1 : 0;
  report.check(`${what}: the room of its table`, table < 0 || after[table] === room[table] - used, `${room} → ${after}`);
  // The list finds a player by the name he is shown by (his common name, or his first and last names) and his full name:
  // a first or last name of a player who has a common name is neither.
  if (to !== null && (kind === "common" || kind === "full" || before.common === null)) {
    report.check(`${what}: the list's search finds him by it`, await found(app, to, uid));
  }
  await app.must("undo_change", { id: renamed.id });
  const back = probedNames(probe, uid);
  report.check(`${what}: the undo gives him his old name`, same(back, before), shown(back));
}

export async function run({ app, report, probe }) {
  const club = (await topClubs(app, 1))[0];
  const player = club && (await clubPlayers(app, club, 1))[0];
  if (!player) {
    report.skip("renames a player", "no player at the best known club");
    return;
  }
  const uid = player.uid;
  const names = await app.must("player_names", { uid });
  report.note(`witness: ${player.name} (${uid}) of ${club.name}: ${shown(names)}, room ${JSON.stringify(names.room)}`);
  if (!names.room) {
    report.skip("renames a player", "the editor cannot change names in this game");
    return;
  }
  const before = probedNames(probe, uid);
  report.check("the probe reads the names the app reads", same(before, names), shown(before));

  // Names that are not names are refused, and nothing is written.
  const refused = [
    ["an empty first name", "first", ""],
    ["no last name", "last", null],
    ["a first name with a space at its start", "first", ` ${names.first}`],
    ["a name over the most bytes", "full", "X".repeat(names.longest + 1)],
  ];
  for (const [what, kind, to] of refused) {
    const tried = await app.invoke("rename_player", { uid, kind, name: to });
    report.check(`refuses ${what}`, !tried.ok && tried.error.code === "names.bad", tried.ok ? "written" : tried.error.code);
  }
  const unchanged = await app.invoke("rename_player", { uid, kind: "last", name: names.last });
  report.check("refuses the name he has", !unchanged.ok && unchanged.error.code === "names.same", unchanged.ok ? "written" : unchanged.error.code);
  report.check("and writes nothing", same(probedNames(probe, uid), before));
  report.check("nor takes room", JSON.stringify((await app.must("player_names", { uid })).room) === JSON.stringify(names.room));

  await renameAndUndo(app, report, probe, uid, "first", "FMLTestFirst", before);
  if (names.common === null) {
    await renameAndUndo(app, report, probe, uid, "common", "FML Common", before);
  } else {
    await renameAndUndo(app, report, probe, uid, "common", null, before);
    await renameAndUndo(app, report, probe, uid, "common", `${names.common} FML`, before);
  }
  await renameAndUndo(app, report, probe, uid, "full", "FMLibre Test Full Name", before);
  if (names.full !== null) await renameAndUndo(app, report, probe, uid, "full", null, before);

  // The same through his profile: Rename, a new last name, Rename in the dialog, the new name in the profile's header.
  await app.openTab("Players");
  await app.setInput(`${VIS}(".search input")`, String(uid));
  const rows = `[...document.querySelectorAll("table.grid tbody tr")].filter(${SHOWN})`;
  await app.waitFor(`${rows}.length === 1`, "his row");
  await app.click(`${rows}[0]`, "his row");
  const profile = `${VIS}(".profile:not(.popup)")`;
  await app.waitFor(`${profile} && ${profile}.getAttribute("aria-busy") === "false"`, "his profile", 30000);
  await app.click(`${profile}.querySelector("button.rename-toggle")`, "Rename");
  const dialog = `document.querySelector('[role="dialog"].names-dialog')`;
  const lastInput = `${dialog}?.querySelector('input[name="last"]')`;
  await app.waitFor(`${lastInput} && !${lastInput}.disabled`, "the last name's input", 20000);
  await app.setInput(lastInput, "FMLTestLast");
  await sleep(200);
  await app.shot("names-dialog");
  await app.click(`[...${dialog}.querySelectorAll(".modal-foot button")].find((b) => b.classList.contains("primary"))`, "Rename");
  await app.waitFor(`!${dialog}`, "the dialog to close", 20000);
  const renamed = names.common === null ? `${names.first} FMLTestLast` : names.common;
  await app.waitFor(`${profile}.querySelector("h2")?.textContent.includes(${JSON.stringify(renamed)})`, "the new name in the header", 20000);
  report.check("Rename in the dialog gives him the last name", probedNames(probe, uid).last === "FMLTestLast", shown(probedNames(probe, uid)));
  await app.shot("names-renamed");

  // Undone from the change log, as the Changes tab does.
  const logged = (await app.must("change_log")).find((c) => c.uid === uid && c.field === "name.last" && c.undoneAt == null);
  if (logged) await app.must("undo_change", { id: logged.id });
  report.check("undone from the change log", same(probedNames(probe, uid), before), shown(probedNames(probe, uid)));
  await app.press("Escape");
}
