// Fixtures for the Scouting tab: the human manager's club with its squad line by line and the players a scout would
// let go, a 4-3-3 he plays, the positions and roles the editor knows (the same as the core's), and recommendations
// worked out from the fixture players, so the tab can be tried without the game.

import type {
  City,
  ClubSummary,
  Departure,
  DepartureReason,
  DepthLine,
  DepthPlayer,
  DepthStatus,
  Fitting,
  Line,
  Opportunities,
  Opportunity,
  OpportunityKind,
  OpportunityRequest,
  PlayerSummary,
  Reason,
  Role,
  ScoutPosition,
  Scouted,
  ScoutingOverview,
  ScoutRequest,
  Similar,
  SimilarRequest,
  Starter,
  Suggestion,
  Why,
  YouthIntakes,
} from "../types";

/** [key, phase, line] of every role the core knows, in its order. */
const ROLE_LIST: [string, "inPossession" | "outOfPossession", Line][] = [
  ["bgk", "inPossession", "goalkeeper"],
  ["ngk", "inPossession", "goalkeeper"],
  ["cb", "inPossession", "centreBack"],
  ["bcb", "inPossession", "centreBack"],
  ["ncb", "inPossession", "centreBack"],
  ["acb", "inPossession", "centreBack"],
  ["ocb", "inPossession", "centreBack"],
  ["fb", "inPossession", "fullBack"],
  ["ifb", "inPossession", "fullBack"],
  ["wb", "inPossession", "wingBack"],
  ["iwb", "inPossession", "wingBack"],
  ["pwb", "inPossession", "wingBack"],
  ["awb", "inPossession", "wingBack"],
  ["dm", "inPossession", "defensiveMidfield"],
  ["hb", "inPossession", "defensiveMidfield"],
  ["bbm", "inPossession", "defensiveMidfield"],
  ["bbp", "inPossession", "defensiveMidfield"],
  ["chm", "inPossession", "centralMidfield"],
  ["wcm", "inPossession", "centralMidfield"],
  ["ap", "inPossession", "centralMidfield"],
  ["am", "inPossession", "attackingMidfield"],
  ["w", "inPossession", "wide"],
  ["if", "inPossession", "wide"],
  ["pw", "inPossession", "wide"],
  ["wfd", "inPossession", "wide"],
  ["cfd", "inPossession", "striker"],
  ["dlf", "inPossession", "striker"],
  ["p", "inPossession", "striker"],
  ["sk", "outOfPossession", "goalkeeper"],
  ["lhk", "outOfPossession", "goalkeeper"],
  ["cb", "outOfPossession", "centreBack"],
  ["scb", "outOfPossession", "centreBack"],
  ["ccb", "outOfPossession", "centreBack"],
  ["wcb", "outOfPossession", "centreBack"],
  ["fb", "outOfPossession", "fullBack"],
  ["pfb", "outOfPossession", "fullBack"],
  ["hfb", "outOfPossession", "fullBack"],
  ["wb", "outOfPossession", "wingBack"],
  ["hwb", "outOfPossession", "wingBack"],
  ["dm", "outOfPossession", "defensiveMidfield"],
  ["ddm", "outOfPossession", "defensiveMidfield"],
  ["pdm", "outOfPossession", "defensiveMidfield"],
  ["cm", "outOfPossession", "centralMidfield"],
  ["pcm", "outOfPossession", "centralMidfield"],
  ["scm", "outOfPossession", "centralMidfield"],
  ["oam", "outOfPossession", "attackingMidfield"],
  ["w", "outOfPossession", "wide"],
  ["tw", "outOfPossession", "wide"],
  ["iow", "outOfPossession", "wide"],
  ["cfd", "outOfPossession", "striker"],
  ["tcf", "outOfPossession", "striker"],
  ["ocf", "outOfPossession", "striker"],
];

const ROLES: Role[] = ROLE_LIST.map(([key, phase, line]) => ({
  key,
  phase,
  line,
  keyAttributes: ["passing", "first_touch", "decisions"],
  otherAttributes: ["stamina", "work_rate"],
}));

/** The positions as the core lists them. */
const POSITIONS: ScoutPosition[] = [
  { key: "gk", lines: ["goalkeeper"] },
  { key: "dr", lines: ["fullBack", "wingBack"] },
  { key: "dc", lines: ["centreBack"] },
  { key: "dl", lines: ["fullBack", "wingBack"] },
  { key: "wbr", lines: ["wingBack", "fullBack"] },
  { key: "dm", lines: ["defensiveMidfield", "centralMidfield"] },
  { key: "wbl", lines: ["wingBack", "fullBack"] },
  { key: "mr", lines: ["wide"] },
  { key: "mc", lines: ["centralMidfield", "attackingMidfield", "defensiveMidfield"] },
  { key: "ml", lines: ["wide"] },
  { key: "amr", lines: ["wide"] },
  { key: "amc", lines: ["attackingMidfield", "centralMidfield"] },
  { key: "aml", lines: ["wide"] },
  { key: "st", lines: ["striker"] },
];

/** The squad's lines as the core has them: key, positions, how many a squad carries. */
const LINES: [string, string[], number][] = [
  ["gk", ["gk"], 2],
  ["dc", ["dc"], 4],
  ["rightBack", ["dr", "wbr"], 2],
  ["leftBack", ["dl", "wbl"], 2],
  ["dm", ["dm"], 2],
  ["mc", ["mc"], 3],
  ["rightWing", ["amr", "mr"], 2],
  ["leftWing", ["aml", "ml"], 2],
  ["amc", ["amc"], 2],
  ["st", ["st"], 3],
];

export interface ScoutingFixtures {
  players: PlayerSummary[];
  clubs: ClubSummary[];
  ratings: Record<number, Record<string, number>>;
  women: Set<number>;
}

const TRANSFER_BUDGET = 22_957_535;
const WAGE_BUDGET = 3_638_850;
const WAGE_ROOM = 666_235;

/** The human manager's club in the fixtures: the first men's club. */
function humanClub(f: ScoutingFixtures): ClubSummary {
  return f.clubs.find((club) => !club.women)!;
}

const rating = (f: ScoutingFixtures, uid: number, key: string) => f.ratings[uid]?.[key] ?? 0;
const best = (f: ScoutingFixtures, uid: number, keys: string[]) => Math.max(0, ...keys.map((key) => rating(f, uid, key)));

/** The line a fixture player plays best. */
function lineOf(f: ScoutingFixtures, uid: number): number {
  let found = 0;
  let top = 0;
  LINES.forEach(([, keys], i) => {
    const here = best(f, uid, keys);
    if (here > top) {
      top = here;
      found = i;
    }
  });
  return found;
}

function depthStatus(players: number, cover: number, target: number): DepthStatus {
  if (players === 0 && cover === 0) return "missing";
  if (players + Math.floor(cover / 2) < target) return "thin";
  if (players >= target + 2) return "crowded";
  return "fine";
}

/** A made-up but steady weekly wage for a fixture player. */
const wageOf = (p: PlayerSummary) => Math.round(250 + p.currentAbility ** 2.4 / 6);
/** A made-up but steady transfer value for a fixture player. */
const valueOf = (p: PlayerSummary) => Math.round(p.currentAbility ** 3 * 9);

export function scoutingOverview(f: ScoutingFixtures): ScoutingOverview {
  const club = humanClub(f);
  const squad = f.players.filter((p) => p.clubUid === club.uid);
  const byAbility = (a: DepthPlayer, b: DepthPlayer) => b.player.currentAbility - a.player.currentAbility;
  const abilities = squad.map((p) => p.currentAbility).sort((a, b) => b - a).slice(0, 11);
  const level = abilities.length ? Math.round(abilities.reduce((s, a) => s + a, 0) / abilities.length) : 0;
  const lines: DepthLine[] = LINES.map(([key, positions, target], i) => {
    const players = squad
      .filter((p) => lineOf(f, p.uid) === i)
      .map((p): DepthPlayer => ({ player: p, rating: best(f, p.uid, positions), onLoan: p.uid % 17 === 0 }))
      .sort(byAbility);
    const cover = squad
      .filter((p) => lineOf(f, p.uid) !== i && best(f, p.uid, positions) >= 15)
      .map((p): DepthPlayer => ({ player: p, rating: best(f, p.uid, positions), onLoan: false }))
      .sort(byAbility);
    return {
      key,
      positions,
      target,
      players,
      cover,
      status: depthStatus(players.length, cover.length, target),
      weak: players.length > 0 && players[0].player.currentAbility + 15 < level,
      ageing: players.length > 0 && players.every((d) => (d.player.age ?? 0) >= 31),
    };
  });
  const departures: Departure[] = [];
  for (const line of lines) {
    line.players.forEach((d, i) => {
      const p = d.player;
      const rank = i + 1;
      const starters = Math.ceil(line.target / 2);
      const age = p.age ?? 25;
      const reasons: DepartureReason[] = [];
      let priority = 0;
      const add = (code: string, weight: number, value: number | null) => {
        reasons.push({ code, value });
        priority += weight;
      };
      if (line.status === "crowded" && rank > line.target) add("surplus", 3, line.players.length);
      const below = p.currentAbility + 25 < level && age >= 23;
      if (below) add("belowLevel", 3, p.currentAbility);
      const ageing = (age >= 32 && rank > starters) || age >= 34;
      if (ageing) add("ageing", 2, age);
      if (p.uid % 9 === 0 && rank > starters) add("expiring", 2, 160);
      if (p.uid % 11 === 0) add("lowMorale", 1, 5);
      const blocked = age <= 21 && p.potentialAbility - p.currentAbility >= 15 && rank > line.target;
      if (blocked) add("blocked", 2, p.potentialAbility);
      // One fixture player in a few stands for those whose squad status is surplus to requirements.
      if (p.uid % 13 === 0 && rank > starters) add("unwanted", 3, null);
      // As the core: his mood only adds to other reasons.
      const onlyMood = reasons.every((r) => r.code === "unhappy" || r.code === "lowMorale");
      if (onlyMood || d.onLoan) return;
      const value = valueOf(p);
      // One fixture player stands for those the game keeps as not for sale.
      const notForSale = p.uid % 7 === 0;
      departures.push({
        player: p,
        action: blocked && !below ? "loan" : value < 250_000 && age >= 28 && (below || ageing) ? "release" : "sell",
        reasons,
        priority,
        value: notForSale ? null : value,
        notForSale,
        wage: wageOf(p),
        line: line.key,
        rank,
      });
    });
  }
  departures.sort((a, b) => b.priority - a.priority || a.player.currentAbility - b.player.currentAbility);
  const ages = squad.map((p) => p.age ?? 0).filter((a) => a > 0);
  return {
    club,
    transferBudget: TRANSFER_BUDGET,
    wageBudget: WAGE_BUDGET,
    wageRoom: WAGE_ROOM,
    report: {
      lines,
      departures,
      level,
      size: squad.length,
      averageAge: ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null,
    },
    positions: POSITIONS,
    roles: ROLES,
  };
}

/** A made-up but steady measure of how a fixture player suits a position. */
function measure(f: ScoutingFixtures, player: PlayerSummary, request: ScoutRequest): Fitting {
  const position = POSITIONS.find((p) => p.key === request.position)!;
  const own = rating(f, player.uid, position.key);
  const roleRating = Math.min(20, 4 + player.currentAbility / 13 + ((player.uid >> 3) % 5) / 2);
  const factor = own >= 18 ? 1 : own >= 15 ? 0.97 : own >= 13 ? 0.88 : own >= 10 ? 0.75 : 0;
  const fit = Math.max(0, Math.min(100, Math.round(((roleRating - 5) / 12) * 100 * factor)));
  const firstOf = (phase: "inPossession" | "outOfPossession") => {
    const choices = ROLES.filter((r) => r.phase === phase && position.lines.includes(r.line));
    return choices[player.uid % choices.length]?.key ?? null;
  };
  return {
    player,
    fit,
    inPossession: Math.round(roleRating * 10) / 10,
    outOfPossession: Math.round((roleRating - 0.6) * 10) / 10,
    inPossessionRole: request.inPossession ?? firstOf("inPossession"),
    outOfPossessionRole: request.outOfPossession ?? firstOf("outOfPossession"),
    positionRating: own,
  };
}

function suggestion(f: ScoutingFixtures, player: PlayerSummary, request: ScoutRequest, club: ClubSummary): Suggestion {
  const fitting = measure(f, player, request);
  const value = valueOf(player);
  const theirs = f.clubs.find((c) => c.uid === player.clubUid);
  const reasons: Reason[] = [];
  let fee: number | null = player.clubUid === null ? 0 : Math.round(value * 1.15);
  if (player.clubUid === null) reasons.push({ code: "freeAgent", points: 25, value: null });
  if (player.uid % 7 === 0) {
    reasons.push({ code: "listed", points: 15, value: null });
    fee = fee === null ? null : Math.round(fee * 0.8);
  }
  if (player.uid % 5 === 0) reasons.push({ code: "fringe", points: 10, value: 4 });
  else if (player.uid % 11 === 0) reasons.push({ code: "keyPlayer", points: -15, value: 1 });
  else if (player.uid % 17 === 0) reasons.push({ code: "unwanted", points: 15, value: 22 });
  if (player.uid % 13 === 0) reasons.push({ code: "expiring", points: 15, value: 140 });
  if (fee !== null && fee > TRANSFER_BUDGET * 1.3) reasons.push({ code: "overBudget", points: -40, value: fee - TRANSFER_BUDGET });
  else if (fee !== null && fee > TRANSFER_BUDGET) reasons.push({ code: "stretch", points: -15, value: fee - TRANSFER_BUDGET });
  if (theirs?.reputation != null && club.reputation != null) {
    if (theirs.reputation > club.reputation + 1000) reasons.push({ code: "biggerClub", points: -20, value: theirs.reputation });
    else if (theirs.reputation + 1000 < club.reputation) reasons.push({ code: "smallerClub", points: 10, value: theirs.reputation });
  }
  const probability = Math.max(0, Math.min(100, 55 + reasons.reduce((sum, r) => sum + r.points, 0)));
  const age = player.age ?? 27;
  const years = age <= 29 ? 1 : age <= 31 ? 0.95 : age <= 33 ? 0.88 : 0.8;
  const purpose = request.purpose ?? "firstTeam";
  const potential = Math.max(0, Math.min(100, player.potentialAbility - 100));
  const score =
    purpose === "rotation" ? (0.5 * fitting.fit + 0.5 * probability) * years
    : purpose === "future" ? 0.35 * fitting.fit + 0.35 * potential + 0.3 * probability
    : (0.7 * fitting.fit + 0.3 * probability) * years;
  // Every ninth player plays on loan from another club, which would sell him.
  const lender = player.uid % 9 === 0 ? f.clubs.find((c) => !c.women && c.uid !== club.uid && c.uid !== player.clubUid) : undefined;
  return {
    ...fitting,
    probability,
    reasons,
    fee,
    wage: wageOf(player),
    value,
    score: Math.round(score),
    ownerClub: player.clubUid !== null && lender ? lender.name : null,
    ownerClubUid: player.clubUid !== null && lender ? lender.uid : null,
  };
}

export function scoutingSuggest(f: ScoutingFixtures, request: ScoutRequest): Scouted {
  const club = humanClub(f);
  if (!POSITIONS.some((p) => p.key === request.position)) {
    throw { code: "scout.unknownRole", message: "unknown position", params: { role: request.position } };
  }
  const own = f.players
    .filter((p) => p.clubUid === club.uid && rating(f, p.uid, request.position) >= 10)
    .map((p) => measure(f, p, request))
    .sort((a, b) => b.fit - a.fit);
  const bestOwn = own[0]?.fit ?? 0;
  const secondOwn = own[1]?.fit ?? 0;
  const purpose = request.purpose ?? "firstTeam";
  const pool = f.players.filter((p) => !f.women.has(p.uid) && p.clubUid !== club.uid);
  const fitting = pool
    .filter((p) => rating(f, p.uid, request.position) >= 10)
    .filter((p) => (request.minAge == null || (p.age ?? 0) >= request.minAge) && (request.maxAge == null || (p.age ?? 99) <= request.maxAge))
    .filter((p) => !(request.noFreeAgents && p.clubUid === null))
    .filter((p) => purpose !== "future" || ((p.age ?? 99) <= 21 && p.potentialAbility - p.currentAbility >= 15));
  let suggestions = fitting.map((p) => suggestion(f, p, request, club));
  if (purpose === "firstTeam") suggestions = suggestions.filter((s) => s.fit > bestOwn);
  if (purpose === "rotation") suggestions = suggestions.filter((s) => s.fit >= Math.max(secondOwn, bestOwn - 10));
  if (request.minProbability != null) suggestions = suggestions.filter((s) => s.probability >= request.minProbability!);
  if (request.maxFee != null) suggestions = suggestions.filter((s) => s.fee !== null && s.fee <= request.maxFee!);
  const order = request.order ?? "score";
  suggestions.sort((a, b) =>
    order === "fit" ? b.fit - a.fit
    : order === "probability" ? b.probability - a.probability
    : order === "fee" ? (a.fee ?? Infinity) - (b.fee ?? Infinity)
    : b.score - a.score);
  return {
    suggestions: suggestions.slice(0, request.limit ?? 50),
    squad: own.slice(0, 5),
    transferBudget: TRANSFER_BUDGET,
    wageRoom: WAGE_ROOM,
    examined: f.players.length,
    candidates: fitting.length,
    eligible: suggestions.length,
  };
}

/** The position among the core's a fixture player plays best: the one he is rated highest at. */
function bestPositionOf(f: ScoutingFixtures, uid: number): string {
  let found = POSITIONS[0].key;
  let top = 0;
  for (const position of POSITIONS) {
    const here = rating(f, uid, position.key);
    if (here > top) {
      top = here;
      found = position.key;
    }
  }
  return found;
}

/** The club's best player at each position it has one for. */
function startersOf(f: ScoutingFixtures, club: ClubSummary): Starter[] {
  const own = f.players.filter((p) => p.clubUid === club.uid);
  return POSITIONS.flatMap((position) => {
    const best = own
      .filter((p) => rating(f, p.uid, position.key) >= 10)
      .map((p) => measure(f, p, { position: position.key }))
      .sort((a, b) => b.fit - a.fit)[0];
    return best ? [{ ...best, position: position.key }] : [];
  });
}

const KINDS: OpportunityKind[] = ["bosman", "releaseClause", "unhappy", "inTheRed", "listed", "loanListed", "wonderkid"];

/** What makes a fixture player an opportunity of each list, picked steadily from his UID. */
function whysOf(p: PlayerSummary): [OpportunityKind, Why][] {
  const out: [OpportunityKind, Why][] = [];
  const why = (code: string, value: number | null, against: number | null = null): Why => ({ code, value, against });
  if (p.clubUid === null) out.push(["bosman", why("freeAgent", null)]);
  else if (p.uid % 4 === 0) out.push(["bosman", why("expiring", 120 + (p.uid % 60))]);
  if (p.clubUid !== null && p.uid % 6 === 1) {
    out.push(["releaseClause", why("releaseClause", Math.round(valueOf(p) * 0.7), valueOf(p))]);
  }
  if (p.clubUid !== null && p.uid % 5 === 2) out.push(["unhappy", why("unhappy", 1 + (p.uid % 2))]);
  if (p.clubUid !== null && p.uid % 7 === 3) out.push(["inTheRed", why("inTheRed", -1_200_000 - (p.uid % 9) * 900_000)]);
  if (p.clubUid !== null && p.uid % 7 === 0) out.push(["listed", why("listed", null)]);
  if (p.clubUid !== null && p.uid % 8 === 5) out.push(["loanListed", why("loanListed", null)]);
  if ((p.age ?? 99) <= 19 && p.potentialAbility - p.currentAbility >= 20) {
    out.push(["wonderkid", why("wonderkid", p.potentialAbility)]);
  }
  return out;
}

export function scoutingOpportunities(f: ScoutingFixtures, request: OpportunityRequest): Opportunities {
  const club = humanClub(f);
  const starters = startersOf(f, club);
  const starterFit = new Map(starters.map((s) => [s.position, s.fit]));
  const own = f.players.filter((p) => p.clubUid === club.uid);
  const abilities = own.map((p) => p.currentAbility).sort((a, b) => b - a).slice(0, 11);
  const level = abilities.length ? Math.round(abilities.reduce((s, a) => s + a, 0) / abilities.length) : 0;
  const pool = f.players
    .filter((p) => !f.women.has(p.uid) && p.clubUid !== club.uid)
    .filter((p) => request.maxAge == null || (p.age ?? 0) <= request.maxAge)
    .filter((p) => request.minAge == null || (p.age ?? 99) >= request.minAge);
  const lists = new Map<OpportunityKind, Opportunity[]>(KINDS.map((kind) => [kind, []]));
  for (const p of pool) {
    const position = request.position || bestPositionOf(f, p.uid);
    if (rating(f, p.uid, position) < 10) continue;
    const s = suggestion(f, p, { position, purpose: "any" }, club);
    const better = s.fit > (starterFit.get(position) ?? 0);
    if (request.maxFee != null && (s.fee === null || s.fee > request.maxFee)) continue;
    for (const [kind, why] of whysOf(p)) {
      if (request.betterOnly && kind !== "wonderkid" && !better) continue;
      lists.get(kind)!.push({ ...s, position, why, better });
    }
  }
  const items = [...(lists.get(request.kind) ?? [])].sort((a, b) => b.score - a.score);
  return {
    kind: request.kind,
    items: items.slice(0, request.limit ?? 50),
    counts: KINDS.map((kind) => ({ kind, count: lists.get(kind)!.length, more: false })),
    starters,
    level,
    lowest: Math.max(0, level - 30),
    highest: level + 45,
    examined: f.players.length,
    pool: pool.length,
    transferBudget: TRANSFER_BUDGET,
    wageRoom: WAGE_ROOM,
  };
}

export function scoutingSimilar(f: ScoutingFixtures, request: SimilarRequest): Similar {
  const club = humanClub(f);
  const reference = f.players.find((p) => p.uid === request.uid);
  if (!reference) {
    throw { code: "notFound", message: `no player with UID ${request.uid}`, params: { entity: "player", uid: String(request.uid) } };
  }
  const positions = POSITIONS.map((p) => p.key).filter((key) => rating(f, reference.uid, key) >= 15);
  const position = request.position || positions[0] || bestPositionOf(f, reference.uid);
  const starter = startersOf(f, club).find((s) => s.position === position) ?? null;
  const value = valueOf(reference);
  const candidates = f.players
    .filter((p) => p.uid !== reference.uid && !f.women.has(p.uid) && p.clubUid !== club.uid)
    .filter((p) => rating(f, p.uid, position) >= 13)
    .filter((p) => !request.younger || (p.age ?? 99) < (reference.age ?? 0))
    .filter((p) => !request.cheaper || valueOf(p) < value);
  const items = candidates
    .map((p) => {
      const s = suggestion(f, p, { position, purpose: "any" }, club);
      const gap = Math.abs(p.currentAbility - reference.currentAbility) / 2;
      const similarity = Math.max(0, Math.min(100, Math.round(96 - gap - (p.uid % 23))));
      return { ...s, similarity, better: s.fit > (starter?.fit ?? 0) };
    })
    .filter((s) => request.maxFee == null || (s.fee !== null && s.fee <= request.maxFee))
    .sort((a, b) => b.similarity - a.similarity);
  return {
    reference: rating(f, reference.uid, position) >= 10 ? measure(f, reference, { position }) : null,
    player: reference,
    value,
    notForSale: false,
    position,
    positions: positions.length > 0 ? positions : [position],
    items: items.slice(0, request.limit ?? 50),
    starter,
    examined: f.players.length,
    candidates: candidates.length,
  };
}

/**
 * The youth intakes of the club `clubUid` (the human manager's when null): its players of 17 or younger, as if the
 * game had made them at the intakes of 11 March 2026 (those 16 or younger then) and 2025.
 */
export function youthIntakes(
  f: ScoutingFixtures,
  clubUid: number | null,
  cityOf: (player: PlayerSummary) => City | null,
): YouthIntakes {
  const club = clubUid === null ? humanClub(f) : f.clubs.find((c) => c.uid === clubUid)!;
  const young = f.players
    .filter((p) => p.clubUid === club.uid && p.age !== null && p.age <= 17 && p.dateOfBirth !== null)
    .sort((a, b) => b.potentialAbility - a.potentialAbility || b.currentAbility - a.currentAbility);
  const day = (year: number) => ({ year, month: 3, day: 11 });
  /** How old a player was on 11 March of `year`. */
  const ageIn = (p: PlayerSummary, year: number) => {
    const born = p.dateOfBirth!;
    return year - born.year - (born.month > 3 || (born.month === 3 && born.day > 11) ? 1 : 0);
  };
  const intake = (players: PlayerSummary[], year: number) => ({
    joined: day(year),
    players: players.map((player, i) => ({
      player,
      city: cityOf(player),
      joined: day(year),
      joinedAge: ageIn(player, year),
      contractType: (player.age ?? 0) <= 16 ? 3 : 1,
      team: { index: 2, kind: 12, ageLimit: 18 },
      onLoanAt: year === 2025 && i === 1 ? "Old Mill United" : null,
      onLoanAtUid: year === 2025 && i === 1 ? 535 : null,
    })),
  });
  const newer = young.filter((p) => ageIn(p, 2026) <= 16);
  const older = young.filter((p) => ageIn(p, 2026) > 16);
  return {
    clubUid: club.uid,
    club: club.name,
    marked: true,
    intakes: [newer.length > 0 ? intake(newer, 2026) : null, older.length > 0 ? intake(older, 2025) : null].filter(
      (i) => i !== null,
    ),
  };
}
