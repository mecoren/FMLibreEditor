import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { call, inTauri, sampleData } from "./api";
import { BridgeSetup } from "./BridgeSetup";
import { ChangesView, useChangeLog } from "./ChangesView";
import { ClubBrowser } from "./ClubBrowser";
import { CommandPalette, Keys, SearchIcon, type Command, type Found, type FoundKind } from "./CommandPalette";
import { CompatibilityNotice } from "./CompatibilityNotice";
import { CopyDiagnostics } from "./CopyDiagnostics";
import { forgetFieldTables } from "./fieldTables";
import { describeError, describeGame, formatDate } from "./format";
import { FrozenNotice } from "./FrozenNotice";
import { GraphicsStatus } from "./GraphicsStatus";
import { SettingsMenu } from "./SettingsMenu";
import {
  appText,
  changesText,
  clubListText,
  homeText,
  paletteText,
  playerListText,
  scoutingText,
  staffListText,
  updateText,
} from "./labels";
import type { ListRequest } from "./ListBrowser";
import { PlayerBrowser } from "./PlayerBrowser";
import { restored, useSnapshot } from "./restore";
import { SaveChangedNotice, useSaveChanged } from "./SaveChangedNotice";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { MyClub } from "./MyClub";
import { matches, SHORTCUTS, viewShortcut, withShortcut } from "./shortcuts";
import { StaffBrowser } from "./StaffBrowser";
import type {
  BridgeInfo,
  ClubSummary,
  ConnectionInfo,
  Detection,
  PlayerSummary,
  Refrozen,
  ReloadInfo,
  StaffSummary,
} from "./types";
import { useUpdateCheck } from "./update";
import { UpdateCheck, UpdateNotice } from "./UpdateNotice";
import { ComparisonContext, useComparison } from "./useComparison";
import { modalOpen, topModal } from "./useModal";
import { askToLeave, EditorContext, profileOnTop } from "./useProfileEditing";
import "./App.css";

type View = "home" | "players" | "staff" | "clubs" | "scouting" | "changes";

const VIEWS: { id: View; label: string }[] = [
  { id: "home", label: homeText.nav },
  { id: "players", label: playerListText.nav },
  { id: "staff", label: staffListText.nav },
  { id: "clubs", label: clubListText.nav },
  { id: "scouting", label: scoutingText.nav },
  { id: "changes", label: changesText.nav },
];

/** The list each kind of thing the command palette finds is in. */
const VIEW_OF: Record<FoundKind, View> = { player: "players", staff: "staff", club: "clubs" };

/** What the command palette asks of one of the lists: someone's profile, or a search (see `ListRequest`). */
type Request =
  | { kind: "player"; ask: ListRequest<PlayerSummary> }
  | { kind: "staff"; ask: ListRequest<StaffSummary> }
  | { kind: "club"; ask: ListRequest<ClubSummary> };

/** The request that opens the profile of what the palette found. */
function profileRequest(found: Found): Request {
  switch (found.kind) {
    case "player":
      return { kind: "player", ask: { row: found.row } };
    case "staff":
      return { kind: "staff", ask: { row: found.row } };
    case "club":
      return { kind: "club", ask: { row: found.row } };
  }
}

/** Puts the caret in the search box of the list on show, with its text selected. */
function focusListSearch(): void {
  const box = document.querySelector<HTMLInputElement>(".views .workspace:not(.inactive) .toolbar .search input");
  box?.focus();
  box?.select();
}

/** The view the window was in before the language was switched; the first one when there was no such switch. */
const readView = (value: unknown): View => VIEWS.find(({ id }) => id === value)?.id ?? "home";

/** The app's mark, as on its icon: FML over FM's four bands. */
function BrandMark() {
  return (
    <span className="brand" title="FMLibreEditor">
      <span className="brand-word" aria-hidden="true">
        FML
      </span>
      <span className="brand-bands" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="sr-only">FMLibreEditor</span>
    </span>
  );
}

function App() {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  // False until the app has asked whether it is connected already (see the effect below): the connect panel would
  // flash up for a moment after the window was reloaded to change the language.
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  // What connecting froze again of what was frozen in the save before, until the notice that says so is dismissed.
  const [refrozen, setRefrozen] = useState<Refrozen | null>(null);
  const [view, setView] = useState<View>(() => restored("view", readView));
  useSnapshot("view", () => view);
  // Whether the view on show is one that was asked for: a tab, a shortcut, the palette, or the view the window was in
  // before the language was switched. Until then the app is where it opened, on My club, and goes to the players
  // instead when the save has no club for that page (see `MyClub`).
  const viewChosen = useRef(restored("view", (value) => value !== undefined));
  // The players picked for a comparison: in the player list's profiles and in those opened from a club's squad.
  const comparison = useComparison();
  const { log, error: logError, reload: reloadLog, clear: clearLog } = useChangeLog();
  const update = useUpdateCheck();
  // Whether Check for updates was pressed: only then does the foot of the window say what was found.
  const [askedUpdate, setAskedUpdate] = useState(false);
  // Whether the game has loaded a save, or gone back to its main menu, since the data was read.
  const saveChanged = useSaveChanged(connection !== null, dataVersion);
  // The command palette: whether it is up, what had focus before it, and what it last asked of a list.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const focusBefore = useRef<Element | null>(null);
  const [request, setRequest] = useState<Request | null>(null);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const detect = useCallback(
    () => run(appText.detecting, async () => setDetection(await call<Detection>("detect_game"))),
    [run],
  );

  const connect = () =>
    run(appText.connecting, async () => {
      const { refrozen: again, ...connected } = await call<ConnectionInfo>("connect");
      // A new connection has an empty change log, and its field tables may differ. Its lists start afresh, with no one
      // picked for a comparison.
      forgetFieldTables();
      clearLog();
      comparison.clear();
      setConnection(connected);
      setRefrozen(again ?? null);
      setDataVersion((v) => v + 1);
    });

  const reload = () =>
    run(appText.reloading, async () => {
      try {
        const { refrozen: again, ...reloaded } = await call<ReloadInfo>("reload");
        setConnection((c) => c && { ...c, ...reloaded });
        if (again) {
          setRefrozen(again);
        }
        setDataVersion((v) => v + 1);
      } catch (e) {
        // The Rust side drops the connection when reading fails (e.g. the game was closed).
        setConnection(null);
        void detect();
        throw e;
      }
    });

  // At startup: the Rust side keeps its connection, lists and change log when the window is reloaded (that is how a
  // change of language keeps the connection), so the app first asks for the connection it may have already. With
  // one, it shows the connected app right away, without reading the game again; without one, it looks for the game.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let current: ConnectionInfo | null = null;
      try {
        current = await call<ConnectionInfo | null>("current_connection");
      } catch {
        // Not knowing is no reason to stop: looking for the game says what is wrong, if anything is.
      }
      if (cancelled) {
        return;
      }
      if (current) {
        setConnection(current);
        setDataVersion((v) => v + 1);
        void reloadLog();
      } else {
        void detect();
      }
      setChecked(true);
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [detect, reloadLog]);

  // Changes were written or undone: the lists and the open profile read the game again, and so does the log.
  // The lists keep their search, filters, sort and selection when they do.
  const edited = useCallback(() => {
    setDataVersion((v) => v + 1);
    void reloadLog();
  }, [reloadLog]);

  // A version of the game the editor has no profile for is read-only until editing it is allowed.
  const allowEditing = async () => {
    setError(null);
    try {
      setConnection(await call<ConnectionInfo>("allow_editing"));
    } catch (e) {
      setError(describeError(e));
    }
  };

  const checkUpdates = () => {
    setAskedUpdate(true);
    update.check();
  };

  const editable = connection?.editable ?? false;
  // The note on applying edits, the colophon's first: whole in its hover too, should a window ever be too narrow for it.
  // While nothing can be edited, it is also the hover of what that turns off.
  const note = !connection
    ? appText.noteNotConnected
    : editable
      ? appText.noteEditable
      : connection.writable
        ? appText.noteUnknownBuild
        : appText.noteReadOnly;
  const editor = useMemo(() => ({ editable, readOnlyNote: note, onEdited: edited }), [editable, note, edited]);

  // With edits pending in the open profile, leaving for another view asks first.
  const show = (id: View) => {
    viewChosen.current = true;
    if (id !== view) {
      askToLeave(() => setView(id));
    }
  };

  // A club's profile, opened from My club: the Clubs tab shows it.
  const openClub = (club: ClubSummary) => {
    viewChosen.current = true;
    setView("clubs");
    setRequest({ kind: "club", ask: { row: club } });
  };

  // Under a dialog the palette stays shut: the dialog has the keys.
  const openPalette = () => {
    if (!paletteOpen && !modalOpen()) {
      focusBefore.current = document.activeElement;
      setPaletteOpen(true);
    }
  };

  // Closes the palette at once, gives focus back to what had it, and only then runs `then`: what that does (another
  // view, a search box) may take focus from there.
  const closePalette = (then?: () => void) => {
    flushSync(() => setPaletteOpen(false));
    const before = focusBefore.current;
    focusBefore.current = null;
    if (before instanceof HTMLElement && before.isConnected) {
      before.focus();
    }
    then?.();
  };

  // The palette found someone: the list they are in shows their profile. Edits pending in the open profile ask first.
  const openFound = (found: Found) =>
    closePalette(() =>
      askToLeave(() => {
        viewChosen.current = true;
        setView(VIEW_OF[found.kind]);
        setRequest(profileRequest(found));
      }),
    );

  // The palette's line that shows all of a list's matches: the list searches for what was typed in the palette.
  const showAll = (kind: FoundKind, query: string) =>
    closePalette(() =>
      askToLeave(() => {
        viewChosen.current = true;
        setView(VIEW_OF[kind]);
        setRequest({ kind, ask: { query } });
      }),
    );

  const game = detection?.games[0];
  const idle = busy === null;
  const searchable = connection !== null && (view === "players" || view === "staff" || view === "clubs");

  // What the palette lists, read when it opens: the commands of the profile on show, then the lists, then the rest.
  const commands: Command[] = [];
  if (paletteOpen) {
    const profile = profileOnTop();
    if (profile?.canApply) {
      commands.push({ id: "apply", label: paletteText.applyChanges, shortcut: SHORTCUTS.apply, run: profile.apply });
    }
    if (profile?.canEdit()) {
      commands.push({
        id: "edit",
        label: profile.editing ? paletteText.doneEditing : paletteText.editProfile,
        shortcut: SHORTCUTS.edit,
        run: profile.toggleEdit,
      });
    }
    VIEWS.forEach(({ id, label }, index) =>
      commands.push({
        id: `view-${id}`,
        label: paletteText.goTo(label),
        shortcut: viewShortcut(index),
        run: () => show(id),
      }),
    );
    if (searchable) {
      commands.push({ id: "find", label: paletteText.searchList, shortcut: SHORTCUTS.find, run: focusListSearch });
    }
    if (idle && connection) {
      commands.push({ id: "reload", label: appText.reload, shortcut: SHORTCUTS.reload, run: () => void reload() });
    } else if (idle) {
      if (game?.info && game.pluginLoaded) {
        commands.push({ id: "connect", label: appText.connect.button, run: () => void connect() });
      }
      commands.push({ id: "refresh", label: appText.refresh, shortcut: SHORTCUTS.reload, run: () => void detect() });
    }
    if (update.current) {
      commands.push({ id: "updates", label: updateText.check, run: checkUpdates });
    }
  }

  // The keyboard shortcuts. A dialog that is up has the keys to itself, but for a profile opened as one: Edit and
  // Apply are its own. A shortcut that does something here keeps the key from the web view, which would search the
  // page, load it again or save it.
  const onShortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    if (matches(event, SHORTCUTS.palette)) {
      event.preventDefault();
      if (paletteOpen) {
        closePalette();
      } else {
        openPalette();
      }
      return;
    }
    if (matches(event, SHORTCUTS.apply) || matches(event, SHORTCUTS.reload)) {
      // Never the web view's own, whatever is up: saving the page, or loading it again.
      event.preventDefault();
    }
    if (paletteOpen) {
      return;
    }
    const profile = profileOnTop();
    if (profile && (!modalOpen() || topModal() === profile.box())) {
      if (matches(event, SHORTCUTS.edit) && profile.canEdit()) {
        event.preventDefault();
        profile.toggleEdit();
        return;
      }
      if (matches(event, SHORTCUTS.apply) && profile.canApply) {
        profile.apply();
        return;
      }
    }
    if (modalOpen()) {
      return;
    }
    const tab = VIEWS.findIndex((_, index) => matches(event, viewShortcut(index)));
    if (tab >= 0) {
      event.preventDefault();
      show(VIEWS[tab].id);
    } else if (matches(event, SHORTCUTS.reload)) {
      if (idle) {
        void (connection ? reload() : detect());
      }
    } else if (matches(event, SHORTCUTS.find) && searchable) {
      event.preventDefault();
      focusListSearch();
    }
  };
  // The listener is put up once, and calls the handler of the last render.
  const latestShortcut = useRef(onShortcut);
  useLayoutEffect(() => {
    latestShortcut.current = onShortcut;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => latestShortcut.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="app">
      {/* `contents` keeps the masthead and the page as direct flex children of `.app`; only the Tabs context is added. */}
      <Tabs value={view} onValueChange={(value: string) => show(readView(value))} className="contents">
      <header className="masthead">
        <BrandMark />
        <TabsList className="tabs">
          {VIEWS.map(({ id, label }, index) => (
            <TabsTrigger
              key={id}
              type="button"
              value={id}
              className={id === view ? "tab active" : "tab"}
              aria-current={id === view ? "page" : undefined}
              title={withShortcut(label, viewShortcut(index))}
            >
              {label}
              {id === "changes" && log.length > 0 && <small>{log.length}</small>}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="masthead-side">
          {busy && <span className="busy">{busy}</span>}
          <button
            type="button"
            className="palette-open"
            aria-haspopup="dialog"
            title={withShortcut(paletteText.title, SHORTCUTS.palette)}
            onClick={openPalette}
          >
            <SearchIcon />
            <span className="palette-open-label">{paletteText.button}</span>
            <Keys shortcut={SHORTCUTS.palette} />
          </button>
          {connection &&
            (connection.gameDate ? (
              <span className="game-date">{formatDate(connection.gameDate)}</span>
            ) : (
              <span className="game-date missing" title={appText.noDateTitle}>
                {appText.noDate}
              </span>
            ))}
          {connection ? (
            <button onClick={reload} disabled={!idle} title={withShortcut(appText.reload, SHORTCUTS.reload)}>
              {appText.reload}
            </button>
          ) : (
            <button onClick={detect} disabled={!idle} title={withShortcut(appText.refresh, SHORTCUTS.reload)}>
              {appText.refresh}
            </button>
          )}
          <SettingsMenu busy={busy !== null} />
        </div>
      </header>

      <div className="main">
        {update.notice && (
          <UpdateNotice
            release={update.notice}
            current={update.current}
            selfUpdate={update.selfUpdate}
            onLater={update.later}
          />
        )}
        {connection && (
          <CompatibilityNotice
            connection={connection}
            busy={busy !== null}
            onAllow={allowEditing}
            onCheckUpdates={checkUpdates}
          />
        )}
        {connection && saveChanged && <SaveChangedNotice busy={busy !== null} onReload={reload} />}
        {connection && refrozen && <FrozenNotice refrozen={refrozen} onDismiss={() => setRefrozen(null)} />}
        {error && <div className="banner">{error}</div>}

        {connection ? (
          // All the lists stay mounted, so each keeps its search and selection while another is shown.
          <EditorContext.Provider value={editor}>
            <ComparisonContext.Provider value={comparison}>
              <div className="views">
                <TabsContent value="home" forceMount className="contents">
                  {view === "home" && (
                    <MyClub
                      version={dataVersion}
                      gameDate={connection.gameDate}
                      onOpenClub={openClub}
                      onEmpty={() => {
                        if (!viewChosen.current) {
                          setView("players");
                        }
                      }}
                    />
                  )}
                </TabsContent>
                <TabsContent value="players" forceMount className="contents">
                  <PlayerBrowser
                    version={dataVersion}
                    active={view === "players"}
                    genderKnown={connection.genderKnown}
                    comparison={comparison}
                    request={request?.kind === "player" ? request.ask : null}
                  />
                </TabsContent>
                <TabsContent value="staff" forceMount className="contents">
                  <StaffBrowser
                    version={dataVersion}
                    active={view === "staff"}
                    genderKnown={connection.genderKnown}
                    request={request?.kind === "staff" ? request.ask : null}
                  />
                </TabsContent>
                <TabsContent value="clubs" forceMount className="contents">
                  <ClubBrowser
                    version={dataVersion}
                    active={view === "clubs"}
                    request={request?.kind === "club" ? request.ask : null}
                  />
                </TabsContent>
                <TabsContent value="scouting" forceMount className="contents">
                  <ScoutingBrowser
                    version={dataVersion}
                    active={view === "scouting"}
                    gameDate={connection.gameDate}
                  />
                </TabsContent>
                <TabsContent value="changes" forceMount className="contents">
                  {view === "changes" && <ChangesView log={log} error={logError} reload={reloadLog} onUndone={edited} />}
                </TabsContent>
              </div>
            </ComparisonContext.Provider>
          </EditorContext.Provider>
        ) : (
          checked && (
            <ConnectPanel
              detection={detection}
              busy={busy !== null}
              onConnect={connect}
              onBridge={(bridge) => setDetection((d) => d && { ...d, bridge })}
            />
          )
        )}
      </div>
      </Tabs>

      <footer className="colophon">
        <div className="colophon-main">
          <span className="colophon-name">
            FMLibreEditor{update.current && ` ${update.current}`} · {appText.stage}
          </span>
          {update.current && <UpdateCheck state={update.state} asked={askedUpdate} onCheck={checkUpdates} />}
          {connection && <CopyDiagnostics variant="link" />}
          <span className={`status ${connection ? "on" : ""}`}>
            <span className="dot" />
            <span className="status-text">
              {connection
                ? [
                    describeGame(connection.game),
                    playerListText.count(connection.players),
                    staffListText.count(connection.staff),
                    clubListText.count(connection.clubs),
                  ].join(" · ")
                : appText.notConnected}
            </span>
          </span>
          {!inTauri && <span className="tag">{appText.previewTag}</span>}
          {inTauri && sampleData && <span className="tag">{appText.sampleTag}</span>}
        </div>
        <div className="colophon-notes">
          <p className="sidebar-note" title={note}>
            {note}
          </p>
          <GraphicsStatus />
        </div>
      </footer>

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          connected={connection !== null}
          onRun={(command) => closePalette(command.run)}
          onOpen={openFound}
          onShowAll={showAll}
          onClose={closePalette}
        />
      )}
    </div>
  );
}

function ConnectPanel(props: {
  detection: Detection | null;
  busy: boolean;
  onConnect: () => void;
  onBridge: (bridge: BridgeInfo) => void;
}) {
  const { detection, busy, onConnect, onBridge } = props;
  const game = detection?.games[0];
  // macOS: the bridge comes first while it is not set up, as nothing connects without it.
  const bridge = detection?.bridge;
  const bridgeSetup = bridge && <BridgeSetup bridge={bridge} busy={busy} onChange={onBridge} />;
  const ready = Boolean(game?.info && game.pluginLoaded);
  const text = appText.connect;

  return (
    <section className="connect">
      <div className="card">
        <h2>{text.title}</h2>
        <p className="muted">{text.intro}</p>
        {bridge && !bridge.ready && bridgeSetup}

        {detection && detection.games.length === 0 && <p className="hint">{text.notRunning}</p>}
        {game && !game.info && <p className="hint error">{text.openFailed(describeError(game.error))}</p>}
        {game?.info && (
          <dl className="facts">
            <dt>{text.game}</dt>
            <dd>{describeGame(game.info)}</dd>
            <dt>{text.gameData}</dt>
            <dd>{game.pluginLoaded ? text.loaded : text.stillLoading}</dd>
            <dt>{text.process}</dt>
            <dd>{text.pid(game.info.pid)}</dd>
          </dl>
        )}
        {detection && detection.games.length > 1 && <p className="hint">{text.several}</p>}

        <button className="primary" onClick={onConnect} disabled={busy || !ready}>
          {text.button}
        </button>
        {bridge?.ready && bridgeSetup}
      </div>
    </section>
  );
}

export default App;
