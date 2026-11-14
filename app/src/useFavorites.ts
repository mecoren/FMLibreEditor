// The players the user marked as favorites in the save the app is connected to. A mark is the user's own: the app keeps
// it with the save (see the `set_player_favorite` command), so another save does not show it and a reload of the window
// keeps it. The set lives in the app (see `App`), so a mark made in a profile opened from a club's squad shows in the
// players list too.

import { createContext, useEffect, useMemo, useState } from "react";
import { call } from "./api";

/** The players marked as favorites, and what can be done to the marks. */
export interface Favorites {
  /** What changed the marks. A list that shows only favorites asks again when it changes (see `PlayerBrowser`). */
  revision: number;
  has: (uid: number) => boolean;
  /** Marks the player as a favorite, or takes the mark away when it is on. */
  toggle: (uid: number) => void;
}

/** The app's favorites, for the profiles that are not in the player list; null outside the connected app. */
export const FavoritesContext = createContext<Favorites | null>(null);

/** The favorites of the save, read again whenever `version` changes. */
export function useFavorites(version: number): Favorites {
  const [uids, setUids] = useState<readonly number[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    call<number[]>("favorite_players").then(
      (read) => {
        if (!cancelled) {
          setUids(read);
        }
      },
      () => {
        // Without a connection there are no marks to show, and the list says so if it is asked to show them.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  const marked = useMemo(() => new Set(uids), [uids]);

  return useMemo<Favorites>(() => {
    const toggle = (uid: number) => {
      const favorite = !marked.has(uid);
      const before = uids;
      // The star turns at once; the command answers with the marks as they are kept, which may differ.
      setUids(favorite ? [...uids, uid] : uids.filter((other) => other !== uid));
      setRevision((count) => count + 1);
      call<number[]>("set_player_favorite", { uid, favorite }).then(setUids, () => setUids(before));
    };
    return { revision, has: (uid) => marked.has(uid), toggle };
  }, [marked, uids, revision]);
}
