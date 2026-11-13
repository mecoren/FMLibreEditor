// One choice from a list, wherever the app used a native <select>: Radix supplies the list, its keyboard and its
// typeahead (see `components/ui/select.tsx`), and this wraps the two shapes the app feeds it — flat options, or
// groups of them under a heading — and the empty value that stands for "no choice".

import { Fragment, type Ref } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { cn } from "./lib/utils";

/**
 * What an option of no choice is worth to Radix: an item's value may not be "", so the empty choice carries this,
 * and `onChange` turns it back into "".
 */
const NONE = "__none__";

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
}

export function SelectField({
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
