// "Youth intake": the players the game made at the club's youth intakes who are still there (the ones out on loan
// included), by the day they joined it, the newest first. Any of them is edited in place (date of birth, nationality,
// city of birth, current and potential ability) or opened in his profile for the rest. Another club's intakes can be
// looked at too, and edited alike.

import { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ClubSearch } from "./ClubSearch";
import { applyEdits, isoFromNumber, numberFromIso, readValues } from "./editing";
import { birthCityList, fieldTable, nationList } from "./fieldTables";
import { describeError, formatDate, formatNumber } from "./format";
import { InfoTip } from "./InfoTip";
import { editText, fieldLabel, positionLabel, scoutingText, teamLabel } from "./labels";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { youthIntakes } from "./scoutApi";
import { PlayerName } from "./ScoutParts";
import { EditorContext } from "./useProfileEditing";
import type {
  City,
  EditField,
  FieldEdit,
  FieldValues,
  FmDate,
  Intake,
  IntakePlayer,
  Nation,
  PlayerSummary,
  YouthIntakes,
} from "./types";

const text = scoutingText.youth;

/** The kind of contract the game gives an intake's players at first. */
const YOUTH_CONTRACT = 3;

/** An intake's key: its day as a number, 0 for a day nothing says. */
const intakeKey = (joined: FmDate | null) =>
  joined === null ? 0 : joined.year * 10_000 + joined.month * 100 + joined.day;

/** The club looked at: null for the user's own. */
type Shown = { uid: number; name: string } | null;

interface ScoutYouthProps {
  version: number;
  hidden: boolean;
  onOpen: (player: PlayerSummary) => void;
}

export function ScoutYouth({ version, hidden, onOpen }: ScoutYouthProps) {
  const [club, setClub] = useState<Shown>(null);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<YouthIntakes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const seq = useRef(0);
  useEffect(() => {
    if (hidden) {
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    youthIntakes(club?.uid ?? null).then(
      (read) => {
        if (mine === seq.current) {
          setResult(read);
          setError(null);
          setLoading(false);
        }
      },
      (e) => {
        if (mine === seq.current) {
          setError(describeError(e));
          setLoading(false);
        }
      },
    );
  }, [club, version, hidden]);

  // Another club starts at its newest intake, with nothing being edited.
  useEffect(() => {
    setResult(null);
    setChosen(null);
    setEditing(null);
    setStatus(null);
  }, [club]);

  const intakes = result?.intakes ?? [];
  const intake: Intake | undefined = intakes.find((i) => intakeKey(i.joined) === chosen) ?? intakes[0];
  const clubName = result?.club ?? club?.name ?? "";
  const clubUid = result?.clubUid ?? club?.uid ?? null;

  return (
    <div className="scout-youth" hidden={hidden}>
      <div className="scout-youth-head">
        {clubUid !== null && (
          <span className="scout-youth-club">
            <WithPicture picture={<ClubLogo uid={clubUid} name={clubName} size={PICTURE_SIZE.clubRowLogo} />}>
              <span className="name-text">{clubName}</span>
            </WithPicture>
          </span>
        )}
        <div className="scout-youth-tools">
          {club !== null && (
            <button type="button" className="link-button" onClick={() => setClub(null)}>
              {text.mine}
            </button>
          )}
          {!picking && (
            <button type="button" onClick={() => setPicking(true)}>
              {text.otherClub}
            </button>
          )}
        </div>
      </div>
      {picking && (
        <div className="scout-youth-search">
          <ClubSearch
            label={text.searchLabel}
            onPick={(picked) => {
              setPicking(false);
              setClub({ uid: picked.uid, name: picked.name });
            }}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}

      <div className="scout-youth-intro">
        <p className="scout-intro">{text.intro}</p>
        <span className="scout-how">
          <InfoTip label={text.how.label} note={text.how.note} />
        </span>
      </div>
      {result !== null && !result.marked && <p className="scout-note">{text.unmarked}</p>}
      {error && <div className="banner scout-banner">{text.failed(error)}</div>}
      {result === null && loading && <p className="empty">{text.loading}</p>}

      {result !== null && intakes.length === 0 && (
        <div className="scout-youth-empty">
          <p>{text.empty(result.club)}</p>
          <p className="muted">{text.emptyHint}</p>
        </div>
      )}

      {intakes.length > 0 && (
        <div className="scout-youth-days" role="group" aria-label={text.intakesLabel}>
          {intakes.map((i) => {
            const key = intakeKey(i.joined);
            return (
              <button
                key={key}
                type="button"
                className="scout-youth-day"
                aria-pressed={i === intake}
                onClick={() => {
                  setChosen(key);
                  setEditing(null);
                }}
              >
                <span>{i.joined === null ? text.noDay : formatDate(i.joined)}</span>
                <span className="scout-youth-day-count">{formatNumber(i.players.length)}</span>
              </button>
            );
          })}
        </div>
      )}

      {intake !== undefined && (
        <>
          <IntakeSummary intake={intake} />
          {status && (
            <p className="scout-youth-status" role="status">
              {status}
            </p>
          )}
          <IntakeTable
            intake={intake}
            editing={editing}
            onEdit={(uid) => {
              setEditing((old) => (old === uid ? null : uid));
              setStatus(null);
            }}
            onSaved={(note) => {
              setEditing(null);
              setStatus(note);
            }}
            onClose={() => setEditing(null)}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  );
}

/** How many players the intake holds, their average potential and the best of them. */
function IntakeSummary({ intake }: { intake: Intake }) {
  const players = intake.players;
  const average = players.reduce((sum, p) => sum + Math.max(0, p.player.potentialAbility), 0) / players.length;
  const best = players[0];
  const lent = players.filter((p) => p.onLoanAt !== null).length;
  return (
    <p className="scout-youth-summary">
      {text.summary(
        players.length,
        formatNumber(average, { maximumFractionDigits: 0 }),
        `${best.player.name} (${best.player.potentialAbility})`,
      )}
      {lent > 0 && ` · ${text.lent(lent)}`}
    </p>
  );
}

interface IntakeTableProps {
  intake: Intake;
  editing: number | null;
  onEdit: (uid: number) => void;
  onSaved: (note: string) => void;
  onClose: () => void;
  onOpen: (player: PlayerSummary) => void;
}

function IntakeTable({ intake, editing, onEdit, onSaved, onClose, onOpen }: IntakeTableProps) {
  const { editable, readOnlyNote } = useContext(EditorContext);
  const columns = 8;
  return (
    <table className="grid scout-grid scout-youth-grid">
      <thead>
        <tr>
          <th className="col-name">{text.columns.player}</th>
          <th>{text.columns.position}</th>
          <th>{text.columns.born}</th>
          <th>{text.columns.nation}</th>
          <th>{text.columns.city}</th>
          <th className="num">{text.columns.ca}</th>
          <th className="num">{text.columns.pa}</th>
          <th className="scout-col-actions">
            <span className="sr-only">{text.columns.actions}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {intake.players.map((item) => {
          const p = item.player;
          const open = editing === p.uid;
          return (
            <Fragment key={p.uid}>
              <tr className={open ? "scout-youth-open" : undefined}>
                <td className="col-name">
                  <PlayerName player={p} onOpen={onOpen} sub={<PlayerLine item={item} />} />
                </td>
                <td className="scout-youth-positions">
                  {p.positions
                    .slice(0, 3)
                    .map((key) => positionLabel(key))
                    .join(" ") || scoutingText.none}
                </td>
                <td>
                  <span>{p.dateOfBirth ? formatDate(p.dateOfBirth) : scoutingText.none}</span>
                  <span className="sub">
                    {[p.age === null ? null : text.age(p.age), item.joinedAge === null ? null : text.joinedAt(item.joinedAge)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td>
                  {p.nation ? (
                    <WithPicture picture={<NationFlag uid={p.nationUid} />}>
                      <span className="name-text">{p.nation}</span>
                    </WithPicture>
                  ) : (
                    scoutingText.none
                  )}
                </td>
                <td>{item.city?.name ?? <span className="muted">{scoutingText.none}</span>}</td>
                <td className="num scout-ca">{p.currentAbility}</td>
                <td className="num scout-youth-pa">{p.potentialAbility}</td>
                <td className="scout-col-actions">
                  <button
                    type="button"
                    className="icon-button scout-youth-edit"
                    aria-expanded={open}
                    aria-label={text.edit(p.name)}
                    title={editable ? text.edit(p.name) : readOnlyNote}
                    disabled={!editable}
                    onClick={() => onEdit(p.uid)}
                  >
                    <PencilIcon />
                  </button>
                </td>
              </tr>
              {open && (
                <tr className="scout-youth-editor-row">
                  <td colSpan={columns}>
                    <YouthEditor item={item} onSaved={onSaved} onClose={onClose} onOpen={onOpen} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Under the name: the team that lists him, a youth contract, and where he is on loan. */
function PlayerLine({ item }: { item: IntakePlayer }) {
  const parts = [
    item.team ? teamLabel(item.team) : null,
    item.contractType === YOUTH_CONTRACT ? text.youthContract : null,
    item.onLoanAt ? text.onLoan(item.onLoanAt) : null,
  ].filter((part): part is string => part !== null);
  return <span className="muted">{parts.join(" · ")}</span>;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M12.5 4.5l3 3M4 16l1-4 8.5-8.5 3 3L8 15z" />
    </svg>
  );
}

/** The fields edited in place, in the order they are shown. */
const KEYS = ["date_of_birth", "nation", "city_of_birth", "current_ability", "potential_ability"] as const;
type Key = (typeof KEYS)[number];

interface Loaded {
  values: FieldValues;
  fields: Map<string, EditField>;
  nations: Nation[];
  cities: City[];
}

/** The inputs of one player of an intake: his values as the game holds them now, written with Save. */
function YouthEditor({
  item,
  onSaved,
  onClose,
  onOpen,
}: {
  item: IntakePlayer;
  onSaved: (note: string) => void;
  onClose: () => void;
  onOpen: (player: PlayerSummary) => void;
}) {
  const { onEdited } = useContext(EditorContext);
  const player = item.player;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Partial<Record<Key, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([readValues("player", player.uid), fieldTable("player"), nationList(), birthCityList()]).then(
      ([values, table, nations, cities]) => {
        if (live) {
          setLoaded({ values, fields: new Map(table.map((field) => [field.key, field])), nations, cities });
        }
      },
      (e) => live && setLoadError(describeError(e)),
    );
    return () => {
      live = false;
    };
  }, [player.uid]);

  /** The text an input shows: what was typed, else the value the game holds. */
  const shown = (key: Key): string => {
    const typedText = typed[key];
    if (typedText !== undefined) {
      return typedText;
    }
    const stored = loaded?.values[key];
    if (stored === undefined) {
      return "";
    }
    return key === "date_of_birth" ? isoFromNumber(stored) : String(stored);
  };
  const type = (key: Key, value: string) => {
    setTyped((old) => ({ ...old, [key]: value }));
    setNotes([]);
  };
  const has = (key: Key) => loaded !== null && loaded.values[key] !== undefined && loaded.fields.has(key);

  // The cities of the nation picked, and the one he was born in when it is not among them.
  const nationAddress = Number(shown("nation"));
  const nationUid = loaded?.nations.find((n) => n.address === nationAddress)?.uid ?? null;
  const cityAddress = Number(shown("city_of_birth"));
  const cities = useMemo(() => {
    if (loaded === null) {
      return [];
    }
    const own = loaded.cities.filter((city) => city.nationUid !== null && city.nationUid === nationUid);
    const current = loaded.cities.find((city) => city.address === cityAddress);
    return current && !own.includes(current) ? [current, ...own] : own;
  }, [loaded, nationUid, cityAddress]);
  const currentCityKnown = loaded !== null && loaded.cities.some((city) => city.address === cityAddress);

  const save = async () => {
    if (loaded === null) {
      return;
    }
    const edits: FieldEdit[] = [];
    const wrong: string[] = [];
    for (const key of KEYS) {
      const field = loaded.fields.get(key);
      const stored = loaded.values[key];
      const typedText = typed[key];
      if (field === undefined || stored === undefined || typedText === undefined) {
        continue;
      }
      const value = key === "date_of_birth" ? numberFromIso(typedText) : Number(typedText);
      const fits =
        value !== null &&
        Number.isInteger(value) &&
        (field.kind === "pointer" ? value > 0 : value >= field.min && value <= field.max);
      if (!fits) {
        wrong.push(text.editor.invalid(fieldLabel("player", key)));
      } else if (value !== stored) {
        edits.push({ field: key, value });
      }
    }
    if (wrong.length > 0) {
      setNotes(wrong);
      return;
    }
    if (edits.length === 0) {
      setNotes([text.editor.nothing]);
      return;
    }
    setBusy(true);
    setNotes([]);
    try {
      const report = await applyEdits("player", player.uid, edits);
      if (report.applied.length > 0) {
        onEdited();
      }
      if (report.failed.length === 0) {
        onSaved(text.editor.saved(report.applied.length));
        return;
      }
      setNotes(report.failed.map((f) => text.editor.failed(fieldLabel("player", f.field), describeError(f.error))));
    } catch (e) {
      setNotes([describeError(e)]);
    } finally {
      setBusy(false);
    }
  };

  const field = (key: Key) => loaded?.fields.get(key);
  const dateField = field("date_of_birth");
  const number = (key: "current_ability" | "potential_ability", label: string) => {
    const f = field(key);
    return (
      <label className="scout-field scout-youth-number">
        <span>{label}</span>
        <input
          type="number"
          inputMode="numeric"
          min={f?.min}
          max={f?.max}
          step={1}
          value={shown(key)}
          disabled={busy || !has(key)}
          onChange={(e) => type(key, e.currentTarget.value)}
        />
      </label>
    );
  };

  return (
    <form
      className="scout-youth-editor"
      aria-label={text.editor.label(player.name)}
      aria-busy={loaded === null || busy || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {loadError && <div className="banner">{loadError}</div>}
      {loaded === null && !loadError && <p className="muted">{text.editor.reading}</p>}
      {loaded !== null && (
        <div className="scout-youth-fields">
          <label className="scout-field scout-youth-date">
            <span>{text.editor.dateOfBirth}</span>
            <input
              type="date"
              value={shown("date_of_birth")}
              min={dateField ? isoFromNumber(dateField.min) : undefined}
              max={dateField ? isoFromNumber(dateField.max) : undefined}
              disabled={busy || !has("date_of_birth")}
              onChange={(e) => type("date_of_birth", e.currentTarget.value)}
            />
          </label>
          <label className="scout-field scout-youth-nation">
            <span>{text.editor.nation}</span>
            <select
              value={shown("nation")}
              disabled={busy || !has("nation")}
              onChange={(e) => type("nation", e.currentTarget.value)}
            >
              {!loaded.nations.some((n) => n.address === nationAddress) && (
                <option value={shown("nation")}>{editText.unknownNation}</option>
              )}
              {loaded.nations.map((nation) => (
                <option key={nation.address} value={nation.address}>
                  {nation.name}
                </option>
              ))}
            </select>
          </label>
          <label className="scout-field scout-youth-city" title={text.editor.cityHint}>
            <span>{text.editor.city}</span>
            {has("city_of_birth") && cityAddress > 0 ? (
              <select
                value={shown("city_of_birth")}
                disabled={busy}
                onChange={(e) => type("city_of_birth", e.currentTarget.value)}
              >
                {!currentCityKnown && <option value={shown("city_of_birth")}>{editText.unknownCity}</option>}
                {cities.map((city) => (
                  <option key={city.address} value={city.address}>
                    {city.name}
                  </option>
                ))}
              </select>
            ) : (
              <select disabled value="">
                <option value="">{text.editor.noCity}</option>
              </select>
            )}
          </label>
          {number("current_ability", text.editor.ca)}
          {number("potential_ability", text.editor.pa)}
          <div className="scout-youth-buttons">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? text.editor.saving : text.editor.save}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              {text.editor.cancel}
            </button>
            <button
              type="button"
              className="link-button"
              title={text.editor.profileTitle}
              aria-haspopup="dialog"
              onClick={() => onOpen(player)}
            >
              {text.editor.profile}
            </button>
          </div>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="scout-youth-notes" role="alert">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
