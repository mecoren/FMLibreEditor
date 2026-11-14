// The star that marks a player as a favorite: the first column of the player list, where it is the whole cell, and a
// button in the header of a player's profile. Both change the one set the app holds (see `useFavorites`).

import { playerListText } from "./labels";
import type { Favorites } from "./useFavorites";

const text = playerListText.favorite;

/** A star, filled when the player is marked. Drawn rather than typed, so that it reads the same in every font. */
export function FavoriteStar({ marked }: { marked: boolean }) {
  return (
    <svg className="favorite-star" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 2.6l2.3 4.66 5.14.75-3.72 3.62.88 5.12L10 14.33l-4.6 2.42.88-5.12-3.72-3.62 5.14-.75z"
        fill={marked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface FavoriteButtonProps {
  favorites: Favorites;
  /** The player marked, and the name its hover text uses. */
  uid: number;
  name: string;
  /** The button of a table row: the star alone, with no label beside it. */
  compact?: boolean;
}

/** The button that marks the player as a favorite, or takes the mark away. */
export function FavoriteButton({ favorites, uid, name, compact }: FavoriteButtonProps) {
  const marked = favorites.has(uid);
  const hint = marked ? text.remove(name) : text.add(name);
  return (
    <button
      type="button"
      className={compact ? "favorite-toggle compact" : "favorite-toggle"}
      aria-pressed={marked}
      // A star alone says nothing to a screen reader; a label beside it says what the button is.
      aria-label={compact ? hint : undefined}
      title={hint}
      // In a row of the player list the star is the button's: a click or Enter on it must not pick the player too.
      onClick={(event) => {
        event.stopPropagation();
        favorites.toggle(uid);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
        }
      }}
    >
      <FavoriteStar marked={marked} />
      {!compact && <span>{text.label}</span>}
    </button>
  );
}
