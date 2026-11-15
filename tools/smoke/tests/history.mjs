// The history of a career's changes: what one copy of the app wrote is listed again by a copy started later on the same
// data folder, as after a restart. A change of a value comes back as an earlier one, with whether the game holds it,
// and is undone from the Changes tab (the probe reads the old value); a captaincy, whose undo needed the game's memory
// as it was, comes back as history without Undo, and the copy that made it undoes it. Clear history empties the list
// and the file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { App, SHOWN } from "../lib/app.mjs";
import { clubPlayers, topClubs } from "../lib/witness.mjs";

export const name = "history";
export const writes = true;

const FIELD = "attribute.finishing";

export async function run({ app, report, probe }) {
  const [, , club] = await topClubs(app, 3);
  const [player] = await clubPlayers(app, club, 1);
  report.note(`witnesses: ${player.name} (${player.uid}) and the senior team of ${club.name}`);
  const data = join(app.folder, "data");
  const folder = join(data, "history");
  const files = () => {
    try {
      return readdirSync(folder).filter((file) => file.endsWith(".jsonl"));
    } catch {
      return [];
    }
  };

  // A captaincy of this copy, which only it can undo: it holds what the game's memory was.
  const team = (await app.must("club_squads", { uid: club.uid })).find((t) => t.index === 0);
  const vice = team.players.find((p) => p.playsHere && !p.loan && p.uid !== team.captain && p.uid !== team.viceCaptain);
  const captaincy = await app.must("set_captain", { club: club.uid, team: 0, role: "viceCaptain", uid: vice.uid });
  report.check("a captaincy is logged", captaincy.field === "vice_captain" && captaincy.earlier === false, captaincy.field);
  const [file] = files();
  const written = file ? readFileSync(join(folder, file), "utf8") : "";
  report.check("the career's history file has it", files().length === 1 && written.includes('"vice_captain"'), file ?? "no file");

  const before = probe.get("player", player.uid, [FIELD])[FIELD];
  const value = before + 5 <= 100 ? before + 5 : before - 5;
  let second;
  let third;
  try {
    // A second copy, as after a restart: the captaincy comes back as history; this copy changes a value itself.
    second = await App.start({ exe: app.exe, port: app.port + 2, folder: join(app.folder, "history-second"), env: { FMLIBRE_DATA: data } });
    await second.connect();
    const listed = (await second.must("change_log")).find((c) => c.field === "vice_captain" && c.uid === club.uid && c.undoneAt == null);
    report.check("a second copy lists the captaincy as an earlier change, without Undo", listed?.earlier === true && listed.undoable === false,
      JSON.stringify(listed && { earlier: listed.earlier, undoable: listed.undoable }));
    const tried = listed ? await second.invoke("undo_change", { id: listed.id }) : null;
    report.check("and refuses to undo it", tried?.ok === false && tried.error?.code === "app.historyOnly", JSON.stringify(tried?.error));
    const applied = await second.must("apply_edits", { entity: "player", uid: player.uid, edits: [{ field: FIELD, value }] });
    const changed = probe.get("player", player.uid, [FIELD])[FIELD];
    report.check("the second copy changes a value", applied.applied.length === 1 && changed === value, `${before} → ${changed}`);
    report.check("no errors in the second copy's console", second.consoleProblems.length === 0, second.consoleProblems.slice(0, 3).join(" || "));
    second.close();
    second = null;

    // A third copy: the value comes back with what the game holds, and is undone from the Changes tab.
    third = await App.start({ exe: app.exe, port: app.port + 4, folder: join(app.folder, "history-third"), env: { FMLIBRE_DATA: data } });
    await third.connect();
    const edit = (await third.must("change_log")).find((c) => c.field === FIELD && c.uid === player.uid && c.new === value && c.undoneAt == null);
    report.check("a third copy lists the value as an earlier change the game holds, with Undo",
      edit?.earlier === true && edit.undoable === true && edit.inGame === true,
      JSON.stringify(edit && { earlier: edit.earlier, undoable: edit.undoable, inGame: edit.inGame }));
    const count = await third.js(`document.querySelector("nav.tabs button small")?.textContent ?? ""`);
    report.check("the Changes tab counts only this connection's changes", count === "", count);
    await third.openTab("Changes");
    const rows = `[...document.querySelectorAll(".changes-grid tbody tr")].filter(${SHOWN})`;
    const row = `${rows}.find((tr) => tr.textContent.includes(${JSON.stringify(player.name)}) && tr.querySelector(".tag.earlier"))`;
    await third.waitFor(row, "the earlier change's row");
    report.check("its row is marked earlier and in the game", await third.js(`!!${row}.querySelector(".in-game:not(.missing)")`));
    const history = `${rows}.find((tr) => tr.textContent.includes(${JSON.stringify(club.name)}) && tr.querySelector(".history-only"))`;
    report.check("the captaincy's row has no Undo", await third.js(`!!${history} && !${history}.querySelector("button")`));
    await third.shot("history-earlier");
    await third.click(`${row}.querySelector(".col-status button")`, "Undo");
    await third.waitFor(`${row}?.classList.contains("undone")`, "the change undone");
    const back = probe.get("player", player.uid, [FIELD])[FIELD];
    report.check("Undo writes the old value back", back === before, `reads ${back}, was ${before}`);

    // Clear history: the list and the file are emptied.
    await third.click(`document.querySelector(".toolbar .clear-history")`, "Clear history");
    await third.waitFor(`document.querySelector(".toolbar .clear-question")`, "the question");
    await third.shot("history-clear");
    await third.click(`document.querySelector(".toolbar button.danger")`, "Clear");
    await third.waitFor(`document.querySelector(".changes .empty")`, "the empty list");
    report.check("Clear history empties the list", (await third.must("change_log")).length === 0);
    const size = file ? statSync(join(folder, file)).size : -1;
    report.check("and the file", size === 0, `${size} bytes`);
    report.check("no errors in the third copy's console", third.consoleProblems.length === 0, third.consoleProblems.slice(0, 3).join(" || "));
  } finally {
    second?.close();
    third?.close();
    // Whatever a copy left of the value goes back, as the runner's undo knows only the first copy's changes.
    if (probe.get("player", player.uid, [FIELD])[FIELD] !== before) probe.set("player", player.uid, FIELD, before);
    const undone = await app.invoke("undo_change", { id: captaincy.id });
    report.check("the first copy undoes its captaincy", undone.ok, JSON.stringify(undone.error));
    const after = (await app.must("club_squads", { uid: club.uid })).find((t) => t.index === 0);
    report.check("the vice-captain is the one before", after.viceCaptain === team.viceCaptain, `${after.viceCaptain} (was ${team.viceCaptain})`);
  }
}
