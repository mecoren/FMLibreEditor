// What's new: the dialog that tells what a version brings opens by itself once after an update, and never on a new
// install. On a copy of the app of its own (its own web view profile, as a new install has): started, it shows nothing
// and keeps its version as seen; then left as 0.5.1 left the storage (no version seen, and 0.5.1 as the version of
// its last look for updates) and loaded again, it opens with this version's notes; Got it closes it for good, as the
// next start shows; the link at the foot of the window opens it again and Escape closes it. Writes nothing.
import { join } from "node:path";
import { App, SHOWN, sleep } from "../lib/app.mjs";

export const name = "whatsnew";
export const writes = false;

const DIALOG = `[...document.querySelectorAll(".modal.whats-new")].find(${SHOWN})`;
const LINK = `document.querySelector(".colophon .whats-new-link")`;
const VERSION = `(document.querySelector(".colophon-name")?.textContent.match(/\\d+\\.\\d+\\.\\d+/) ?? [null])[0]`;

/**
 * Loads the page again, as the app starting again on the same profile: once it is done starting, and its calls are
 * back, so that none is cut short (see `App.start`).
 */
async function restart(copy) {
  await copy.waitFor(`(window.__TAURI_INTERNALS__.callbacks?.size ?? 0) === 0`, "the app's calls to come back", 5000).catch(() => {});
  await copy.js(`window.smokeOldPage = true`);
  await copy.send("Page.reload");
  await copy.waitFor(
    `!window.smokeOldPage && document.readyState === "complete" && !!document.querySelector(".connect, .views") && ${VERSION} !== null`,
    "the app to start again",
    60000,
  );
}

export async function run({ app, report }) {
  const copy = await App.start({ exe: app.exe, port: app.port + 6, folder: join(app.folder, "whatsnew") });
  try {
    await copy.waitFor(`${VERSION} !== null`, "the app's version at the foot of the window");
    const version = await copy.js(VERSION);
    await sleep(1000);
    report.check("a new install opens no What's new", !(await copy.js(`!!${DIALOG}`)));
    const kept = await copy.js(`localStorage.getItem("fmlibre.whatsNew")`);
    report.check("and keeps its version as the one seen", kept === version, `${kept} (the app: ${version})`);
    if (!(await copy.js(`!!${LINK}`))) {
      report.skip("the dialog", `this build has no notes up to ${version}`);
      return;
    }

    // The storage as 0.5.1 left it, and the app started again: updated from 0.5.1.
    await copy.js(`localStorage.removeItem("fmlibre.whatsNew");
      localStorage.setItem("fmlibre.update", JSON.stringify({ checkedAt: Date.now(), current: "0.5.1", newer: null }))`);
    await restart(copy);
    await copy.waitFor(DIALOG, "What's new after the update", 15000);
    const title = await copy.js(`${DIALOG}.querySelector("h2").textContent`);
    const things = await copy.js(`${DIALOG}.querySelectorAll("li").length`);
    report.check("after an update from 0.5.1, What's new opens by itself about this version", title.includes(version) && things > 0,
      `${title}; ${things} things`);
    report.check("it says the app was updated, and thanks", await copy.js(`!!${DIALOG}.querySelector(".mass-scope")`),
      String(await copy.js(`${DIALOG}.querySelector(".whats-new-thanks")?.textContent ?? "no thanks"`)));
    report.check("focus waits on Got it", await copy.js(`document.activeElement?.textContent === "Got it"`));
    report.check("the release's notes in full are a button away", await copy.js(`[...${DIALOG}.querySelectorAll("button")].some((b) => b.textContent === "All changes")`));
    await copy.shot("whatsnew");
    await copy.click(`[...${DIALOG}.querySelectorAll("button")].find((b) => b.textContent === "Got it")`, "Got it");
    await copy.waitFor(`!${DIALOG}`, "What's new to close");
    const seen = await copy.js(`localStorage.getItem("fmlibre.whatsNew")`);
    report.check("Got it keeps this version as the one seen", seen === version, String(seen));
    await restart(copy);
    await sleep(1500);
    report.check("the next start opens it no more", !(await copy.js(`!!${DIALOG}`)));

    // Asked for: the link at the foot of the window, and Escape to close it.
    await copy.click(LINK, "What's new");
    await copy.waitFor(DIALOG, "What's new from the foot of the window");
    const asked = await copy.js(`${DIALOG}.querySelector("h2").textContent`);
    report.check("the link at the foot of the window opens it again, without saying the app was updated",
      asked.includes(version) && !(await copy.js(`!!${DIALOG}.querySelector(".mass-scope")`)), asked);
    await copy.press("Escape");
    await copy.waitFor(`!${DIALOG}`, "Escape to close What's new");
    report.check("Escape closes it", true);
    report.check("no errors in the copy's console", copy.consoleProblems.length === 0, copy.consoleProblems.slice(0, 3).join(" || "));
  } finally {
    copy.close();
  }
}
