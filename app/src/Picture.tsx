import { useReducer, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { intlLocale } from "./i18n";
import { pictureUrl, type PictureKind } from "./pictures";

// Pictures from the graphics packs: club logos, faces and flags. A picture sits in a box of a fixed size, so a row or a
// header is as big while the picture is on its way, or when no pack has it, as with it. Where there is none the box
// shows a stand-in: initials for a club or a person, an empty frame for a flag (never a made-up flag).

/** How big a picture is: one number for a square, or the width and the height of its box, in pixels. */
export type PictureSize = number | { width: number; height: number };

/** The sizes the app shows pictures at, by where they are. */
export const PICTURE_SIZE = {
  /** A club's logo in a row of the players and staff tables. */
  rowLogo: 18,
  /** A club's logo in a row of the clubs table. */
  clubRowLogo: 22,
  /** A club's logo in a line of text, such as the line under the name in a profile. */
  textLogo: 16,
  /** A person's face in the header of a profile. */
  face: 64,
  /** A person's face at the head of a column of the comparison. */
  columnFace: 44,
  /** A person's face in a row of the players a dialog lists. */
  rowFace: 28,
  /** A club's logo in the header of its profile. */
  clubLogo: 56,
  /** A flag, in a table cell or a line of text: the 3:2 of most flags, small. */
  flag: { width: 16, height: 11 },
  /** A competition's logo at the head of its table, on the standings page. */
  competitionLogo: 20,
} as const;

/** The addresses the app answered 404 for: a missing picture is asked for once, not again on every render of a list. */
const missing = new Set<string>();

/** Counts the times the missing pictures were forgotten: a picture asks for its image again under a new count. */
let generation = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentGeneration = () => generation;

/**
 * Forgets which pictures were missing, so that every picture asks again. The app answers 404 for everything until it
 * has read the packs, a moment after it starts: call this once it has, so that a picture asked for before then does
 * not stay missing.
 */
export function retryMissingPictures(): void {
  missing.clear();
  generation += 1;
  listeners.forEach((listener) => listener());
}

interface PictureProps {
  kind: PictureKind;
  /** The UID the picture is filed under: a club's, a person's or a nation's. With none, nothing is asked for. */
  id: number | null | undefined;
  size: PictureSize;
  /** The picture's name for assistive technology (its alt text): "" when the text beside it already says what it is. */
  label: string;
  /** What the box shows where there is no picture; nothing by default. */
  fallback?: ReactNode;
}

/**
 * A picture from the graphics packs in a box of a fixed size. Where there is none (the app has no packs, no pack has
 * this picture, or it cannot be read) the box shows `fallback`. The box is empty while the picture is on its way.
 */
export function Picture({ kind, id, size, label, fallback }: PictureProps) {
  // The third argument lets it render without a window (on a server, in a test): the count does not need one.
  const retry = useSyncExternalStore(subscribe, currentGeneration, currentGeneration);
  const [, imageFailed] = useReducer((failures: number) => failures + 1, 0);
  const url = pictureUrl(kind, id);
  const { width, height } = typeof size === "number" ? { width: size, height: size } : size;
  const style = { "--picture-w": `${width}px`, "--picture-h": `${height}px` } as CSSProperties;
  const className = `picture ${kind}`;

  if (url !== null && !missing.has(url)) {
    return (
      <span className={className} style={style}>
        <img
          key={retry}
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            missing.add(url);
            imageFailed();
          }}
        />
      </span>
    );
  }
  // The text beside a picture usually names it, so its stand-in is for the eye only; one with a label is an image.
  return (
    <span
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {fallback}
    </span>
  );
}

/** Words that say what kind of club it is, not which one: "FC Barcelona" is B…, not F…. */
const CLUB_TYPE_WORDS: ReadonlySet<string> = new Set([
  "fc", "cf", "afc", "sc", "ac", "as", "sk", "fk", "sv", "ssc", "us", "rc", "cd", "ud", "sd",
  "club", "de", "del", "la", "the", "of", "and",
]);

/** The words of a name: runs of letters, so "Saint-Germain" and "O'Higgins" are two words each. */
const wordsOf = (name: string): string[] => name.normalize("NFC").match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];

/** The first `count` letters of a word, as capitals of the language. */
const capitals = (word: string, count: number): string =>
  Array.from(word).slice(0, count).join("").toLocaleUpperCase(intlLocale);

/** "TH" for "Tottenham Hotspur" (two words: their first letters), "AR" for "Arsenal" (one word: its first two). */
function clubInitials(name: string): string {
  const words = wordsOf(name);
  const named = words.filter((word) => !CLUB_TYPE_WORDS.has(word.toLowerCase()));
  const parts = named.length > 0 ? named : words;
  if (parts.length === 0) {
    // No letter in the name at all ("1860"): its first characters will do.
    return capitals(name.trim(), 2);
  }
  return parts.length === 1 ? capitals(parts[0], 2) : capitals(parts[0], 1) + capitals(parts[1], 1);
}

/** "AY" for "Arda Yılmaz": the first letters of the first and the last word; one letter for a single name. */
function personInitials(name: string): string {
  const words = wordsOf(name);
  if (words.length === 0) {
    return capitals(name.trim(), 1);
  }
  return words.length === 1 ? capitals(words[0], 1) : capitals(words[0], 1) + capitals(words[words.length - 1], 1);
}

/** A hue (0–359) that is the same for the same name, and far from the one of a name that differs by a letter. */
function hueOf(name: string): number {
  let hash = 2166136261;
  for (const char of name) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  }
  // The last letters barely move the low bits of the hash above: mix them in.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) % 360;
}

interface ClubLogoProps {
  /** The club's UID; null when there is no club (a free agent). */
  uid: number | null;
  /** The club's name, for the initials of its badge; null when it is not known. */
  name: string | null;
  /** The side of the square box. */
  size: number;
  /** The alt text; "" (the default) when the club's name is written beside the logo. */
  label?: string;
}

/**
 * A club's logo; where no pack has it, a rounded badge with the club's initials on a colour that comes from its name.
 * With no club the box is left empty, so the text beside it lines up with that of the other rows.
 */
export function ClubLogo({ uid, name, size, label = "" }: ClubLogoProps) {
  const badge = name ? (
    <span className="picture-badge" style={{ "--hue": hueOf(name) } as CSSProperties}>
      {clubInitials(name)}
    </span>
  ) : null;
  return <Picture kind="club" id={uid} size={size} label={label} fallback={badge} />;
}

interface PersonFaceProps {
  /** The UID of the player or member of staff. */
  uid: number;
  name: string;
  /** The side of the square box. */
  size: number;
  /** The alt text; "" (the default) when the name is written beside the face. */
  label?: string;
}

/** A person's face, in a circle; where no pack has it, the person's initials in a neutral circle. */
export function PersonFace({ uid, name, size, label = "" }: PersonFaceProps) {
  return (
    <Picture
      kind="face"
      id={uid}
      size={size}
      label={label}
      fallback={<span className="picture-initials">{personInitials(name)}</span>}
    />
  );
}

interface NationFlagProps {
  /** The nation's UID; null when there is no nation. */
  uid: number | null;
  size?: PictureSize;
  /** The alt text; "" (the default) when the nation's name is written beside the flag. */
  label?: string;
}

/** A nation's flag; where no pack has it, an empty frame in its place: never a flag that is not the nation's. */
export function NationFlag({ uid, size = PICTURE_SIZE.flag, label = "" }: NationFlagProps) {
  return (
    <Picture
      kind="flag"
      id={uid}
      size={size}
      label={label}
      fallback={uid === null ? null : <span className="picture-frame" />}
    />
  );
}

interface CompetitionLogoProps {
  /** The competition's UID, as its logo is filed under in the packs. */
  uid: number;
  /** The side of the square box; `PICTURE_SIZE.competitionLogo` by default. */
  size?: number;
  /** The alt text; "" (the default) when the competition's name is written beside the logo. */
  label?: string;
}

/** A competition's logo; where no pack has it, an empty frame keeps the name lined up with the others. */
export function CompetitionLogo({ uid, size = PICTURE_SIZE.competitionLogo, label = "" }: CompetitionLogoProps) {
  return <Picture kind="competition" id={uid} size={size} label={label} fallback={<span className="picture-frame" />} />;
}

interface WithPictureProps {
  picture: ReactNode;
  /** The words the picture goes with. */
  children: ReactNode;
  /**
   * For a line of text, such as the line under the name in a profile: the picture and the words stay together,
   * wrap as one, and keep the baseline of the line. Otherwise (a table cell) they sit side by side, and the words give
   * way with an ellipsis, or wrap as the cell does, rather than push the picture off.
   */
  inline?: boolean;
}

/** A picture before the words it goes with. */
export function WithPicture({ picture, children, inline = false }: WithPictureProps) {
  if (inline) {
    return (
      <span className="picture-text">
        {picture}
        {children}
      </span>
    );
  }
  return (
    <div className="with-picture">
      {picture}
      <div className="with-picture-text">{children}</div>
    </div>
  );
}
