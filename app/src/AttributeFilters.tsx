import { useEffect, useId, useRef, useState } from "react";
import { ATTRIBUTE_LABELS, playerListText, profileText, STAFF_ATTRIBUTE_LABELS } from "./labels";
import { FEET, GOALKEEPING, HIDDEN, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { isRecord } from "./restore";
import { SelectField } from "./SelectField";
import type { AttributeBound } from "./types";

const text = playerListText.filters;

/** A bound on an attribute as its inputs hold it: the attribute's key ("" until one is picked) and both ends, as typed. */
export interface AttributeRow {
  key: string;
  min: string;
  max: string;
}

/** The attributes the select of a row offers, group by group, and their names. */
export interface AttributeChoices {
  groups: readonly { label: string; keys: readonly string[] }[];
  labels: Readonly<Record<string, string>>;
}

/** A player's attributes as the profile groups them; first touch and passing only once, under Technical. */
export const PLAYER_ATTRIBUTES: AttributeChoices = {
  groups: [
    { label: profileText.technical, keys: TECHNICAL },
    { label: profileText.mental, keys: MENTAL },
    { label: profileText.physical, keys: PHYSICAL },
    { label: profileText.goalkeeping, keys: GOALKEEPING.filter((key) => !TECHNICAL.includes(key)) },
    { label: profileText.hidden, keys: HIDDEN },
    { label: profileText.feet, keys: FEET },
  ],
  labels: ATTRIBUTE_LABELS,
};

/** A member of staff's attributes as the profile groups them. */
export const STAFF_ATTRIBUTES: AttributeChoices = {
  groups: [
    {
      label: profileText.coaching,
      keys: [
        "attacking", "defending", "fitness", "goalkeeping", "possession", "set_pieces", "tactical", "technical",
        "working_with_youngsters",
      ],
    },
    { label: profileText.mental, keys: ["authority", "determination", "motivating", "people_management"] },
    {
      label: profileText.knowledge,
      keys: [
        "data_analysis", "judging_ability", "judging_potential", "judging_staff", "negotiating", "tactical_knowledge",
      ],
    },
    { label: profileText.medical, keys: ["physiotherapy", "sports_science"] },
  ],
  labels: STAFF_ATTRIBUTE_LABELS,
};

/** Attributes run from 1 to 20 as FM shows them. */
const SCALE = { min: 1, max: 20 };

/** The most rows a filter keeps, however a stored value got there. */
const MAX_ROWS = 20;

/** An end of a bound: a whole number within 1–20; nothing for an empty or unreadable input. */
function end(input: string): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(SCALE.max, Math.max(SCALE.min, Math.round(value))) : undefined;
}

/** The bounds the rows ask for: a row counts once it has an attribute and at least one end. */
export function toAttributeBounds(rows: readonly AttributeRow[]): AttributeBound[] | undefined {
  const bounds = rows.flatMap((row): AttributeBound[] => {
    const min = end(row.min);
    const max = end(row.max);
    return row.key !== "" && (min !== undefined || max !== undefined) ? [{ key: row.key, min, max }] : [];
  });
  return bounds.length > 0 ? bounds : undefined;
}

/**
 * The rows in a stored value (a saved filter, or the bar before the language was switched): rows that are not rows are
 * left out, and an attribute `choices` do not offer becomes no attribute.
 */
export function readAttributeRows(value: unknown, choices: AttributeChoices): AttributeRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const keys = new Set(choices.groups.flatMap((group) => group.keys));
  const number = (part: unknown) => (typeof part === "string" && part.length <= 3 && end(part) !== undefined ? part : "");
  return value
    .filter(isRecord)
    .slice(0, MAX_ROWS)
    .map((row) => ({
      key: typeof row.key === "string" && keys.has(row.key) ? row.key : "",
      min: number(row.min),
      max: number(row.max),
    }));
}

interface AttributeFiltersProps {
  rows: readonly AttributeRow[];
  choices: AttributeChoices;
  onChange: (rows: AttributeRow[]) => void;
}

/**
 * Bounds on attributes, across the filter panel: a row each, with the attribute, the least and the most it may be, and
 * a button that takes the row away; then a button for one more row.
 */
export function AttributeFilters({ rows, choices, onChange }: AttributeFiltersProps) {
  const heading = useId();
  // A row the button just added gets keyboard focus; rows that come back with the panel do not take it.
  const [added, setAdded] = useState(false);
  const addedSelect = useRef<HTMLButtonElement>(null);
  const set = (index: number, row: AttributeRow) => onChange(rows.map((old, i) => (i === index ? row : old)));
  const name = (key: string) => choices.labels[key] ?? key;

  // The focus is moved once the row is on screen: the trigger only exists after the render the flag asked for.
  useEffect(() => {
    if (added) {
      addedSelect.current?.focus();
      setAdded(false);
    }
  }, [added]);

  return (
    <div className="filter-attributes" role="group" aria-labelledby={heading}>
      <span id={heading}>{text.attributes.heading}</span>
      {rows.map((row, index) => (
        <div key={index} className="attribute-bound">
          <SelectField
            label={text.attributes.attribute}
            triggerRef={index === rows.length - 1 ? addedSelect : undefined}
            value={row.key}
            groups={[
              { options: [{ value: "", label: text.attributes.pick }] },
              ...choices.groups.map((group) => ({
                label: group.label,
                options: group.keys.map((key) => ({ value: key, label: name(key) })),
              })),
            ]}
            onChange={(key) => set(index, { ...row, key })}
          />
          <input
            type="number"
            min={SCALE.min}
            max={SCALE.max}
            step={1}
            placeholder={text.minPlaceholder}
            aria-label={text.attributes.min(name(row.key))}
            value={row.min}
            onChange={(e) => set(index, { ...row, min: e.currentTarget.value })}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            min={SCALE.min}
            max={SCALE.max}
            step={1}
            placeholder={text.maxPlaceholder}
            aria-label={text.attributes.max(name(row.key))}
            value={row.max}
            onChange={(e) => set(index, { ...row, max: e.currentTarget.value })}
          />
          <button
            type="button"
            className="bound-remove"
            aria-label={text.attributes.remove(row.key === "" ? "" : name(row.key))}
            title={text.attributes.remove(row.key === "" ? "" : name(row.key))}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      {rows.length < MAX_ROWS && (
        <button
          type="button"
          className="bound-add"
          onClick={() => {
            setAdded(true);
            onChange([...rows, { key: "", min: "", max: "" }]);
          }}
        >
          {text.attributes.add}
        </button>
      )}
    </div>
  );
}
