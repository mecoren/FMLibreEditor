// The mark that watches a player for CA growth: a button in a row of the player list, and one in the header of a
// player's profile. Both change the one watch the app holds (see `useGrowthWatch`), which the CA growth tab lists.

import { growthText as text } from "./labels";
import { useGrowthWatchContext } from "./useGrowthWatch";

/** An arrow rising, drawn rather than typed, so that it reads the same in every font. */
export function GrowthMark({ watched }: { watched: boolean }) {
  const width = watched ? 2 : 1.5;
  return (
    <svg
      className="favorite-star"
      viewBox="0 0 20 20"
      aria-hidden="true"
      style={{ opacity: watched ? 1 : 0.45 }}
    >
      <path
        d="M3 16 8.2 9.2l3.1 3.1L17 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6 4.6H17v4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface GrowthButtonProps {
  uid: number;
  name: string;
  /** The button of a table row: the mark alone, with no label beside it. */
  compact?: boolean;
}

/** The button that watches the player for CA growth, or stops watching him. */
export function GrowthButton({ uid, name, compact }: GrowthButtonProps) {
  const watch = useGrowthWatchContext();
  if (watch === null) {
    return null;
  }
  const watched = watch.has(uid);
  const hint = watched ? text.unwatchPlayerTitle(name) : text.watchPlayerTitle(name);
  return (
    <button
      type="button"
      className={compact ? "favorite-toggle compact" : "favorite-toggle"}
      aria-pressed={watched}
      // A mark alone says nothing to a screen reader; a label beside it says what the button is.
      aria-label={compact ? hint : undefined}
      title={hint}
      // In a row of the player list the mark is the button's: a click or Enter on it must not pick the player too.
      onClick={(event) => {
        event.stopPropagation();
        watch.toggle(uid);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
        }
      }}
    >
      <GrowthMark watched={watched} />
      {!compact && <span>{watched ? text.unwatchPlayer : text.watchPlayer}</span>}
    </button>
  );
}
