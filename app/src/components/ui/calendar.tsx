// shadcn/ui Calendar, adapted to the almanac: react-day-picker's grid and keyboard, the app's type and ink (see
// `dates.css`), inline SVG chevrons (no icon package) and Intl for every word it writes — the months, the weekdays and
// the labels a screen reader hears come out in the language of the window, as the app's dates do (no date-fns).
import * as React from "react";
import { DayPicker, getDefaultClassNames, type DayButton, type DropdownProps } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { intlLocale } from "@/i18n";
import { dateText } from "@/labels";
import { cn } from "@/lib/utils";

const weekdays = new Intl.DateTimeFormat(intlLocale, { weekday: "short" });
const weekdayNames = new Intl.DateTimeFormat(intlLocale, { weekday: "long" });
const dayNames = new Intl.DateTimeFormat(intlLocale, { dateStyle: "full" });
const captionOf = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });
const monthNames = new Intl.DateTimeFormat(intlLocale, { month: "short" });
// The day of the month alone: `Intl` writes it as a date in some languages ("12日" in Chinese), and its own number here.
const dayNumbers = new Intl.NumberFormat(intlLocale);
const years = new Intl.NumberFormat(intlLocale, { useGrouping: false });

/** The calendar's words, as `react-day-picker` asks for them one at a time. */
const LABELS = {
  labelPrevious: () => dateText.previousMonth,
  labelNext: () => dateText.nextMonth,
  labelMonthDropdown: () => dateText.month,
  labelYearDropdown: () => dateText.year,
  labelWeekday: (date: Date) => weekdayNames.format(date),
  labelGrid: (date: Date) => captionOf.format(date),
  labelDayButton: (date: Date, modifiers: { today?: boolean }) =>
    modifiers.today ? dateText.today(dayNames.format(date)) : dayNames.format(date),
};

function Calendar({ className, classNames, components, ...props }: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays
      // A month and a year to pick from: a birth date is fifty years back from today, too far to step to a month at a time.
      captionLayout="dropdown"
      // Every language the app has starts its week on Monday.
      weekStartsOn={1}
      formatters={{
        formatCaption: (date) => captionOf.format(date),
        formatDay: (date) => dayNumbers.format(date.getDate()),
        formatMonthDropdown: (date) => monthNames.format(date),
        formatWeekdayName: (date) => weekdays.format(date),
        formatYearDropdown: (date) => years.format(date.getFullYear()),
      }}
      labels={LABELS}
      className={cn("group/calendar", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", defaults.nav),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaults.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaults.month_caption,
        ),
        dropdowns: cn("flex h-(--cell-size) items-center justify-center gap-1", defaults.dropdowns),
        caption_label: cn(
          "flex h-full items-center gap-1 pr-1 pl-2 text-sm [&>svg]:size-3 [&>svg]:text-muted-foreground",
          defaults.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("flex-1 text-center text-[0.8rem] font-normal text-muted-foreground select-none", defaults.weekday),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("group/day relative aspect-square h-full w-full p-0 text-center select-none", defaults.day),
        today: cn("rounded-md", defaults.today),
        outside: cn("text-muted-foreground", defaults.outside),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClass, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(rootClass)} {...rootProps} />
        ),
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        Dropdown: CalendarDropdown,
        ...components,
      }}
      {...props}
    />
  );
}

/** One of the arrows of the calendar, drawn as the app draws its icons: a thin stroke, no fill (see `dates.css`). */
function CalendarChevron({
  className,
  orientation = "down",
  size = 16,
}: {
  className?: string;
  orientation?: "up" | "down" | "left" | "right";
  size?: number;
}) {
  const paths = {
    up: "m5 12 5-5 5 5",
    down: "m5 8 5 5 5-5",
    left: "m12 5-5 5 5 5",
    right: "m8 5 5 5-5 5",
  } as const;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" className={className}>
      <path d={paths[orientation]} />
    </svg>
  );
}

/**
 * The month and the year of the caption. `react-day-picker` draws them as native `<select>`s, whose open list the
 * system paints — nothing of the page reaches it; they are the app's own list here (a shadcn Select, see `select.tsx`).
 */
function CalendarDropdown({ options, value, onChange, disabled, "aria-label": label }: DropdownProps) {
  return (
    <Select
      value={value === undefined ? undefined : String(value)}
      disabled={disabled}
      onValueChange={(picked) => {
        // `react-day-picker` reads the change of the `<select>` it would have drawn: the value it moves to is the pick.
        onChange?.({ target: { value: picked } } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger
        size="sm"
        // The skin of `dates.css`: the pill the native list sat in.
        className="calendar-pick"
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="calendar-pick-list">
        {options?.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A day of the month: a shadcn button, focused while the arrows move over it. */
function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaults = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-sm"
      // What the skin of `dates.css` paints: the picked day, and the one the calendar is on.
      data-day={day.date.toLocaleDateString(intlLocale)}
      data-selected-single={modifiers.selected || undefined}
      className={cn(
        "flex aspect-square size-auto w-full min-w-(--cell-size) p-0 font-normal",
        defaults.day_button,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
