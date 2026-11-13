// The ability radar of a player's profile: six spokes around a middle, one ring each five points of the 1–20 scale,
// and the shape the attributes of his position make. The attributes are the ones FM reads a player by there, so a
// centre-back is drawn by tackling and heading, a striker by finishing and movement; a player the game gives no
// position is drawn by the six that tell one sort of player from another.

import { ATTRIBUTE_LABELS, profileText, type AttributeKey } from "./labels";
import type { PlayerDetails } from "./types";

/** The box the chart is drawn in, its middle, and how far the spokes and their labels go from it. */
const WIDTH = 218;
const HEIGHT = 184;
const CENTER_X = 109;
const CENTER_Y = 90;
const RADIUS = 56;
const LABEL_RADIUS = 74;
/** The rings of the scale, the outermost being the whole of it. */
const RINGS = [5, 10, 15, 20];
/** The top of the chart; its six spokes run clockwise from it, 60 degrees apart. */
const FIRST_ANGLE = -90;
/** The top of the scale: an attribute's value as FM shows it. */
const MAX = 20;

/** The six attributes a player is read by at each position, in the order the spokes go round. */
const BY_POSITION: Partial<Record<string, readonly AttributeKey[]>> = {
  gk: ["handling", "reflexes", "aerial_reach", "command_of_area", "rushing_out", "kicking"],
  sw: ["marking", "tackling", "heading", "positioning", "passing", "strength"],
  dl: ["tackling", "marking", "crossing", "pace", "stamina", "positioning"],
  dr: ["tackling", "marking", "crossing", "pace", "stamina", "positioning"],
  dc: ["tackling", "marking", "heading", "strength", "positioning", "pace"],
  wbl: ["tackling", "marking", "crossing", "pace", "stamina", "dribbling"],
  wbr: ["tackling", "marking", "crossing", "pace", "stamina", "dribbling"],
  dm: ["tackling", "marking", "passing", "positioning", "work_rate", "strength"],
  mc: ["passing", "vision", "technique", "teamwork", "work_rate", "stamina"],
  ml: ["crossing", "dribbling", "pace", "technique", "passing", "work_rate"],
  mr: ["crossing", "dribbling", "pace", "technique", "passing", "work_rate"],
  amc: ["passing", "vision", "technique", "dribbling", "finishing", "flair"],
  aml: ["dribbling", "pace", "crossing", "technique", "off_the_ball", "finishing"],
  amr: ["dribbling", "pace", "crossing", "technique", "off_the_ball", "finishing"],
  st: ["finishing", "heading", "off_the_ball", "pace", "strength", "dribbling"],
};

/** Where the game names no position: the six that tell one sort of player from another. */
const ANYWHERE: readonly AttributeKey[] = ["pace", "strength", "tackling", "dribbling", "passing", "finishing"];

/** A point `radius` out along spoke `index`, in the chart's box, to a tenth of a point. */
function point(radius: number, index: number): { x: number; y: number } {
  const angle = ((FIRST_ANGLE + index * 60) * Math.PI) / 180;
  const tenth = (value: number) => Math.round(value * 10) / 10;
  return { x: tenth(CENTER_X + radius * Math.cos(angle)), y: tenth(CENTER_Y + radius * Math.sin(angle)) };
}

/** The polygon of a radius for each spoke, as an SVG's `points`. */
function outline(radii: readonly number[]): string {
  return radii
    .map((radius, index) => {
      const { x, y } = point(radius, index);
      return `${x},${y}`;
    })
    .join(" ");
}

/** An attribute as FM shows it, 0 where the game has none. */
const shown = (player: PlayerDetails, key: AttributeKey) => player.attributes[key]?.value ?? 0;

/** The attributes the radar is drawn from: those of the best position he plays, or of the one he rates highest at. */
function keysOf(player: PlayerDetails): readonly AttributeKey[] {
  const listed = player.positions[0]?.toLowerCase();
  if (listed !== undefined && BY_POSITION[listed] !== undefined) {
    return BY_POSITION[listed];
  }
  let best: string | null = null;
  let rating = 0;
  for (const [key, value] of Object.entries(player.positionRatings)) {
    if (value > rating) {
      best = key;
      rating = value;
    }
  }
  return (best !== null ? BY_POSITION[best] : undefined) ?? ANYWHERE;
}

/**
 * A player's abilities as a hexagon: the six attributes of his position, each a value of the 1–20 scale over the rings
 * that mark 5, 10, 15 and 20, with the value under its name. The hover of a name has the value as the game stores it.
 */
export function AbilityRadar({ player }: { player: PlayerDetails }) {
  const spokes = keysOf(player).map((key) => ({ key, value: shown(player, key) }));
  // A shape is drawn inside the outermost ring: a value the game holds beyond the scale does not break out of it.
  const fraction = (value: number) => Math.max(0, Math.min(MAX, value)) / MAX;
  const said = spokes.map((spoke) => `${ATTRIBUTE_LABELS[spoke.key]} ${spoke.value}`).join(" · ");

  return (
    <svg className="radar" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${profileText.radar}: ${said}`}>
      {RINGS.map((ring) => (
        <polygon key={ring} className="radar-ring" points={outline(spokes.map(() => RADIUS * (ring / MAX)))} />
      ))}
      {spokes.map((spoke, index) => {
        const end = point(RADIUS, index);
        return <line key={spoke.key} className="radar-axis" x1={CENTER_X} y1={CENTER_Y} x2={end.x} y2={end.y} />;
      })}
      <polygon className="radar-shape" points={outline(spokes.map((spoke) => RADIUS * fraction(spoke.value)))} />
      {spokes.map((spoke, index) => {
        const dot = point(RADIUS * fraction(spoke.value), index);
        return <circle key={spoke.key} className="radar-dot" cx={dot.x} cy={dot.y} r={2.6} />;
      })}
      {spokes.map((spoke, index) => {
        const at = point(LABEL_RADIUS, index);
        // The names stand outside the shape: those at the sides are written outwards from it, those at the top and the
        // bottom centred on their spoke.
        const anchor = index === 1 || index === 2 ? "start" : index === 4 || index === 5 ? "end" : "middle";
        const attribute = player.attributes[spoke.key];
        return (
          <g key={spoke.key}>
            {/* The value as the game stores it, for the pointer. */}
            {attribute && <title>{profileText.raw(attribute.raw)}</title>}
            <text className="radar-label" x={at.x} y={at.y} textAnchor={anchor}>
              {ATTRIBUTE_LABELS[spoke.key]}
            </text>
            <text className="radar-value" x={at.x} y={at.y + 13} textAnchor={anchor}>
              {spoke.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
