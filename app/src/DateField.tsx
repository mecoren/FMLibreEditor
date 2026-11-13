// A date, as shadcn's Date Picker: a button that shows it and a calendar under it to pick another. The app used to
// leave the calendar to the browser (`<input type="date">`); this one is drawn in the almanac's ink, and the button
// takes the skin of the input it replaces — `.edit-input` in a profile, `.move-input` in a dialog, `.mass-input` in a
// mass edit, `.picker` in a filter (see `dates.css`).
//
// Keyboard, as the date input was: Tab reaches the button, Enter or Space opens the calendar, the arrows move through
// the days (Page Up and Page Down through the months), Enter picks the day, and Escape closes the calendar and puts
// the focus back on the button.

import { useState } from "react";
import { Button } from "./components/ui/button";
import { Calendar } from "./components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { formatDate } from "./format";
import { cn } from "./lib/utils";

/** A date as the app holds it: `YYYY-MM-DD`, as a date input did; "" for none. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The day a `YYYY-MM-DD` names, at noon so that no change of the clock in any time zone moves it to another day;
 * null for nothing, or for a day the month does not have.
 */
function toDay(iso: string | undefined): Date | null {
  const match = iso === undefined ? null : ISO_DATE.exec(iso);
  if (match === null) {
    return null;
  }
  const month = Number(match[2]) - 1;
  const day = new Date(Number(match[1]), month, Number(match[3]), 12);
  return day.getMonth() === month ? day : null;
}

/** The `YYYY-MM-DD` of a day. */
function toIso(day: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(day.getFullYear(), 4)}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The day as the app writes dates ("26 Sep 1990", in the language of the window). */
function dayText(day: Date): string {
  return formatDate({ year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() });
}

/**
 * The last month a calendar with no bound of its own offers: twenty years after today. Left to itself, the calendar
 * stops at the end of this year — too soon for a contract end.
 */
function lastMonth(): Date {
  return new Date(new Date().getFullYear() + 20, 11, 31);
}

/** The small calendar of the button, drawn as the app draws its own icons: a thin stroke, no fill. */
function CalendarMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" />
      <path d="M3 8.5h14M6.5 3v3M13.5 3v3" />
    </svg>
  );
}

interface DateFieldProps {
  /** The date it holds: `YYYY-MM-DD`, or "" for none. */
  value: string;
  /** Takes the `YYYY-MM-DD` of the day picked, or "" from the button that clears it. */
  onChange: (value: string) => void;
  /** The least and the most it takes, as `YYYY-MM-DD`: the days outside them cannot be picked. */
  min?: string;
  max?: string;
  /** The name of the control, where no <label> names it. */
  label?: string;
  /** What it reads as while it holds no date: "any" in a filter, "none" in a profile. */
  placeholder?: string;
  /** The name of the button that clears the date, where the field may be left empty; no button without it. */
  clearLabel?: string;
  /** Whether it holds a date that cannot be applied (a profile's edit). */
  invalid?: boolean;
  disabled?: boolean;
  /** The field it changes, for focus that goes back to it (a profile's edit). */
  field?: string;
  /** The id of the button, for the `<label htmlFor>` beside it. */
  id?: string;
  title?: string;
  /** The note under it, e.g. why the date cannot be sent (a move's terms). */
  describedBy?: string;
  /** The app's own skin for the button (`.edit-input`, `.move-input`, `.mass-input`, `.picker`). */
  className?: string;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  placeholder,
  clearLabel,
  invalid,
  disabled,
  field,
  id,
  title,
  describedBy,
  className,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = toDay(value);
  const first = toDay(min);
  const last = toDay(max);
  // The days the calendar greys out: those outside the range the field takes.
  const outside = [...(first === null ? [] : [{ before: first }]), ...(last === null ? [] : [{ after: last }])];

  const pick = (day: Date) => {
    onChange(toIso(day));
    // The calendar would cover the value just picked: it closes, and the focus goes back to the button.
    setOpen(false);
  };
  // What the button says: the day as the app writes it, or what no date reads as. A screen reader hears the name of
  // the field and the value too, as it heard both of a date input.
  const shown = selected === null ? (placeholder ?? "") : dayText(selected);

  return (
    // A field that cannot be changed (a move on its way) closes the calendar: it would be over its own button.
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={id}
          className={cn("date-field", className)}
          data-field={field}
          data-placeholder={selected === null || undefined}
          aria-label={label === undefined ? undefined : shown === "" ? label : `${label} · ${shown}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          title={title}
        >
          <span className="date-field-text">{shown}</span>
          <CalendarMark />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="date-popover w-auto p-0"
        // The calendar says what it is for, as the button does.
        aria-label={label}
        // The calendar opens on its day, not on the lists of months and years above it: the arrows then move through
        // the days, as they do in the grid of a date input's calendar.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.rdp-day_button[tabindex="0"]')?.focus();
        }}
        // Escape closes the calendar only: the profile behind it, which closes on Escape too, stays open.
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          defaultMonth={selected ?? undefined}
          onSelect={(picked) => {
            // Picking the picked day again takes the pick away; only a day is a date here.
            if (picked !== undefined) {
              pick(picked);
            }
          }}
          disabled={outside.length > 0 ? outside : undefined}
          startMonth={first === null ? undefined : new Date(first.getFullYear(), 0, 1)}
          endMonth={last === null ? lastMonth() : new Date(last.getFullYear(), 11, 31)}
        />
        {clearLabel !== undefined && (
          <div className="date-popover-foot">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="date-clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {clearLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
