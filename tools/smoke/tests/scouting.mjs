// The Scouting tab's extras: the lists of opportunities (the cards count what the core counts, every player of a list
// is on it for its reason), players like one (from "Find a replacement"), the comparison with the club's best player
// at the position, the scout report saved as a picture in the exports folder, the squad on a pitch, and the youth
// intakes of the club and of another one. Writes nothing to the game.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep, VIS } from "../lib/app.mjs";
import { humanClubs } from "../lib/witness.mjs";

export const name = "scouting";
export const writes = false;

const KINDS = ["bosman", "releaseClause", "unhappy", "inTheRed", "listed", "loanListed", "wonderkid"];
const WHY = {
  bosman: ["freeAgent", "expiring"],
  releaseClause: ["releaseClause"],
  unhappy: ["unhappy"],
  inTheRed: ["inTheRed"],
  listed: ["listed"],
  loanListed: ["loanListed"],
  wonderkid: ["wonderkid"],
};
const DIALOG = (cls) => `document.querySelector(".modal-backdrop .modal.${cls}")`;
const SUBTAB = (id) => `document.querySelector('.scout-subtabs [data-tab="${id}"]')`;

/** Days from one in-game date to another, by the calendar. */
const days = (from, to) => (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 864e5;

export async function run({ app, report, connection }) {
  if ((await humanClubs(app)).length === 0) {
    report.skip("the Scouting tab", "the user manages no club in this save");
    return;
  }
  await app.openTab("Scouting");
  await app.waitFor(`!!document.querySelector(".scout-subtabs")`, "the Scouting tab", 30000);
  const tabs = await app.js(`[...document.querySelectorAll(".scout-subtabs [role=tab]")].map((t) => t.dataset.tab)`);
  report.check(
    "the tab has its six sections",
    JSON.stringify(tabs) === JSON.stringify(["recommend", "opportunities", "similar", "depth", "departures", "youth"]),
    tabs.join(", "),
  );

  // The lists of opportunities, as the core gives them: each player on a list for its reason.
  const today = connection.gameDate;
  let counts = null;
  for (const kind of KINDS) {
    const started = Date.now();
    const found = await app.must("scouting_opportunities", { request: { kind, limit: 50 } });
    const took = Date.now() - started;
    counts ??= Object.fromEntries(found.counts.map((c) => [c.kind, c]));
    const wrong = found.items.filter((item) => !WHY[kind].includes(item.why.code));
    let detail = `${found.items.length} of ${found.counts.find((c) => c.kind === kind)?.count}, ${took} ms`;
    if (kind === "bosman" && today) {
      const late = found.items.filter(
        (item) => item.why.code === "expiring" && (!item.player.contractExpires || days(today, item.player.contractExpires) > 183),
      );
      wrong.push(...late);
      detail += `, ${late.length} ending later than six months`;
    }
    if (kind === "releaseClause") {
      wrong.push(...found.items.filter((item) => item.why.against !== null && item.why.value >= item.why.against));
    }
    if (kind === "wonderkid") {
      wrong.push(...found.items.filter((item) => (item.player.age ?? 99) > 19 || item.player.potentialAbility < 140));
    }
    report.check(`the ${kind} list holds only players on it for its reason`, wrong.length === 0, detail);
  }
  report.check(
    "every list is counted",
    counts !== null && KINDS.every((kind) => counts[kind] !== undefined),
    JSON.stringify(Object.fromEntries(Object.entries(counts ?? {}).map(([k, c]) => [k, c.count]))),
  );

  // The cards say the same.
  await app.click(SUBTAB("opportunities"), "Opportunities");
  await app.waitFor(`[...document.querySelectorAll(".scout-kind-count")].every((c) => c.textContent !== "…")`, "the counts", 30000);
  const shown = await app.js(
    `Object.fromEntries([...document.querySelectorAll(".scout-kind")].map((card) => [card.dataset.kind, card.querySelector(".scout-kind-count").textContent]))`,
  );
  const expected = Object.fromEntries(KINDS.map((kind) => [kind, `${counts[kind].count}${counts[kind].more ? "+" : ""}`]));
  report.check(
    "the cards count what the core counts",
    KINDS.every((kind) => shown[kind]?.replace(/[^\d+]/g, "") === expected[kind]),
    `${JSON.stringify(shown)} (expected ${JSON.stringify(expected)})`,
  );
  await app.shot("scouting-opportunities");

  // A list picked fills the table.
  const kind = KINDS.find((k) => counts[k].count > 0) ?? "bosman";
  await app.click(`document.querySelector('.scout-kind[data-kind="${kind}"]')`, `the ${kind} card`);
  await app.waitFor(
    `document.querySelector('.scout-kind[data-kind="${kind}"]').getAttribute("aria-pressed") === "true" && (${VIS}(".scout-opportunities tbody tr") || ${VIS}(".scout-opportunities .empty"))`,
    "the list",
    30000,
  );
  await sleep(600);
  const rows = await app.js(`document.querySelectorAll(".scout-opportunities tbody tr").length`);
  report.check(`the ${kind} card fills the table`, rows === Math.min(50, counts[kind].count), `${rows} rows`);

  // The comparison with the club's best player there.
  if (rows > 0) {
    await app.click(`document.querySelector('.scout-opportunities tbody tr [data-action="compare"]')`, "Compare");
    await app.waitFor(`${DIALOG("scout-compare")} && !${DIALOG("scout-compare")}.getAttribute("aria-busy")`, "the comparison", 30000);
    const heads = await app.js(`[...${DIALOG("scout-compare")}.querySelectorAll(".scout-compare-tag")].map((t) => t.textContent)`);
    const attributes = await app.js(`${DIALOG("scout-compare")}.querySelectorAll(".scout-key-attribute").length`);
    report.check(
      "Compare puts him beside the club's no. 1 at his position, the role's key attributes first",
      heads.length === 2 && heads[0] === "Your no. 1" && attributes > 0,
      `${heads.join(" + ")}, ${attributes} key attributes`,
    );
    await app.shot("scouting-compare");
    await app.press("Escape");
    await app.waitFor(`!${DIALOG("scout-compare")}`, "the comparison to close");
  }

  // Players like one: a replacement for a player the scout would let go.
  await app.click(SUBTAB("departures"), "Players to let go");
  const replace = `${VIS}(".scout-departures .scout-replace")`;
  if (await app.js(`!!${replace}`)) {
    const who = await app.js(`${replace}.closest("tr").querySelector(".name-link").textContent`);
    await app.click(replace, `Find a replacement for ${who}`);
    await app.waitFor(`${SUBTAB("similar")}.getAttribute("aria-selected") === "true"`, "the Similar players section");
    await app.waitFor(`!!document.querySelector(".scout-reference-name")`, "the player they are like", 30000);
    const reference = await app.js(`document.querySelector(".scout-reference-name").textContent`);
    report.check("Find a replacement looks for players like him", reference === who, `${reference} (expected ${who})`);
    await app.waitFor(`${VIS}(".scout-similar tbody tr") || ${VIS}(".scout-similar .empty")`, "the players like him", 30000);
    const alike = await app.js(
      `[...document.querySelectorAll(".scout-similar tbody tr")].map((tr) => Number(tr.querySelector("td:nth-child(6) .num")?.textContent))`,
    );
    const sorted = alike.every((value, i) => i === 0 || value <= alike[i - 1]);
    report.check("the most alike come first", alike.length === 0 || sorted, alike.slice(0, 8).join(", "));
    await app.shot("scouting-similar");
  } else {
    report.skip("Find a replacement", "the scout would let nobody go");
  }

  // The scout report, saved as a picture in the exports folder.
  const reportButton = `${VIS}(".scout-similar tbody tr [data-action=report], .scout-opportunities tbody tr [data-action=report]")`;
  if (await app.js(`!!${reportButton}`)) {
    await app.click(reportButton, "Scout report");
    await app.waitFor(`${DIALOG("scout-report")}?.querySelector("img.scout-report-card")?.complete`, "the report", 30000);
    const width = await app.js(`${DIALOG("scout-report")}.querySelector("img.scout-report-card").naturalWidth`);
    report.check("the report is drawn as a picture", width === 1520, `${width} pixels wide`);
    await app.click(
      `[...${DIALOG("scout-report")}.querySelectorAll(".modal-foot button")].find((b) => b.classList.contains("primary"))`,
      "Save as image",
    );
    await app.waitFor(`/Saved as/.test(${DIALOG("scout-report")}.querySelector(".scout-report-status").textContent)`, "the save");
    const file = await app.js(`${DIALOG("scout-report")}.querySelector(".scout-report-status").textContent.match(/Saved as (\\S+\\.png)/)?.[1] ?? ""`);
    const path = join(app.folder, "exports", file);
    const png = existsSync(path) ? readFileSync(path) : null;
    report.check(
      "Save as image writes a PNG to the exports folder",
      png !== null && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      `${file}${png ? `, ${png.length} bytes` : ", not there"}`,
    );
    // The PDF: a page whose cross-reference table points at its objects.
    await app.click(
      `[...${DIALOG("scout-report")}.querySelectorAll(".modal-foot button")].find((b) => b.textContent === "Save as PDF")`,
      "Save as PDF",
    );
    await app.waitFor(`/Saved as \\S+\\.pdf/.test(${DIALOG("scout-report")}.querySelector(".scout-report-status").textContent)`, "the PDF");
    const pdfFile = await app.js(`${DIALOG("scout-report")}.querySelector(".scout-report-status").textContent.match(/Saved as (\\S+\\.pdf)/)?.[1] ?? ""`);
    const pdfPath = join(app.folder, "exports", pdfFile);
    const pdf = existsSync(pdfPath) ? readFileSync(pdfPath).toString("latin1") : "";
    const xrefAt = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1] ?? -1);
    const offsets = pdf.slice(xrefAt).split("\n").slice(3).filter((line) => / n $/.test(line)).map((line) => Number(line.slice(0, 10)));
    const pointed = offsets.every((offset, i) => pdf.startsWith(`${i + 1} 0 obj`, offset));
    report.check(
      "Save as PDF writes a PDF whose objects are where it says",
      pdf.startsWith("%PDF-") && pdf.startsWith("xref", xrefAt) && offsets.length === 5 && pointed,
      `${pdfFile}, ${pdf.length} bytes, ${offsets.length} objects`,
    );
    await app.shot("scouting-report");
    await app.press("Escape");
    await app.waitFor(`!${DIALOG("scout-report")}`, "the report to close");
  } else {
    report.skip("the scout report", "no player found to write one about");
  }

  // The squad on a pitch, and a line picked on it.
  await app.click(SUBTAB("depth"), "Squad depth");
  await app.click(`document.querySelector('.scout-depth-head [data-view="pitch"]')`, "Pitch");
  await app.waitFor(`document.querySelectorAll(".scout-line-spot").length > 0`, "the pitch");
  const spots = await app.js(`document.querySelectorAll(".scout-line-spot").length`);
  report.check("the pitch shows the ten lines", spots === 10, `${spots}`);
  await app.click(`document.querySelector('.scout-line-spot[data-line="st"]')`, "the strikers");
  const detail = await app.js(`document.querySelector(".scout-line-detail h3")?.textContent ?? ""`);
  report.check("a line picked on the pitch shows in full beside it", detail === "Strikers", detail);
  await app.shot("scouting-pitch");
  await app.click(`document.querySelector('.scout-depth-head [data-view="table"]')`, "Table");
  report.check("the table is a click away", await app.js(`!!document.querySelector(".scout-depth-table")`));

  await youthIntakes(app, report);

  const log = await app.must("change_log");
  report.check("nothing was written", log.length === 0, `${log.length} changes`);
}

/** An intake's day as a number, 0 for none. */
const dayKey = (d) => (d ? d.year * 10000 + d.month * 100 + d.day : 0);

/** What is wrong with a club's youth intakes as `youth_intakes` gives them: the order, and players who should not be there. */
function intakeFaults(found) {
  const days = found.intakes.map((i) => dayKey(i.joined));
  const newestFirst = days.every((d, i) => i === 0 || days[i - 1] > d);
  const players = found.intakes.flatMap((i) => i.players.map((p) => ({ ...p, day: dayKey(i.joined) })));
  const wrong = players.filter(
    (p) =>
      p.joinedAge === null ||
      p.joinedAge > 17 ||
      dayKey(p.joined) !== p.day ||
      (p.player.clubUid !== found.clubUid && p.onLoanAtUid === null),
  );
  return { newestFirst, players, wrong };
}

async function youthIntakes(app, report) {
  const mine = await app.must("youth_intakes", { club: null });
  const own = intakeFaults(mine);
  const ownCounts = mine.intakes.map((i) => i.players.length).join(" + ") || "none";
  report.check(
    "the club's youth intakes hold its own players who joined it at 17 or younger, the newest first",
    own.newestFirst && own.wrong.length === 0,
    `${mine.club}: ${ownCounts}${own.wrong.length ? `; wrong: ${own.wrong.map((p) => p.player.name).join(", ")}` : ""}`,
  );
  report.check("the game's mark of the players it made is known", mine.marked === true);

  // Another club: the one with the most players of 16 or younger, which no human manages.
  const human = await humanClubs(app);
  const young = (await app.must("search_players", { query: "", limit: 1000, filter: { maxAge: 16, women: false } })).rows;
  const byClub = new Map();
  for (const p of young.filter((p) => p.clubUid != null && !human.includes(p.clubUid))) {
    byClub.set(p.clubUid, (byClub.get(p.clubUid) ?? 0) + 1);
  }
  const [otherUid] = [...byClub.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (otherUid === undefined) {
    report.skip("another club's youth intakes", "no club has players of 16 or younger");
    return;
  }
  const other = await app.must("youth_intakes", { club: otherUid });
  const theirs = intakeFaults(other);
  report.check(
    "another club's youth intakes read alike",
    other.intakes.length > 0 && theirs.newestFirst && theirs.wrong.length === 0,
    `${other.club}: ${other.intakes.map((i) => i.players.length).join(" + ")} players`,
  );
  const cities = await app.must("birth_cities");
  const known = new Set(cities.map((c) => c.address));
  const missing = theirs.players.filter((p) => p.city !== null && !known.has(p.city.address));
  report.check(
    "the cities a city of birth can be set to hold the intake's",
    cities.length > 0 && missing.length === 0 && theirs.players.some((p) => p.city !== null),
    `${cities.length} cities, ${missing.length} missing`,
  );

  // The section: the club's newest intake (or that it has none), then the other club's, picked from the club search.
  const rows = `[...document.querySelectorAll(".scout-youth-grid tbody tr:not(.scout-youth-editor-row)")]`;
  await app.click(SUBTAB("youth"), "Youth intake");
  await app.waitFor(`!!document.querySelector(".scout-youth-grid, .scout-youth-empty")`, "the youth intakes", 30000);
  if (mine.intakes.length === 0) {
    report.check("the section says the club has no intake players", await app.js(`!!document.querySelector(".scout-youth-empty")`));
  } else {
    const shown = await app.js(`${rows}.length`);
    report.check("the section lists the club's newest intake", shown === mine.intakes[0].players.length, `${shown} rows`);
  }
  await app.click(
    `[...document.querySelectorAll(".scout-youth-tools button")].find((b) => b.textContent === "Look at another club")`,
    "Look at another club",
  );
  await app.waitFor(`document.querySelector(".scout-youth-search input")`, "the club search");
  await app.setInput(`document.querySelector(".scout-youth-search input")`, other.club);
  const result = `[...document.querySelectorAll(".scout-youth-search li")].find((li) => li.textContent.includes(${JSON.stringify(other.club)}))`;
  await app.waitFor(result, "the club in the search");
  await app.click(result, other.club);
  // The name alone: without a graphics pack the club's logo is a badge with its initials.
  await app.waitFor(
    `document.querySelector(".scout-youth-club .name-text")?.textContent === ${JSON.stringify(other.club)} && ${rows}.length > 0`,
    "the other club's intake",
    30000,
  );
  const listed = await app.js(`${rows}.length`);
  report.check(
    "another club picked in the search shows its newest intake",
    listed === other.intakes[0].players.length,
    `${listed} rows, ${other.intakes[0].players.length} expected`,
  );
  await app.shot("scouting-youth");

  // The inputs of the first of them, read from the game; nothing is saved.
  await app.click(`${rows}[0].querySelector(".scout-youth-edit")`, "Edit");
  const editor = `document.querySelector(".scout-youth-editor")`;
  await app.waitFor(`${editor}?.querySelector("button[type=submit]")`, "his inputs");
  const inputs = await app.js(`({
    date: ${editor}.querySelector("input[type=date]").value,
    numbers: [...${editor}.querySelectorAll("input[type=number]")].map((i) => i.value),
    cities: ${editor}.querySelectorAll(".scout-youth-city option").length,
  })`);
  const first = other.intakes[0].players[0].player;
  report.check(
    "Edit shows his values from the game",
    /^\d{4}-\d{2}-\d{2}$/.test(inputs.date) &&
      Number(inputs.numbers[0]) === first.currentAbility &&
      Number(inputs.numbers[1]) === first.potentialAbility &&
      inputs.cities > 0,
    JSON.stringify(inputs),
  );
  await app.shot("scouting-youth-edit");
  await app.click(`[...${editor}.querySelectorAll("button")].find((b) => b.textContent === "Cancel")`, "Cancel");
  await app.click(`document.querySelector(".scout-youth-tools .link-button")`, "Back to my club");
}
