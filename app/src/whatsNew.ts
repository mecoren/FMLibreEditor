// What's new: what a version brings, told once, the first time the app starts after it was updated to that version.
// The notes are in the dictionaries (`whatsNew.versions`, in English where a language lacks a version), the people
// thanked here. The version whose notes the user has seen is kept in the web view's storage, as the language is.
//
// A copy of 0.5.1 or earlier kept no such version, but it kept the version it was when it last looked for updates
// (`fmlibre.update`, see `update.ts`): the version it was updated from. That is read as the app starts, before this
// run's look for updates writes over it. A first start with nothing kept is a new install, which shows nothing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { inTauri } from "./api";
import { intlLocale, strings } from "./i18n";
import { en } from "./i18n/en";
import { isNewer } from "./update";

/** Where the version whose notes the user has seen is kept. */
const SEEN_KEY = "fmlibre.whatsNew";

/** What `SEEN_KEY` holds after the first start of a new install, until the app's version is known. */
const NEW_INSTALL = "new";

/** Where the look for updates keeps its last answer, with the version the app then was (see `update.ts`). */
const UPDATE_KEY = "fmlibre.update";

/** The most versions the dialog shows at once, newest first: after a long gap, the rest are a link away. */
const MOST_VERSIONS = 3;

/** The people each version thanks, by their names on GitHub. */
const THANKS: Record<string, string[]> = {
  "0.5.2": ["pdalu", "Ragebulls", "pirocky", "keyboard1011-dev"],
};

/** A version's notes, in the language in use or else in English, and the people it thanks. */
export interface VersionNotes {
  version: string;
  things: { title: string; text: string }[];
  /** The names, joined as the language joins a list ("a, b and c"); null when it thanks nobody. */
  thanks: string | null;
}

const isVersion = (value: unknown): value is string => typeof value === "string" && /^\d+(\.\d+)*$/.test(value);

function keepSeen(version: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Not kept: the notes show again at the next start, which is all that is lost.
  }
}

/**
 * The version whose notes the user had seen when the app started, or `NEW_INSTALL`. Where nothing was kept yet, it is
 * the version updated from, or "0" for a copy used before by a version that kept neither; it is kept at once, before
 * anything else this start writes, so that a reload (to change the language, say) reads the same.
 */
const seenAtStart: string = (() => {
  try {
    const storage = window.localStorage;
    const kept = storage.getItem(SEEN_KEY);
    if (isVersion(kept) || kept === NEW_INSTALL) {
      return kept;
    }
    let before: unknown = null;
    try {
      before = (JSON.parse(storage.getItem(UPDATE_KEY) ?? "null") as { current?: unknown } | null)?.current;
    } catch {
      // An answer that cannot be read tells nothing about the version before.
    }
    const usedBefore = Object.keys(storage).some((key) => key.startsWith("fmlibre."));
    const seen = isVersion(before) ? before : usedBefore ? "0" : NEW_INSTALL;
    storage.setItem(SEEN_KEY, seen);
    return seen;
  } catch {
    // Where nothing can be kept, nothing opens by itself: it would at every start.
    return NEW_INSTALL;
  }
})();

/** `?whatsnew` in the browser preview opens the dialog as after an update; without it the preview never does. */
const previewAsked = !inTauri && new URLSearchParams(window.location.search).has("whatsnew");

/** The versions that have notes, newest first. */
const VERSIONS = Object.keys(en.whatsNew.versions)
  .filter(isVersion)
  .sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0));

/** The list formatter of the web view, which an older macOS lacks (the app's TypeScript library predates it too). */
type ListFormat = new (locale: string, options: { type: "conjunction" }) => { format(list: string[]): string };
const ListFormat = (Intl as { ListFormat?: ListFormat }).ListFormat;

/** `names` joined as the language joins a list ("a, b and c"), or with commas where the web view cannot. */
const joinNames = (names: string[]): string =>
  ListFormat ? new ListFormat(intlLocale, { type: "conjunction" }).format(names) : names.join(", ");

/** A version's notes as the dialog shows them. */
function notesOf(version: string): VersionNotes {
  const names = THANKS[version] ?? [];
  return {
    version,
    things: strings.whatsNew.versions[version] ?? en.whatsNew.versions[version] ?? [],
    thanks: names.length > 0 ? joinNames(names) : null,
  };
}

/**
 * The notes for `current`, the app's version once it is known: the dialog opens with them by itself after an update,
 * and shows the latest of the versions up to `current` when asked (`show`). Once it is closed (`close`) it does not
 * open by itself again, at this start or a later one of the same version.
 */
export function useWhatsNew(current: string | null) {
  const [shown, setShown] = useState<VersionNotes[] | null>(null);
  // Whether the dialog opened by itself, after an update.
  const [updated, setUpdated] = useState(false);

  // The versions up to the app's own, newest first; the browser preview, which pretends to be an old version, has all.
  const known = useMemo(
    () => (current === null ? [] : VERSIONS.filter((version) => !inTauri || !isNewer(version, current))),
    [current],
  );

  useEffect(() => {
    if (current === null) {
      return;
    }
    if (previewAsked) {
      setShown(known.slice(0, MOST_VERSIONS).map(notesOf));
      setUpdated(true);
      return;
    }
    if (!inTauri) {
      return;
    }
    const due = seenAtStart === NEW_INSTALL ? [] : known.filter((version) => isNewer(version, seenAtStart));
    if (due.length > 0) {
      setShown(due.slice(0, MOST_VERSIONS).map(notesOf));
      setUpdated(true);
    } else {
      keepSeen(current);
    }
  }, [current, known]);

  const show = useCallback(() => {
    if (known.length > 0) {
      setShown([notesOf(known[0])]);
      setUpdated(false);
    }
  }, [known]);

  const close = useCallback(() => {
    setShown(null);
    if (current !== null && inTauri) {
      keepSeen(current);
    }
  }, [current]);

  /** Whether there are notes to show when asked: the foot of the window and the palette offer them then. */
  const available = known.length > 0;
  return { shown, updated, available, show, close };
}
