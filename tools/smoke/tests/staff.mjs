// Moving a member of staff to a club whose department is full, as most are once a save is loaded: the app grows the
// department's list, the probe reads him at the new club, and the undo puts him back. A new job in another department
// of his club, the same way. Then the jobs the editor gives since issue #120: a doctor (whose contract the game keeps
// as a basic one, with no dates) moved, a coach moved as a head performance analyst, a director of football moved to a
// club that has none and refused at one that has one, and a member of staff with no club signed as a coach under a
// contract taken from the game's own pool (skipped while the pool has no free slot, right after a load), then again
// through his profile's Transfer dialog on a wage of the test's own. Then a manager: refused at a club that has one and
// at the human manager's, moved to a club whose leagues are played and whose senior team has none (his old club's
// place left empty), given an assistant's job at his club, and a member of staff with no club signed as one.
import { SHOWN, VIS, sleep } from "../lib/app.mjs";
import { humanClubs, topClubs } from "../lib/witness.mjs";

export const name = "staff";
export const writes = true;

/** Coaching jobs the editor moves (see STAFF_JOBS in staff_move.rs), and a scout's, for a new job. */
const COACHING = [2, 20, 22, 26, 34, 60, 64];
const SCOUT = 14;
/** The jobs issue #120 asked for: a director of football, a chief doctor, a doctor, a head performance analyst. */
const DIRECTOR_OF_FOOTBALL = 10;
const DOCTORS = [38, 46];
const HEAD_PERFORMANCE_ANALYST = 62;
const COACH = 2;
/** A manager's job, which the editor gives where the club's senior team has none, and an assistant coach's. */
const MANAGER = 16;
const ASSISTANT_COACH = 20;

/** The line the probe lists the member of staff `id` on: his name, job and club, by name. */
function probedClub(probe, id) {
  const line = probe.run(["staff", id]).split(/\r?\n/).find((l) => l.trimStart().startsWith(String(id)));
  return line?.replace(/\s+/g, " ").trim() ?? "";
}

/** The best member of staff with one of `jobs`, at a club no human manages, among the best `limit` staff. */
async function witness(app, jobs, human, limit = 400) {
  const staff = (await app.must("search_staff", { query: "", limit })).rows;
  return staff.find((m) => !m.isHuman && m.clubUid != null && !human.includes(m.clubUid) && jobs.includes(m.job));
}

export async function run({ app, report, probe }) {
  const human = await humanClubs(app);
  const clubs = await topClubs(app, 10);
  const coach = await witness(app, COACHING, human, 200);
  if (!coach) {
    report.skip("moves a coach to a club with a full department", "no coach at a club no human manages among the best staff");
    return;
  }
  const club = clubs.find((c) => c.uid !== coach.clubUid);
  report.note(`witness: ${coach.name} (${coach.uid}), ${coach.club} → ${club.name}`);
  const before = probedClub(probe, coach.uid);
  report.check("the probe reads him at his club", before.includes(coach.club.slice(0, 20)), before);

  const plan = await app.invoke("plan_staff_move", { uid: coach.uid, club: club.uid });
  report.check("the move is offered, the department full or not", plan.ok, plan.ok ? `${plan.value.from.name} → ${plan.value.to.name}` : plan.error.code);
  if (!plan.ok) return;
  const moved = await app.must("move_staff", { uid: coach.uid, club: club.uid });
  const after = probedClub(probe, coach.uid);
  report.check("moves him, as the probe reads it", after.includes(club.name.slice(0, 20)), after);
  await app.must("undo_change", { id: moved.id });
  const back = probedClub(probe, coach.uid);
  report.check("the undo puts him back", back === before, back);

  // A new job in another department of his club: a scout's.
  const job = await app.invoke("change_staff_job", { uid: coach.uid, job: SCOUT });
  report.check("gives him a scout's job at his club", job.ok, job.ok ? "" : job.error.code);
  if (job.ok) {
    report.check("as the probe reads it", /Scout/.test(probedClub(probe, coach.uid)), probedClub(probe, coach.uid));
    await app.must("undo_change", { id: job.value.id });
    report.check("and the undo gives him his job back", probedClub(probe, coach.uid) === before, probedClub(probe, coach.uid));
  }

  const jobs = await app.must("staff_jobs", {});
  const asked = [DIRECTOR_OF_FOOTBALL, ...DOCTORS, HEAD_PERFORMANCE_ANALYST];
  report.check("offers the jobs issue #120 asked for", asked.every((code) => jobs.includes(code)), jobs.join(", "));

  // Moving him as a head performance analyst: he leaves his department, and joins the new club's coaching staff.
  const asAnalyst = await app.invoke("move_staff", { uid: coach.uid, club: club.uid, job: HEAD_PERFORMANCE_ANALYST });
  report.check("moves him as a head performance analyst", asAnalyst.ok, asAnalyst.ok ? "" : asAnalyst.error.code);
  if (asAnalyst.ok) {
    const there = probedClub(probe, coach.uid);
    report.check("as the probe reads it", /Head Performance/.test(there) && there.includes(club.name.slice(0, 20)), there);
    await app.must("undo_change", { id: asAnalyst.value.id });
    report.check("and the undo puts him back as he was", probedClub(probe, coach.uid) === before, probedClub(probe, coach.uid));
  }

  await doctor(app, report, probe, human, clubs);
  await director(app, report, probe, human, clubs);
  await signing(app, report, probe, clubs);
  await manager(app, report, probe, human, clubs, jobs);
}

/** A doctor, whose contract the game keeps as a basic one, moved and back. */
async function doctor(app, report, probe, human, clubs) {
  const member = await witness(app, DOCTORS, human, 2000);
  if (!member) {
    report.skip("moves a doctor", "no doctor at a club no human manages among the best staff");
    return;
  }
  const to = clubs.find((c) => c.uid !== member.clubUid);
  report.note(`doctor: ${member.name} (${member.uid}), ${member.club} → ${to.name}`);
  const before = probedClub(probe, member.uid);
  const moved = await app.invoke("move_staff", { uid: member.uid, club: to.uid });
  report.check("moves a doctor", moved.ok, moved.ok ? "" : moved.error.code);
  if (!moved.ok) return;
  report.check("as the probe reads it", probedClub(probe, member.uid).includes(to.name.slice(0, 20)), probedClub(probe, member.uid));
  await app.must("undo_change", { id: moved.value.id });
  report.check("and the undo puts the doctor back", probedClub(probe, member.uid) === before, probedClub(probe, member.uid));
}

/** A director of football: refused at a club that has one, moved to one that has none, and back. */
async function director(app, report, probe, human, clubs) {
  const staff = (await app.must("search_staff", { query: "", limit: 5000, filter: { job: DIRECTOR_OF_FOOTBALL } })).rows;
  const directed = new Set(staff.filter((m) => m.job === DIRECTOR_OF_FOOTBALL).map((m) => m.clubUid));
  const member = staff.find((m) => !m.isHuman && m.job === DIRECTOR_OF_FOOTBALL && m.clubUid != null && !human.includes(m.clubUid));
  if (!member) {
    report.skip("moves a director of football", "no director of football at a club no human manages");
    return;
  }
  const taken = clubs.find((c) => c.uid !== member.clubUid && directed.has(c.uid));
  const free = clubs.find((c) => c.uid !== member.clubUid && !directed.has(c.uid));
  report.note(`director of football: ${member.name} (${member.uid}), ${member.club}; taken ${taken?.name}, free ${free?.name}`);
  if (taken) {
    const refused = await app.invoke("plan_staff_move", { uid: member.uid, club: taken.uid });
    const said = refused.ok ? "offered" : `${refused.error.code} ${refused.error.params?.name ?? ""}`;
    report.check("refuses him at a club that has one, and names that one", !refused.ok && refused.error.code === "staff.directorTaken" && Boolean(refused.error.params?.name), said);
  }
  if (!free) {
    report.skip("moves a director of football to a club that has none", "every one of the best clubs has one");
    return;
  }
  const before = probedClub(probe, member.uid);
  const moved = await app.invoke("move_staff", { uid: member.uid, club: free.uid });
  report.check("moves him to a club that has none", moved.ok, moved.ok ? "" : moved.error.code);
  if (!moved.ok) return;
  const there = probedClub(probe, member.uid);
  report.check("as the probe reads it", there.includes(free.name.slice(0, 20)) && /Director of Football/.test(there), there);
  // The club he left has none now: another could be given the job there, and he could go back.
  await app.must("undo_change", { id: moved.value.id });
  report.check("and the undo puts him back", probedClub(probe, member.uid) === before, probedClub(probe, member.uid));
}

/** The contract line of the probe's `staff-member` for `id` ("job 2, £7746 per week, signed ..."), or "". */
function probedContract(probe, id) {
  return probe.run(["staff-member", id]).match(/^\s+contract\s+(.*)$/m)?.[1]?.trim() ?? "";
}

/** The game's pool of contracts as the probe reads it: how many slots are free and used. */
function contractPool(probe) {
  const line = probe.run(["pools"]).split(/\r?\n/).find((l) => l.includes("FULL_CONTRACT"));
  const match = line?.match(/(\d+) free\s+(\d+) used/);
  return match ? { free: Number(match[1]), used: Number(match[2]) } : null;
}

/** A date stored as a number like 20280630, as the probe prints it. */
const iso = (number) => `${String(number).slice(0, 4)}-${String(number).slice(4, 6)}-${String(number).slice(6, 8)}`;

/** A member of staff with no club signed as a coach, and back. */
async function signing(app, report, probe, clubs) {
  const out = (await app.must("search_staff", { query: "", limit: 50, filter: { unemployed: true, women: false } })).rows;
  const member = out.find((m) => !m.isHuman);
  if (!member) {
    report.skip("signs a member of staff who has no club", "no one without a club");
    return;
  }
  const to = clubs[0];
  const refused = await app.invoke("plan_staff_move", { uid: member.uid, club: to.uid });
  report.check("asks for the job of one with no club", !refused.ok && refused.error.code === "staff.noJob", refused.ok ? "offered" : refused.error.code);
  const plan = await app.invoke("plan_staff_move", { uid: member.uid, club: to.uid, job: COACH, terms: {} });
  if (!plan.ok && plan.error.code === "sign.poolFull") {
    report.skip("signs a member of staff who has no club", "the game has no free contract slot yet: continue a day in the game");
    return;
  }
  report.check("offers the signing, with the contract made", plan.ok && plan.value.staffContract != null, plan.ok ? JSON.stringify(plan.value.staffContract) : plan.error.code);
  if (!plan.ok) return;
  report.note(`signing: ${member.name} (${member.uid}) → ${to.name} as a coach`);
  const pool = contractPool(probe);
  const signed = await app.must("move_staff", { uid: member.uid, club: to.uid, job: COACH, terms: {} });
  const there = probedClub(probe, member.uid);
  report.check("signs him, as the probe reads it", there.includes(to.name.slice(0, 20)) && /Coach/.test(there), there);
  const { wage, expires } = plan.value.staffContract;
  const contract = probedContract(probe, member.uid);
  report.check(
    "under the contract the plan showed",
    /^(Coach|job 2),/.test(contract) && contract.includes(`£${wage} per week`) && contract.includes(`expires ${iso(expires)}`),
    contract,
  );
  const taken = contractPool(probe);
  report.check("in a slot of the game's pool of contracts", pool && taken && taken.free === pool.free - 1 && taken.used === pool.used + 1, `${JSON.stringify(pool)} → ${JSON.stringify(taken)}`);
  await app.must("undo_change", { id: signed.id });
  const back = probedClub(probe, member.uid);
  report.check("and the undo leaves him with no club again", / - /.test(` ${back} `) || !back.includes(to.name.slice(0, 20)), back);
  const given = contractPool(probe);
  report.check("the slot given back", JSON.stringify(given) === JSON.stringify(pool), JSON.stringify(given));

  // On terms of one's own, through his profile's Transfer dialog: the club, the job, a wage, Sign; undone from the log.
  await viaDialog(app, report, probe, member, to);
}

/**
 * The signing through the Transfer button of the member of staff's profile: a Job select and the contract's inputs,
 * no fee and no swap; the plan asks for the job first, then shows the contract made on the wage typed; Sign. The undo
 * goes through the app.
 */
async function viaDialog(app, report, probe, member, to) {
  const WAGE = 12_345;
  await app.openTab("Staff");
  await app.setInput(`${VIS}(".search input")`, String(member.uid));
  const rows = `[...document.querySelectorAll("table.grid tbody tr")].filter(${SHOWN})`;
  await app.waitFor(`${rows}.length === 1 && ${rows}[0].textContent.includes(${JSON.stringify(member.name)})`, "his row");
  await app.click(`${rows}[0]`, "his row");
  const profile = `${VIS}(".profile:not(.popup)")`;
  await app.waitFor(`${profile} && ${profile}.getAttribute("aria-busy") === "false"`, "his profile", 30000);
  const button = `${profile}.querySelector(".move-toggle")`;
  await app.waitFor(`${button} && !${button}.disabled`, "the Transfer button of one with no club");
  await app.click(button, "Transfer");
  const dialog = `document.querySelector(".move-dialog")`;
  await app.waitFor(dialog, "the dialog");
  report.check(
    "the dialog signs him: a job and a contract to set, no fee or swap",
    await app.js(
      `!!${dialog}.querySelector('[data-slot="select-trigger"].move-input') && !!${dialog}.querySelector('input[id$="-wage"]') && ` +
        `!${dialog}.querySelector(".move-mode") && !${dialog}.querySelector('input[id$="-fee"]')`,
    ),
  );
  await app.setInput(`${dialog}.querySelector(".move-search input")`, String(to.uid));
  const option = `${dialog}.querySelector(".move-option")`;
  await app.waitFor(`${option}?.textContent.includes(${JSON.stringify(to.name)})`, "the club found", 20000);
  await sleep(300);
  await app.press("Enter");
  const planLine = `${dialog}.querySelector(".move-plan")`;
  await app.waitFor(`${planLine}?.classList.contains("pending") && !${dialog}.querySelector(".move-search")`, "the club picked");
  report.check("asks for the job first", true, await app.js(`${planLine}.textContent`));
  // The Job select is a shadcn Select: its lines are in the page only while the list is open, and carry their value
  // in `data-value`.
  const jobSelect = `${dialog}.querySelector('[aria-labelledby$="-job-heading"]')`;
  await app.click(jobSelect, "the Job select");
  const jobLine = (code) => `document.querySelector('[data-slot="select-item"][data-value="${code}"]')`;
  await app.waitFor(jobLine(MANAGER), "the jobs offered");
  report.check("the Job select offers a manager's job", true);
  await app.click(jobLine(COACH), "the coach job");
  await app.setInput(`${dialog}.querySelector('input[id$="-wage"]')`, String(WAGE));
  await app.waitFor(`${dialog}.querySelector(".move-plan.ok")`, "the plan of the signing", 20000);
  const planText = await app.js(`${planLine}.textContent`);
  report.check("the plan shows the club, the job and the wage", planText.includes(to.name) && /12[,.\s]?345/.test(planText), planText);
  await app.shot("staff-sign-dialog");
  await app.click(`${dialog}.querySelector(".modal-foot .primary")`, "Sign");
  await app.waitFor(`!${dialog}`, "the dialog to close", 30000);
  const contract = probedContract(probe, member.uid);
  report.check("Sign signs him on that wage, as the probe reads it", /^(Coach|job 2),/.test(contract) && contract.includes(`£${WAGE} per week`), contract);
  const logged = (await app.must("change_log")).find((c) => c.uid === member.uid && c.field === "club" && c.undoneAt == null);
  report.check("logged as a move from no club", logged?.moved?.from === undefined && logged?.moved?.to === to.name, JSON.stringify(logged?.moved));
  await app.openTab("Changes");
  await app.shot("staff-sign-changes");
  if (logged) await app.must("undo_change", { id: logged.id });
  report.check("undone again", / - /.test(` ${probedClub(probe, member.uid)} `), probedClub(probe, member.uid));
}

/** Who the probe reads as the manager of the club `uid`: "Name (id)", "no one", or "" when it reads none. */
function probedManager(probe, uid) {
  return probe.run(["club", uid]).match(/^\s+manager\s+(.*)$/m)?.[1]?.trim() ?? "";
}

/** The clubs whose leagues the game plays and whose senior team has no manager, as the probe lists them. */
function vacantClubs(probe) {
  const out = probe.run(["staff-places", "--team-offset", "0x80", "--job", String(MANAGER)]);
  const lines = out.slice(out.indexOf("Senior teams holding no one there")).split(/\r?\n/).slice(1);
  return lines.map((l) => l.trim().match(/^\d+\s+(.+)\s+(\d+)$/)).filter(Boolean).map((m) => ({ name: m[1], uid: Number(m[2]) }));
}

/** The member of staff with the id `uid`, as the Staff tab lists him. */
async function staffRow(app, uid) {
  return (await app.must("search_staff", { query: String(uid), limit: 5 })).rows.find((m) => m.uid === uid);
}

/**
 * A manager: refused at a club whose senior team has one, naming him, and at the human manager's; moved to a club
 * whose senior team has none, his old club's place left empty, and back; given an assistant coach's job at his club,
 * and back; and one with no club signed as the manager of a club that has none, and back.
 */
async function manager(app, report, probe, human, clubs, jobs) {
  report.check("offers a manager's job", jobs.includes(MANAGER), jobs.join(", "));
  const managed = clubs
    .map((club) => ({ club, id: Number(probedManager(probe, club.uid).match(/\((\d+)\)$/)?.[1]) }))
    .filter(({ id }) => id > 0);
  if (managed.length < 2) {
    report.skip("moves a manager", "fewer than two of the best clubs have a manager the probe reads");
    return;
  }
  const [{ club: from, id }, { club: other, id: otherId }] = managed;
  const member = await staffRow(app, id);
  const otherManager = await staffRow(app, otherId);
  report.note(`manager: ${member?.name} (${id}), ${from.name}; ${otherManager?.name} (${otherId}), ${other.name}`);
  const taken = await app.invoke("plan_staff_move", { uid: otherId, club: from.uid });
  const said = taken.ok ? "offered" : `${taken.error.code} ${taken.error.params?.name ?? ""}`;
  report.check(
    "refuses a manager at a club that has one, and names that one",
    !taken.ok && taken.error.code === "staff.managerTaken" && taken.error.params?.name === member?.name,
    said,
  );
  if (human.length > 0) {
    const yours = await app.invoke("plan_staff_move", { uid: id, club: human[0], job: MANAGER });
    report.check(
      "refuses the human manager's place",
      !yours.ok && ["staff.yourClub", "move.menAndWomen"].includes(yours.error.code),
      yours.ok ? "offered" : yours.error.code,
    );
  }

  // To a club whose senior team has no manager, one of men's clubs as his.
  let vacant = null;
  for (const club of vacantClubs(probe)) {
    const plan = await app.invoke("plan_staff_move", { uid: id, club: club.uid });
    if (plan.ok) {
      vacant = club;
      break;
    }
  }
  if (!vacant) {
    report.skip("moves a manager to a club that has none", "no club whose leagues are played has an empty place he can take");
    return;
  }
  report.note(`a club with no manager: ${vacant.name} (${vacant.uid})`);
  const before = probedClub(probe, id);
  const moved = await app.invoke("move_staff", { uid: id, club: vacant.uid });
  report.check("moves the manager to a club that has none", moved.ok, moved.ok ? "" : moved.error.code);
  if (moved.ok) {
    const there = probedManager(probe, vacant.uid);
    report.check("its senior team's manager, as the probe reads it", there.includes(`(${id})`), there);
    report.check("his old club's place left empty", probedManager(probe, from.uid) === "no one", probedManager(probe, from.uid));
    await app.must("undo_change", { id: moved.value.id });
    report.check(
      "and the undo makes him his old club's manager again",
      probedClub(probe, id) === before && probedManager(probe, from.uid).includes(`(${id})`) && probedManager(probe, vacant.uid) === "no one",
      `${probedManager(probe, from.uid)}; ${probedManager(probe, vacant.uid)}`,
    );
  }

  // An assistant coach's job at his club: out of the manager's place, into the coaching staff.
  const assistant = await app.invoke("change_staff_job", { uid: id, job: ASSISTANT_COACH });
  report.check("gives the manager an assistant coach's job at his club", assistant.ok, assistant.ok ? "" : assistant.error.code);
  if (assistant.ok) {
    const now = probedClub(probe, id);
    report.check("as the probe reads it, the place left empty", /Assistant Coach/.test(now) && probedManager(probe, from.uid) === "no one", now);
    await app.must("undo_change", { id: assistant.value.id });
    report.check("and the undo makes him the manager again", probedManager(probe, from.uid).includes(`(${id})`), probedManager(probe, from.uid));
  }

  // One with no club signed as the manager of the club that has none.
  const out = (await app.must("search_staff", { query: "", limit: 50, filter: { unemployed: true, women: false } })).rows;
  const free = out.find((m) => !m.isHuman);
  if (!free) {
    report.skip("signs a manager who has no club", "no one without a club");
    return;
  }
  const plan = await app.invoke("plan_staff_move", { uid: free.uid, club: vacant.uid, job: MANAGER, terms: {} });
  if (!plan.ok && plan.error.code === "sign.poolFull") {
    report.skip("signs a manager who has no club", "the game has no free contract slot yet: continue a day in the game");
    return;
  }
  report.check("offers the signing of a manager", plan.ok, plan.ok ? JSON.stringify(plan.value.staffContract) : plan.error.code);
  if (!plan.ok) return;
  const pool = contractPool(probe);
  const signed = await app.must("move_staff", { uid: free.uid, club: vacant.uid, job: MANAGER, terms: {} });
  const there = probedManager(probe, vacant.uid);
  report.check("signs him as its manager, as the probe reads it", there.includes(`(${free.uid})`), `${free.name}: ${there}`);
  await app.must("undo_change", { id: signed.id });
  report.check("and the undo leaves the place empty again", probedManager(probe, vacant.uid) === "no one", probedManager(probe, vacant.uid));
  report.check("the slot given back", JSON.stringify(contractPool(probe)) === JSON.stringify(pool), JSON.stringify(contractPool(probe)));
}