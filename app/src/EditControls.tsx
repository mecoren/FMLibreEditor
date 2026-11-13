// What editing draws: the inputs, which take the place of the values they change, the Edit button, and the bar under a
// profile.

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { DateField } from "./DateField";
import { valueText, type Pending } from "./editDraft";
import { isoFromNumber, isStoredFiner } from "./editing";
import { currencySymbol } from "./format";
import { changesText, choiceLabel, editText, fieldLabel, valueChange } from "./labels";
import { SelectField } from "./SelectField";
import { useEditableField, useEditSession, type ProfileEditing, type Report } from "./useProfileEditing";

/**
 * The input of an editable field, showing the value as the game shows it and taking the values it takes: a number
 * input, with the sign of the chosen currency before it for an amount of money and the percent sign after it for a percentage, or a
 * date field (a button showing the date, and a calendar under it, see `DateField`) for a date. A field that holds a
 * code from a list is a select of its choices, and a yes-or-no a checkbox with the name of the field, or with Yes or
 * No `inFact`, where the label beside it names the field. A number that may be left empty says "none" while it is. A
 * changed input is outlined in the accent colour and says what it was; one that cannot be applied is outlined as an
 * error. Nothing while the profile is not being edited.
 */
export function EditInput({ field, inFact = false }: { field: string; inFact?: boolean }) {
  const session = useEditSession();
  const input = session?.input(field);
  if (!session || !input) {
    return null;
  }
  const { field: spec, text, range, status, was, message } = input;
  const label = fieldLabel(session.entity, field);
  const title = [message, status !== "same" && editText.was(valueText(spec, was))].filter(Boolean).join(" · ");
  const outline = status === "same" ? "" : ` ${status}`;
  // What every kind of input carries: whether it holds something that cannot be applied, and its field, which focus
  // goes back to when an Apply refused its value.
  const common = { "aria-invalid": status === "invalid" || undefined, "data-field": field };

  // A yes-or-no is a checkbox in a pill, like the tag that shows it while the profile is read: the pill carries the
  // outline and the name of the field, or in a fact its value, as the fact says it while the profile is read.
  if (spec.kind === "flag") {
    return (
      <label className={`edit-flag${outline}`} title={title || undefined}>
        <input
          type="checkbox"
          checked={text === "1"}
          disabled={session.busy}
          aria-label={inFact ? label : undefined}
          {...common}
          onChange={(e) => session.type(field, e.currentTarget.checked ? "1" : "0")}
        />
        {inFact ? (text === "1" ? editText.yes : editText.no) : label}
      </label>
    );
  }

  if (spec.choices !== null) {
    // A code the game holds that the field does not offer stays on the list as the current one, so that a code picked
    // instead can be put back.
    const codes = spec.choices.includes(was) ? spec.choices : [was, ...spec.choices];
    return (
      <SelectField
        className={`edit-input${outline}`}
        value={text}
        disabled={session.busy}
        label={label}
        title={title || undefined}
        invalid={status === "invalid"}
        field={field}
        options={codes.map((code) => ({ value: String(code), label: choiceLabel(spec.key, code) }))}
        onChange={(next) => session.type(field, next)}
      />
    );
  }

  if (spec.kind === "date") {
    return (
      <DateField
        className={`edit-input${outline}`}
        value={text}
        min={isoFromNumber(range.min)}
        max={isoFromNumber(range.max)}
        disabled={session.busy}
        label={label}
        placeholder={editText.none}
        title={title || undefined}
        invalid={status === "invalid"}
        field={field}
        onChange={(next) => session.type(field, next)}
      />
    );
  }

  // A number that may be left empty is a text input: a number input reads what is no number (a lone minus sign) as
  // empty, which here would stand for "none".
  const clearable = spec.blank !== null;
  // As wide as the longest value it takes, a minus sign included; an input that may be empty has room for its hint.
  const digits = Math.max(String(range.min).length, String(range.max).length, clearable ? editText.none.length : 0);
  const control = (
    <Input
      type={clearable ? "text" : "number"}
      inputMode={clearable ? "numeric" : undefined}
      className={`edit-input${outline}`}
      style={{ "--digits": digits } as CSSProperties}
      min={range.min}
      max={range.max}
      step={1}
      placeholder={clearable ? editText.none : undefined}
      value={text}
      readOnly={session.busy}
      aria-label={label}
      title={title || undefined}
      {...common}
      onChange={(e) => session.type(field, e.currentTarget.value)}
      // A wheel turned over the focused input would change its value: let go of it, so the profile scrolls instead.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
  if (spec.kind === "i32") {
    return (
      <span className="edit-money">
        <span className="edit-unit" aria-hidden="true">
          {currencySymbol}
        </span>
        {control}
      </span>
    );
  }
  if (spec.scale === "percent") {
    return (
      <span className="edit-percent">
        {control}
        <span className="edit-unit" aria-hidden="true">
          {editText.percent}
        </span>
      </span>
    );
  }
  return control;
}

/**
 * `children` while the profile is read, the input of `field` in their place while it is edited. `inFact`: the value of
 * a fact, whose label names the field (see `EditInput`).
 */
export function EditableValue({ field, inFact, children }: { field: string; inFact?: boolean; children: ReactNode }) {
  const editing = useEditableField(field);
  return editing ? <EditInput field={field} inFact={inFact} /> : children;
}

/** The Edit button in the header of a profile. It stays while editing, pressed, and then ends the editing like Done. */
export function EditButton({ editing, ready }: { editing: ProfileEditing; ready: boolean }) {
  if (!editing.editable) {
    return null;
  }
  const active = editing.stage === "edit";
  return (
    <Button
      ref={editing.editButton}
      type="button"
      variant="outline"
      size="sm"
      className="edit-toggle skin"
      aria-pressed={active}
      aria-busy={editing.stage === "loading" || undefined}
      disabled={!ready}
      title={editText.editTitle}
      onClick={active ? editing.done : editing.begin}
    >
      {editText.edit}
    </Button>
  );
}

/**
 * The bar at the foot of a profile: what the last Apply said, and while editing the list of changes and the
 * footer with the buttons. The report is in a live region that is always there, so it is read out when it fills.
 */
export function EditBar({ editing }: { editing: ProfileEditing }) {
  const { stage, changes, invalid, reviewing, confirming, applying, report } = editing;
  const reviewId = useId();
  const keepButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // The question takes the place of the buttons: focus goes to its safe answer, and back to Done once answered.
  useEffect(() => {
    if (confirming) {
      keepButton.current?.focus();
    } else if (wasConfirming.current) {
      doneButton.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!editing.editable) {
    return null;
  }
  const showReview = stage === "edit" && reviewing && changes.length > 0;
  const canApply = changes.length > 0 && invalid === 0 && !applying;

  return (
    <div className="edit-bar">
      <div className="edit-report" role="status" aria-live="polite">
        {report && <ReportText report={report} />}
      </div>
      {report && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="icon-button edit-dismiss"
          aria-label={editText.dismiss}
          title={editText.dismiss}
          onClick={editing.dismissReport}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </Button>
      )}
      {showReview && <ReviewList id={reviewId} changes={changes} />}

      {stage === "edit" && (
        <div className="edit-footer" role="group" aria-label={editText.footer}>
          {confirming ? (
            <>
              <span className="edit-count">{editText.confirmDiscard(changes.length)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="skin"
                ref={keepButton}
                onClick={editing.keepEditing}
              >
                {editText.keepEditing}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="danger skin"
                onClick={editing.confirmDiscard}
              >
                {editText.discard}
              </Button>
            </>
          ) : (
            <>
              <span className={changes.length > 0 ? "edit-count pending" : "edit-count"}>
                {editText.changes(changes.length)}
                {invalid > 0 && <span className="edit-invalid"> · {editText.invalidCount(invalid)}</span>}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="skin"
                aria-expanded={showReview}
                aria-controls={reviewId}
                disabled={changes.length === 0}
                onClick={editing.toggleReview}
              >
                {editText.review}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="skin"
                disabled={changes.length + invalid === 0 || applying}
                onClick={editing.discard}
              >
                {editText.discard}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="primary skin"
                disabled={!canApply}
                title={invalid > 0 ? editText.applyBlocked : undefined}
                onClick={editing.apply}
              >
                {applying ? editText.applying : editText.apply}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="skin"
                ref={doneButton}
                disabled={applying}
                onClick={editing.done}
              >
                {editText.done}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "Applied 3 changes", and the changes the game refused with its reasons. */
function ReportText({ report }: { report: Report }) {
  const { applied, problems } = report;
  return (
    <>
      {(applied > 0 || problems.length === 0) && (
        <p>{applied > 0 ? editText.applied(applied) : editText.nothingToChange}</p>
      )}
      {problems.length > 0 && (
        <ul className="edit-problems">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * What Apply would write, as "Finishing 17 → 20", "Contract end 30 Jun 2029 → 30 Jun 2031", "Balance £1,000 →
 * £2,000" or "Energy 70% → 100%"; the hover text of an attribute or a percentage has the stored values.
 */
function ReviewList({ id, changes }: { id: string; changes: Pending[] }) {
  return (
    <ul id={id} className="edit-review" aria-label={editText.reviewList}>
      {changes.map(({ field, was, now, wasStored, edit }) => (
        <li
          key={field.key}
          title={isStoredFiner(field) ? changesText.stored(valueChange(wasStored, edit.value)) : undefined}
        >
          <span>{fieldLabel(field.entity, field.key)}</span>{" "}
          <span className="edit-delta">{valueChange(valueText(field, was), valueText(field, now))}</span>
        </li>
      ))}
    </ul>
  );
}

