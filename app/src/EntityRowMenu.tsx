// One right-click menu for every row of players, staff and clubs in the app. A list only spreads `rowMenuProps`
// onto its rows: this menu at the root of the app finds the nearest marked row from the event, so no table has to
// hold a menu of its own (and rows added later need nothing but the same three attributes).
//
// The menu is drawn here rather than with Radix's ContextMenu on purpose: opening it cost Radix 36 getComputedStyle
// probes (positioning, presence, scroll lock), each forcing a style recalculation of the page, which is about 400 ms
// before the first pixel of a two-item menu over a table of a few hundred rows. Measuring the box once, keeping it in
// the page and focusing it costs a few milliseconds and keeps the same keyboard and focus behaviour.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { rowMenuText } from "./labels";

/** A row of a list of people, or one of clubs; only clubs name the first action "copy club name". */
export type RowEntity = "player" | "staff" | "club";

/** What the menu offers: the name as the list shows it, and the game's UID as a string. */
export function rowMenuProps(kind: RowEntity, name: string, uid: number) {
  return {
    "data-row-entity": kind,
    "data-row-name": name,
    "data-row-uid": uid,
  };
}

export type RowMenuAttrs = ReturnType<typeof rowMenuProps>;

interface Selection {
  kind: RowEntity;
  name: string;
  uid: number;
}

/** An open menu: what it acts on, and where it was asked for (a pointer's or a row's coordinates, in the window). */
interface Opened {
  selection: Selection;
  x: number;
  y: number;
}

/** How far the menu keeps from the window's edges, in pixels. */
const EDGE = 4;

function readRow(row: HTMLElement): Selection | null {
  const { rowEntity: kind, rowName: name, rowUid: raw } = row.dataset;
  const uid = Number(raw);
  if (
    (kind !== "player" && kind !== "staff" && kind !== "club") ||
    !name ||
    raw === undefined ||
    !Number.isInteger(uid)
  ) {
    return null;
  }
  return { kind, name, uid };
}

/** Where the focus goes back when the menu closes: the row, or the control that had it (a search box, a name). */
function focusOf(row: HTMLElement): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    // A focused row or name, or the search box whose results these rows are: leave the focus where it was.
    if (row.contains(active) || active.matches("input, textarea, [contenteditable='true']")) return active;
  }
  if (row.tabIndex >= 0) return row;
  return row.querySelector<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])") ?? row;
}

/** One action of the menu: a menu item that runs on click, and on Enter or Space from the keyboard. */
function MenuItem(props: { onChoose: () => void; children: ReactNode }) {
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
      onClick={props.onChoose}
    >
      {props.children}
    </div>
  );
}

export function EntityRowMenu() {
  const [menu, setMenu] = useState<Opened | null>(null);
  const [status, setStatus] = useState("");
  const [said, setSaid] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Set when the menu closes and the focus has to go back to where it was; a click outside leaves it where it lands.
  const giveBack = useRef(false);

  useEffect(() => {
    function start(found: Selection, row: HTMLElement, x: number, y: number) {
      opener.current = focusOf(row);
      setStatus("");
      setMenu({ selection: found, x, y });
    }

    function onContextMenu(event: MouseEvent) {
      const target = event.target;
      // Leave the browser's own menu alone inside a field or a piece of editable text.
      if (!(target instanceof Element) || target.closest("input, textarea, [contenteditable='true']")) return;
      const row = target.closest<HTMLElement>("[data-row-entity]");
      if (!row) return;
      const found = readRow(row);
      if (!found) return;
      event.preventDefault();
      start(found, row, event.clientX, event.clientY);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      const active = document.activeElement;
      if (!(active instanceof Element)) return;
      const row = active.closest<HTMLElement>("[data-row-entity]");
      if (!row) return;
      const found = readRow(row);
      if (!found) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      start(found, row, rect.left + 8, rect.bottom);
    }

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // Until the box has been measured it stays hidden, so it never shows for a frame at the pointer's raw coordinates.
  // Its place and its visibility are set here rather than in the render, which would only apply them once.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || menu === null) {
      return;
    }
    element.style.visibility = "hidden";
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    element.style.left = `${Math.max(EDGE, Math.min(menu.x, window.innerWidth - width - EDGE))}px`;
    element.style.top = `${Math.max(EDGE, Math.min(menu.y, window.innerHeight - height - EDGE))}px`;
    element.style.visibility = "";
    element.querySelector<HTMLElement>("[role='menuitem']")?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (menu === null) {
      if (giveBack.current) {
        giveBack.current = false;
        opener.current?.focus({ preventScroll: true });
      }
      return;
    }
    const pressed = (event: PointerEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return;
      setMenu(null);
    };
    // A box that stays where it was while the page moves under it would be worse than one that goes away.
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", pressed, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", pressed, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(rowMenuText.copied);
    } catch {
      setStatus(rowMenuText.failed);
    }
    // A second copy of the same text has to be announced again.
    setSaid((n) => n + 1);
  }

  function close(returnFocus: boolean) {
    giveBack.current = returnFocus;
    setMenu(null);
  }

  function choose(value: string) {
    void copy(value);
    close(true);
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const at = items.findIndex((item) => item === document.activeElement);
    const step = (delta: number) =>
      at < 0 ? items[delta > 0 ? 0 : items.length - 1] : items[(at + delta + items.length) % items.length];
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1)?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1)?.focus();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.click();
        break;
      case "Escape":
        // The menu is the innermost thing Escape has to close: an open profile behind it stays.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Tab leaves the menu for the page, as it does for a native context menu.
        close(false);
        break;
      default:
        break;
    }
  }

  // The box stays in the page and is hidden between uses: inserting it on every right-click would make the browser
  // match every `:first-child` and `:last-child` of a table of hundreds of rows again.
  return (
    <>
      {createPortal(
        <div
          ref={box}
          role="menu"
          data-slot="row-menu"
          aria-label={menu?.selection.name}
          hidden={menu === null}
          className="fixed z-[130] min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0, visibility: "hidden" }}
          onKeyDown={onMenuKeyDown}
        >
          <MenuItem onChoose={() => choose(menu?.selection.name ?? "")}>
            {menu?.selection.kind === "club" ? rowMenuText.copyClubName : rowMenuText.copyName}
          </MenuItem>
          <MenuItem onChoose={() => choose(menu === null ? "" : String(menu.selection.uid))}>
            {rowMenuText.copyUid}
          </MenuItem>
        </div>,
        document.body,
      )}
      <span key={said} className="sr-only" role="status">
        {status}
      </span>
    </>
  );
}
