// The players watched for CA growth. The watch itself lives in the Rust side (see `growth_watch` in the app's
// commands), which also reads and writes every ability: this holds what it answered last, so the growth tab, the player
// list and a player's profile all show the same watch without a second copy of the game's data.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  growthClear,
  growthFill,
  growthRows,
  growthSetSeasons,
  growthStep,
  growthUnwatch,
  growthWatchPlayers,
} from "./editing";
import { describeError } from "./format";
import type { GrowthReport, GrowthRows } from "./types";

/** The watch, with what can be done to it. */
export interface GrowthWatch {
  /** Changes when the watch is read or written, for the panels that list it. */
  revision: number;
  /** The watch as last read or written; null until the first answer. */
  rows: GrowthRows | null;
  /** What the last step or fill wrote; null until one runs, and after any other action. */
  report: GrowthReport | null;
  error: string | null;
  busy: boolean;
  has: (uid: number) => boolean;
  /** Watches the player, or stops watching him when he is watched. */
  toggle: (uid: number) => void;
  watch: (uids: number[]) => void;
  unwatch: (uids: number[]) => void;
  clear: () => void;
  setSeasons: (seasons: number) => void;
  step: () => void;
  fill: () => void;
}

/** The app's CA-growth watch; null outside the connected app. */
export const GrowthWatchContext = createContext<GrowthWatch | null>(null);

/** The CA-growth watch, read again whenever `version` changes (a connection or a scan). */
export function useGrowthWatch(version: number): GrowthWatch {
  const [rows, setRows] = useState<GrowthRows | null>(null);
  const [report, setReport] = useState<GrowthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    growthRows().then(
      (read) => {
        if (!cancelled) {
          setRows(read);
          // What the last action wrote is no longer news: the game may have had those changes undone.
          setReport(null);
          setRevision((count) => count + 1);
        }
      },
      (e) => {
        if (!cancelled) {
          setError(describeError(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  return useMemo<GrowthWatch>(() => {
    const settle = (action: Promise<GrowthRows>) => {
      setBusy(true);
      setError(null);
      action
        .then(
          (read) => {
            setRows(read);
            setReport(null);
            setRevision((count) => count + 1);
          },
          (e) => setError(describeError(e)),
        )
        .finally(() => setBusy(false));
    };
    const grow = (action: Promise<GrowthReport>) => {
      setBusy(true);
      setError(null);
      action
        .then(
          (result) => {
            setRows(result.rows);
            setReport(result);
            setRevision((count) => count + 1);
          },
          (e) => setError(describeError(e)),
        )
        .finally(() => setBusy(false));
    };
    const watched = new Set((rows?.rows ?? []).map((row) => row.uid));
    return {
      revision,
      rows,
      report,
      error,
      busy,
      has: (uid) => watched.has(uid),
      toggle: (uid) => settle(watched.has(uid) ? growthUnwatch([uid]) : growthWatchPlayers([uid])),
      watch: (uids) => settle(growthWatchPlayers(uids)),
      unwatch: (uids) => settle(growthUnwatch(uids)),
      clear: () => settle(growthClear()),
      setSeasons: (seasons) => settle(growthSetSeasons(seasons)),
      step: () => grow(growthStep()),
      fill: () => grow(growthFill()),
    };
  }, [rows, report, error, busy, revision]);
}

/** The watch the app holds, for the components that are not handed it; null outside the connected app. */
export function useGrowthWatchContext(): GrowthWatch | null {
  return useContext(GrowthWatchContext);
}
