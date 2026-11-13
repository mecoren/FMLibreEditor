// "Compare with your squad": a player the scout found beside the club's best player at his position, and up to two
// more of the same list. The scout's view comes first (fit, probability, money), then the attributes the role leans
// on, each with how far it is from the club's player; the whole profile of each is a click away.

import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ability } from "./Ability";
import { bestColumns, type Column, ComparisonTable } from "./ComparisonDialog";
import { describeError, formatDate, formatMoney, formatPercent } from "./format";
import { ATTRIBUTE_LABELS, type AttributeKey, positionLabel, scoutingText } from "./labels";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { tierClass, type Loaded } from "./ProfileParts";
import { playerDetails } from "./scoutApi";
import {
  type CompareAsk,
  chanceOf,
  familiarity,
  FitBar,
  roleAbbreviation,
  roleName,
  rolesFor,
  type ScoutPick,
  verdictOf,
} from "./ScoutParts";
import type { Fitting, PlayerDetails, PlayerSummary, Role, ScoutPosition } from "./types";
import { useModal } from "./useModal";

const text = scoutingText.compare;

/** The most players the scout found that one comparison holds, beside the club's own. */
const MOST_PICKS = 3;

/** A column: the club's best player at the position, or one the scout found. */
interface CompareColumn {
  player: PlayerSummary;
  fitting: Fitting | null;
  pick: ScoutPick | null;
}

/** What the game says about each player, asked once per player and kept while the dialog is open. */
function useDetails(uids: readonly number[]): ReadonlyMap<number, Loaded<PlayerDetails>> {
  const [loaded, setLoaded] = useState<ReadonlyMap<number, Loaded<PlayerDetails>>>(new Map());
  const asked = useRef(new Set<number>());
  const key = uids.join(",");

  useEffect(() => {
    let live = true;
    for (const uid of uids) {
      if (asked.current.has(uid)) {
        continue;
      }
      asked.current.add(uid);
      playerDetails(uid).then(
        (details) => live && setLoaded((old) => new Map(old).set(uid, { details })),
        (e) => live && setLoaded((old) => new Map(old).set(uid, { error: describeError(e) })),
      );
    }
    return () => {
      live = false;
      // An answer that came after the dialog closed is of no use; the next opening asks again.
      asked.current.clear();
    };
    // `key` stands for `uids`, which is a new array whenever the columns are worked out again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return loaded;
}

/** A player's attributes for a role, 1–20: what it leans on most counts three times (as the scout measures it). */
function roleRating(details: PlayerDetails, role: Role | undefined): number | null {
  if (!role) {
    return null;
  }
  let sum = 0;
  let total = 0;
  for (const [keys, weight] of [
    [role.keyAttributes, 3],
    [role.otherAttributes, 1],
  ] as const) {
    for (const key of keys) {
      const value = details.attributes[key]?.value;
      if (value !== undefined) {
        sum += weight * value;
        total += weight;
      }
    }
  }
  return total > 0 ? sum / total : null;
}

interface ScoutCompareProps extends CompareAsk {
  roles: Role[];
  positions: ScoutPosition[];
  onClose: () => void;
}

export function ScoutCompare({ position, starter, picks, pool, roles, positions, onClose }: ScoutCompareProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog, true, onClose);
  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const [shown, setShown] = useState<ScoutPick[]>(picks.slice(0, MOST_PICKS));
  const first = shown[0]?.suggestion;
  const ipRoles = rolesFor(roles, positions, position, "inPossession");
  const oopRoles = rolesFor(roles, positions, position, "outOfPossession");
  const [ip, setIp] = useState(first?.inPossessionRole ?? ipRoles[0]?.key ?? "");
  const [oop, setOop] = useState(first?.outOfPossessionRole ?? oopRoles[0]?.key ?? "");
  const ipRole = ipRoles.find((role) => role.key === ip);
  const oopRole = oopRoles.find((role) => role.key === oop);

  const columns: CompareColumn[] = useMemo(
    () => [
      ...(starter ? [{ player: starter.player, fitting: starter, pick: null }] : []),
      ...shown.map((pick) => ({ player: pick.suggestion.player, fitting: pick.suggestion, pick })),
    ],
    [starter, shown],
  );
  const loaded = useDetails(columns.map((column) => column.player.uid));
  const addable = pool.filter((pick) => !shown.some((s) => s.suggestion.player.uid === pick.suggestion.player.uid));
  const ready = columns.every((column) => loaded.has(column.player.uid));

  // The attributes of the two roles: what they lean on most first, then what helps, each once.
  const keyAttributes = unique([...(ipRole?.keyAttributes ?? []), ...(oopRole?.keyAttributes ?? [])]);
  const otherAttributes = unique([...(ipRole?.otherAttributes ?? []), ...(oopRole?.otherAttributes ?? [])]).filter(
    (key) => !keyAttributes.includes(key),
  );
  const detailsOf = (column: CompareColumn) => loaded.get(column.player.uid)?.details;
  const starterDetails = starter ? loaded.get(starter.player.uid)?.details : undefined;

  const fullColumns: Column[] = columns.map((column) => {
    const own = loaded.get(column.player.uid);
    const player = { uid: column.player.uid, name: column.player.name };
    return own?.details ? { player, details: own.details } : { player, error: own?.error ?? text.loading };
  });

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal compare-dialog scout-compare"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={!ready || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{text.title}</h2>
          <p className="compare-hint">
            {starter ? text.hint(positionLabel(position), starter.player.name) : text.noStarter}
          </p>
        </header>

        <div className="modal-body">
          <div className="scout-compare-tools">
            <label className="scout-field">
              <span>{text.inPossession}</span>
              <select value={ip} onChange={(e) => setIp(e.currentTarget.value)}>
                {ipRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {roleAbbreviation(role.key)} — {roleName(role.key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="scout-field">
              <span>{text.outOfPossession}</span>
              <select value={oop} onChange={(e) => setOop(e.currentTarget.value)}>
                {oopRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {roleAbbreviation(role.key)} — {roleName(role.key)}
                  </option>
                ))}
              </select>
            </label>
            {addable.length > 0 && shown.length < MOST_PICKS && (
              <label className="scout-field">
                <span>{text.add}</span>
                <select
                  value=""
                  onChange={(e) => {
                    const uid = Number(e.currentTarget.value);
                    const pick = addable.find((p) => p.suggestion.player.uid === uid);
                    if (pick) {
                      setShown([...shown, pick]);
                    }
                  }}
                >
                  <option value="">{text.addNone}</option>
                  {addable.map((pick) => (
                    <option key={pick.suggestion.player.uid} value={pick.suggestion.player.uid}>
                      {pick.suggestion.player.name} · {pick.suggestion.player.currentAbility}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="compare-wrap" role="region" aria-label={text.title} tabIndex={0}>
            <table className="compare-grid scout-compare-grid" style={{ "--columns": columns.length } as CSSProperties}>
              <thead>
                <tr>
                  <td className="compare-corner" />
                  {columns.map((column) => (
                    <Head
                      key={column.player.uid}
                      column={column}
                      details={detailsOf(column)}
                      error={loaded.get(column.player.uid)?.error}
                      onRemove={
                        column.pick && shown.length > 1
                          ? () => setShown(shown.filter((pick) => pick !== column.pick))
                          : undefined
                      }
                    />
                  ))}
                </tr>
              </thead>

              <tbody>
                <Heading title={text.scoutView} span={columns.length + 1} />
                <Row label={text.rows.fit}>
                  {columns.map((column) => (
                    <Cell key={column.player.uid} best={bestOf(columns, (c) => c.fitting?.fit, column)}>
                      {column.fitting ? <FitBar fit={column.fitting.fit} /> : missing}
                    </Cell>
                  ))}
                </Row>
                <Row label={text.rows.position(positionLabel(position))}>
                  {columns.map((column) => (
                    <Cell key={column.player.uid}>
                      {column.fitting ? (
                        <span>
                          {familiarity(column.fitting.positionRating)}{" "}
                          <span className="muted">({column.fitting.positionRating})</span>
                        </span>
                      ) : (
                        missing
                      )}
                    </Cell>
                  ))}
                </Row>
                {(["inPossession", "outOfPossession"] as const).map((phase) => {
                  const role = phase === "inPossession" ? ipRole : oopRole;
                  if (!role) {
                    return null;
                  }
                  const ratings = columns.map((column) => {
                    const details = detailsOf(column);
                    return details ? roleRating(details, role) : null;
                  });
                  const best = bestColumns(ratings.map((r) => (r === null ? undefined : Math.round(r * 10))));
                  return (
                    <Row key={phase} label={text.rows.roleRating(roleName(role.key))}>
                      {ratings.map((rating, i) => (
                        <Cell key={columns[i].player.uid} best={best.has(i)}>
                          {rating === null ? missing : <span className="compare-figure">{rating.toFixed(1)}</span>}
                        </Cell>
                      ))}
                    </Row>
                  );
                })}
                <Row label={text.rows.probability}>
                  {columns.map((column) => (
                    <Cell key={column.player.uid}>
                      {column.pick ? (
                        <span className={`scout-probability ${level(column.pick.suggestion.probability)}`}>
                          {formatPercent(column.pick.suggestion.probability)}
                        </span>
                      ) : (
                        <span className="muted">{text.ownPlayer}</span>
                      )}
                    </Cell>
                  ))}
                </Row>
                <Row label={text.rows.fee}>
                  {columns.map((column) => (
                    <Cell key={column.player.uid}>{money(column.pick?.suggestion.fee ?? null)}</Cell>
                  ))}
                </Row>
                <Row label={text.rows.wage}>
                  {columns.map((column) => {
                    const wage = column.pick ? column.pick.suggestion.wage : detailsOf(column)?.contract?.wage;
                    return (
                      <Cell key={column.player.uid}>
                        {wage === null || wage === undefined
                          ? missing
                          : `${formatMoney(wage)}${scoutingText.perWeek}`}
                      </Cell>
                    );
                  })}
                </Row>
                <Row label={text.rows.contract}>
                  {columns.map((column) => (
                    <Cell key={column.player.uid}>{formatDate(column.player.contractExpires) || missing}</Cell>
                  ))}
                </Row>
                <Row label={text.rows.verdict}>
                  {columns.map((column) => {
                    const verdict = column.pick ? verdictOf(column.pick.suggestion.fit, starter) : null;
                    return (
                      <Cell key={column.player.uid}>
                        {column.pick === null ? (
                          <span className="muted">{text.starter}</span>
                        ) : (
                          <span className="scout-verdict" data-verdict={verdict ?? "none"}>
                            {verdict ? scoutingText.verdicts[verdict] : scoutingText.verdicts.none}
                            <span className="sub">
                              {scoutingText.chances[chanceOf(column.pick.suggestion.probability)]}
                            </span>
                          </span>
                        )}
                      </Cell>
                    );
                  })}
                </Row>
              </tbody>

              <tbody>
                <Heading
                  title={text.roleAttributes(
                    [ipRole, oopRole].flatMap((role) => (role ? [roleAbbreviation(role.key)] : [])).join(" · "),
                  )}
                  span={columns.length + 1}
                />
                {[...keyAttributes, ...otherAttributes].map((key) => {
                  const values = columns.map((column) => detailsOf(column)?.attributes[key]?.value);
                  const best = bestColumns(values);
                  const own = starterDetails?.attributes[key]?.value;
                  const isKey = keyAttributes.includes(key);
                  return (
                    <tr key={key} className={isKey ? "scout-key-attribute" : undefined}>
                      <th scope="row" title={isKey ? text.keyAttribute : undefined}>
                        {ATTRIBUTE_LABELS[key as AttributeKey] ?? key}
                        {isKey && <span className="scout-key-mark" aria-label={text.keyAttribute} />}
                      </th>
                      {values.map((value, i) => {
                        const column = columns[i];
                        const delta =
                          column.pick && value !== undefined && own !== undefined ? value - own : undefined;
                        return (
                          <Cell key={column.player.uid} best={best.has(i)}>
                            {value === undefined ? (
                              missing
                            ) : (
                              <>
                                <span className={`value ${tierClass(value)}`}>{value}</span>
                                {delta !== undefined && delta !== 0 && (
                                  <span
                                    className={`scout-delta ${delta > 0 ? "up" : "down"}`}
                                    title={text.versus(delta > 0 ? `+${delta}` : String(delta))}
                                  >
                                    {delta > 0 ? `+${delta}` : delta}
                                  </span>
                                )}
                              </>
                            )}
                          </Cell>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details className="scout-compare-all">
            <summary>{text.allAttributes}</summary>
            {ready ? (
              <div className="compare-wrap" role="region" aria-label={text.allAttributes} tabIndex={0}>
                <ComparisonTable columns={fullColumns} />
              </div>
            ) : (
              <p className="compare-status">{text.loading}</p>
            )}
          </details>
        </div>

        <footer className="modal-foot">
          <button type="button" className="compare-close" onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const missing = <span className="muted">{scoutingText.none}</span>;

const unique = (keys: string[]) => keys.filter((key, i) => keys.indexOf(key) === i);

const level = (probability: number) => (probability >= 70 ? "good" : probability >= 50 ? "ok" : "poor");

const money = (pounds: number | null) => (pounds === null ? missing : formatMoney(pounds));

/** Whether `column` holds the best value of a row (the highest), where two columns or more have one. */
function bestOf(
  columns: CompareColumn[],
  value: (column: CompareColumn) => number | undefined,
  column: CompareColumn,
): boolean {
  return bestColumns(columns.map(value)).has(columns.indexOf(column));
}

function Heading({ title, span }: { title: string; span: number }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={span} className="compare-group">
        {title}
      </th>
    </tr>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {children}
    </tr>
  );
}

function Cell({ best = false, children }: { best?: boolean; children: ReactNode }) {
  return (
    <td className={best ? "compare-cell best" : "compare-cell"}>
      {children}
      {best && <span className="sr-only"> ({scoutingText.compare.best})</span>}
    </td>
  );
}

/** The head of a column: face, name, club, age and abilities, and what the column is. */
function Head({
  column,
  details,
  error,
  onRemove,
}: {
  column: CompareColumn;
  details: PlayerDetails | undefined;
  error: string | undefined;
  onRemove?: () => void;
}) {
  const { player, pick } = column;
  return (
    <th scope="col" className="compare-head">
      <div className="compare-head-box">
        <span className={pick ? "scout-compare-tag" : "scout-compare-tag own"}>
          {pick ? text.candidate : text.starter}
        </span>
        <PersonFace uid={player.uid} name={player.name} size={PICTURE_SIZE.columnFace} />
        <div className="compare-name">{player.name}</div>
        <div className="compare-club">
          {player.club === null || player.clubUid === null ? (
            <span className="muted">{scoutingText.freeAgent}</span>
          ) : (
            <WithPicture inline picture={<ClubLogo uid={player.clubUid} name={player.club} size={PICTURE_SIZE.textLogo} />}>
              {player.club}
            </WithPicture>
          )}
        </div>
        <div className="compare-age">{player.age === null ? scoutingText.none : text.age(player.age)}</div>
        <div className="compare-abilities">
          <abbr title={scoutingText.sortNames.ca}>{scoutingText.columns.ca}</abbr>
          <Ability value={details?.currentAbility ?? player.currentAbility} />
          <abbr title={scoutingText.sortNames.pa}>{scoutingText.columns.pa}</abbr>
          <Ability value={details?.potentialAbility ?? player.potentialAbility} />
        </div>
        {error && (
          <div className="compare-error" role="alert">
            {error}
          </div>
        )}
        {onRemove && (
          <button type="button" className="scout-compare-remove" onClick={onRemove} title={text.remove(player.name)}>
            {text.removeShort}
          </button>
        )}
      </div>
    </th>
  );
}
