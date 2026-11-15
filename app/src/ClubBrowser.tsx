import { useState } from "react";
import { ClubFilterBar, countClubFilters, readClubFields, toClubFilter, type ClubFilterFields } from "./ClubFilters";
import { ClubProfile, readTab, type ClubTab } from "./ClubProfile";
import { ExportButton } from "./ExportDialog";
import { rowMenuProps } from "./EntityRowMenu";
import { clubListText, profileText } from "./labels";
import { ListBrowser, type ListRequest } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { ClubSummary } from "./types";

const columns = clubListText.columns;

interface ClubBrowserProps {
  version: number;
  active: boolean;
  /** What the command palette asks of the list (see `ListRequest`). */
  request: ListRequest<ClubSummary> | null;
}

/** The clubs table with the profile of the selected club beside it. */
export function ClubBrowser({ version, active, request }: ClubBrowserProps) {
  // It starts as it was before the language was switched, if it was (see `restore.ts`).
  const [fields, setFields] = useState<ClubFilterFields>(() => restored("clubFilters", readClubFields));
  useSnapshot("clubFilters", () => fields);
  // The tab of the club profile is kept here, so that the next club picked opens on the squad when this one did.
  const [tab, setTab] = useState<ClubTab>(() => restored("clubTab", readTab));
  useSnapshot("clubTab", () => tab);
  const filter = toClubFilter(fields);

  return (
    <ListBrowser<ClubSummary>
      name="clubs"
      command="search_clubs"
      requestArgs={{ filter }}
      request={request}
      version={version}
      active={active}
      placeholder={clubListText.search}
      summary={clubListText.summary}
      empty={(query) => clubListText.empty(query, filter !== undefined)}
      filterBar={
        <ClubFilterBar fields={fields} onChange={setFields} active={countClubFilters(filter)} version={version} />
      }
      toolbarActions={(list) => (
        <>
          <ExportButton entity="club" list={list} args={{ filter }} />
          <MassEditButton entity="club" filters={{ clubFilter: filter }} list={list} />
        </>
      )}
      tableClass="club-grid"
      rowMenu={(c) => rowMenuProps("club", c.name, c.uid)}
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-league">{columns.league}</th>
          <th className="num col-rep">{columns.reputation}</th>
          <th className="num col-founded">{columns.founded}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(c) => <ClubCells club={c} />}
      profile={(c, panel) => (
        <ClubProfile club={c} version={panel.version} tab={tab} onTab={setTab} onClose={panel.onClose} />
      )}
    />
  );
}

function ClubCells({ club: c }: { club: ClubSummary }) {
  return (
    <>
      <td className="col-name" title={c.name}>
        <WithPicture picture={<ClubLogo uid={c.uid} name={c.name} size={PICTURE_SIZE.clubRowLogo} />}>
          <div className="name">
            <span className="name-text">{c.name}</span>
            {c.women && <span className="tag women">{clubListText.women}</span>}
          </div>
          {c.shortName && c.shortName !== c.name && <div className="sub">{c.shortName}</div>}
        </WithPicture>
      </td>
      {/* The hover text has what a long nation or league is cut to. */}
      <td className="col-nation" title={c.nation ?? undefined}>
        <WithPicture picture={<NationFlag uid={c.nationUid} />}>{c.nation ?? profileText.none}</WithPicture>
      </td>
      <td className="col-league" title={c.league ?? undefined}>
        {c.league ?? <span className="muted">{profileText.none}</span>}
      </td>
      <td className="num col-rep">
        <ReputationMeter value={c.reputation} />
      </td>
      {/* A year, so it is printed as it is: no thousands separator. */}
      <td className="num date col-founded">{c.founded ?? profileText.none}</td>
      <td className="num uid col-uid">{c.uid}</td>
    </>
  );
}
