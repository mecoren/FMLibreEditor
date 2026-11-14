// One choice from a list, wherever the app used a native <select>: Radix supplies the list, its keyboard and its
// typeahead (see `components/ui/select.tsx`), and this wraps the two shapes the app feeds it — flat options, or
// groups of them under a heading — and the empty value that stands for "no choice".
//
// A list too long to read at a glance (the nations, the competitions, the cities of a save) opens as a search
// instead: a Popover over the same choices, with a box at its head that narrows them as the app's own searches do
// (folded, so "turkiye" finds "Türkiye"), the arrows moving through the list, Enter picking, Escape closing. Radix's
// Select cannot hold a box — its items take the focus, and its typeahead only jumps to a prefix; this path renders
// its own listbox, skinned by `selects.css` as the Select's list is.

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { fold } from "./format";
import { pickerText } from "./labels";
import { cn } from "./lib/utils";

/**
 * What an option of no choice is worth to Radix: an item's value may not be "", so the empty choice carries this,
 * and `onChange` turns it back into "".
 */
const NONE = "__none__";

/** From how many choices a list is opened as a search: a dozen or so fit in a glance, and a box over them is a step. */
const SEARCH_FROM = 12;

export interface SelectOption {
  /** The value the app holds; "" for no choice. */
  value: string;
  label: string;
  /** A code the game may hold but the app does not offer: still listed, so the current one shows. */
  disabled?: boolean;
}

export interface SelectOptionGroup {
  /** The heading over the group, where the app grouped its options (a native `optgroup`). */
  label?: string;
  options: readonly SelectOption[];
}

interface SelectFieldProps {
  /** The value picked; "" when none is. */
  value: string;
  /** The choices. Give `groups` instead to head some of them. */
  options?: readonly SelectOption[];
  groups?: readonly SelectOptionGroup[];
  onChange: (value: string) => void;
  /** The name of the control, where no <label> names it. */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  /** Whether it holds a value that cannot be applied (a profile's edit). */
  invalid?: boolean;
  /** The field it changes, for focus that goes back to it (a profile's edit). */
  field?: string;
  /** The trigger's class: the app's own skins (`.edit-input`, `.move-input`) apply to it as they did to a select. */
  className?: string;
  /** The trigger itself, for a caller that moves focus to it (see `SavedFilterControls`). */
  triggerRef?: Ref<HTMLButtonElement>;
  /**
   * Whether the list opens as a search. By default a list of `SEARCH_FROM` choices or more does, and a shorter one
   * does not; a caller that knows better — a list that is long but has no names to search — says so.
   */
  searchable?: boolean;
}

/** A choice of the list, and the heading of the group it came from. */
interface Row {
  option: SelectOption;
  group?: string;
}

export function SelectField(props: SelectFieldProps) {
  const count = props.groups
    ? props.groups.reduce((total, group) => total + group.options.length, 0)
    : (props.options?.length ?? 0);
  return (props.searchable ?? count >= SEARCH_FROM) ? <SearchField {...props} /> : <PlainField {...props} />;
}

/** The list Radix Select opens: short enough to read, so it needs no box over it. */
function PlainField({
  value,
  options,
  groups,
  onChange,
  label,
  labelledBy,
  disabled,
  id,
  title,
  invalid,
  field,
  className,
  triggerRef,
}: SelectFieldProps) {
  const all = groups ? groups.flatMap((group) => group.options) : (options ?? []);
  // Radix shows the placeholder only for no value at all: it is the empty option that stands for no choice here.
  const hasNone = all.some((option) => option.value === "");
  const shown = value === "" ? (hasNone ? NONE : undefined) : value;
  // A value the list does not offer (a code the game holds and the app has stopped listing) still has to read out.
  const unknown = value !== "" && !all.some((option) => option.value === value);
  const item = (option: SelectOption) => (
    <SelectItem key={option.value} value={option.value === "" ? NONE : option.value} disabled={option.disabled}>
      {option.label}
    </SelectItem>
  );

  return (
    <Select value={shown} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled}>
      <SelectTrigger
        ref={triggerRef}
        id={id}
        className={cn("picker", className)}
        title={title}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
        data-field={field}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups
          ? groups.map((group, index) =>
              group.label ? (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map(item)}
                </SelectGroup>
              ) : (
                // A group with no heading is the choices before any of them are grouped: no group to announce.
                <Fragment key={index}>{group.options.map(item)}</Fragment>
              ),
            )
          : (options ?? []).map(item)}
        {unknown && <SelectItem value={value}>{value}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

/** The choice `step` away from `index` that can be picked, round the list: a disabled one is stepped over. */
function reachable(rows: readonly Row[], index: number, step: 1 | -1): number {
  let at = index;
  for (let moved = 0; moved < rows.length; moved++) {
    at = (at + step + rows.length) % rows.length;
    if (!rows[at].option.disabled) {
      return at;
    }
  }
  return index;
}

/** The list of a long search: a box at its head that narrows the choices, and the keys that move through them. */
function SearchField({
  value,
  options,
  groups,
  onChange,
  label,
  labelledBy,
  disabled,
  id,
  title,
  invalid,
  field,
  className,
  triggerRef,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const base = useId();
  const optionId = (index: number) => `${base}-choice-${index}`;

  const all = useMemo(
    () => (groups ? groups.flatMap((group) => group.options) : (options ?? [])),
    [groups, options],
  );

  // Every choice on offer, under the heading of its group; the value the app holds but the list lacks is one more,
  // at the end, so that a code picked earlier can be found again.
  const rows = useMemo<Row[]>(() => {
    const rows: Row[] = groups
      ? groups.flatMap((group) => group.options.map((option) => ({ option, group: group.label })))
      : (options ?? []).map((option) => ({ option }));
    return value !== "" && !all.some((option) => option.value === value)
      ? [...rows, { option: { value, label: value } }]
      : rows;
  }, [all, groups, options, value]);

  // What each choice is searched by, folded once: a save offers thousands of cities, and each key would fold them all.
  const names = useMemo(() => rows.map((row) => fold(row.option.label)), [rows]);
  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return words.length === 0
      ? rows
      : rows.filter((_, index) => words.every((word) => names[index].includes(word)));
  }, [names, query, rows]);

  const picked = all.find((option) => option.value === value);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  // Opening puts the highlight on the choice in hand, so that a list of hundreds opens where the app is; typing puts
  // it on the first choice the search leaves.
  useEffect(() => {
    if (!open) {
      return;
    }
    const inHand = query === "" ? shown.findIndex((row) => row.option.value === value) : -1;
    const first = shown.findIndex((row) => !row.option.disabled);
    const next = inHand >= 0 ? inHand : first;
    setActive(next >= 0 ? next : 0);
    // Only the opening of the list and the text of the search move the highlight: `shown` and `value` follow those.
  }, [open, query]);

  useEffect(() => {
    if (open) {
      list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active, open]);

  const pick = (option: SelectOption) => {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    close();
  };

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows move through the choices, not the caret.
      event.preventDefault();
      if (shown.length > 0) {
        setActive((index) => reachable(shown, index, event.key === "ArrowDown" ? 1 : -1));
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = shown[active];
      if (row) {
        pick(row.option);
      }
    } else if (event.key === "Escape") {
      // Only the list goes: the dialog around it stays, as it does with the app's other searches (see `useModal`).
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      // Tab leaves the list, and the list goes with it, as a native one does.
      close();
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild aria-haspopup="listbox">
        <button
          ref={triggerRef}
          type="button"
          id={id}
          className={cn("picker flex w-fit items-center justify-between gap-2 whitespace-nowrap", className)}
          title={title}
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || undefined}
          data-field={field}
          // The slot keeps the app's legacy rules for a plain button off it (see `button:not([data-slot])` in App.css).
          data-slot="picker-trigger"
          disabled={disabled}
        >
          <span className="picker-value">{picked ? picked.label : value}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 8 5 5 5-5" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="picker-popover"
        onOpenAutoFocus={(event) => {
          // The search is what the list opened for: the caret goes to its box, not to the first choice.
          event.preventDefault();
          box.current?.focus();
        }}
      >
        <label className="picker-search">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4.5 4.5" />
          </svg>
          <input
            ref={box}
            role="combobox"
            aria-label={pickerText.search}
            aria-autocomplete="list"
            aria-expanded={shown.length > 0}
            aria-controls={`${base}-list`}
            aria-activedescendant={shown.length > 0 ? optionId(active) : undefined}
            value={query}
            placeholder={pickerText.search}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={keys}
          />
        </label>
        <ul
          ref={list}
          id={`${base}-list`}
          className="picker-list"
          role="listbox"
          aria-label={label ?? pickerText.search}
        >
          {shown.length === 0 && (
            <li className="picker-empty" role="presentation">
              {pickerText.empty(query)}
            </li>
          )}
          {shown.map((row, index) => (
            <Fragment key={row.option.value}>
              {row.group !== undefined && row.group !== shown[index - 1]?.group && (
                <li className="picker-group" role="presentation">
                  {row.group}
                </li>
              )}
              <li
                id={optionId(index)}
                className="picker-option"
                role="option"
                data-index={index}
                aria-selected={row.option.value === value}
                aria-disabled={row.option.disabled || undefined}
                data-active={index === active || undefined}
                data-current={row.option.value === value || undefined}
                // The caret stays in the search box while the pointer picks, as in the app's other searches.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(row.option)}
              >
                <span className="picker-tick" aria-hidden="true">
                  {row.option.value === value && (
                    <svg viewBox="0 0 20 20">
                      <path d="m4 10 4 4 8-9" />
                    </svg>
                  )}
                </span>
                <span className="picker-label">{row.option.label}</span>
              </li>
            </Fragment>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
