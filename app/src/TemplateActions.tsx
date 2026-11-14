// Above the attributes of a player while the profile is edited: a template that fills the inputs in, either from a
// preset of a position at 19 or from what the players of the save of the same age, nation and position average.

import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { describeError } from "./format";
import { nationList } from "./fieldTables";
import { InfoTip } from "./InfoTip";
import { positionLabel, templateText } from "./labels";
import { playerTemplate, templatePresets } from "./editing";
import { SelectField } from "./SelectField";
import type { Nation, PlayerDetails, TemplatePreset, TemplateProfile, TemplateQuery } from "./types";
import { useEditSession } from "./useProfileEditing";

/** What the last template came to, under the buttons. */
interface Outcome {
  message: string;
  /** Whether the message is why it did not happen. */
  failed: boolean;
}

/** The age input's range: the presets are written for 19, and the game plays no one outside it. */
const AGE_RANGE = { min: 15, max: 45 };

/** The position a preset of `player` is for: his best, and the preset of a wing-back's or sweeper's side. */
function bestPosition(player: PlayerDetails, offered: readonly string[]): string {
  let best = "";
  let rating = -1;
  for (const [key, value] of Object.entries(player.positionRatings)) {
    if (value > rating) {
      best = key;
      rating = value;
    }
  }
  const key = best === "wbl" ? "dl" : best === "wbr" ? "dr" : best === "sw" ? "dc" : best;
  return offered.includes(key) ? key : offered[0] ?? "st";
}

/** A template's values as the strings an input holds. */
function asText(profile: TemplateProfile): Record<string, string> {
  return Object.fromEntries(Object.entries(profile.values).map(([key, value]) => [key, String(value)]));
}

/** What the template came to: its players' average, or the preset that took its place. */
function outcomeOf(profile: TemplateProfile): Outcome {
  if (profile.source === "sample") {
    return { message: templateText.sampled(profile.sampled), failed: false };
  }
  return { message: profile.sampled > 0 ? templateText.tooFew(profile.sampled) : templateText.presetUsed, failed: false };
}

/**
 * The template panel of a player's edit: a preset per position, and the conditions the players of the save are
 * averaged by. It only fills the inputs in; nothing is written before Apply, and Discard takes it all back.
 */
export function TemplateActions({ details }: { details: PlayerDetails }) {
  const session = useEditSession();
  const [presets, setPresets] = useState<TemplatePreset[] | null>(null);
  const [position, setPosition] = useState("");
  const [nations, setNations] = useState<Nation[]>([]);
  // The conditions are out of the way until they are wanted: a preset is the usual case.
  const [custom, setCustom] = useState(false);
  const [age, setAge] = useState("");
  const [nation, setNation] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The presets are the same all session long: they are read once, and the position starts at his best.
  useEffect(() => {
    templatePresets()
      .then((list) => {
        if (!alive.current) {
          return;
        }
        setPresets(list);
        setPosition((chosen) => chosen || bestPosition(details, list.map((preset) => preset.position)));
      })
      .catch((e) => alive.current && setOutcome({ message: templateText.failed(describeError(e)), failed: true }));
    // The nations of the lists are only needed by the conditions, and fail to nothing when they cannot be read.
    nationList()
      .then((list) => alive.current && setNations(list))
      .catch(() => undefined);
  }, []);

  if (session === null) {
    return null;
  }

  /** Fills the inputs in with `query`, and says where the numbers came from. */
  const fill = async (query: TemplateQuery) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const profile = await playerTemplate(query);
      const changed = session.fill(asText(profile));
      if (alive.current) {
        setOutcome(changed > 0 ? outcomeOf(profile) : { message: templateText.nothingToFill, failed: false });
      }
    } catch (e) {
      if (alive.current) {
        setOutcome({ message: templateText.failed(describeError(e)), failed: true });
      }
    } finally {
      if (alive.current) {
        setBusy(false);
      }
    }
  };

  const preset = presets?.find((entry) => entry.position === position) ?? null;
  const ageNumber = Number(age.trim());
  const ageGiven = age.trim() !== "" && Number.isInteger(ageNumber) && ageNumber >= AGE_RANGE.min && ageNumber <= AGE_RANGE.max;
  // A condition is a way to sample the save; without one the preset of the position is what Generate uses too.
  const generate = () =>
    void fill({
      position,
      age: ageGiven ? ageNumber : undefined,
      nation: nation === "" ? undefined : nation,
      excludeUid: details.uid,
    });

  return (
    <section className="profile-group template-panel" aria-label={templateText.title}>
      <h3>
        {templateText.title}
        <InfoTip label={templateText.title} note={templateText.hint} />
      </h3>
      <div className="template-row">
        <SelectField
          className="template-select"
          value={position}
          disabled={presets === null || busy}
          label={templateText.position}
          options={(presets ?? []).map((entry) => ({
            value: entry.position,
            label: `${positionLabel(entry.position)} · ${templateText.preset(entry.ca, entry.pa)}`,
          }))}
          onChange={(next) => {
            setPosition(next);
            setOutcome(null);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="skin"
          aria-disabled={busy || preset === null || undefined}
          aria-busy={busy || undefined}
          title={templateText.fillTitle}
          onClick={() => preset !== null && void fill({ position, excludeUid: details.uid })}
        >
          {templateText.fill}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="skin"
          aria-expanded={custom}
          onClick={() => {
            setCustom((open) => !open);
            setOutcome(null);
          }}
        >
          {templateText.custom}
        </Button>
      </div>
      {custom ? (
        <div className="template-row">
          <label className="template-field">
            <span>{templateText.age}</span>
            <Input
              type="number"
              className="template-input"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              step={1}
              placeholder={templateText.anyAge}
              value={age}
              readOnly={busy}
              onChange={(e) => {
                setAge(e.currentTarget.value);
                setOutcome(null);
              }}
              // A wheel turned over the focused input would change its value: let go of it, so the panel scrolls.
              onWheel={(e) => e.currentTarget.blur()}
            />
          </label>
          <SelectField
            className="template-select"
            value={nation}
            disabled={busy}
            label={templateText.nation}
            options={[
              { value: "", label: templateText.anyNation },
              ...nations.map((entry) => ({ value: entry.name, label: entry.name })),
            ]}
            onChange={(next) => {
              setNation(next);
              setOutcome(null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="skin"
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            title={templateText.generateTitle}
            onClick={generate}
          >
            {templateText.generate}
          </Button>
        </div>
      ) : (
        <p className="note">{templateText.presetNote}</p>
      )}
      {/* A live region that is always there, so that it is read out when it fills; it takes no room while empty. */}
      <div className="squad-result" role="status">
        {outcome && <p className={outcome.failed ? "error" : undefined}>{outcome.message}</p>}
      </div>
    </section>
  );
}
