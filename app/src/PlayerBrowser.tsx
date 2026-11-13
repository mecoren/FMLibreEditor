import { useEffect, useRef, useState } from "react";
import { Ability } from "./Ability";
import { ComparisonTray } from "./Comparison";
import { ExportButton } from "./ExportDialog";
import { formatDate } from "./format";
import { playerListText, positionLabel, profileText } from "./labels";
import { ListBrowser, type ListRequest } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { countFilters, PlayerFilterBar, toPlayerFilter, type PlayerFilterFields } from "./PlayerFilters";
import { PlayerPage, PlayerProfile } from "./PlayerProfile";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { PLAYER_FILTERS, readFields, readOrder } from "./savedFilters";
import { SortHeader } from "./SortHeader";
import type { PlayerOrder, PlayerSort, PlayerSummary } from "./types";
import type { Comparison } from "./useComparison";

const text = playerListText;

/** What the list is in until a column header is clicked: the best players first. */
const DEFAULT_ORDER: PlayerOrder = { by: "currentAbility", ascending: false };

/** The columns whose first click sorts from A to Z or from the earliest date; the numbers start with the highest. */
const FIRST_ASCENDING: ReadonlySet<PlayerSort> = new Set<PlayerSort>(["name", "nation", "club", "contractExpires"]);

/** How many positions a row shows before the ellipsis; its hover text has all of them. */
const POSITIONS_SHOWN = 3;

interface PlayerBrowserProps {
  version: number;
  active: boolean;
  /** Whether the game's layout tells women from men, for the filter that keeps to one of them. */
  genderKnown: boolean;
  /** The players picked for a comparison, which the tray under the table shows (see `useComparison`). */
  comparison: Comparison;
  /** What the command palette asks of the list (see `ListRequest`). */
  request: ListRequest<PlayerSummary> | null;
}

/** The players table with the profile of the selected player beside it. */
export function PlayerBrowser({ version, active, genderKnown, comparison, request }: PlayerBrowserProps) {
  // The filters and the sort start as they were before the language was switched, if it was (see `restore.ts`).
  const [fields, setFields] = useState<PlayerFilterFields>(() => restored("playerFields", readFields));
  // Null until a header is clicked: no order is asked for, and the search answers with the best current ability first.
  const [order, setOrder] = useState<PlayerOrder | null>(() => restored("playerOrder", readOrder));
  useSnapshot("playerFields", () => fields);
  useSnapshot("playerOrder", () => order);

  // The player whose profile is up as a page over the list, and the name that opened it: the name takes focus back once
  // the page is closed, as the squad's names do (see `SquadTab`).
  const [shown, setShown] = useState<PlayerSummary | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasShown = useRef(false);

  useEffect(() => {
    if (wasShown.current && shown === null && opener.current?.isConnected) {
      opener.current.focus();
    }
    wasShown.current = shown !== null;
  }, [shown]);

  // Leaving the tab leaves the page too: coming back finds the list, at the top level. The view guard has asked
  // already for changes pending in the page (see `App`'s `show`).
  useEffect(() => {
    if (!active) {
      setShown(null);
    }
  }, [active]);

  // The command palette asks the list for another player: the page gives way to the list, which shows his profile beside
  // it (the palette let the page's pending changes go before it asked, see `App`'s `openFound`).
  useEffect(() => {
    if (request) {
      setShown(null);
    }
  }, [request]);

  // Where the layout cannot tell women from men, the bar offers no such choice, and a saved filter that made one is
  // taken without it.
  const filter = toPlayerFilter(genderKnown ? fields : { ...fields, gender: "" });
  const filterCount = countFilters(filter);
  const sorted = order ?? DEFAULT_ORDER;
  const sortBy = (by: PlayerSort) =>
    setOrder({ by, ascending: sorted.by === by ? !sorted.ascending : FIRST_ASCENDING.has(by) });
  const sortHeader = (by: PlayerSort, className?: string) => (
    <SortHeader
      by={by}
      order={sorted}
      onSort={sortBy}
      label={text.columns[by]}
      title={text.sortBy(text.sortNames[by])}
      className={className}
    />
  );

  const list = (
    <ListBrowser<PlayerSummary>
      name="players"
      command="search_players"
      requestArgs={{ filter, order: order ?? undefined }}
      request={request}
      version={version}
      active={active}
      placeholder={text.search}
      summary={(total, shown) =>
        text.summary(total, shown, order && { by: text.sortNames[order.by], ascending: order.ascending })
      }
      empty={(query) => text.empty(query, filterCount > 0)}
      filterBar={
        <PlayerFilterBar
          fields={fields}
          onChange={setFields}
          active={filterCount}
          genderKnown={genderKnown}
          actions={
            <SavedFilterControls
              kind={PLAYER_FILTERS}
              fields={fields}
              order={order}
              filtered={filterCount > 0}
              onApply={(savedFields, savedOrder) => {
                setFields(savedFields);
                setOrder(savedOrder);
              }}
            />
          }
        />
      }
      toolbarActions={(list) => (
        <>
          <ExportButton entity="player" list={list} args={{ filter, order: order ?? undefined }} />
          <MassEditButton entity="player" filters={{ playerFilter: filter }} list={list} />
        </>
      )}
      footer={<ComparisonTray comparison={comparison} />}
      tableClass="player-grid"
      header={
        <>
          {sortHeader("name", "col-name")}
          {sortHeader("age", "num col-age")}
          <th className="col-positions">{text.columns.positions}</th>
          {sortHeader("nation", "col-nation")}
          {sortHeader("club", "col-club")}
          {sortHeader("contractExpires", "col-contract")}
          <th className="col-born">{text.columns.born}</th>
          {sortHeader("currentAbility", "num col-ca")}
          {sortHeader("potentialAbility", "num col-pa")}
          <th className="num col-uid">{text.columns.uid}</th>
        </>
      }
      cells={(p) => (
        <>
          {/* The hover text has what a long name, nation or club is cut to. */}
          <td className="col-name" title={p.fullName && p.fullName !== p.name ? `${p.name}\n${p.fullName}` : p.name}>
            <button
              type="button"
              className="name name-link"
              aria-haspopup="dialog"
              title={text.openProfile}
              // The name opens his profile as a dialog over the list, the way the scout's lists do; a click elsewhere
              // in the row opens it beside the list, as before. Enter on the name is the button's, not the row's.
              onClick={(event) => {
                event.stopPropagation();
                opener.current = event.currentTarget;
                setShown(p);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.stopPropagation();
                }
              }}
            >
              {p.name}
            </button>
            {p.fullName && p.fullName !== p.name && <div className="sub">{p.fullName}</div>}
          </td>
          <td className="num col-age">{p.age ?? profileText.none}</td>
          <PositionsCell positions={p.positions} />
          <td className="col-nation" title={p.nation ?? undefined}>
            <WithPicture picture={<NationFlag uid={p.nationUid} />}>{p.nation ?? profileText.none}</WithPicture>
          </td>
          <td className="col-club" title={p.club ?? undefined}>
            <WithPicture picture={<ClubLogo uid={p.clubUid} name={p.club} size={PICTURE_SIZE.rowLogo} />}>
              {p.club ?? <span className="muted">{profileText.freeAgent}</span>}
            </WithPicture>
          </td>
          <td className="date col-contract">{formatDate(p.contractExpires) || profileText.none}</td>
          <td className="date col-born">{formatDate(p.dateOfBirth)}</td>
          <td className="num col-ca">
            <Ability value={p.currentAbility} />
          </td>
          <td className="num col-pa">
            <Ability value={p.potentialAbility} />
          </td>
          <td className="num uid col-uid">{p.uid}</td>
        </>
      )}
      profile={(p, panel) => (
        <PlayerProfile player={p} version={panel.version} onClose={panel.onClose} comparison={comparison} />
      )}
    />
  );

  return (
    <>
      {list}
      {shown && <PlayerPage player={shown} version={version} onClose={() => setShown(null)} />}
    </>
  );
}

/** The positions a player can play, best first: three at most, then an ellipsis; the hover text has all of them. */
function PositionsCell({ positions }: { positions: readonly string[] }) {
  if (positions.length === 0) {
    return <td className="col-positions muted">{profileText.none}</td>;
  }
  const labels = positions.map(positionLabel);
  return (
    <td className="col-positions" title={labels.join(" ")}>
      {labels.slice(0, POSITIONS_SHOWN).join(" ")}
      {labels.length > POSITIONS_SHOWN && " …"}
    </td>
  );
}
