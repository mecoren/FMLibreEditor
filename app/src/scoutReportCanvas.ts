// The scout report as a picture: one card about a player the scout found, drawn on a canvas so that what the dialog
// shows is what is saved and copied. It takes the colours of the app's theme as they are when it is drawn, and the
// app's typeface. The card is made to be shared, so it says nothing about the user's own squad or money: no verdict
// against the club's player at the position, no ticks of his on the bars, no notes about the budget.

import { formatDate, formatMoney, formatPercent } from "./format";
import { intlLocale } from "./i18n";
import { ATTRIBUTE_LABELS, type AttributeKey, positionLabel, scoutingText } from "./labels";
import { pictureUrl } from "./pictures";
import { chanceOf, familiarity, reasonText, roleName, type ScoutPick, whyText } from "./ScoutParts";
import type { FmDate, PlayerDetails, Role } from "./types";

const text = scoutingText.report;

/** The scout's reasons that are about the user's own money, left off a card made to be shared. */
const OWN_MONEY_REASONS = new Set(["overBudget", "stretch", "wageHigh"]);

/** What a report is drawn from. */
export interface ReportData {
  pick: ScoutPick;
  details: PlayerDetails;
  /** The roles he was measured for. */
  inPossession: Role | undefined;
  outOfPossession: Role | undefined;
  gameDate: FmDate | null;
}

/** The card's width in CSS pixels, and how many device pixels each one gets: sharp on any screen and in a post. */
const WIDTH = 760;
const SCALE = 2;
const PAD = 28;
/** Tall enough for any report; the picture is cut to what was drawn. */
const MOST_HEIGHT = 1700;

const FONT = '"Archivo Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

interface Palette {
  panel: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  strip: string;
  onStrip: string;
  link: string;
  tiers: [string, string, string, string];
}

/** The theme's colours as they are now. */
function palette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    panel: value("--panel", "#f6f7f9"),
    raised: value("--raised", "#eceef1"),
    border: value("--border", "#d6d9df"),
    text: value("--text", "#16181d"),
    muted: value("--muted", "#5b6069"),
    strip: value("--strip", "#16181d"),
    onStrip: value("--on-strip", "#f6f7f9"),
    link: value("--accent-text", "#2457c5"),
    tiers: [
      value("--tier-1", "#b3402f"),
      value("--tier-2", "#8f5d0e"),
      value("--tier-3", "#5a761b"),
      value("--tier-4", "#1f7547"),
    ],
  };
}

/** The colour of an attribute (1–20) by its band, as the profile colours it. */
const tierColour = (colours: Palette, value: number) =>
  colours.tiers[value <= 5 ? 0 : value <= 10 ? 1 : value <= 15 ? 2 : 3];

/** A picture the app serves, or null when there is none; asked so that the canvas can still be saved. */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (url === null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** The good and the weak points of a player in a role: the three highest and the three lowest of what it leans on. */
function points(details: PlayerDetails, keys: string[]): { strengths: string[]; weaknesses: string[] } {
  const rated = keys
    .map((key) => ({ key, value: details.attributes[key]?.value }))
    .filter((entry): entry is { key: string; value: number } => entry.value !== undefined);
  const label = (entry: { key: string; value: number }) =>
    `${ATTRIBUTE_LABELS[entry.key as AttributeKey] ?? entry.key} ${entry.value}`;
  const high = [...rated].sort((a, b) => b.value - a.value).filter((entry) => entry.value >= 14);
  const low = [...rated].sort((a, b) => a.value - b.value).filter((entry) => entry.value <= 11);
  return { strengths: high.slice(0, 3).map(label), weaknesses: low.slice(0, 3).map(label) };
}

/** What a scout would say about his character and his body, from the hidden attributes and the personality. */
function traits(details: PlayerDetails): string[] {
  const hidden = (key: string) => details.attributes[key]?.value;
  const personality = (key: string) => details.personality[key];
  const out: string[] = [];
  const add = (holds: boolean | undefined, trait: keyof typeof text.traits) => {
    if (holds) {
      out.push(text.traits[trait]);
    }
  };
  const consistency = hidden("consistency");
  const big = hidden("important_matches");
  const injuries = hidden("injury_proneness");
  add(consistency !== undefined && consistency >= 15, "consistent");
  add(consistency !== undefined && consistency <= 6, "inconsistent");
  add(big !== undefined && big >= 15, "bigGames");
  add(big !== undefined && big <= 6, "nervous");
  add(injuries !== undefined && injuries >= 15, "injuryProne");
  add(injuries !== undefined && injuries <= 4, "robust");
  add((hidden("versatility") ?? 0) >= 16, "versatile");
  add((personality("professionalism") ?? 0) >= 17, "professional");
  add((personality("ambition") ?? 0) >= 17, "ambitious");
  add((personality("loyalty") ?? 0) >= 17, "loyal");
  const temperament = personality("temperament");
  add(temperament !== undefined && temperament <= 5, "hotHeaded");
  return out;
}

/** Draws the report on a new canvas and gives it back cut to its height. */
export async function drawReport(data: ReportData): Promise<HTMLCanvasElement> {
  const { pick, details } = data;
  const s = pick.suggestion;
  const colours = palette();
  await Promise.all([
    document.fonts.load(`800 30px ${FONT}`),
    document.fonts.load(`600 14px ${FONT}`),
    document.fonts.load(`400 13px ${FONT}`),
  ]).catch(() => undefined);
  const [face, logo, flag] = await Promise.all([
    loadImage(pictureUrl("face", details.uid)),
    loadImage(pictureUrl("club", details.clubUid)),
    loadImage(pictureUrl("flag", details.nationUid)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = MOST_HEIGHT * SCALE;
  const g = canvas.getContext("2d");
  if (!g) {
    throw new Error("no 2D canvas");
  }
  g.scale(SCALE, SCALE);
  g.textBaseline = "alphabetic";
  const font = (weight: number, size: number) => {
    g.font = `${weight} ${size}px ${FONT}`;
  };
  const write = (value: string, x: number, y: number, colour: string, align: CanvasTextAlign = "left") => {
    g.fillStyle = colour;
    g.textAlign = align;
    g.fillText(value, x, y);
    g.textAlign = "left";
  };
  /** Cuts `value` with an ellipsis to fit `width`. */
  const fit = (value: string, width: number) => {
    if (g.measureText(value).width <= width) {
      return value;
    }
    let cut = value;
    while (cut.length > 1 && g.measureText(`${cut}…`).width > width) {
      cut = cut.slice(0, -1);
    }
    return `${cut}…`;
  };
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  const label = (value: string, x: number, y: number, colour = colours.muted) => {
    font(800, 10.5);
    write(value.toLocaleUpperCase(intlLocale), x, y, colour);
  };

  // The card.
  g.fillStyle = colours.panel;
  g.fillRect(0, 0, WIDTH, MOST_HEIGHT);

  // The head: an ink band with the face, the name and the club.
  const HEAD = 132;
  g.fillStyle = colours.strip;
  g.fillRect(0, 0, WIDTH, HEAD);
  const faceSize = 88;
  const faceX = PAD;
  const faceY = (HEAD - faceSize) / 2;
  g.save();
  rounded(faceX, faceY, faceSize, faceSize, 6);
  g.clip();
  g.fillStyle = colours.raised;
  g.fillRect(faceX, faceY, faceSize, faceSize);
  if (face) {
    g.drawImage(face, faceX, faceY, faceSize, faceSize);
  } else {
    font(800, 34);
    const initials = details.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toLocaleUpperCase(intlLocale) ?? "")
      .join("");
    write(initials, faceX + faceSize / 2, faceY + faceSize / 2 + 12, colours.muted, "center");
  }
  g.restore();

  const textX = faceX + faceSize + 20;
  const right = WIDTH - PAD;
  // "Scout report" and the game's date in the corner.
  font(800, 10.5);
  write(text.heading.toLocaleUpperCase(intlLocale), right, 30, colours.onStrip, "right");
  if (data.gameDate) {
    font(400, 12);
    write(formatDate(data.gameDate), right, 48, colours.onStrip, "right");
  }

  font(800, 30);
  write(fit(details.name, right - textX - 150), textX, 54, colours.onStrip);
  // The lines under the name, a little quieter than it.
  g.globalAlpha = 0.82;
  font(500, 14);
  const position = positionLabel(pick.position);
  const facts = [
    `${position} · ${familiarity(s.positionRating)}`,
    details.age === null ? null : text.age(details.age),
    details.nation,
  ].filter((part): part is string => part !== null && part !== "");
  let x = textX;
  if (flag) {
    g.drawImage(flag, x, 66, 20, 14);
    x += 26;
  }
  write(fit(facts.join(" · "), right - x), x, 78, colours.onStrip);
  x = textX;
  if (logo) {
    g.drawImage(logo, x, 89, 18, 18);
    x += 24;
  }
  const club = details.club ?? text.freeAgent;
  const contract = details.contract?.expires ?? details.contractExpires;
  const clubLine = contract ? `${club} · ${text.contract} ${formatDate(contract)}` : club;
  write(fit(clubLine, right - x), x, 103, colours.onStrip);
  g.globalAlpha = 1;

  // The tiles: fit, probability, fee and wage, abilities.
  let y = HEAD + 22;
  const tileGap = 12;
  const tileWidth = (WIDTH - 2 * PAD - 3 * tileGap) / 4;
  const tileHeight = 74;
  const tiles: { title: string; value: string; sub?: string; colour?: string; bar?: number }[] = [
    { title: text.fit, value: String(s.fit), bar: s.fit },
    {
      title: text.probability,
      value: formatPercent(s.probability),
      sub: scoutingText.chances[chanceOf(s.probability)],
      colour: colours.tiers[s.probability >= 70 ? 3 : s.probability >= 50 ? 1 : 0],
    },
    {
      title: text.fee,
      value: s.fee === null ? scoutingText.none : formatMoney(s.fee, { notation: "compact", maximumFractionDigits: 1 }),
      sub:
        s.wage === null
          ? undefined
          : `${formatMoney(s.wage, { notation: "compact", maximumFractionDigits: 1 })}${scoutingText.perWeek}`,
    },
    {
      title: text.abilities,
      value: `${details.currentAbility} / ${details.potentialAbility}`,
      sub:
        s.value === null
          ? undefined
          : `${text.value} ${formatMoney(s.value, { notation: "compact", maximumFractionDigits: 1 })}`,
    },
  ];
  tiles.forEach((tile, i) => {
    const tx = PAD + i * (tileWidth + tileGap);
    rounded(tx, y, tileWidth, tileHeight, 4);
    g.fillStyle = colours.raised;
    g.fill();
    label(tile.title, tx + 12, y + 20);
    font(800, 24);
    write(fit(tile.value, tileWidth - 24), tx + 12, y + 50, tile.colour ?? colours.text);
    if (tile.bar !== undefined) {
      const barWidth = tileWidth - 24;
      rounded(tx + 12, y + 58, barWidth, 6, 3);
      g.fillStyle = colours.border;
      g.fill();
      rounded(tx + 12, y + 58, (barWidth * Math.max(0, Math.min(100, tile.bar))) / 100, 6, 3);
      g.fillStyle = colours.tiers[tile.bar >= 70 ? 3 : tile.bar >= 50 ? 2 : 1];
      g.fill();
    } else if (tile.sub) {
      font(500, 12);
      write(fit(tile.sub, tileWidth - 24), tx + 12, y + 66, colours.muted);
    }
  });
  y += tileHeight + 40;

  // The role and the attributes it leans on.
  const roles = [data.inPossession, data.outOfPossession].filter((role): role is Role => role !== undefined);
  const keyAttributes = [...new Set(roles.flatMap((role) => role.keyAttributes))];
  const otherAttributes = [...new Set(roles.flatMap((role) => role.otherAttributes))].filter(
    (key) => !keyAttributes.includes(key),
  );
  g.fillStyle = colours.border;
  g.fillRect(PAD, y - 18, WIDTH - 2 * PAD, 1);
  label(text.role, PAD, y + 4);
  font(700, 14);
  const roleLine = roles.map((role) => roleName(role.key)).join(" · ") || scoutingText.none;
  write(fit(roleLine, right - PAD - 80), PAD + 80, y + 5, colours.text);
  y += 26;

  const shownAttributes = keyAttributes.slice(0, 10);
  const labelWidth = 170;
  const barX = PAD + labelWidth;
  const barWidth = WIDTH - 2 * PAD - labelWidth - 40;
  for (const key of shownAttributes) {
    const value = details.attributes[key]?.value;
    font(500, 13.5);
    write(fit(ATTRIBUTE_LABELS[key as AttributeKey] ?? key, labelWidth - 12), PAD, y + 10, colours.text);
    rounded(barX, y, barWidth, 12, 3);
    g.fillStyle = colours.raised;
    g.fill();
    if (value !== undefined) {
      rounded(barX, y, (barWidth * value) / 20, 12, 3);
      g.fillStyle = tierColour(colours, value);
      g.fill();
    }
    font(800, 14);
    write(value === undefined ? scoutingText.none : String(value), right, y + 11, colours.text, "right");
    y += 22;
  }
  y += 14;

  // Strengths and weaknesses side by side, then his character.
  const { strengths, weaknesses } = points(details, [...keyAttributes, ...otherAttributes]);
  const half = (WIDTH - 2 * PAD - 20) / 2;
  g.fillStyle = colours.border;
  g.fillRect(PAD, y - 12, WIDTH - 2 * PAD, 1);
  label(text.strengths, PAD, y + 6, colours.tiers[3]);
  label(text.weaknesses, PAD + half + 20, y + 6, colours.tiers[0]);
  font(500, 13.5);
  const listed = (items: string[], x0: number) => {
    let line = 0;
    for (const item of items.length > 0 ? items : [scoutingText.none]) {
      write(fit(item, half), x0, y + 28 + line * 20, colours.text);
      line += 1;
    }
    return Math.max(1, items.length);
  };
  const lines = Math.max(listed(strengths, PAD), listed(weaknesses, PAD + half + 20));
  y += 28 + lines * 20 + 8;

  /** Chips in rows: each with its colour, wrapping at the right edge. */
  const chips = (items: { value: string; colour: string }[], startY: number) => {
    let cx = PAD;
    let cy = startY;
    font(600, 12.5);
    for (const item of items) {
      const width = Math.min(g.measureText(item.value).width + 18, WIDTH - 2 * PAD);
      if (cx + width > right) {
        cx = PAD;
        cy += 28;
      }
      rounded(cx, cy, width, 22, 11);
      g.strokeStyle = item.colour;
      g.lineWidth = 1;
      g.stroke();
      write(fit(item.value, width - 18), cx + 9, cy + 15, item.colour);
      cx += width + 6;
    }
    return cy + 22;
  };

  const character = traits(details);
  if (character.length > 0) {
    label(text.profile, PAD, y + 6);
    y = chips(
      character.map((value) => ({ value, colour: colours.text })),
      y + 14,
    );
    y += 18;
  }

  // The scout's note: what makes him an opportunity, how alike he is, and why a move looks likely or not.
  const notes: { value: string; colour: string }[] = [];
  if (pick.why) {
    notes.push({ value: whyText(pick.why), colour: colours.link });
  }
  if (pick.similarity !== undefined && pick.similarity !== null) {
    notes.push({ value: text.similarity(pick.similarity), colour: colours.link });
  }
  for (const reason of s.reasons.filter((r) => !OWN_MONEY_REASONS.has(r.code))) {
    notes.push({
      value: reasonText(reason),
      colour: reason.points > 0 ? colours.tiers[3] : reason.points < 0 ? colours.tiers[0] : colours.muted,
    });
  }
  if (notes.length > 0) {
    label(text.note, PAD, y + 6);
    y = chips(notes, y + 14) + 18;
  }

  // The foot.
  g.fillStyle = colours.border;
  g.fillRect(PAD, y, WIDTH - 2 * PAD, 1);
  font(400, 11.5);
  write(fit(text.footer, WIDTH - 2 * PAD), PAD, y + 22, colours.muted);
  const height = Math.min(MOST_HEIGHT, y + 38);

  const out = document.createElement("canvas");
  out.width = WIDTH * SCALE;
  out.height = height * SCALE;
  out.getContext("2d")?.drawImage(canvas, 0, 0, WIDTH * SCALE, height * SCALE, 0, 0, WIDTH * SCALE, height * SCALE);
  return out;
}

/** The canvas as PNG bytes. */
export function pngOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png"),
  );
}
