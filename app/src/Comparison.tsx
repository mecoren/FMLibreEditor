// What puts players into a comparison and opens it: the Compare button in the header of a player's profile, and the
// tray under the player list with the players picked so far (see `useComparison`).

import { useEffect, useRef, useState } from "react";
import { ComparisonDialog } from "./ComparisonDialog";
import { rowMenuProps } from "./EntityRowMenu";
import { comparisonText as text } from "./labels";
import { MAX_COMPARED, type ComparedPlayer, type Comparison } from "./useComparison";

/**
 * The Compare button of a player's profile: it puts the player into the comparison, or takes them out again. A full
 * comparison takes no one more; the button then says so in its hover text. It is `aria-disabled` rather than disabled,
 * so that it stays on the Tab order and the explanation can be read out.
 */
export function CompareToggle({ comparison, player }: { comparison: Comparison; player: ComparedPlayer }) {
  const included = comparison.has(player.uid);
  const blocked = !included && comparison.full;
  return (
    <button
      type="button"
      className="compare-toggle"
      aria-pressed={included}
      aria-disabled={blocked || undefined}
      title={included ? text.remove : blocked ? text.full(MAX_COMPARED) : text.add}
      onClick={() => {
        if (!blocked) {
          comparison.toggle(player);
        }
      }}
    >
      {text.compare}
    </button>
  );
}

/** Where focus goes when the control that has it goes away with the player or the tray: the search box of the list. */
const searchBoxOf = (tray: HTMLElement) => tray.closest(".players")?.querySelector<HTMLElement>(".search input");

/**
 * The slim tray under the player list: a chip for each player picked (with a × to take them out), Clear, and the
 * Compare button that opens the comparison. There is nothing of it while no one is picked.
 */
export function ComparisonTray({ comparison }: { comparison: Comparison }) {
  const { players, remove, clear } = comparison;
  // The players the dialog shows: those of the moment it was opened. Null while it is closed.
  const [opened, setOpened] = useState<readonly ComparedPlayer[] | null>(null);
  const tray = useRef<HTMLElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it. Doing it earlier, with the dialog still up,
  // would only make the dialog take focus back.
  useEffect(() => {
    if (wasOpen.current && opened === null) {
      openButton.current?.focus();
    }
    wasOpen.current = opened !== null;
  }, [opened]);

  if (players.length === 0) {
    return null;
  }

  /** Keyboard focus is not lost with the chip: it moves first to the next one, or to the last, or off the tray. */
  const removeAt = (index: number) => {
    const box = tray.current;
    if (box?.contains(document.activeElement)) {
      const buttons = Array.from(box.querySelectorAll<HTMLElement>(".compare-chip button"));
      (buttons[index + 1] ?? buttons[index - 1] ?? searchBoxOf(box))?.focus();
    }
    remove(players[index].uid);
  };

  const clearAll = () => {
    const box = tray.current;
    if (box?.contains(document.activeElement)) {
      searchBoxOf(box)?.focus();
    }
    clear();
  };

  return (
    <>
      <section ref={tray} className="compare-tray" aria-label={text.trayLabel}>
        <ul className="compare-chips">
          {players.map((player, index) => (
            <li key={player.uid} className="compare-chip" {...rowMenuProps("player", player.name, player.uid)}>
              <span className="compare-chip-name" title={player.name}>
                {player.name}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={text.removePlayer(player.name)}
                title={text.removePlayer(player.name)}
                onClick={() => removeAt(index)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="compare-clear" onClick={clearAll}>
          {text.clear}
        </button>
        {/* One player is no comparison yet: the button is plain until there are two, but the dialog says why. */}
        <button
          ref={openButton}
          type="button"
          className={players.length >= 2 ? "primary compare-open" : "compare-open"}
          aria-haspopup="dialog"
          onClick={() => setOpened(players)}
        >
          {text.open(players.length)}
        </button>
      </section>
      {opened && <ComparisonDialog players={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
