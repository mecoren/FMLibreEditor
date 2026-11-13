// A note behind a small (i) button, for what most people need not read. It shows while the pointer is over the button
// or the note, while the button has keyboard focus, and after a click on it until the next click anywhere. Escape
// hides it, and only it (see `useModal`), until the pointer and focus have left. The note describes the button
// (aria-describedby), so assistive technology reads it with the button.
//
// The note is placed under the element the button sits in, as wide as it: that element must be positioned. Where that
// leaves it far from its button, it is moved to it, inside the window and any box that cuts off what spills out:
// - a narrower note under a wide row whose (i) is on the left begins at the button;
// - a note under a tall element (a whole section) comes up to just under the button;
// - a note that would run past the foot of what holds it shows over the button, where there is room.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** How long the note stays once the pointer has left, so that the pointer can cross over to it. */
const HIDE_DELAY = 150;

/** How far a note may begin or end beside its button and still count as under it. */
const NEAR = 24;

/** How far under its button a note may hang (under a few lines of text) before it is brought up to it. */
const FAR = 48;

/** The gap between a button and a note moved to it, as between a note and the element it hangs under. */
const GAP = 6;

/** The least room between a moved note and the edge of what holds it. */
const EDGE = 8;

/**
 * The room `note` may take: the window's, less that of every box that cuts off what spills out of it. Those are the
 * boxes the note is positioned in, and theirs: a box between the note and the one it is positioned in does not cut it.
 */
function roomOf(note: HTMLElement): { left: number; right: number; top: number; bottom: number } {
  const room = { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: window.innerHeight };
  const from = note.offsetParent ?? note.parentElement;
  for (let box = from; box !== null && box !== document.body; box = box.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(box);
    if (overflowX !== "visible" || overflowY !== "visible") {
      const rect = box.getBoundingClientRect();
      room.left = Math.max(room.left, rect.left);
      room.right = Math.min(room.right, rect.right);
      room.top = Math.max(room.top, rect.top);
      room.bottom = Math.min(room.bottom, rect.bottom);
    }
  }
  return room;
}

interface InfoTipProps {
  /** The button's name for assistive technology, e.g. "Why?". */
  label: string;
  note: string;
}

export function InfoTip({ label, note }: InfoTipProps) {
  const noteId = useId();
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const noteBox = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shown = !dismissed && (hovered || focused || pinned);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // Once it shows: a note its place puts far from the button is moved to it (see the top of the file).
  useLayoutEffect(() => {
    const tip = noteBox.current;
    const icon = button.current;
    if (!shown || tip === null || icon === null) {
      return;
    }
    tip.style.transform = "";
    const placed = tip.getBoundingClientRect();
    const at = icon.getBoundingClientRect();
    const room = roomOf(tip);
    let left = placed.left;
    if (at.right < placed.left - NEAR || at.left > placed.right + NEAR) {
      left = Math.max(room.left + EDGE, Math.min(at.left - EDGE, room.right - EDGE - placed.width));
    }
    let top = placed.top > at.bottom + FAR ? at.bottom + GAP : placed.top;
    if (top > at.top && top + placed.height > room.bottom - EDGE && at.top - GAP - placed.height >= room.top + EDGE) {
      top = at.top - GAP - placed.height;
    }
    if (left !== placed.left || top !== placed.top) {
      tip.style.transform = `translate(${Math.round(left - placed.left)}px, ${Math.round(top - placed.top)}px)`;
    }
  }, [shown, note]);

  // What Escape hid may show again once the pointer and focus have both left (at once, when it only showed from a
  // click).
  useEffect(() => {
    if (dismissed && !hovered && !focused) {
      setDismissed(false);
    }
  }, [dismissed, hovered, focused]);

  // While it shows, a click elsewhere takes back a click that opened it, and Escape hides it. The dialog lets this
  // Escape through, and it goes no further than here: the profile behind the dialog, which closes on Escape, stays.
  useEffect(() => {
    if (!shown) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) {
        setPinned(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.stopPropagation();
        event.preventDefault();
        setPinned(false);
        setDismissed(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shown]);

  const enter = () => {
    window.clearTimeout(hideTimer.current);
    setHovered(true);
  };
  const leave = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHovered(false), HIDE_DELAY);
  };

  return (
    <span ref={box} className="info-tip" data-open-tip={shown || undefined} onMouseEnter={enter} onMouseLeave={leave}>
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={label}
        aria-describedby={noteId}
        onClick={() => {
          setPinned((open) => !open);
          setDismissed(false);
        }}
        // A click focuses the button in some browsers: only focus from the keyboard shows the note by itself.
        onFocus={(event) => setFocused(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocused(false)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v4.5M10 6.3v0.01" />
        </svg>
      </button>
      <span ref={noteBox} id={noteId} role="tooltip" className={shown ? "info-tip-note shown" : "info-tip-note"}>
        {note}
      </span>
    </span>
  );
}
