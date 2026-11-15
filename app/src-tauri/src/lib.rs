mod bridge;
mod self_update;

use std::cell::OnceCell;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use fmlibre_core::{
    ArraySource, Buyer, COHESION_RANGE, CaptainRole, CaptainSet, Change, ChangeRow, Clause, ClauseSet, ClubDetails,
    ClubFilter, ClubIndex, ClubMove, ClubSummary, Coded, CohesionSet, Competition, DEFAULT_SEASONS, EditError, Entity,
    EntityArrays, ExportFormat, ExportHeader, Exported, FeePlan, Field, FmDate, GAME_EXE, GAME_PLUGIN, GameInfo,
    GraphicsCounts, GraphicsIndex, GrowNote, GrowTarget, HOMEGROWN_RULES, Healed, Health, Kind, LEAST_CA,
    LEAST_SEASONS, LOAN_EXPIRES, LOAN_OPTION_FEE, LeagueTable, Lifted, Listed, Loan, Lock, MOST_CA, MOST_SEASONS,
    MoveError, MovePlan, MoveTerms, NameChange, NameKind, Nation, NewContract, NewStaffContract, Operation, Paid,
    People, PersonNames, Picture, Planned, PlayerDetails, PlayerFilter, PlayerIndex, PlayerOrder, PlayerSummary, ROLES,
    RelationSet, RetirementSet, Role, SCOUT_POSITIONS, ScoutError, ScoutPosition, ScoutRequest, Scouted, SearchIndex,
    Session, SessionError, Skipped, SquadReport, StadiumName, StadiumRename, StaffChange, StaffDetails, StaffFilter,
    StaffIndex, StaffOrder, StaffPlan, StandingsError, TacticsSet, Target, TemplatePreset, TemplateProfile,
    TemplateQuery, Tie, TieTarget, ability_cap, diagnostics_report, find_game, nations, sort_players, sort_staff,
    span_days, wanted_ca,
};
use fmlibre_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// The environment variable that names the graphics folder to read packs from, instead of
/// `Documents\Sports Interactive\Football Manager 27\graphics` on Windows and
/// `~/Library/Application Support/Sports Interactive/Football Manager 27/graphics` on macOS.
const GRAPHICS_FOLDER: &str = "FMLIBRE_GRAPHICS";

/// The environment variable that names the folder the app keeps its own files in, instead of its data folder
/// (`%APPDATA%\io.github.tozmoz.fmlibreeditor` on Windows, below `dev` in a development build): what was frozen in
/// each save, and the history of the changes written to each career.
const DATA_FOLDER: &str = "FMLIBRE_DATA";

/// The file in that folder that remembers what was frozen in each save (see `Remembered`).
const FROZEN_FILE: &str = "frozen.json";

/// The file in that folder that remembers the graphics folder the user chose (see `GraphicsChoice`).
const GRAPHICS_FILE: &str = "graphics.json";

/// The folder in that folder that keeps the history of the changes written to each career (see `History`).
const HISTORY_FOLDER: &str = "history";

/// The environment variable that names the folder exports are written to, instead of `FMLibreEditor\Exports` in the
/// documents folder, below `dev` in a development build.
const EXPORTS_FOLDER: &str = "FMLIBRE_EXPORTS";

/// Whether this is a development build: it keeps its files below a `dev` folder, so that running it leaves what the
/// installed app keeps alone.
const DEVELOPMENT: bool = cfg!(debug_assertions);

/// `folder`, with the `dev` layer of a development build added; in a release, `folder` itself.
fn scoped(folder: Option<PathBuf>, dev: bool) -> Option<PathBuf> {
    folder.map(|folder| if dev { folder.join("dev") } else { folder })
}

/// The connected game, the people read from it and the changes written this session.
struct Connection {
    session: Session,
    players: PlayerIndex,
    staff: StaffIndex,
    clubs: ClubIndex,
    /// The clubs human managers run: a player who leaves one leaves its team selections too.
    human_clubs: Vec<u32>,
    /// The changes written to the career the game has loaded: this connection's, after the earlier ones its history
    /// lists.
    log: Vec<LoggedChange>,
    /// Where the log is kept for the next connection to this career.
    history: History,
    /// The mass edit last previewed, until it is applied or replaced.
    mass: Option<PendingMass>,
    /// The next id for a mass-edit preview or batch.
    next_id: u32,
    frozen: Frozen,
    /// The players the user marked as favorites in this save: their own mark, kept with the save rather than read from
    /// the game.
    favorites: BTreeSet<u32>,
    /// The players watched for CA growth, in the order they were watched, and the number of seasons a climb is spread
    /// over. The watch starts empty on every connection: the objects of the players read before may belong to another
    /// save.
    growth: Vec<GrowTarget>,
    growth_seasons: u32,
    /// Which save the game has loaded (see `save_of`); none when the lists name no human manager.
    save: Option<String>,
    /// What the hold last found of the game's clubs, for the stadiums renamed in the editor.
    clubs_seen: ClubsSeen,
    /// Whom the game's ids of people name among `players`, read when a profile first needs it (see `people`).
    people: OnceCell<People>,
}

/// How often the balances of frozen clubs, the attributes, energy and sharpness of frozen players, the attributes of
/// frozen members of staff and the names of renamed stadiums are looked at.
const FREEZE_EVERY: Duration = Duration::from_secs(2);

/// How long after the game's clubs moved (a save loaded) the hold looks often whether the game has the save the lists
/// were read from, while it may still be loading it, how often, and how often after that.
const SAVE_SETTLES: Duration = Duration::from_secs(180);
const SAVE_RECHECK: Duration = Duration::from_secs(5);
const SAVE_RECHECK_LATER: Duration = Duration::from_secs(60);

/// What the hold last found of the game's clubs (see `Connection::hold_stadiums`): a save loaded again, this one or
/// another, gives them a new array, of new objects.
struct ClubsSeen {
    /// Where the array of clubs began.
    begin: u64,
    /// How many saves the game had loaded (see `Session::loads`); none while that cannot be read.
    loads: Option<u64>,
    /// Whether a club whose stadium was renamed was missing, or not where the lists found it.
    lost: bool,
    /// Whether the game had given a stadium renamed in the editor another name.
    off: bool,
    /// Since when the game had what it has: when one of these last came about.
    since: Instant,
    /// Whether the game has the save the lists were read from; none until it is known.
    same_save: Option<bool>,
    /// When that was last worked out.
    checked: Option<Instant>,
}

impl ClubsSeen {
    fn unknown(begin: u64, loads: Option<u64>) -> Self {
        Self { begin, loads, lost: false, off: false, since: Instant::now(), same_save: None, checked: None }
    }
}

/// The attributes of a player that are at their best at 1, not at 20.
const LOWER_IS_BETTER: [&str; 2] = ["attribute.injury_proneness", "attribute.dirtiness"];

/// The fields of a player that freezing his fitness holds: his energy and his match sharpness.
const FITNESS: [&str; 2] = ["condition", "match_sharpness"];

/// The two ability fields CA growth reads and writes.
const CURRENT_ABILITY: &str = "current_ability";
const POTENTIAL_ABILITY: &str = "potential_ability";

/// What the app keeps from getting worse while it is connected (see `Connection::hold_frozen`).
#[derive(Default)]
struct Frozen {
    /// The clubs whose money is frozen, with the least their balance may be: what it was when it was frozen, or more
    /// once the club earned more.
    money: BTreeMap<u32, i64>,
    /// The players whose attributes are frozen, with the worst each attribute may be, as stored: what it was when it
    /// was frozen, or better once he improved. Worse is lower, or higher where lower is better.
    attributes: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The members of staff whose attributes are frozen, with the worst each attribute may be, as stored: what it was
    /// when it was frozen, or better once it improved. None of them is better lower.
    staff: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The players whose energy and match sharpness are frozen, with the least each may be, as stored: what it was
    /// when it was frozen, or more once he was fitter. A player frozen at full energy stays at it.
    fitness: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The players whose positions are frozen at their exact ratings: neither lower nor higher.
    positions: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The stadiums renamed in the editor, by the UID of a club that plays there: the game gives a stadium its own
    /// name back whenever it loads the save, as it keeps no stadium names in it, and the app gives it the new one again.
    stadiums: BTreeMap<u32, HeldName>,
}

/// A stadium's name as the editor gave it, and the game's own, which an undo back to it lets go of.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct HeldName {
    name: String,
    original: String,
}

impl HeldName {
    /// What is held once the editor has given a stadium `name`, by a rename or an undo, after `held` was: `before` is
    /// the name it had, which is the game's own when nothing was held. Nothing, once it has the game's own name back.
    fn after(held: Option<&HeldName>, name: &str, before: &str) -> Option<HeldName> {
        let original = held.map_or(before, |held| held.original.as_str());
        (name != original).then(|| HeldName { name: name.to_owned(), original: original.to_owned() })
    }
}

impl Frozen {
    fn is_empty(&self) -> bool {
        self.money.is_empty()
            && self.attributes.is_empty()
            && self.staff.is_empty()
            && self.fitness.is_empty()
            && self.positions.is_empty()
            && self.stadiums.is_empty()
    }

    /// The players frozen in the way `kind` names, with what they are held at.
    fn of(&mut self, kind: FreezeKind) -> &mut BTreeMap<u32, BTreeMap<String, i64>> {
        match kind {
            FreezeKind::Attributes => &mut self.attributes,
            FreezeKind::Fitness => &mut self.fitness,
            FreezeKind::Positions => &mut self.positions,
        }
    }

    /// A value the editor just wrote to a frozen field becomes what it is held at, so it is not taken back as if the
    /// game had changed it.
    fn note(&mut self, change: &Change, value: i64) {
        let held = match change.entity {
            Entity::Club if change.field == "finance.balance" => self.money.get_mut(&change.uid),
            Entity::Player if change.field.starts_with("position.") => {
                self.positions.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field))
            }
            Entity::Player if change.field.starts_with("attribute.") => {
                self.attributes.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field))
            }
            Entity::Player => self.fitness.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field)),
            Entity::Staff => self.staff.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field)),
            _ => None,
        };
        if let Some(held) = held {
            *held = value;
        }
    }
}

/// What was frozen in each save, kept in a file so that it is frozen again when the app connects to that save another
/// time: after the app, the game or the computer was restarted.
#[derive(Default, Serialize, Deserialize)]
struct Remembered {
    /// By save (see `save_of`).
    saves: BTreeMap<String, RememberedSave>,
}

#[derive(Default, Serialize, Deserialize)]
struct RememberedSave {
    /// The players whose attributes are frozen.
    players: BTreeSet<u32>,
    /// The members of staff whose attributes are frozen; not in the files of versions before it.
    #[serde(default)]
    staff: BTreeSet<u32>,
    /// The clubs whose money is frozen.
    clubs: BTreeSet<u32>,
    /// The players whose energy and match sharpness are frozen; not in the files of versions before it.
    #[serde(default)]
    fitness: BTreeSet<u32>,
    /// The players whose position ratings are frozen; not in the files of versions before it.
    #[serde(default)]
    positions: BTreeSet<u32>,
    /// The stadiums renamed in the editor, by the UID of a club that plays there; not in the files of versions before
    /// it.
    #[serde(default)]
    stadiums: BTreeMap<u32, HeldName>,
    /// The players the user marked as favorites; not in the files of versions before it. Unlike what is frozen, a mark
    /// is kept after the player it names has left the game: it is the user's, not a state to be restored.
    #[serde(default)]
    favorites: BTreeSet<u32>,
}

impl RememberedSave {
    fn is_empty(&self) -> bool {
        self.players.is_empty()
            && self.staff.is_empty()
            && self.clubs.is_empty()
            && self.fitness.is_empty()
            && self.positions.is_empty()
            && self.stadiums.is_empty()
            && self.favorites.is_empty()
    }

    /// The players frozen in the way `kind` names.
    fn of(&mut self, kind: FreezeKind) -> &mut BTreeSet<u32> {
        match kind {
            FreezeKind::Attributes => &mut self.players,
            FreezeKind::Fitness => &mut self.fitness,
            FreezeKind::Positions => &mut self.positions,
        }
    }
}

impl Remembered {
    /// What the file at `path` holds: nothing when there is none, or it cannot be read.
    fn read(path: &Path) -> Self {
        std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
    }

    /// Writes it whole to `path`, through a file beside it, so that a write cut short never leaves half a file.
    fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let part = path.with_extension("json.part");
        std::fs::write(&part, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(&part, path)
    }
}

/// The changes written to one career, in a file of its own, so that the change log lists them again after the app, the
/// game or the computer was restarted. A career is told by its human managers, as for what is frozen (see `save_of`):
/// its saves share one history, and the app cannot know whether the game was saved after a change.
///
/// Each change and each undo is a line added to the end of the file as it is made (see `HistoryLine`): the file is never
/// written whole, so a crash costs at most the line being written, and two copies of the app can add to it at once. It
/// stays open while connected: opening it for each line took 0.2 ms here, as the antivirus looks at a file whenever it
/// is closed, which the 10,000 changes of a mass edit would feel; a line added to an open file took 3 µs.
struct History {
    /// The file; none without a data folder or a known career.
    path: Option<PathBuf>,
    /// Open to add lines to, once the first is added.
    file: Option<File>,
    /// What tells the changes of this connection from the others in the file, as each connection numbers its own from
    /// 1: those of another copy of the app, or of this one before a restart.
    session: String,
}

impl History {
    /// The history of the career `save` in `folder`, and the changes it lists in the order they were written, numbered
    /// from 1 (see `read_history`). Nothing without a folder or a career.
    fn open(folder: Option<&Path>, save: Option<&str>) -> (Self, Vec<LoggedChange>) {
        let path = folder.zip(save).map(|(folder, save)| folder.join(history_file_name(save)));
        let log = path.as_deref().map(read_history).unwrap_or_default();
        let session = format!("{}-{}", now_ms(), std::process::id());
        (Self { path, file: None, session }, log)
    }

    /// Adds `line` to the end of the file. A file that cannot be written only means that the history lacks the line.
    fn add(&mut self, line: &HistoryLine) {
        let Some(path) = &self.path else {
            return;
        };
        if self.file.is_none() {
            if let Some(folder) = path.parent() {
                let _ = std::fs::create_dir_all(folder);
            }
            self.file = OpenOptions::new().create(true).append(true).open(path).ok();
        }
        let (Some(file), Ok(mut text)) = (self.file.as_mut(), serde_json::to_string(line)) else {
            return;
        };
        text.push('\n');
        // The whole line in one write, which the system adds to the end of the file at once: the lines of two copies of
        // the app do not mix.
        let _ = file.write_all(text.as_bytes());
    }

    /// Empties the file. It is not removed: another copy of the app may have it open, and goes on adding to it.
    fn clear(&mut self) -> std::io::Result<()> {
        self.file = None;
        let Some(path) = &self.path else {
            return Ok(());
        };
        match OpenOptions::new().write(true).truncate(true).open(path) {
            Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err),
            _ => Ok(()),
        }
    }

    /// What the file calls the change `logged`: an earlier one by the name it was written under, one of this connection
    /// by its id.
    fn key(&self, logged: &LoggedChange) -> StoredKey {
        logged.stored.clone().unwrap_or_else(|| StoredKey { session: self.session.clone(), id: logged.id })
    }
}

/// The name of the history file of the career `save` (see `save_of`), such as `Steam-12345.jsonl`: a character a file
/// name may not hold becomes a `-`.
fn history_file_name(save: &str) -> String {
    let name: String = save.chars().map(|c| if c.is_ascii_alphanumeric() || c == '+' { c } else { '-' }).collect();
    format!("{name}.jsonl")
}

/// The changes the history file at `path` lists, oldest first, numbered from 1; undone where a later line says so. A
/// line that cannot be read (cut short by a crash, or of a later version) is passed over, and so is a change listed
/// twice. The mass edits are numbered afresh, as each connection numbers its own from 1.
fn read_history(path: &Path) -> Vec<LoggedChange> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let mut log: Vec<LoggedChange> = Vec::new();
    let mut places: HashMap<StoredKey, usize> = HashMap::new();
    let mut batches: HashMap<(String, u32), u32> = HashMap::new();
    for line in bytes.split(|&byte| byte == b'\n') {
        match serde_json::from_slice::<HistoryLine>(line) {
            Ok(HistoryLine::Change(stored)) => {
                let key = StoredKey { session: stored.session.clone(), id: stored.id };
                if places.contains_key(&key) {
                    continue;
                }
                let next = batches.len() as u32 + 1;
                let batch = stored.batch.map(|batch| *batches.entry((stored.session.clone(), batch)).or_insert(next));
                places.insert(key, log.len());
                log.push(stored.into_logged(log.len() + 1, batch));
            }
            Ok(HistoryLine::Undone { session, id, at }) => {
                if let Some(&place) = places.get(&StoredKey { session, id }) {
                    log[place].undone_at.get_or_insert(at);
                }
            }
            Err(_) => {}
        }
    }
    log
}

/// A line of a history file (see `History`): one JSON object, which says what it is in `line`.
#[derive(Serialize, Deserialize)]
#[serde(tag = "line", rename_all = "camelCase")]
enum HistoryLine {
    /// A change written to the game.
    Change(Box<StoredChange>),
    /// The change the file calls `session` and `id` (see `StoredKey`), undone at `at`.
    Undone { session: String, id: usize, at: u64 },
}

/// What a history file calls a change: the connection that wrote it (see `History::session`) and its id there.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StoredKey {
    session: String,
    id: usize,
}

/// A change as a history file keeps it: what the change log shows of it, and what an undo can do once the game's
/// memory is no longer what it was.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredChange {
    session: String,
    id: usize,
    at: u64,
    name: String,
    change: Change,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    batch: Option<u32>,
    /// Whether undoing it was writing values back and no more: a change of a value, or a recall from loan. A move,
    /// healing, a tie, a clause, a name, ... changed the game's lists and records, at addresses that are gone once the
    /// game has loaded a save.
    #[serde(default)]
    plain: bool,
    /// For a recall from loan that took the loan's option to buy away: that change, which an undo writes back too.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    option: Option<Change>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    moved: Option<MovedClubs>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    captaincy: Option<Captaincy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tie: Option<TieChange>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    clause: Option<ClauseChange>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    recall: Option<RecallNote>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stadium: Option<StadiumNames>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    person_name: Option<PersonNameChange>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    objects: Option<ObjectNames>,
}

impl StoredChange {
    /// `logged`, a change of the connection called `session`, as its history keeps it.
    fn of(logged: &LoggedChange, session: &str) -> Self {
        let (plain, option) = match &logged.undo {
            None => (true, None),
            Some(Undo::Recall(option)) => (true, Some(option.clone())),
            Some(_) => (false, None),
        };
        Self {
            session: session.to_owned(),
            id: logged.id,
            at: logged.at,
            name: logged.name.clone(),
            change: logged.change.clone(),
            batch: logged.batch,
            plain,
            option,
            moved: logged.moved.clone(),
            captaincy: logged.captaincy.clone(),
            tie: logged.tie.clone(),
            clause: logged.clause.clone(),
            recall: logged.recall.clone(),
            stadium: logged.stadium.clone(),
            person_name: logged.person_name.clone(),
            objects: logged.objects.clone(),
        }
    }

    /// The change as the log lists it: numbered `id`, in its mass edit `batch` as the log numbers them, written before
    /// this connection. Undo may take it back only if it was plain, as `Connection::check_earlier` works out further.
    fn into_logged(self, id: usize, batch: Option<u32>) -> LoggedChange {
        LoggedChange {
            id,
            at: self.at,
            name: self.name,
            change: self.change,
            undone_at: None,
            batch,
            earlier: true,
            undoable: self.plain,
            in_game: None,
            moved: self.moved,
            captaincy: self.captaincy,
            tie: self.tie,
            clause: self.clause,
            recall: self.recall,
            stadium: self.stadium,
            person_name: self.person_name,
            objects: self.objects,
            stored: Some(StoredKey { session: self.session, id: self.id }),
            undo: self.option.map(Undo::Recall),
        }
    }
}

/// What a reload keeps of the connection before while the game has the same career: its change log and its history.
struct Kept {
    save: Option<String>,
    log: Vec<LoggedChange>,
    history: History,
}

/// Where the app keeps the history of each career's changes (see `History`); none when it has no data folder.
struct HistoryFolder(Option<PathBuf>);

/// Where the app remembers what was frozen in each save; none when it has no data folder.
struct FrozenFile(Option<PathBuf>);

/// The folder exports are written to; none when there is no documents folder.
struct ExportsFolder(Option<PathBuf>);

/// What an export wrote, and where.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportReport {
    /// The file, and its name and folder apart.
    path: PathBuf,
    file: String,
    folder: PathBuf,
    /// The players, staff or clubs written.
    count: usize,
    /// Players, staff or clubs whose objects changed while they were read: left out.
    skipped: usize,
}

/// What connecting froze again of what was frozen in the save before (see `Connection::restore_frozen`).
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Refrozen {
    /// The players whose attributes are frozen again, by name.
    players: Vec<String>,
    /// The members of staff whose attributes are frozen again, by name.
    staff: Vec<String>,
    /// The clubs whose money is frozen again, by name.
    clubs: Vec<String>,
    /// The players whose energy and match sharpness are frozen again, by name.
    fitness: Vec<String>,
    /// The players whose positions are frozen again, by name.
    positions: Vec<String>,
    /// The stadiums given the names the editor gave them again, by their new names.
    stadiums: Vec<String>,
    /// How many are left for later, still remembered: the editor has no profile for this version of the game, or a
    /// check did not pass.
    waiting: usize,
}

impl Refrozen {
    fn is_empty(&self) -> bool {
        self.players.is_empty()
            && self.staff.is_empty()
            && self.clubs.is_empty()
            && self.fitness.is_empty()
            && self.positions.is_empty()
            && self.stadiums.is_empty()
            && self.waiting == 0
    }
}

/// Where the game's array of clubs begins now; none when it cannot be read.
fn clubs_begin(session: &Session) -> Option<u64> {
    let array = session.arrays.clubs.as_ref()?;
    array.locate(&session.process, &session.plugin).ok().map(|(begin, _)| begin)
}

/// What tells one save from another: the storefront, and the managers that human players control in it, whom each
/// new save makes afresh. None when the lists name no human manager.
fn save_of(session: &Session, humans: &[u32]) -> Option<String> {
    if humans.is_empty() {
        return None;
    }
    let managers: Vec<String> = humans.iter().map(u32::to_string).collect();
    Some(format!("{:?}:{}", session.game.storefront, managers.join("+")))
}

/// Keeps the fields `fields` of each person in `held` (players, or members of staff: `target_of` finds where one is)
/// from getting worse than they are held at (see `Connection::hold_frozen`): worse is lower, or higher where lower is
/// better.
fn hold_people(
    session: &Session,
    target_of: impl Fn(u32) -> Option<Target>,
    held: &mut BTreeMap<u32, BTreeMap<String, i64>>,
    fields: &[Field],
) {
    for (&uid, limits) in held.iter_mut() {
        let Some(target) = target_of(uid) else {
            continue;
        };
        let Ok(values) = session.read_fields(&target, fields) else {
            continue;
        };
        for (field, now) in fields.iter().zip(values) {
            let (Some(now), Some(limit)) = (now, limits.get_mut(&field.key)) else {
                continue;
            };
            let worse = if LOWER_IS_BETTER.contains(&field.key.as_str()) { now > *limit } else { now < *limit };
            if worse {
                // Only while the game still holds what was read: a day it is working out is left to it.
                let _ = session.write_field_if(&target, field, now, *limit);
            } else {
                *limit = now;
            }
        }
    }
}

/// Keeps the position ratings of each player in `held` exactly at what they are held at:
/// if the game's simulation engine tries to raise or lower them, what the user set is put back.
fn hold_positions(
    session: &Session,
    target_of: impl Fn(u32) -> Option<Target>,
    held: &mut BTreeMap<u32, BTreeMap<String, i64>>,
    fields: &[Field],
) {
    for (&uid, targets) in held.iter_mut() {
        let Some(target) = target_of(uid) else {
            continue;
        };
        let Ok(values) = session.read_fields(&target, fields) else {
            continue;
        };
        for (field, now) in fields.iter().zip(values) {
            let (Some(now), Some(target_val)) = (now, targets.get_mut(&field.key)) else {
                continue;
            };
            if now != *target_val {
                let _ = session.write_field_if(&target, field, now, *target_val);
            }
        }
    }
}

/// A mass edit that was worked out and shown, waiting to be applied as it was shown.
struct PendingMass {
    id: u32,
    entity: Entity,
    planned: Vec<Planned>,
}

impl Connection {
    /// Reads every list. The change log is the one `kept` by a reload while the game has the same career, or else the
    /// one the history of the career in `folder` lists (see `History`), checked against the game (see
    /// `check_earlier`). A mass edit previewed before is dropped, since its people may have moved. Nothing is frozen
    /// yet.
    fn load(session: Session, folder: Option<&Path>, kept: Option<Kept>) -> Result<Self, Failure> {
        // The game may have loaded a save or moved on since the checks last ran; the date the lists' ages are worked
        // out from is one of them.
        session.recheck();
        let players = PlayerIndex::new(session.players()?);
        let staff = session.staff()?;
        let human_clubs = staff.iter().filter(|member| member.is_human).filter_map(|member| member.club_uid).collect();
        let mut humans: Vec<u32> = staff.iter().filter(|member| member.is_human).map(|member| member.uid).collect();
        humans.sort_unstable();
        let save = save_of(&session, &humans);
        let staff = StaffIndex::new(staff);
        let clubs = ClubIndex::new(session.clubs()?);
        let (history, log) = match kept {
            Some(kept) if kept.save == save => (kept.history, kept.log),
            _ => History::open(folder, save.as_deref()),
        };
        let next_id = log.iter().filter_map(|logged| logged.batch).max().unwrap_or(0) + 1;
        let frozen = Frozen::default();
        // The clubs were just read, from this save.
        let begin = clubs_begin(&session).unwrap_or(0);
        let clubs_seen = ClubsSeen {
            same_save: Some(true),
            checked: Some(Instant::now()),
            ..ClubsSeen::unknown(begin, session.loads())
        };
        let people = OnceCell::new();
        let mut connection = Self {
            session,
            players,
            staff,
            clubs,
            human_clubs,
            log,
            history,
            mass: None,
            next_id,
            frozen,
            favorites: BTreeSet::new(),
            growth: Vec::new(),
            growth_seasons: DEFAULT_SEASONS,
            save,
            clubs_seen,
            people,
        };
        connection.check_earlier();
        Ok(connection)
    }

    /// For each change listed from before this connection: whether Undo may take it back, and, unless it is undone,
    /// whether the game holds what it wrote (see `in_game`). An earlier change is undone as a new edit back to its old
    /// value would be (see `undo_earlier`), so only one whose undo was writing values back (see `StoredChange::plain`),
    /// of a field that is not a pointer (the objects it pointed at are gone once the game has loaded a save), to a value
    /// the editor writes.
    fn check_earlier(&mut self) {
        if !self.log.iter().any(|logged| logged.earlier) {
            return;
        }
        let fields: HashMap<(Entity, String), Field> = [Entity::Player, Entity::Staff, Entity::Club]
            .into_iter()
            .flat_map(|entity| self.session.fields(entity))
            .map(|field| ((field.entity, field.key.clone()), field))
            .collect();
        let writes_back = |change: &Change| {
            let field = fields.get(&(change.entity, change.field.clone()));
            field.is_some_and(|field| field.kind != Kind::Pointer && field.takes(change.old))
        };
        let mut nations = None;
        let checked: Vec<(usize, bool, Option<bool>)> = self
            .log
            .iter()
            .enumerate()
            .filter(|(_, logged)| logged.earlier)
            .map(|(at, logged)| {
                let option = match &logged.undo {
                    Some(Undo::Recall(option)) => Some(option),
                    _ => None,
                };
                let undoable = logged.undoable && writes_back(&logged.change) && option.is_none_or(writes_back);
                let in_game = logged.undone_at.is_none().then(|| self.in_game(logged, &fields, &mut nations)).flatten();
                (at, undoable, in_game)
            })
            .collect();
        for (at, undoable, in_game) in checked {
            self.log[at].undoable = undoable;
            self.log[at].in_game = in_game;
        }
    }

    /// Whether the game holds what the earlier change `logged` wrote: a value as read now (a nation or a city of birth
    /// by its name), a club or a job as the lists just read have it, a stadium's or a player's name as read now. None
    /// where that is not looked at: healing and lifting bans (the game brings new ones), cohesion, tactics, retirement,
    /// ties, clauses and captaincies. `fields` are the fields by entity and key; `nations` keeps the nations of the
    /// lists once they are worked out.
    fn in_game(
        &self,
        logged: &LoggedChange,
        fields: &HashMap<(Entity, String), Field>,
        nations: &mut Option<Vec<Nation>>,
    ) -> Option<bool> {
        let change = &logged.change;
        let uid = change.uid;
        match (change.entity, change.field.as_str()) {
            (Entity::Player, "club") => self.players.get(uid).map(|p| i64::from(p.club_uid.unwrap_or(0)) == change.new),
            (Entity::Staff, "club") => self.staff.get(uid).map(|s| i64::from(s.club_uid.unwrap_or(0)) == change.new),
            (Entity::Staff, "contract.job") => self.staff.get(uid).map(|s| s.job.map(i64::from) == Some(change.new)),
            (Entity::Club, "stadium.name") => {
                let to = &logged.stadium.as_ref()?.to;
                let now = self.session.stadium_name(self.clubs.get(uid)?).ok()?;
                Some(now.name == *to)
            }
            (Entity::Player, key) if key.starts_with("name.") => {
                let to = &logged.person_name.as_ref()?.to;
                let now = self.session.player_names(self.players.get(uid)?).ok()?;
                let held = match key {
                    "name.first" => now.first,
                    "name.last" => now.last,
                    "name.common" => now.common,
                    "name.full" => now.full,
                    _ => return None,
                };
                Some(held == *to)
            }
            (entity, key) => {
                let field = fields.get(&(entity, key.to_owned()))?;
                let (target, _) = self.target(entity, uid).ok()?;
                let now = self.session.read_field(&target, field).ok()?;
                if field.kind != Kind::Pointer {
                    return Some(now == change.new);
                }
                let to = logged.objects.as_ref()?.to.as_ref()?;
                Some(self.object_name(key, now, nations).as_ref() == Some(to))
            }
        }
    }

    /// The name of the nation or the city (as the field `key` says) at `address`, as the game has it now; `nations`
    /// keeps the nations of the lists once they are worked out.
    fn object_name(&self, key: &str, address: i64, nations: &mut Option<Vec<Nation>>) -> Option<String> {
        match key {
            "nation" => nations
                .get_or_insert_with(|| self.nations())
                .iter()
                .find(|nation| nation.address == address as u64)
                .map(|nation| nation.name.clone()),
            "city_of_birth" => self.session.city_at(address as u64).map(|city| city.name),
            _ => None,
        }
    }

    /// For a change of a field that points at one of the game's objects, the names of the objects it pointed at and
    /// points at: they outlive the addresses the change is logged with.
    fn objects_of(&self, change: &Change) -> Option<ObjectNames> {
        // The fields of kind `Kind::Pointer`: a person's nation and a player's city of birth. By key, as this is asked
        // for every change of a mass edit, and none of these is ever part of one.
        if !matches!(change.field.as_str(), "nation" | "city_of_birth") {
            return None;
        }
        let mut nations = None;
        Some(ObjectNames {
            from: self.object_name(&change.field, change.old, &mut nations),
            to: self.object_name(&change.field, change.new, &mut nations),
        })
    }

    /// Whom the game's ids of people name: read once for these lists, a read for each player, and kept until they
    /// are read again.
    fn people(&self) -> &People {
        self.people.get_or_init(|| self.session.people(&self.players))
    }

    /// Freezes again what was frozen in this save before, as the file at `path` remembers it: the attributes, energy,
    /// match sharpness and positions of its players and the money of its clubs, each held from what it is now. Only on
    /// a build the editor has a profile for and only where its checks let it write: on any other, after an update of
    /// the game say, nothing is frozen, and the file keeps them for later. What is no longer in the lists (a player who
    /// retired) is forgotten.
    fn restore_frozen(&mut self, path: Option<&Path>) -> Refrozen {
        let mut refrozen = Refrozen::default();
        let (Some(path), Some(save)) = (path, self.save.clone()) else {
            return refrozen;
        };
        let mut remembered = Remembered::read(path);
        // The favorites are read here too, as this is where the file is read: they are not frozen, and nothing is done
        // with them but keeping them for the lists. A mark whose player is no longer in the lists stays: the file keeps
        // what the user chose, not what the game holds.
        self.favorites = remembered.saves.get(&save).map(|entry| entry.favorites.clone()).unwrap_or_default();
        let Some(entry) = remembered.saves.get_mut(&save) else {
            return refrozen;
        };
        let count = entry.players.len()
            + entry.staff.len()
            + entry.clubs.len()
            + entry.fitness.len()
            + entry.positions.len()
            + entry.stadiums.len();
        entry.players.retain(|&uid| self.players.get(uid).is_some());
        entry.staff.retain(|&uid| self.staff.get(uid).is_some());
        entry.clubs.retain(|&uid| self.clubs.get(uid).is_some());
        entry.fitness.retain(|&uid| self.players.get(uid).is_some());
        entry.positions.retain(|&uid| self.players.get(uid).is_some());
        entry.stadiums.retain(|&uid, _| self.clubs.get(uid).is_some());
        let (players, staff) = (entry.players.clone(), entry.staff.clone());
        let (clubs, fitness, positions) = (entry.clubs.clone(), entry.fitness.clone(), entry.positions.clone());
        let stadiums = entry.stadiums.clone();
        if players.len() + staff.len() + clubs.len() + fitness.len() + positions.len() + stadiums.len() < count {
            remembered.saves.retain(|_, save| !save.is_empty());
            let _ = remembered.write(path);
        }
        let safe = self.session.known_build() && self.session.process.can_write();
        for uid in players {
            match safe.then(|| self.freeze_player(uid)) {
                Some(Ok(())) => refrozen.players.push(self.player_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in staff {
            match safe.then(|| self.freeze_member(uid)) {
                Some(Ok(())) => refrozen.staff.push(self.staff_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in fitness {
            match safe.then(|| self.freeze_fitness(uid)) {
                Some(Ok(())) => refrozen.fitness.push(self.player_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in clubs {
            match safe.then(|| self.freeze_club(uid)) {
                Some(Ok(())) => refrozen.clubs.push(self.club_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in positions {
            match safe.then(|| self.freeze_positions(uid)) {
                Some(Ok(())) => refrozen.positions.push(self.player_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for (uid, held) in stadiums {
            if safe && self.give_stadium_name(uid, &held.name) {
                refrozen.stadiums.push(held.name.clone());
                self.frozen.stadiums.insert(uid, held);
            } else {
                refrozen.waiting += 1;
            }
        }
        refrozen
    }

    /// Gives the stadium of the club `uid` the name `name`, unless it has it already: whether it has it now. Not
    /// logged: the rename that chose the name was.
    fn give_stadium_name(&self, uid: u32, name: &str) -> bool {
        let Some(club) = self.clubs.get(uid) else {
            return false;
        };
        match self.session.stadium_name(club) {
            Ok(now) if now.name == name => true,
            Ok(_) => self
                .session
                .plan_stadium_rename(club, name)
                .and_then(|plan| self.session.apply_stadium_rename(&plan))
                .is_ok(),
            Err(_) => false,
        }
    }

    /// Gives each stadium renamed in the editor its name again where the game has given it back its own, as it does
    /// whenever it loads the save. Before that, the game is checked to have this save: a save loaded (this one again or
    /// another) raises the game's count of saves loaded, may move the clubs' array or objects, and gives the stadiums
    /// the names in the game's database. Once it is this one, clubs that moved are read again; while it is another, or
    /// none, nothing is written, and it is looked at again every little while.
    fn hold_stadiums(&mut self) {
        if self.frozen.stadiums.is_empty() {
            return;
        }
        let Some(begin) = clubs_begin(&self.session) else {
            return;
        };
        let loads = self.session.loads();
        let lost = self.clubs_lost();
        // Names are read only from clubs where the lists found them.
        let off = !lost && self.stadium_names_off();
        let seen = &self.clubs_seen;
        let loaded = matches!((seen.loads, loads), (Some(then), Some(now)) if now != then);
        if begin != seen.begin || loaded || (lost && !seen.lost) || (off && !seen.off) {
            self.clubs_seen = ClubsSeen { lost, off, ..ClubsSeen::unknown(begin, loads) };
        }
        self.clubs_seen.off = off;
        self.clubs_seen.loads = loads.or(self.clubs_seen.loads);
        let seen = &self.clubs_seen;
        let every = if seen.since.elapsed() < SAVE_SETTLES { SAVE_RECHECK } else { SAVE_RECHECK_LATER };
        if (seen.same_save != Some(true) || lost) && seen.checked.is_none_or(|at| at.elapsed() >= every) {
            if seen.same_save != Some(true) {
                self.clubs_seen.same_save = Some(self.same_save());
            }
            if self.clubs_seen.same_save == Some(true)
                && lost
                && let Ok(clubs) = self.session.clubs()
            {
                self.clubs = ClubIndex::new(clubs);
            }
            self.clubs_seen.lost = self.clubs_lost();
            self.clubs_seen.checked = Some(Instant::now());
        }
        if self.clubs_seen.same_save == Some(true) {
            // Checked here to be a save of this career, its clubs read again where they moved: the names are given
            // even after the game has loaded it again, when nothing else is written until the lists are read again.
            let _vouched = self.session.vouch_for_save();
            self.give_stadium_names();
        }
    }

    /// Gives every stadium renamed in the editor the name it was given, where it has another (see
    /// `give_stadium_name`). For the save the lists were read from only.
    fn give_stadium_names(&self) {
        for (&uid, held) in &self.frozen.stadiums {
            self.give_stadium_name(uid, &held.name);
        }
    }

    /// Whether the game has given a stadium renamed in the editor a name other than the one the editor gave it.
    fn stadium_names_off(&self) -> bool {
        self.frozen.stadiums.iter().any(|(&uid, held)| {
            let now = self.clubs.get(uid).and_then(|club| self.session.stadium_name(club).ok());
            now.is_some_and(|now| now.name != held.name)
        })
    }

    /// Whether a club whose stadium was renamed is missing from the lists, or its object is no longer where they found
    /// it.
    fn clubs_lost(&self) -> bool {
        self.frozen.stadiums.keys().any(|&uid| {
            self.clubs.get(uid).is_none_or(|club| {
                self.session.process.read_u32(club.address + self.session.layout.club.uid).ok() != Some(uid)
            })
        })
    }

    /// Whether the game has the save the lists were read from: the same human managers.
    fn same_save(&self) -> bool {
        let Ok(staff) = self.session.staff() else {
            return false;
        };
        let mut humans: Vec<u32> = staff.iter().filter(|member| member.is_human).map(|member| member.uid).collect();
        humans.sort_unstable();
        self.save.is_some() && save_of(&self.session, &humans) == self.save
    }

    /// Holds and remembers `name`, the name the editor just gave the stadium of the club `uid`, by a rename or an undo
    /// (see `HeldName::after`); a stadium given back the game's own name is let go of.
    fn hold_stadium_name(&mut self, path: Option<&Path>, uid: u32, name: &str, before: &str) {
        match HeldName::after(self.frozen.stadiums.get(&uid), name, before) {
            Some(held) => {
                self.frozen.stadiums.insert(uid, held.clone());
                self.remember(path, |save| {
                    save.stadiums.insert(uid, held);
                });
            }
            None => {
                self.frozen.stadiums.remove(&uid);
                self.remember(path, |save| {
                    save.stadiums.remove(&uid);
                });
            }
        }
    }

    /// Gives the stadium the name it had before `renamed`: by putting back what it wrote, or, once the game has given
    /// the stadium its own name again and the app this one after it (the save loaded meanwhile), by renaming it back.
    fn undo_stadium(&self, renamed: &StadiumRename) -> Result<(), Failure> {
        let Err(err) = self.session.undo_stadium_rename(renamed) else {
            return Ok(());
        };
        let Some(club) = self.clubs.get(renamed.club) else {
            return Err(err.into());
        };
        match self.session.stadium_name(club) {
            Ok(now) if now.name == renamed.to => {}
            _ => return Err(err.into()),
        }
        let plan = self.session.plan_stadium_rename(club, &renamed.from)?;
        self.session.apply_stadium_rename(&plan)?;
        Ok(())
    }

    /// Changes, with `change`, what the file at `path` remembers as frozen in this save. Without a file or a known
    /// save nothing is remembered, and a file that cannot be written only means that this is not.
    fn remember(&self, path: Option<&Path>, change: impl FnOnce(&mut RememberedSave)) {
        let (Some(path), Some(save)) = (path, &self.save) else {
            return;
        };
        let mut remembered = Remembered::read(path);
        change(remembered.saves.entry(save.clone()).or_default());
        remembered.saves.retain(|_, save| !save.is_empty());
        let _ = remembered.write(path);
    }

    /// Freezes the attributes of the player `uid` at what they are now (see `hold_frozen`). Refused while the
    /// attributes may not be written.
    fn freeze_player(&mut self, uid: u32) -> Result<(), Failure> {
        let held = self.held_values(Entity::Player, uid, &self.attribute_fields(Entity::Player))?;
        self.frozen.attributes.insert(uid, held);
        Ok(())
    }

    /// Freezes the attributes of the member of staff `uid` at what they are now (see `hold_frozen`). Refused while the
    /// attributes may not be written.
    fn freeze_member(&mut self, uid: u32) -> Result<(), Failure> {
        let held = self.held_values(Entity::Staff, uid, &self.attribute_fields(Entity::Staff))?;
        self.frozen.staff.insert(uid, held);
        Ok(())
    }

    /// Freezes the energy and match sharpness of the player `uid` at what they are now (see `hold_frozen`). Refused
    /// while they may not be written.
    fn freeze_fitness(&mut self, uid: u32) -> Result<(), Failure> {
        let held = self.held_values(Entity::Player, uid, &self.fitness_fields()?)?;
        self.frozen.fitness.insert(uid, held);
        Ok(())
    }

    /// Freezes the position ratings of the player `uid` at what they are now. Refused while they may not be written.
    fn freeze_positions(&mut self, uid: u32) -> Result<(), Failure> {
        let held = self.held_values(Entity::Player, uid, &self.position_fields())?;
        self.frozen.positions.insert(uid, held);
        Ok(())
    }

    /// Freezes what `kind` names for each of the players `uids`, or unfreezes it, and has the file at `path` remember
    /// it for this save. Those frozen already keep what they are held at. Refused at once while those fields may not
    /// be written; a player who cannot be frozen otherwise is said, and the others are frozen all the same.
    fn set_frozen(
        &mut self,
        path: Option<&Path>,
        kind: FreezeKind,
        uids: &[u32],
        frozen: bool,
    ) -> Result<TeamFreeze, Failure> {
        let fields = match kind {
            FreezeKind::Attributes => self.attribute_fields(Entity::Player),
            FreezeKind::Fitness => self.fitness_fields()?,
            FreezeKind::Positions => self.position_fields(),
        };
        // The fields share one check, which is the same for every player.
        if frozen
            && let Some(field) = fields.first()
            && let Some(lock) = self.session.field_lock(field)
        {
            return Err(EditError::Locked { field: field.key.clone(), lock }.into());
        }
        let mut changed = Vec::new();
        let mut failed = Vec::new();
        for &uid in uids {
            if self.frozen.of(kind).contains_key(&uid) == frozen {
                continue;
            }
            if !frozen {
                self.frozen.of(kind).remove(&uid);
                changed.push(uid);
                continue;
            }
            match self.held_values(Entity::Player, uid, &fields) {
                Ok(held) => {
                    self.frozen.of(kind).insert(uid, held);
                    changed.push(uid);
                }
                Err(error) => {
                    failed.push(MassFailure { uid, name: self.player_name(uid), field: kind.key().to_owned(), error })
                }
            }
        }
        self.remember(path, |save| {
            let remembered = save.of(kind);
            for uid in &changed {
                if frozen {
                    remembered.insert(*uid);
                } else {
                    remembered.remove(uid);
                }
            }
        });
        Ok(TeamFreeze { changed: changed.len(), failed })
    }

    /// What the fields `fields` of the player or member of staff `uid` (as `entity` says) hold now, by key: what
    /// freezing them holds them at. Refused while they may not be written; they share one check, so what holds for the
    /// first holds for all.
    fn held_values(&self, entity: Entity, uid: u32, fields: &[Field]) -> Result<BTreeMap<String, i64>, Failure> {
        let (target, _) = self.target(entity, uid)?;
        if let Some(field) = fields.first()
            && let Some(lock) = self.session.field_lock(field)
        {
            return Err(EditError::Locked { field: field.key.clone(), lock }.into());
        }
        let values = self.session.read_fields(&target, fields)?;
        Ok(fields.iter().zip(values).filter_map(|(field, value)| Some((field.key.clone(), value?))).collect())
    }

    /// Freezes the money of the club `uid` at its balance now (see `hold_money`). Refused while the balance may not be
    /// written.
    fn freeze_club(&mut self, uid: u32) -> Result<(), Failure> {
        let target = self.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?.target();
        let field = self.session.field(Entity::Club, "finance.balance")?;
        if let Some(lock) = self.session.field_lock(&field) {
            return Err(EditError::Locked { field: field.key.clone(), lock }.into());
        }
        let balance = self.session.read_field(&target, &field)?;
        self.frozen.money.insert(uid, balance);
        Ok(())
    }

    /// What the window shows about the connection; `load_ms` is how long reading took.
    fn info(&self, load_ms: u128) -> ConnectionInfo {
        ConnectionInfo {
            game: self.session.game.clone(),
            profile: self.session.profile.as_ref().map(|p| p.name.clone()),
            arrays: self.session.arrays.clone(),
            players: self.players.len(),
            staff: self.staff.len(),
            clubs: self.clubs.len(),
            game_date: self.session.game_date(),
            load_ms,
            editable: self.session.process.can_write() && self.session.writes_allowed(),
            writable: self.session.process.can_write(),
            known_build: self.session.known_build(),
            gender_known: self.session.layout.player.gender.is_some() && self.session.layout.staff.gender.is_some(),
            health: Health::clone(&self.session.health()),
            refrozen: None,
        }
    }

    fn fresh_id(&mut self) -> u32 {
        self.next_id += 1;
        self.next_id - 1
    }

    /// The players, staff or clubs a search and its filter select, as edit targets with names.
    fn select(&self, entity: Entity, query: &str, filters: Filters) -> Vec<(Target, String)> {
        match entity {
            Entity::Player => {
                let filter = filters.player_filter.unwrap_or_default();
                let favorites = &self.favorites;
                let hits = self.players.search(query).into_iter().filter(|p| filter.matches_with(p, favorites));
                hits.map(|p| (p.target(), p.name.clone())).collect()
            }
            Entity::Staff => {
                let filter = filters.staff_filter.unwrap_or_default();
                let hits = self.staff.search(query).into_iter().filter(|s| filter.matches(s));
                hits.map(|s| (s.target(), s.name.clone())).collect()
            }
            Entity::Club => {
                let filter = filters.club_filter.unwrap_or_default();
                let hits = self.clubs.search(query).into_iter().filter(|c| filter.matches(c));
                hits.map(|c| (c.target(), c.name.clone())).collect()
            }
        }
    }

    /// The id of the next change logged: one more than the last one's, as the log is in the order of its ids.
    fn next_log_id(&self) -> usize {
        self.log.last().map_or(1, |logged| logged.id + 1)
    }

    /// A log entry for `change` of the one called `name`, written now by this connection, with nothing more to say about
    /// it than its values; `batch` groups the changes of one mass edit.
    fn entry(&self, change: Change, name: String, batch: Option<u32>) -> LoggedChange {
        LoggedChange {
            id: self.next_log_id(),
            at: now_ms(),
            name,
            change,
            undone_at: None,
            batch,
            earlier: false,
            undoable: true,
            in_game: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            recall: None,
            stadium: None,
            person_name: None,
            objects: None,
            stored: None,
            undo: None,
        }
    }

    /// Adds `logged` to the log, and to the history of the career.
    fn push_log(&mut self, logged: LoggedChange) -> LoggedChange {
        self.history.add(&HistoryLine::Change(Box::new(StoredChange::of(&logged, &self.history.session))));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change just written; `batch` groups the changes of one mass edit.
    fn log_change(&mut self, change: Change, name: String, batch: Option<u32>) -> LoggedChange {
        // Before the lists take the new value: a nation's name is found among them.
        let objects = self.objects_of(&change);
        self.note_change(&change, change.new);
        self.push_log(LoggedChange { objects, ..self.entry(change, name, batch) })
    }

    /// Logs a recall from loan just written, as a change of the day the loan ends; with the change of its option to
    /// buy, if the recall took it away, which its undo writes back too.
    fn log_recall(&mut self, change: Change, name: String, option: Option<Change>) -> LoggedChange {
        self.note_change(&change, change.new);
        let entry = self.entry(change, name, None);
        match option {
            Some(option) => self.push_log(LoggedChange {
                recall: Some(RecallNote { option_fee: option.old }),
                undo: Some(Undo::Recall(option)),
                ..entry
            }),
            None => self.push_log(entry),
        }
    }

    /// Writes changes a mass edit worked out, each only while the game still holds the value it
    /// was planned from, and logs them as the batch `batch`.
    fn write_planned(&mut self, entity: Entity, planned: Vec<Planned>, batch: u32) -> MassReport {
        let fields: BTreeMap<String, Field> =
            self.session.fields(entity).into_iter().map(|field| (field.key.clone(), field)).collect();
        let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
        for planned in planned {
            let field = &fields[&planned.field];
            match self.session.write_field_if(&planned.target, field, planned.old, planned.new) {
                Ok(change) => {
                    self.log_change(change, planned.name, Some(batch));
                    report.applied += 1;
                }
                Err(err) => report.failed.push(MassFailure {
                    uid: planned.uid,
                    name: planned.name,
                    field: planned.field,
                    error: err.into(),
                }),
            }
        }
        report
    }

    /// Logs a captaincy just written, as a change of the club's `captain` or `vice_captain`
    /// from one player's UID to the other's (0 for nobody).
    fn log_captain(&mut self, done: CaptainSet) -> LoggedChange {
        let field = match done.role {
            CaptainRole::Captain => "captain",
            CaptainRole::ViceCaptain => "vice_captain",
        };
        let change = Change {
            entity: Entity::Club,
            uid: done.club,
            field: field.to_owned(),
            old: i64::from(done.old.unwrap_or(0)),
            new: i64::from(done.new),
        };
        let captaincy = Captaincy {
            team: done.team,
            kind: done.kind,
            age_limit: done.age_limit,
            from: done.old.map(|uid| self.player_name(uid)),
            to: self.player_name(done.new),
            swapped: done.swapped,
        };
        let entry = self.entry(change, self.club_name(done.club), None);
        self.push_log(LoggedChange { captaincy: Some(captaincy), undo: Some(Undo::Captain(done)), ..entry })
    }

    /// Logs healing just written, as a change of the player's `injuries` from how many he had to none.
    fn log_heal(&mut self, done: Healed, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "injuries".to_owned(),
            old: done.injuries as i64,
            new: 0,
        };
        let entry = self.entry(change, self.player_name(done.player), batch);
        self.push_log(LoggedChange { undo: Some(Undo::Heal(done)), ..entry })
    }

    /// Logs cohesion just set, as a change of the player's `cohesion` with his club from what it was to what it is.
    fn log_cohesion(&mut self, done: CohesionSet, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "cohesion".to_owned(),
            old: i64::from(done.before),
            new: i64::from(done.value),
        };
        let entry = self.entry(change, self.player_name(done.player), batch);
        self.push_log(LoggedChange { undo: Some(Undo::Cohesion(done)), ..entry })
    }

    /// Logs Max tactics just written, as a change of how well the player knows the tactic (`tactics`, 0..100) from what
    /// it was to what it is.
    fn log_tactics(&mut self, done: TacticsSet, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "tactics".to_owned(),
            old: i64::from(done.before.overall),
            new: i64::from(done.after.overall),
        };
        let entry = self.entry(change, self.player_name(done.player), batch);
        self.push_log(LoggedChange { undo: Some(Undo::Tactics(done)), ..entry })
    }

    /// Logs lifting just written, as a change of the player's `bans` from how many he had to none.
    fn log_lift(&mut self, done: Lifted, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "bans".to_owned(),
            old: done.bans as i64,
            new: 0,
        };
        let entry = self.entry(change, self.player_name(done.player), batch);
        self.push_log(LoggedChange { undo: Some(Undo::Lift(done)), ..entry })
    }

    /// Logs keeping a player from retiring just written, as a change of his `retirement` from the date he was to retire
    /// on (0 when the game had planned none) to 0.
    fn log_retirement(&mut self, done: RetirementSet) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "retirement".to_owned(),
            old: done.date.map_or(0, FmDate::to_number),
            new: 0,
        };
        let entry = self.entry(change, self.player_name(done.player), None);
        self.push_log(LoggedChange { undo: Some(Undo::Retirement(done)), ..entry })
    }

    /// Logs a change to a player's ties just written, as a change of his field `tie.nationality`,
    /// `tie.trainedInNation`, `tie.trainedAtClub` or `tie.workPermit` from one nation's or club's UID to the other's
    /// (0 for none).
    fn log_tie(&mut self, done: RelationSet) -> LoggedChange {
        let tie = done.before.as_ref().or(done.after.as_ref()).map_or(Tie::Nationality, |relation| relation.tie);
        let field = match tie {
            Tie::Nationality => "tie.nationality",
            Tie::TrainedInNation => "tie.trainedInNation",
            Tie::TrainedAtClub => "tie.trainedAtClub",
            Tie::WorkPermit => "tie.workPermit",
        };
        let end = |relation: &Option<fmlibre_core::Relation>| {
            relation.as_ref().map(|relation| TieEnd {
                name: relation.name.clone().unwrap_or_else(|| relation.target_uid.to_string()),
                rule: relation.rule,
            })
        };
        let uid = |relation: &Option<fmlibre_core::Relation>| relation.as_ref().map_or(0, |r| i64::from(r.target_uid));
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: field.to_owned(),
            old: uid(&done.before),
            new: uid(&done.after),
        };
        let tie = TieChange { from: end(&done.before), to: end(&done.after) };
        let entry = self.entry(change, self.player_name(done.player), None);
        self.push_log(LoggedChange { tie: Some(tie), undo: Some(Undo::Tie(done)), ..entry })
    }

    /// Logs a stadium renamed, as a change of the club's `stadium.name` from one length in bytes to the other, with the
    /// names; its undo writes the old name back.
    fn log_stadium(&mut self, done: StadiumRename) -> LoggedChange {
        let change = Change {
            entity: Entity::Club,
            uid: done.club,
            field: "stadium.name".to_owned(),
            old: done.from.len() as i64,
            new: done.to.len() as i64,
        };
        let name = self.clubs.get(done.club).map_or_else(|| done.club.to_string(), |club| club.name.clone());
        let stadium = StadiumNames { from: done.from.clone(), to: done.to.clone() };
        let entry = self.entry(change, name, None);
        self.push_log(LoggedChange { stadium: Some(stadium), undo: Some(Undo::Stadium(done)), ..entry })
    }

    /// Logs a change of a player's name just written, as a change of his field `name.first`, `name.last`,
    /// `name.common` or `name.full` from one length in bytes to the other (0 for none), with the names.
    fn log_name(&mut self, done: NameChange) -> LoggedChange {
        let bytes = |name: &Option<String>| name.as_ref().map_or(0, |name| name.len() as i64);
        let change = Change {
            entity: Entity::Player,
            uid: done.person,
            field: format!("name.{}", done.kind.key()),
            old: bytes(&done.from),
            new: bytes(&done.to),
        };
        let person_name = PersonNameChange { from: done.from.clone(), to: done.to.clone() };
        let entry = self.entry(change, self.player_name(done.person), None);
        self.push_log(LoggedChange { person_name: Some(person_name), undo: Some(Undo::Name(done)), ..entry })
    }

    /// Reads the names of the player `uid` again into his row of the list, after the editor gave him another one or
    /// put his old one back: the name he is shown and found by, and his full name.
    fn renamed_player(&mut self, uid: u32) {
        let Some(names) = self.players.get(uid).and_then(|player| self.session.player_names(player).ok()) else {
            return;
        };
        let shown = names.shown(uid);
        self.players.rename(uid, |player| {
            player.name = shown;
            player.full_name = names.full;
        });
    }

    /// Logs a change to a player's contract clauses just written, as a change of his field `clause` from one amount to
    /// the other (0 for none, or for a clause added or taken out), with the clause before and after.
    fn log_clause(&mut self, done: ClauseSet) -> LoggedChange {
        let amount = |clause: &Option<Clause>| clause.as_ref().and_then(|c| c.amount).map_or(0, i64::from);
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "clause".to_owned(),
            old: amount(&done.before),
            new: amount(&done.after),
        };
        let clause = ClauseChange { from: done.before.clone(), to: done.after.clone() };
        let entry = self.entry(change, self.player_name(done.player), None);
        self.push_log(LoggedChange { clause: Some(clause), undo: Some(Undo::Clause(done)), ..entry })
    }

    /// The nation with the UID `uid`, among the nations of the people in the lists.
    fn nation(&self, uid: u32) -> Result<Nation, Failure> {
        self.nations()
            .into_iter()
            .find(|nation| nation.uid == Some(uid))
            .ok_or_else(|| Failure::new("app.notFound", format!("No nation with UID {uid}")).with("uid", uid))
    }

    /// Works out moving the member of staff `uid` to the club `club`, as `job` if given, or else in his own job; one
    /// who has no club is signed for it, as `job`, on a contract the editor makes on `terms`.
    fn plan_staff_move(&self, uid: u32, club: u32, job: Option<u8>, terms: MoveTerms) -> Result<StaffPlan, Failure> {
        let member = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
        let to = self.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        let planned = match member.club_uid {
            None => job.ok_or(MoveError::NoJob).and_then(|job| self.session.plan_staff_signing(member, to, job, terms)),
            Some(_) => self.session.plan_staff_move(member, to, job),
        };
        planned.map_err(|err| self.with_names(err.into()))
    }

    /// Works out giving the member of staff `uid` the job `job` at his club.
    fn plan_staff_job(&self, uid: u32, job: u8) -> Result<StaffPlan, Failure> {
        let member = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
        self.session.plan_staff_job(member, job).map_err(|err| self.with_names(err.into()))
    }

    /// Works out releasing the member of staff `uid` from his club.
    fn plan_staff_release(&self, uid: u32) -> Result<StaffPlan, Failure> {
        let member = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
        self.session.plan_staff_release(member).map_err(|err| self.with_names(err.into()))
    }

    /// Logs a member of staff's move, signing or release, as a change of his `club`, or his new job, as a change of
    /// `contract.job`, and brings his list row up to date: for one signed, with the end of the contract `made`; for one
    /// released, with no club, job or contract. `batch` groups the releases of a club's staff.
    fn log_staff(&mut self, done: StaffChange, made: Option<NewStaffContract>, batch: Option<u32>) -> LoggedChange {
        let row = self.staff.get(done.member);
        let (club, club_uid, job, contract_expires) =
            row.map_or((None, None, None, None), |s| (s.club.clone(), s.club_uid, s.job, s.contract_expires));
        let name = row.map_or_else(String::new, |s| s.name.clone());
        let moved = done.from_club != done.to_club;
        // One signed had no club, and one released has none.
        let from = (done.from_club != 0).then(|| self.club_name(done.from_club));
        let released = done.to_club == 0;
        let to = (!released).then(|| self.club_name(done.to_club));
        self.staff.update(done.member, |member| {
            if moved {
                member.club = to.clone();
                member.club_uid = (!released).then_some(done.to_club);
            }
            member.job = (!released).then_some(done.job.1);
            if released {
                member.contract_expires = None;
            }
            if let Some(made) = made {
                member.contract_expires = FmDate::from_number(made.expires);
            }
        });
        let (field, old, new) = if moved {
            ("club", i64::from(done.from_club), i64::from(done.to_club))
        } else {
            ("contract.job", i64::from(done.job.0), i64::from(done.job.1))
        };
        let change = Change { entity: Entity::Staff, uid: done.member, field: field.to_owned(), old, new };
        let entry = self.entry(change, name, batch);
        self.push_log(LoggedChange {
            moved: moved.then_some(MovedClubs { from, to, with: None, released: None, fee: None }),
            undo: Some(Undo::Staff(LoggedStaff { done, club, club_uid, job, contract_expires })),
            ..entry
        })
    }

    /// Works out what the fee `fee` of moving the player from the club `from` to the club `to` does to their money:
    /// none for no fee.
    fn plan_fee(&self, from: u32, to: u32, fee: Option<i64>) -> Result<Option<FeePlan>, Failure> {
        // A free agent has no club to pay.
        let Some(fee) = fee.filter(|&fee| fee > 0 && from != 0) else {
            return Ok(None);
        };
        let buyer = self.clubs.get(to).ok_or_else(|| not_found(Entity::Club, to))?;
        let seller = self.clubs.get(from).ok_or_else(|| not_found(Entity::Club, from))?;
        Ok(Some(self.session.plan_fee(buyer, seller, fee)?))
    }

    /// Works out moving the player `uid` to the club `club` on the contract `terms`; with `release`, releasing that
    /// player of the club to make room for him.
    fn plan_move(&self, uid: u32, club: u32, terms: MoveTerms, release: Option<u32>) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let to = self.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        Ok(match release {
            Some(leaver) => {
                let leaver = self.players.get(leaver).ok_or_else(|| not_found(Entity::Player, leaver))?;
                self.session.plan_club_move_releasing(player, to, terms, leaver, &self.human_clubs)?
            }
            None => self.session.plan_club_move(player, to, terms, &self.human_clubs)?,
        })
    }

    /// Works out making the loan of the player `uid` permanent on the contract `terms`.
    fn plan_permanent(&self, uid: u32, terms: MoveTerms) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        Ok(self.session.plan_loan_permanent(player, terms, &self.human_clubs)?)
    }

    /// Works out releasing the player `uid` from his club.
    fn plan_release(&self, uid: u32) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        Ok(self.session.plan_release(player, &self.human_clubs)?)
    }

    /// Works out the players `uid` and `other` swapping clubs.
    fn plan_swap(&self, uid: u32, other: u32) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let partner = self.players.get(other).ok_or_else(|| not_found(Entity::Player, other))?;
        Ok(self.session.plan_club_swap(player, partner, &self.human_clubs)?)
    }

    /// What the list row of the player `uid` says about his club and contract end now.
    fn row_before(&self, uid: u32) -> RowBefore {
        let row = self.players.get(uid);
        RowBefore {
            uid,
            club: row.and_then(|player| player.club.clone()),
            club_uid: row.and_then(|player| player.club_uid),
            contract_expires: row.and_then(|player| player.contract_expires),
        }
    }

    fn player_name(&self, uid: u32) -> String {
        self.players.get(uid).map_or_else(|| uid.to_string(), |player| player.name.clone())
    }

    /// `failure` with the name of the player it names by UID, for the window to say who.
    fn with_names(&self, failure: Failure) -> Failure {
        let holder = failure.params.get("uid").and_then(|uid| uid.parse().ok());
        let name = match failure.code {
            "edit.taken" => holder.and_then(|uid| self.players.get(uid)).map(|player| player.name.clone()),
            // The club's director of football or manager, a member of staff.
            "staff.directorTaken" | "staff.managerTaken" => {
                holder.and_then(|uid| self.staff.get(uid)).map(|member| member.name.clone())
            }
            _ => None,
        };
        match name {
            Some(name) => failure.with("name", name),
            None => failure,
        }
    }

    fn staff_name(&self, uid: u32) -> String {
        self.staff.get(uid).map_or_else(|| uid.to_string(), |member| member.name.clone())
    }

    fn club_name(&self, uid: u32) -> String {
        self.clubs.get(uid).map_or_else(|| uid.to_string(), |club| club.name.clone())
    }

    /// Logs a move just written, as a change of the player's `club` from one club UID to the
    /// other; a swap is one change too, which names the player who went the other way, and so
    /// is a move that released a player of the new club, which names him.
    fn log_move(&mut self, done: ClubMove, terms: MoveTerms, paid: Vec<Paid>, fee: Option<i64>) -> LoggedChange {
        // A free agent signed had no club.
        let from = (done.from_club != 0).then(|| self.club_name(done.from_club));
        let to = self.club_name(done.to_club);
        let name = self.player_name(done.player);
        let mut rows = vec![self.row_before(done.player)];
        self.players.update(done.player, |player| {
            player.club = Some(to.clone());
            player.club_uid = Some(done.to_club);
            if let Some(expires) = terms.expires {
                player.contract_expires = FmDate::from_number(expires);
            }
        });
        let with = done.other.map(|other| {
            rows.push(self.row_before(other));
            self.players.update(other, |player| {
                player.club = from.clone();
                player.club_uid = Some(done.from_club);
            });
            self.player_name(other)
        });
        let released = done.released.map(|leaver| {
            rows.push(self.row_before(leaver));
            self.players.update(leaver, |player| {
                player.club = None;
                player.club_uid = None;
                player.contract_expires = None;
            });
            self.player_name(leaver)
        });
        let before = LoggedMove { done: done.clone(), rows, paid };
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "club".to_owned(),
            old: i64::from(done.from_club),
            new: i64::from(done.to_club),
        };
        let entry = self.entry(change, name, None);
        self.push_log(LoggedChange {
            moved: Some(MovedClubs { from, to: Some(to), with, released, fee }),
            undo: Some(Undo::Move(before)),
            ..entry
        })
    }

    /// Logs a release just written, as a change of the player's `club` from his club's UID
    /// to 0, and brings his list row up to date: no club and no contract. It is undone like a
    /// move.
    fn log_release(&mut self, done: ClubMove) -> LoggedChange {
        let rows = vec![self.row_before(done.player)];
        self.players.update(done.player, |player| {
            player.club = None;
            player.club_uid = None;
            player.contract_expires = None;
        });
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "club".to_owned(),
            old: i64::from(done.from_club),
            new: 0,
        };
        let moved =
            MovedClubs { from: Some(self.club_name(done.from_club)), to: None, with: None, released: None, fee: None };
        let entry = self.entry(change, self.player_name(done.player), None);
        self.push_log(LoggedChange {
            moved: Some(moved),
            undo: Some(Undo::Move(LoggedMove { done, rows, paid: Vec::new() })),
            ..entry
        })
    }

    /// Writes back the old value of the logged change `id`, if the game still holds the new
    /// one; a move or healing goes back if the game still holds everything it wrote. A change
    /// listed from the history goes back as `undo_earlier` says. Nothing goes back once the game
    /// has loaded a save since the lists were read (see `refuse_after_load`).
    fn undo(&mut self, id: usize) -> Result<LoggedChange, Failure> {
        let entry = self
            .log
            .iter()
            .find(|logged| logged.id == id)
            .cloned()
            .ok_or_else(|| Failure::new("app.noChange", format!("No change {id}")).with("id", id))?;
        if entry.undone_at.is_some() {
            return Err(Failure::new("app.alreadyUndone", "This change has already been undone."));
        }
        self.refuse_after_load()?;
        if entry.earlier {
            self.undo_earlier(&entry)?;
            return Ok(self.mark_undone(id));
        }
        match entry.undo {
            Some(Undo::Recall(option)) => {
                // The loan's end first, which checks that the game still holds the recall's day; then its option.
                let (target, _) = self.target(entry.change.entity, entry.change.uid)?;
                self.session.revert(&target, &entry.change)?;
                if let Err(err) = self.session.revert(&target, &option) {
                    let _ = self.session.write_field(
                        &target,
                        &self.session.field(entry.change.entity, &entry.change.field)?,
                        entry.change.new,
                    );
                    return Err(err.into());
                }
                self.note_change(&entry.change, entry.change.old);
            }
            Some(Undo::Stadium(renamed)) => self.undo_stadium(&renamed)?,
            Some(Undo::Name(done)) => {
                self.session.undo_name_change(&done)?;
                self.renamed_player(done.person);
            }
            Some(Undo::Move(moved)) => {
                // The fee goes back first, by what it changed; if the player cannot go back, it is paid again.
                self.session.refund_fee(&moved.paid)?;
                if let Err(err) = self.session.undo_club_move(&moved.done) {
                    let _ = self.session.repay_fee(&moved.paid);
                    // A squad number a team-mate has been given since is refused, naming him.
                    return Err(self.with_names(err.into()));
                }
                for row in moved.rows {
                    self.players.update(row.uid, |player| {
                        player.club = row.club;
                        player.club_uid = row.club_uid;
                        player.contract_expires = row.contract_expires;
                    });
                }
            }
            Some(Undo::Heal(healed)) => self.session.undo_heal(&healed)?,
            Some(Undo::Lift(lifted)) => self.session.undo_lift_bans(&lifted)?,
            Some(Undo::Cohesion(cohesion)) => self.session.undo_cohesion(&cohesion)?,
            Some(Undo::Tactics(tactics)) => self.session.undo_tactics(&tactics)?,
            Some(Undo::Retirement(retirement)) => self.session.undo_retirement(&retirement)?,
            Some(Undo::Tie(tie)) => self.session.undo_relation(&tie)?,
            Some(Undo::Clause(clause)) => self.session.undo_clause(&clause)?,
            Some(Undo::Staff(logged)) => {
                self.session.undo_staff_change(&logged.done)?;
                self.staff.update(logged.done.member, |member| {
                    member.club = logged.club;
                    member.club_uid = logged.club_uid;
                    member.job = logged.job;
                    member.contract_expires = logged.contract_expires;
                });
            }
            Some(Undo::Captain(captaincy)) => self.session.undo_captain(&captaincy)?,
            None => {
                let (target, _) = self.target(entry.change.entity, entry.change.uid)?;
                // A squad number a team-mate has been given since is refused, naming him.
                self.session.revert(&target, &entry.change).map_err(|err| self.with_names(err.into()))?;
                self.note_change(&entry.change, entry.change.old);
            }
        }
        Ok(self.mark_undone(id))
    }

    /// Undoes `entry`, a change listed from the history, which Undo may take back (see `check_earlier`): its old value
    /// is written as a new edit would be, with every check, as the game has moved on since it was made, and only while
    /// the game still holds the value it wrote. A recall from loan goes back with its option to buy, or not at all.
    fn undo_earlier(&mut self, entry: &LoggedChange) -> Result<(), Failure> {
        if !entry.undoable {
            return Err(Failure::new(
                "app.historyOnly",
                "This change was made before the app last connected, and undoing it needed the game's memory as it was \
                 then: change it back by hand.",
            ));
        }
        let change = &entry.change;
        let (target, _) = self.target(change.entity, change.uid)?;
        let field = self.session.field(change.entity, &change.field)?;
        let written = self.session.write_field_if(&target, &field, change.new, change.old);
        written.map_err(|err| self.with_names(err.into()))?;
        if let Some(Undo::Recall(option)) = &entry.undo {
            let written = self
                .session
                .field(change.entity, &option.field)
                .and_then(|field| self.session.write_field_if(&target, &field, option.new, option.old));
            if let Err(err) = written {
                // The loan's end back to the day of the recall, which the game held.
                let back = Change { old: change.new, new: change.old, ..change.clone() };
                let _ = self.session.revert(&target, &back);
                return Err(err.into());
            }
        }
        self.note_change(change, change.old);
        Ok(())
    }

    /// Refuses an undo while the game has loaded a save, or gone back to its main menu, since the lists were read: the
    /// people and clubs there may be another save's, at the same places, and putting a value back skips the checks a new
    /// edit makes, that one among them. An undo of a change of this connection would write where the lists found its
    /// person, if a person with the same UID was there and held the value it wrote. Reload data reads the lists again,
    /// and keeps the log only while the game has the same career.
    fn refuse_after_load(&self) -> Result<(), Failure> {
        if self.session.save_changed() {
            return Err(MoveError::Locked(Lock::SaveChanged).into());
        }
        Ok(())
    }

    /// Marks the change `id` undone now, in the log and in the history of the career.
    fn mark_undone(&mut self, id: usize) -> LoggedChange {
        let at = now_ms();
        let logged = self.log.iter_mut().find(|logged| logged.id == id).expect("in the log");
        logged.undone_at = Some(at);
        let logged = logged.clone();
        let StoredKey { session, id } = self.history.key(&logged);
        self.history.add(&HistoryLine::Undone { session, id, at });
        logged
    }

    /// Where the player, member of staff or club with `uid` lives in the game, and its name.
    fn target(&self, entity: Entity, uid: u32) -> Result<(Target, String), Failure> {
        match entity {
            Entity::Player => self.players.get(uid).map(|p| (p.target(), p.name.clone())),
            Entity::Staff => self.staff.get(uid).map(|s| (s.target(), s.name.clone())),
            Entity::Club => self.clubs.get(uid).map(|c| (c.target(), c.name.clone())),
        }
        .ok_or_else(|| not_found(entity, uid))
    }

    /// The game days a climb is spread over: the seasons the panel chose, a season being 365.
    fn growth_span(&self) -> u32 {
        span_days(self.growth_seasons)
    }

    /// The CA-growth watch as the panel lists it, with every ability read from the game now.
    /// A player whose object moved, or whose ability cannot be read, is marked stopped here:
    /// what the editor would write is no longer his.
    fn growth_rows(&mut self) -> Result<GrowthRows, Failure> {
        let ability = self.session.field(Entity::Player, CURRENT_ABILITY)?;
        let potential = self.session.field(Entity::Player, POTENTIAL_ABILITY)?;
        let editable = self.session.field_lock(&ability).is_none();
        let span = self.growth_span();
        let fields = [ability, potential];
        let mut rows = Vec::with_capacity(self.growth.len());
        for index in 0..self.growth.len() {
            let (uid, start_ca, elapsed, added, was_done, was_note) = {
                let target = &self.growth[index];
                (target.uid, target.start_ca, target.elapsed, target.added, target.done, target.note)
            };
            let (name, club, club_uid, age, target) = match self.players.get(uid) {
                Some(player) => {
                    (player.name.clone(), player.club.clone(), player.club_uid, player.age, Some(player.target()))
                }
                None => (format!("UID {uid}"), None, None, None, None),
            };
            let reading = target.map(|target| growth_reading(&self.session, &target, &fields));
            let (ca, pa, cap, note, done) = match reading {
                Some(Ok((ca, pa))) => {
                    let cap = ability_cap(pa);
                    let at_pa = ca >= cap;
                    // A player watched at his potential stays "was at PA" until he is watched
                    // again, rather than turning into "reached PA".
                    let note = if at_pa {
                        if was_done && was_note == GrowNote::WasAtPa { GrowNote::WasAtPa } else { GrowNote::AtPa }
                    } else {
                        GrowNote::Growing
                    };
                    (ca, pa, cap, note, at_pa)
                }
                Some(Err(note)) => (0, 0, 0, note, true),
                None => (0, 0, 0, GrowNote::Moved, true),
            };
            {
                let target = &mut self.growth[index];
                target.done = done;
                target.note = note;
            }
            rows.push(GrowthRow {
                uid,
                name,
                club,
                club_uid,
                age,
                current_ability: ca,
                potential_ability: pa,
                cap,
                gap: cap.saturating_sub(ca),
                start_ca,
                elapsed,
                span,
                added,
                done,
                note,
            });
        }
        Ok(GrowthRows { seasons: self.growth_seasons, span, editable, rows })
    }

    /// Pays `days` in-game days of every watched player's climb, or, with `fill`, the whole gap
    /// to his potential at once. Each player is read and written on his own: one whose object
    /// moved, or whose current ability the game changed meanwhile, stops; the others carry on.
    /// Every write goes through the same checks as a hand edit and is logged as `batch`, which
    /// `undo_batch` undoes.
    fn growth_apply(&mut self, days: u32, fill: bool) -> Result<GrowthReport, Failure> {
        let ability = self.session.field(Entity::Player, CURRENT_ABILITY)?;
        let potential = self.session.field(Entity::Player, POTENTIAL_ABILITY)?;
        if let Some(lock) = self.session.field_lock(&ability) {
            return Err(EditError::Locked { field: ability.key.clone(), lock }.into());
        }
        let fields = [ability, potential];
        let span = self.growth_span();
        let batch = self.fresh_id();
        let mut written = 0;
        let mut reached = 0;
        let mut stopped = 0;
        let mut skipped = 0;
        for index in 0..self.growth.len() {
            let (uid, start_ca, elapsed, done) = {
                let target = &self.growth[index];
                (target.uid, target.start_ca, target.elapsed, target.done)
            };
            if done {
                continue;
            }
            let Some(player) = self.players.get(uid) else {
                self.growth[index].stopped(GrowNote::Moved);
                stopped += 1;
                continue;
            };
            let (name, target) = (player.name.clone(), player.target());
            let (ca, pa) = match growth_reading(&self.session, &target, &fields) {
                Ok(reading) => reading,
                Err(note) => {
                    self.growth[index].stopped(note);
                    stopped += 1;
                    continue;
                }
            };
            let cap = ability_cap(pa);
            if ca >= cap {
                self.growth[index].reached();
                reached += 1;
                continue;
            }
            let elapsed = if fill { elapsed } else { elapsed.saturating_add(days) };
            let Some(want) = wanted_ca(start_ca, cap, ca, elapsed, span, fill) else {
                // Nothing to write today: the curve has not beaten the value he has yet, or the
                // game moved him further than it asks (a climb never pulls him back). The day is
                // paid for all the same.
                self.growth[index].elapsed = elapsed;
                skipped += 1;
                continue;
            };
            let expected = i64::from(ca);
            match self.session.write_field_if(&target, &fields[0], expected, i64::from(want)) {
                Ok(change) => {
                    self.log_change(change, name, Some(batch));
                    let target = &mut self.growth[index];
                    target.elapsed = elapsed;
                    target.added = target.added.saturating_add(want - ca);
                    if want >= cap {
                        target.reached();
                        reached += 1;
                    }
                    written += 1;
                }
                Err(err) => {
                    self.growth[index].stopped(grow_note_of(&err));
                    stopped += 1;
                }
            }
        }
        let rows = self.growth_rows()?;
        Ok(GrowthReport { batch, written, reached, stopped, skipped, rows })
    }

    /// Keeps the balance of every frozen club, the attributes, energy and match sharpness of every frozen player and
    /// the attributes of every frozen member of staff from getting worse: what the game took is put back, and what it
    /// gave raises what they are held at. The position ratings of a frozen player are held exactly: what the game gave
    /// is put back too. These writes are not logged; unfreezing ends them.
    ///
    /// Once the game has loaded a save, or gone back to its main menu, since the lists were read, nothing is held at
    /// what they found until they are read again: the people and clubs there may be another save's, at the same places.
    /// Only the names of renamed stadiums are given again then, where the game is checked to have a save of this career
    /// (see `hold_stadiums`).
    fn hold_frozen(&mut self) {
        self.hold_stadiums();
        if self.session.save_changed() {
            return;
        }
        self.hold_money();
        if !self.frozen.attributes.is_empty() {
            let fields = self.attribute_fields(Entity::Player);
            let target_of = |uid| self.players.get(uid).map(|player| player.target());
            hold_people(&self.session, target_of, &mut self.frozen.attributes, &fields);
        }
        if !self.frozen.staff.is_empty() {
            let fields = self.attribute_fields(Entity::Staff);
            let target_of = |uid| self.staff.get(uid).map(|member| member.target());
            hold_people(&self.session, target_of, &mut self.frozen.staff, &fields);
        }
        if !self.frozen.fitness.is_empty()
            && let Ok(fields) = self.fitness_fields()
        {
            let target_of = |uid| self.players.get(uid).map(|player| player.target());
            hold_people(&self.session, target_of, &mut self.frozen.fitness, &fields);
        }
        if !self.frozen.positions.is_empty() {
            let fields = self.position_fields();
            let target_of = |uid| self.players.get(uid).map(|player| player.target());
            hold_positions(&self.session, target_of, &mut self.frozen.positions, &fields);
        }
    }

    fn hold_money(&mut self) {
        let Ok(field) = self.session.field(Entity::Club, "finance.balance") else {
            return;
        };
        for (&uid, floor) in self.frozen.money.iter_mut() {
            let Some(target) = self.clubs.get(uid).map(|club| club.target()) else {
                continue;
            };
            match self.session.read_field(&target, &field) {
                Ok(now) if now < *floor => {
                    // Only while the game still holds what was read: a day it is working out is left to it.
                    let _ = self.session.write_field_if(&target, &field, now, *floor);
                }
                Ok(now) => *floor = now,
                Err(_) => {}
            }
        }
    }

    /// The attributes of players or of staff (as `entity` says) the editor can change.
    fn attribute_fields(&self, entity: Entity) -> Vec<Field> {
        let fields = self.session.fields(entity).into_iter();
        fields.filter(|field| field.key.starts_with("attribute.")).collect()
    }

    /// A player's energy and match sharpness, which freezing his fitness holds.
    fn fitness_fields(&self) -> Result<Vec<Field>, EditError> {
        FITNESS.iter().map(|key| self.session.field(Entity::Player, key)).collect()
    }

    /// A player's position ratings, which freezing his positions holds.
    fn position_fields(&self) -> Vec<Field> {
        let fields = self.session.fields(Entity::Player).into_iter();
        fields.filter(|field| field.key.starts_with("position.")).collect()
    }

    /// Every attribute of a player or of a member of staff (as `entity` says) at its best: 20, or 1 where lower is
    /// better, which no attribute of staff is.
    fn best_attributes(&self, entity: Entity) -> Vec<(Field, Operation)> {
        self.attribute_fields(entity)
            .into_iter()
            .map(|field| {
                let best = if LOWER_IS_BETTER.contains(&field.key.as_str()) { 1 } else { 20 };
                let value = field.scale.stored(best);
                (field, Operation::Set { value })
            })
            .collect()
    }

    /// The nations of the players and staff in the lists.
    fn nations(&self) -> Vec<Nation> {
        let players = self.players.iter().map(|p| (p.nation_address, p.nation.as_deref(), p.nation_uid));
        let staff = self.staff.iter().map(|s| (s.nation_address, s.nation.as_deref(), s.nation_uid));
        nations(players.chain(staff))
    }

    /// Keeps the list rows in step with `value`, just written to the field `change` names.
    fn note_change(&mut self, change: &Change, value: i64) {
        self.frozen.note(change, value);
        // A new nation: its name and flag, as the rows of its other people have them.
        let nation = (change.field == "nation")
            .then(|| self.nations().into_iter().find(|n| n.address == value as u64))
            .flatten();
        // The rows keep attributes as FM shows them (1–20), for the lists' filters.
        let value = if change.field.starts_with("attribute.") {
            self.session.field(change.entity, &change.field).map_or(value, |field| field.scale.shown(value))
        } else {
            value
        };
        let today = self.session.game_date();
        match change.entity {
            Entity::Player => self.players.update(change.uid, |p| {
                p.note_change(&change.field, value);
                if change.field == "date_of_birth" {
                    p.note_birth(today);
                }
                if let Some(nation) = nation {
                    (p.nation, p.nation_uid) = (Some(nation.name), nation.uid);
                }
            }),
            Entity::Staff => self.staff.update(change.uid, |s| {
                s.note_change(&change.field, value);
                if let Some(nation) = nation {
                    (s.nation, s.nation_uid) = (Some(nation.name), nation.uid);
                }
            }),
            Entity::Club => self.clubs.update(change.uid, |c| c.note_change(&change.field, value)),
        };
    }
}

/// A change written to the game: by this connection, or before it, as the history of the career lists it (see
/// `History`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoggedChange {
    id: usize,
    /// When it was written, in milliseconds since 1970.
    at: u64,
    /// The person's name when it was written.
    name: String,
    #[serde(flatten)]
    change: Change,
    /// When it was undone, if it was.
    undone_at: Option<u64>,
    /// The mass edit it was part of, if any.
    batch: Option<u32>,
    /// Whether it was written before this connection, and is listed from the history of the career.
    earlier: bool,
    /// Whether Undo may take it back: a change of this connection, or an earlier one as `Connection::check_earlier`
    /// works out.
    undoable: bool,
    /// For an earlier change that is not undone: whether the game held what it wrote when the lists were last read;
    /// none where that is not looked at (see `Connection::in_game`).
    #[serde(skip_serializing_if = "Option::is_none")]
    in_game: Option<bool>,
    /// For a move to another club, logged as a change of the field `club` from one club UID
    /// to the other: the clubs' names.
    #[serde(skip_serializing_if = "Option::is_none")]
    moved: Option<MovedClubs>,
    /// For a captaincy, logged as a change of the club's `captain` or `vice_captain` from one
    /// player's UID to the other's: the team and the players' names.
    #[serde(skip_serializing_if = "Option::is_none")]
    captaincy: Option<Captaincy>,
    /// For a change to a player's ties: the nations or clubs, and their homegrown rules.
    #[serde(skip_serializing_if = "Option::is_none")]
    tie: Option<TieChange>,
    /// For a change to a player's contract clauses: the clause before and after.
    #[serde(skip_serializing_if = "Option::is_none")]
    clause: Option<ClauseChange>,
    /// For a recall from loan that took the loan's option to buy away too: what the option was.
    #[serde(skip_serializing_if = "Option::is_none")]
    recall: Option<RecallNote>,
    /// For a stadium renamed, logged as a change of the club's field `stadium.name` from one length in bytes to the
    /// other: the names.
    #[serde(skip_serializing_if = "Option::is_none")]
    stadium: Option<StadiumNames>,
    /// For a player given another name, logged as a change of his field `name.first`, `name.last`, `name.common` or
    /// `name.full` from one length in bytes to the other (0 for none): the names.
    #[serde(skip_serializing_if = "Option::is_none")]
    person_name: Option<PersonNameChange>,
    /// For a change of a nation or a city of birth, logged with the objects' addresses as its values: their names,
    /// which outlive the addresses.
    #[serde(skip_serializing_if = "Option::is_none")]
    objects: Option<ObjectNames>,
    /// For an earlier change: what the history file calls it.
    #[serde(skip)]
    stored: Option<StoredKey>,
    /// For a move, healing, lifting bans, a captaincy, a tie or a clause: what undoing it takes. Other changes write
    /// back `old`.
    #[serde(skip)]
    undo: Option<Undo>,
}

/// A recall from loan that took the loan's option to buy away, so that the game would not sell him to the club he is on
/// loan at when the loan ends.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecallNote {
    /// The option to buy it took away, pounds.
    option_fee: i64,
}

/// A stadium's name before and after a rename.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StadiumNames {
    from: String,
    to: String,
}

/// A person's name before and after a change: none for a common or full name he did not have, or no longer has.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonNameChange {
    from: Option<String>,
    to: Option<String>,
}

/// The names of the objects a change of a pointer pointed at and points at: nations, or cities; none where the game
/// had no name for the address.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectNames {
    from: Option<String>,
    to: Option<String>,
}

/// What undoing a change takes when writing back its old value is not enough.
#[derive(Clone)]
enum Undo {
    /// A recall from loan that took the loan's option to buy away too: the change of the option, written back with the
    /// loan's end.
    Recall(Change),
    /// A stadium renamed: the bytes it wrote, which the undo writes back.
    Stadium(StadiumRename),
    /// A player given another name: the person's pointer it wrote, which the undo writes back.
    Name(NameChange),
    Move(LoggedMove),
    Heal(Healed),
    Lift(Lifted),
    Cohesion(CohesionSet),
    Tactics(TacticsSet),
    Retirement(RetirementSet),
    Tie(RelationSet),
    Clause(ClauseSet),
    Captain(CaptainSet),
    Staff(LoggedStaff),
}

/// A member of staff's move, new job or signing as the log keeps it: the writes to undo, and what his list row said
/// before.
#[derive(Clone)]
struct LoggedStaff {
    done: StaffChange,
    club: Option<String>,
    club_uid: Option<u32>,
    job: Option<u8>,
    contract_expires: Option<FmDate>,
}

/// A tie before and after a change: none before for one added, none after for one taken out.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TieChange {
    from: Option<TieEnd>,
    to: Option<TieEnd>,
}

/// The nation or club of a tie, and its homegrown rule for a training.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TieEnd {
    name: String,
    rule: Option<u8>,
}

/// A contract clause before and after a change: none before for one added, none after for one taken out.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClauseChange {
    from: Option<Clause>,
    to: Option<Clause>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Captaincy {
    /// Where the team is in its club's list of teams; 0 is the senior team.
    team: usize,
    /// The team's kind and age limit, to name it by (see `TeamView`).
    kind: u8,
    age_limit: Option<u8>,
    /// Who held the role, and who took it.
    from: Option<String>,
    to: String,
    /// Whether the player who took the role held the other one, which `from` now holds.
    swapped: bool,
}

/// One of a club's teams as its squad screen shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamView {
    index: usize,
    /// The game's code for the kind of team: 0 for the first team.
    kind: u8,
    age_limit: Option<u8>,
    captain: Option<u32>,
    vice_captain: Option<u32>,
    players: Vec<SquadRow>,
}

/// A player of a team: his list row and the live values the squad screen shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SquadRow {
    #[serde(flatten)]
    player: PlayerSummary,
    plays_here: bool,
    loan: Option<Loan>,
    condition: u16,
    match_sharpness: u16,
    jadedness: i16,
    morale: u8,
    /// His cohesion with the club, 1..100; none where the layout has not placed it, or he has no entry for it yet.
    cohesion: Option<i8>,
    /// How well he knows the tactic the team plays, 0..100 (see `familiarity.rs`); none where the layout has not
    /// placed it, no human manager picks the team's tactic, or he has no record of familiarity.
    tactics: Option<u8>,
    /// Whether the game keeps a history of training for him: not for one who does not train, as when injured.
    trains: bool,
    /// How many of the club's other players hold a reason to be unhappy about him that is not over.
    concerned_teammates: usize,
    injuries: usize,
    bans: usize,
    /// Whether his attributes are frozen, his energy and match sharpness, or his positions (see `freeze_team`).
    attributes_frozen: bool,
    fitness_frozen: bool,
    positions_frozen: bool,
}

/// A player a move can release to make room: his list row, and what makes him a worse choice.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomMakerRow {
    #[serde(flatten)]
    player: PlayerSummary,
    injured: bool,
    captain: bool,
}

/// A member of staff of a club, as its Staff tab lists him: his list row, and why Release all staff would leave him at
/// the club (none for one it releases).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClubStaffRow {
    #[serde(flatten)]
    member: fmlibre_core::StaffSummary,
    stays: Option<Failure>,
}

/// What a team-wide action does to every player of the team.
#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
enum TeamAction {
    /// Heals every current injury.
    Heal,
    /// Lifts every current ban.
    LiftBans,
    /// Morale to the top.
    Inspire,
    /// Energy and match sharpness to 100%.
    Refresh,
    /// Every attribute to its best: 20, or 1 where lower is better.
    MaxAttributes,
    /// Cohesion with the club to the top, for those who have an entry for it.
    MaxCohesion,
    /// The tactic the human manager plays with the team known at its best (see `familiarity.rs`).
    MaxTactics,
}

#[derive(Clone, Serialize, Deserialize)]
struct MovedClubs {
    /// None for a free agent signed, who had no club.
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
    /// None for a release, after which he has no club.
    #[serde(skip_serializing_if = "Option::is_none")]
    to: Option<String>,
    /// In a swap, the player who went the other way.
    #[serde(skip_serializing_if = "Option::is_none")]
    with: Option<String>,
    /// The player of the new club released to make room for him, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    released: Option<String>,
    /// The fee the buying club paid the selling one, in pounds, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    fee: Option<i64>,
}

/// A move as the log keeps it: the writes to undo, and what the list rows of the players it
/// moved said before.
#[derive(Clone)]
struct LoggedMove {
    done: ClubMove,
    rows: Vec<RowBefore>,
    /// What the fee changed, if one was paid.
    paid: Vec<Paid>,
}

/// What a player's list row said about his club and contract end.
#[derive(Clone)]
struct RowBefore {
    uid: u32,
    club: Option<String>,
    club_uid: Option<u32>,
    contract_expires: Option<FmDate>,
}

/// The clubs a move is between.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MovePreview {
    /// None for a free agent, who has no club.
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<ClubName>,
    to: ClubName,
    /// What the fee does to the two clubs' money, when one is to be paid.
    #[serde(skip_serializing_if = "Option::is_none")]
    fee: Option<FeePlan>,
    /// For a free agent, the contract the editor makes for him.
    #[serde(skip_serializing_if = "Option::is_none")]
    contract: Option<NewContract>,
    /// For a member of staff who has no club, the contract the editor makes for him.
    #[serde(skip_serializing_if = "Option::is_none")]
    staff_contract: Option<NewStaffContract>,
}

#[derive(Serialize)]
struct ClubName {
    uid: u32,
    name: String,
}

/// The filter of the list a mass edit applies to; only the one for its entity is used.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Filters {
    player_filter: Option<PlayerFilter>,
    staff_filter: Option<StaffFilter>,
    club_filter: Option<ClubFilter>,
}

/// One field of a mass edit and what to do with it.
#[derive(Deserialize)]
struct MassOperation {
    field: String,
    operation: Operation,
}

/// Most players, staff or clubs one mass edit may change.
const MASS_LIMIT: usize = 10_000;

/// Most changes and skipped fields a preview lists; the counts cover all of them.
const PREVIEW_ROWS: usize = 500;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassPreview {
    /// What `apply_mass_edit` takes to write exactly these changes.
    id: u32,
    /// How many players, staff or clubs the search and filters selected.
    targets: usize,
    /// How many of them already have the values the edit would give them.
    unchanged: usize,
    /// How many values would change, in all.
    changes: usize,
    /// The first changes.
    rows: Vec<Planned>,
    /// How many values are left alone, and the first of them with the reason.
    skipped_count: usize,
    skipped: Vec<Skipped>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassReport {
    /// Groups the changes in the log; `undo_batch` undoes them together.
    batch: u32,
    applied: usize,
    failed: Vec<MassFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassFailure {
    uid: u32,
    name: String,
    field: String,
    error: Failure,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchUndo {
    undone: usize,
    /// Changes the game has changed since, which were left as they are.
    failed: Vec<BatchUndoFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchUndoFailure {
    id: usize,
    error: Failure,
}

/// One value to write, as stored.
#[derive(Deserialize)]
struct FieldEdit {
    field: String,
    value: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedEdit {
    field: String,
    value: i64,
    error: Failure,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyReport {
    applied: Vec<LoggedChange>,
    failed: Vec<FailedEdit>,
}

/// A watched player as the CA-growth panel lists him: where his climb started, where the game
/// has him now, and the ceiling his potential stands for.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrowthRow {
    uid: u32,
    name: String,
    club: Option<String>,
    club_uid: Option<u32>,
    age: Option<u16>,
    /// The current ability the game holds now.
    current_ability: u16,
    /// The potential ability as stored: a negative value is the random range it settled from.
    potential_ability: i16,
    /// The current ability his potential allows (see `ability_cap`).
    cap: u16,
    /// How much current ability is left to that ceiling.
    gap: u16,
    /// The current ability he had when he was watched: the curve starts there.
    start_ca: u16,
    /// The game days of his climb already paid for, of the `span` it is spread over.
    elapsed: u32,
    span: u32,
    /// The current ability the editor has added to him so far.
    added: u16,
    /// Whether his climb is over: at his potential, or stopped for a reason in `note`.
    done: bool,
    note: GrowNote,
}

/// The CA-growth watch as the panel lists it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrowthRows {
    /// The seasons a climb is spread over, which the panel chooses; one is 365 game days.
    seasons: u32,
    /// That span in game days.
    span: u32,
    /// Whether the current ability may be written now; false leaves the panel read-only.
    editable: bool,
    rows: Vec<GrowthRow>,
}

/// What a growth action wrote, and the watch as it is now.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrowthReport {
    /// Groups the changes in the log; `undo_batch` undoes them together.
    batch: u32,
    /// How many players were written to, and how many of them reached their potential.
    written: usize,
    reached: usize,
    /// How many stopped for a reason (`note` says which), and how many had nothing to write
    /// this time: the curve has not beaten the value the game has yet.
    stopped: usize,
    skipped: usize,
    /// The watch as it is now, so the panel needs no second request.
    rows: GrowthRows,
}

/// The current and potential ability of `target` as the game holds them now, or why they
/// cannot be read: a moved object, a value the field cannot hold, or a read that failed.
fn growth_reading(session: &Session, target: &Target, fields: &[Field]) -> Result<(u16, i16), GrowNote> {
    let values = session.read_fields(target, fields).map_err(|err| grow_note_of(&err))?;
    let (Some(ca), Some(pa)) = (values[0], values[1]) else {
        return Err(GrowNote::Unreadable);
    };
    let ca = u16::try_from(ca).map_err(|_| GrowNote::OutOfRange)?;
    let pa = i16::try_from(pa).map_err(|_| GrowNote::OutOfRange)?;
    if !(LEAST_CA..=MOST_CA).contains(&ca) {
        return Err(GrowNote::OutOfRange);
    }
    Ok((ca, pa))
}

/// Why `err` leaves a watched player where he is: a moved object, a value the game changed
/// between the read and the write, or anything else the editor could not read or write.
fn grow_note_of(err: &EditError) -> GrowNote {
    match err {
        EditError::Moved { .. } => GrowNote::Moved,
        EditError::Conflict { .. } => GrowNote::Changed,
        _ => GrowNote::Unreadable,
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_millis() as u64)
}

#[derive(Default)]
struct AppState(Mutex<Option<Connection>>);

/// The pictures of the user's graphics packs, once the packs have been read.
#[derive(Default)]
struct Graphics {
    /// The packs read from the folder in use; none while they are being read.
    index: Arc<Mutex<Option<Arc<GraphicsIndex>>>>,
    /// Which read is the current one: one that finishes after another was started is dropped, so that a folder the
    /// user has just replaced is not read back over the new one.
    generation: Arc<AtomicU64>,
}

impl Graphics {
    fn index(&self) -> Option<Arc<GraphicsIndex>> {
        self.index.lock().ok()?.clone()
    }
}

/// Where the graphics folder in use came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum GraphicsSource {
    /// The folder the user chose in the window.
    User,
    /// The folder FMLIBRE_GRAPHICS named when the app started.
    Environment,
    /// Documents\Sports Interactive\Football Manager 27\graphics, or the same below Application Support.
    Default,
    /// Neither: the app has no documents folder to look in.
    None,
}

/// The graphics folders the app can read from: the one the user chose, the one FMLIBRE_GRAPHICS named, and the
/// default under the user's documents. Kept in the state so that a choice takes effect without a restart.
struct GraphicsFolders {
    /// The folder the user chose; none while the other two decide.
    chosen: Mutex<Option<PathBuf>>,
    /// The file the choice is kept in; none when the app has no data folder.
    file: Option<PathBuf>,
    /// Where FMLIBRE_GRAPHICS pointed when the app started.
    environment: Option<PathBuf>,
    /// Where the packs go by default.
    default: Option<PathBuf>,
}

impl GraphicsFolders {
    /// The folder the packs are read from now, and where it came from.
    fn root(&self) -> (Option<PathBuf>, GraphicsSource) {
        if let Ok(chosen) = self.chosen.lock()
            && let Some(folder) = chosen.as_ref()
        {
            return (Some(folder.clone()), GraphicsSource::User);
        }
        match (&self.environment, &self.default) {
            (Some(folder), _) => (Some(folder.clone()), GraphicsSource::Environment),
            (None, Some(folder)) => (Some(folder.clone()), GraphicsSource::Default),
            (None, None) => (None, GraphicsSource::None),
        }
    }
}

/// The graphics folder the user chose, kept in a file so that the packs are read from it after a restart.
#[derive(Default, Serialize, Deserialize)]
struct GraphicsChoice {
    /// The folder, as the user typed it; none while the default is used.
    folder: Option<String>,
}

impl GraphicsChoice {
    /// What the file at `path` holds: nothing when there is none, or it cannot be read.
    fn read(path: &Path) -> Self {
        std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
    }

    /// Writes it to `path`, through a file beside it, so that a write cut short never leaves half a file.
    fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let part = path.with_extension("json.part");
        std::fs::write(&part, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(&part, path)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphicsInfo {
    /// Where the packs are read from now.
    root: Option<String>,
    /// False while the packs are still being read.
    ready: bool,
    counts: GraphicsCounts,
    /// Whether `root` came from the user, from FMLIBRE_GRAPHICS or from the default.
    source: GraphicsSource,
    /// The folder the user chose, if any: what a settings box starts with.
    chosen: Option<String>,
    /// The folder the packs go in by default, to show where they belong.
    default_root: Option<String>,
    /// Whether `root` is a folder that exists.
    exists: bool,
    /// Whether the choice can be kept: false when the app has no data folder to keep it in.
    savable: bool,
}

/// What the app knows about the graphics packs now.
fn graphics_state(graphics: &Graphics, folders: &GraphicsFolders) -> GraphicsInfo {
    let (root, source) = folders.root();
    let chosen = folders.chosen.lock().ok().and_then(|chosen| chosen.clone());
    let exists = root.as_deref().is_some_and(Path::is_dir);
    let (root, ready, counts) = match graphics.index() {
        Some(index) => {
            let root = Some(index.root().display().to_string()).filter(|root| !root.is_empty());
            (root, true, index.counts())
        }
        None => (root.map(|root| root.display().to_string()), false, GraphicsCounts::default()),
    };
    GraphicsInfo {
        root,
        ready,
        counts,
        source,
        chosen: chosen.map(|folder| folder.display().to_string()),
        default_root: folders.default.as_ref().map(|folder| folder.display().to_string()),
        exists,
        savable: folders.file.is_some(),
    }
}

/// Reads the graphics packs at `root` beside the window, replacing the ones the app serves when it is done. What was
/// served before is dropped meanwhile, so that a picture is not shown from the folder the user has just replaced.
fn read_graphics(graphics: &Graphics, root: Option<PathBuf>) {
    if let Ok(mut slot) = graphics.index.lock() {
        *slot = None;
    }
    let generation = graphics.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let slot = graphics.index.clone();
    let counter = graphics.generation.clone();
    std::thread::spawn(move || {
        let index = root.map_or_else(GraphicsIndex::default, |root| GraphicsIndex::scan(&root));
        if counter.load(Ordering::SeqCst) == generation
            && let Ok(mut slot) = slot.lock()
        {
            *slot = Some(Arc::new(index));
        }
    });
}

/// Where the graphics packs are and how many pictures they hold.
#[tauri::command]
fn graphics_info(graphics: State<'_, Graphics>, folders: State<'_, GraphicsFolders>) -> GraphicsInfo {
    graphics_state(&graphics, &folders)
}

/// Sets the folder the packs are read from, or, when `folder` is empty, goes back to the default. The choice is kept
/// in the app's data folder so that it is used again after a restart. Returns what the app knows then, with `ready`
/// false: the packs are read beside the window, as when the app starts.
#[tauri::command]
fn set_graphics_folder(
    graphics: State<'_, Graphics>,
    folders: State<'_, GraphicsFolders>,
    folder: Option<String>,
) -> Result<GraphicsInfo, Failure> {
    let chosen = folder
        .map(|folder| folder.trim().trim_matches('"').trim().to_owned())
        .filter(|folder| !folder.is_empty())
        .map(PathBuf::from);
    let Some(file) = folders.file.as_deref() else {
        return Err(Failure::new("app.internal", "the app has no data folder to keep the graphics folder in"));
    };
    GraphicsChoice { folder: chosen.as_ref().map(|folder| folder.to_string_lossy().into_owned()) }
        .write(file)
        .map_err(|err| Failure::new("app.internal", err.to_string()))?;
    if let Ok(mut slot) = folders.chosen.lock() {
        *slot = chosen;
    }
    read_graphics(&graphics, folders.root().0);
    Ok(graphics_state(&graphics, &folders))
}

/// The macOS app bundle the executable `exe` is in (`FMLibreEditor.app/Contents/MacOS/FMLibreEditor`); none for a
/// development build, which runs from the target folder.
fn app_bundle(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let inside = macos.file_name()? == "MacOS" && contents.file_name()? == "Contents" && bundle.extension()? == "app";
    inside.then_some(bundle)
}

/// Serves `fmgfx` requests such as `/club/728`, `/face/7458500` or `/flag/765` from the
/// graphics packs; anything unknown or missing is a 404.
fn picture_response(graphics: &Graphics, path: &str) -> tauri::http::Response<Vec<u8>> {
    // The window's own origin differs from fmgfx's, so let it read the answers, not only show them.
    let not_found = || {
        tauri::http::Response::builder()
            .status(404)
            .header("Access-Control-Allow-Origin", "*")
            .body(Vec::new())
            .expect("a plain response")
    };
    let mut parts = path.trim_matches('/').split('/');
    let picture = match parts.next() {
        Some("club") => Picture::ClubLogo,
        Some("face") => Picture::Face,
        Some("flag") => Picture::Flag,
        Some("competition") => Picture::CompetitionLogo,
        _ => return not_found(),
    };
    let Some(id) = parts.next().and_then(|id| id.parse().ok()) else {
        return not_found();
    };
    let Some(index) = graphics.index() else {
        return not_found();
    };
    let Some(file) = index.file(picture, id) else {
        return not_found();
    };
    let Ok(bytes) = std::fs::read(file) else {
        return not_found();
    };
    let png = file.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
    tauri::http::Response::builder()
        .header("Content-Type", if png { "image/png" } else { "image/jpeg" })
        .header("Cache-Control", "max-age=3600")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .expect("a picture response")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Detection {
    elevated: bool,
    games: Vec<DetectedGame>,
    /// macOS: whether the game loads the bridge, without which the app cannot reach it.
    bridge: Option<bridge::BridgeInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedGame {
    pid: u32,
    info: Option<GameInfo>,
    plugin_loaded: bool,
    error: Option<Failure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    game: GameInfo,
    profile: Option<String>,
    arrays: EntityArrays,
    players: usize,
    staff: usize,
    clubs: usize,
    game_date: Option<FmDate>,
    load_ms: u128,
    /// Whether edits can be written: the system let the app open the game for writing, and the build is one the
    /// editor knows or editing it was allowed.
    editable: bool,
    /// Whether the system let the app open the game for writing.
    writable: bool,
    /// Whether the editor has a profile for this build of the game: one it was checked with.
    known_build: bool,
    /// Whether the layout tells women from men, players and staff alike: the lists offer that filter only then.
    gender_known: bool,
    /// What the checks the editor makes before it writes found on this game.
    health: Health,
    /// Only from `connect`: what it froze again of what was frozen in this save before, when there was any.
    #[serde(skip_serializing_if = "Option::is_none")]
    refrozen: Option<Refrozen>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReloadInfo {
    players: usize,
    staff: usize,
    clubs: usize,
    game_date: Option<FmDate>,
    /// The checks, run again with the game as it is now.
    health: Health,
    /// Only when the game has loaded another save since: what was frozen in that one before and is frozen again,
    /// when there was any. What was frozen in the save before is not held in this one.
    #[serde(skip_serializing_if = "Option::is_none")]
    refrozen: Option<Refrozen>,
}

/// One page of search results.
#[derive(Serialize)]
struct Page<T> {
    total: usize,
    rows: Vec<T>,
}

/// The game's competitions, for the standings page. `readable` is false on a build whose layout does not place them,
/// or which names no class of them: the page says so rather than show an empty list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompetitionList {
    readable: bool,
    competitions: Vec<Competition>,
}

/// The league tables of the standings page. `supported` is false on a build whose layout places no table: the page says
/// so rather than show a competition with no figures.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LeagueTables {
    supported: bool,
    tables: Vec<LeagueTable>,
}

/// The stages of the standings page's competitions. A local alias keeps the game's own answer type out of the long
/// import above, whose lines the build keeps as they are.
type CompetitionStages = fmlibre_core::CompetitionStages;

/// Searches `index`, keeps the hits `keep` accepts and returns at most `limit` of them.
fn page<T: Listed + Clone>(
    index: &SearchIndex<T>,
    query: &str,
    limit: usize,
    keep: impl Fn(&T) -> bool,
    sort: impl FnOnce(&mut Vec<&T>),
) -> Page<T> {
    let mut hits = index.search(query);
    hits.retain(|item| keep(item));
    sort(&mut hits);
    Page { total: hits.len(), rows: hits.into_iter().take(limit).cloned().collect() }
}

/// What a command reports when it fails: a code the window says in its own language, the
/// values the message names, and the message in English for a code the window does not know.
#[derive(Debug, Clone, Serialize)]
struct Failure {
    code: &'static str,
    params: BTreeMap<&'static str, String>,
    message: String,
}

impl Failure {
    /// A failure of the app's own, rather than of the game or of an edit.
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, params: BTreeMap::new(), message: message.into() }
    }

    fn with(mut self, name: &'static str, value: impl ToString) -> Self {
        self.params.insert(name, value.to_string());
        self
    }

    fn coded(err: &impl Coded) -> Self {
        Self { code: err.code(), params: err.params().into_iter().collect(), message: err.to_string() }
    }
}

macro_rules! coded_failures {
    ($($error:ty),*) => {$(
        impl From<$error> for Failure {
            fn from(err: $error) -> Self {
                Failure::coded(&err)
            }
        }
    )*};
}

coded_failures!(EditError, MoveError, ScoutError, SessionError, fmlibre_mem::Error);

impl<T> From<std::sync::PoisonError<T>> for Failure {
    fn from(err: std::sync::PoisonError<T>) -> Self {
        Failure::new("app.internal", err.to_string())
    }
}

impl From<tauri::Error> for Failure {
    fn from(err: tauri::Error) -> Self {
        Failure::new("app.internal", err.to_string())
    }
}

fn not_connected() -> Failure {
    Failure::new("app.notConnected", "Not connected to the game")
}

/// No player, member of staff or club with `uid` in the lists read from the game.
fn not_found(entity: Entity, uid: u32) -> Failure {
    Failure::new("app.notFound", format!("No {entity} with id {uid}")).with("entity", entity).with("uid", uid)
}

/// A profile could not be read whole, as the game changed it meanwhile.
fn data_changed() -> Failure {
    Failure::new("app.dataChanged", "This data has changed in the game; reload and try again.")
}

/// Lists running Football Manager processes and whether they can be opened for reading.
#[tauri::command]
async fn detect_game(app: tauri::AppHandle) -> Result<Detection, Failure> {
    let running = find_processes(GAME_EXE)?;
    let games = running.into_iter().map(|entry| inspect(entry.pid)).collect();
    Ok(Detection { elevated: is_current_process_elevated(), games, bridge: bridge::status(&app) })
}

fn inspect(pid: u32) -> DetectedGame {
    let result = Process::open_read(pid).and_then(|process| {
        let info = GameInfo::inspect(&process)?;
        let plugin_loaded = list_modules(&process)?.iter().any(|m| m.name.eq_ignore_ascii_case(GAME_PLUGIN));
        Ok((info, plugin_loaded))
    });
    match result {
        Ok((info, plugin_loaded)) => DetectedGame { pid, info: Some(info), plugin_loaded, error: None },
        Err(err) => DetectedGame { pid, info: None, plugin_loaded: false, error: Some(err.into()) },
    }
}

/// Attaches to the running game, locates its data and reads every player, member of
/// staff and club. Only reads memory; the game is opened for writing too when the system
/// allows it, so that edits can be applied later, and so that what was frozen in this
/// save before can be held again (see `Connection::restore_frozen`). The change log lists
/// the history of the career the game has loaded (see `History`).
#[tauri::command]
async fn connect(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    history: State<'_, HistoryFolder>,
) -> Result<ConnectionInfo, Failure> {
    let started = Instant::now();
    let path = file.0.clone();
    let folder = history.0.clone();
    let (connection, refrozen) = tauri::async_runtime::spawn_blocking(move || -> Result<_, Failure> {
        let pid = find_game(None)?;
        let process = Process::open_read_write(pid).or_else(|_| Process::open_read(pid))?;
        let session = Session::connect(process, ArraySource::ProfileFirst)?;
        let mut connection = Connection::load(session, folder.as_deref(), None)?;
        let refrozen = connection.restore_frozen(path.as_deref());
        Ok((connection, refrozen))
    })
    .await??;

    let mut info = connection.info(started.elapsed().as_millis());
    info.refrozen = (!refrozen.is_empty()).then_some(refrozen);
    *state.0.lock()? = Some(connection);
    Ok(info)
}

/// The connection made before, if the app is still attached, without reading the game
/// again: lets the window pick it up after a reload (e.g. to change the language) with
/// the lists and the change log as they were.
#[tauri::command]
fn current_connection(state: State<'_, AppState>) -> Result<Option<ConnectionInfo>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.info(0)))
}

/// Lets the editor write to a build of the game it has no profile for, as far as its checks allow, for as long as
/// the app stays connected.
#[tauri::command]
fn allow_editing(state: State<'_, AppState>) -> Result<ConnectionInfo, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    connection.session.allow_unknown_build();
    Ok(connection.info(0))
}

/// Whether the game has loaded a save, or gone back to its main menu, since the lists were read (see
/// `Session::save_changed`): until they are read again (`reload`), nothing is written and nothing frozen is held, but
/// for the names of stadiums renamed in a save of the same career. False while not connected, or reading again.
#[tauri::command]
fn save_changed(state: State<'_, AppState>) -> Result<bool, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().is_some_and(|connection| connection.session.save_changed()))
}

/// Reads everything again, e.g. after the game has moved on. A list not found when the app connected, as while the
/// game was still loading a save, is looked for again. Drops the connection when that fails. What is frozen stays
/// frozen, and the change log stays, unless the game has loaded another career: then what was frozen in that one
/// before is frozen instead, and the change log lists its history.
#[tauri::command]
async fn reload(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    history: State<'_, HistoryFolder>,
) -> Result<ReloadInfo, Failure> {
    let old = state.0.lock()?.take().ok_or_else(not_connected)?;
    let path = file.0.clone();
    let folder = history.0.clone();
    let (connection, refrozen) = tauri::async_runtime::spawn_blocking(move || -> Result<_, Failure> {
        let Connection { mut session, save, frozen, log, history, .. } = old;
        session.find_missing_arrays();
        let kept = Kept { save: save.clone(), log, history };
        let mut connection = Connection::load(session, folder.as_deref(), Some(kept))?;
        if connection.save == save {
            connection.frozen = frozen;
            // A save loaded again has its stadiums' own names back: the ones the editor gave are given again now.
            connection.give_stadium_names();
            return Ok((connection, None));
        }
        let refrozen = connection.restore_frozen(path.as_deref());
        Ok((connection, (!refrozen.is_empty()).then_some(refrozen)))
    })
    .await??;
    let info = ReloadInfo {
        players: connection.players.len(),
        staff: connection.staff.len(),
        clubs: connection.clubs.len(),
        game_date: connection.session.game_date(),
        health: Health::clone(&connection.session.health()),
        refrozen,
    };
    *state.0.lock()? = Some(connection);
    Ok(info)
}

/// The report Copy diagnostics puts on the clipboard for a bug report, built now from the connection as it is, with
/// the lists Reload data may have found since the app connected (see `fmlibre_core::diagnostics_report`). Off the
/// window's thread, as the retirement manager may be looked for then.
#[tauri::command]
async fn diagnostics(app: tauri::AppHandle) -> Result<String, Failure> {
    let version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        Ok(diagnostics_report(&connection.session, &version))
    })
    .await?
}

/// Players matching `query`, highest current ability first; at most `limit` rows. A filter that keeps to the favorites
/// keeps to those of this save.
#[tauri::command]
fn search_players(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    filter: Option<PlayerFilter>,
    order: Option<PlayerOrder>,
) -> Result<Page<fmlibre_core::PlayerSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let favorites = &connection.favorites;
    Ok(page(
        &connection.players,
        &query,
        limit,
        |p| filter.matches_with(p, favorites),
        |hits| {
            if let Some(order) = order {
                sort_players(hits, order);
            }
        },
    ))
}

/// Staff matching `query`, the human manager first, then by current ability, unless `order` sorts them otherwise; at
/// most `limit` rows.
#[tauri::command]
fn search_staff(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    filter: Option<StaffFilter>,
    order: Option<StaffOrder>,
) -> Result<Page<fmlibre_core::StaffSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    Ok(page(
        &connection.staff,
        &query,
        limit,
        |s| filter.matches(s),
        |hits| {
            if let Some(order) = order {
                sort_staff(hits, order);
            }
        },
    ))
}

/// Clubs matching `query`, highest reputation first; at most `limit` rows. `kind_of` keeps to the clubs of the same kind
/// as the club with that UID, men's or women's: those its players and staff can move to. `kind_of_player` does the same
/// for the player with that UID, for one with no club: the clubs a free agent can sign for; `kind_of_staff` for the
/// member of staff with that id, for one with no club.
#[tauri::command]
fn search_clubs(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    filter: Option<ClubFilter>,
    kind_of: Option<u32>,
    kind_of_player: Option<u32>,
    kind_of_staff: Option<u32>,
) -> Result<Page<fmlibre_core::ClubSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let mut filter = filter.unwrap_or_default();
    if let Some(club) = kind_of.and_then(|uid| connection.clubs.get(uid)) {
        filter.women = Some(club.women);
    }
    if let Some(woman) = kind_of_player.and_then(|uid| connection.players.get(uid)).and_then(|player| player.woman) {
        filter.women = Some(woman);
    }
    if let Some(woman) = kind_of_staff.and_then(|uid| connection.staff.get(uid)).and_then(|member| member.woman) {
        filter.women = Some(woman);
    }
    Ok(page(&connection.clubs, &query, limit, |c| filter.matches(c), |_| {}))
}

/// The leagues the clubs `filter` selects play in this season, for the club list's league filter: grouped by their
/// nation, a nation's best known first. The filter's own league is left out of it, so that every league its other
/// filters allow is offered. Only reads what the club list holds.
#[tauri::command]
fn club_leagues(state: State<'_, AppState>, filter: Option<ClubFilter>) -> Result<Vec<fmlibre_core::League>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = ClubFilter { league_uid: None, ..filter.unwrap_or_default() };
    Ok(fmlibre_core::leagues(connection.clubs.search("").into_iter().filter(|club| filter.matches(club))))
}

/// Writes the players `query` and `filter` select, in `order`, to a new file in the exports folder as `format`: what
/// their profiles hold, with the in-game date in the file and in its name ("players-2027-01-02.csv"; a second export
/// that day "players-2027-01-02-2.csv"). Only reads memory.
#[tauri::command]
async fn export_players(
    app: tauri::AppHandle,
    query: String,
    filter: Option<PlayerFilter>,
    order: Option<PlayerOrder>,
    format: ExportFormat,
) -> Result<ExportReport, Failure> {
    export_list(app, "players", format, move |connection, header, out| {
        let filter = filter.unwrap_or_default();
        let mut hits = connection.players.search(&query);
        hits.retain(|player| filter.matches_with(player, &connection.favorites));
        if let Some(order) = order {
            sort_players(&mut hits, order);
        }
        connection.session.export_players(&hits, format, header, out)
    })
    .await
}

/// Writes the staff `query` and `filter` select, in `order` or as the list shows them (the human manager first, then by
/// current ability), to a new file in the exports folder as `format`: what their profiles hold, with the in-game date in
/// the file and in its name ("staff-2027-01-02.csv"). Only reads memory.
#[tauri::command]
async fn export_staff(
    app: tauri::AppHandle,
    query: String,
    filter: Option<StaffFilter>,
    order: Option<StaffOrder>,
    format: ExportFormat,
) -> Result<ExportReport, Failure> {
    export_list(app, "staff", format, move |connection, header, out| {
        let filter = filter.unwrap_or_default();
        let mut hits = connection.staff.search(&query);
        hits.retain(|member| filter.matches(member));
        if let Some(order) = order {
            sort_staff(&mut hits, order);
        }
        connection.session.export_staff(&hits, format, header, out)
    })
    .await
}

/// Writes the clubs `query` and `filter` select, highest reputation first as the list shows them, to a new file in the
/// exports folder as `format`: what their profiles hold, with the in-game date in the file and in its name
/// ("clubs-2027-01-02.csv"). Only reads memory.
#[tauri::command]
async fn export_clubs(
    app: tauri::AppHandle,
    query: String,
    filter: Option<ClubFilter>,
    format: ExportFormat,
) -> Result<ExportReport, Failure> {
    export_list(app, "clubs", format, move |connection, header, out| {
        let filter = filter.unwrap_or_default();
        let mut hits = connection.clubs.search(&query);
        hits.retain(|club| filter.matches(club));
        connection.session.export_clubs(&hits, format, header, out)
    })
    .await
}

/// Writes the changes `rows` to a new file in the exports folder as CSV, with commas or with semicolons (`format`), a row
/// each: what the Changes view lists for them, with the in-game date in the file's name ("changes-2027-01-02.csv"; a
/// second export that day "changes-2027-01-02-2.csv"). The window sends the rows its search and filters show, since it
/// alone has the texts that go with them: the values as shown, the field's name, the time in its zone. Nothing in the
/// game changes.
#[tauri::command]
async fn export_changes(
    app: tauri::AppHandle,
    rows: Vec<ChangeRow>,
    format: ExportFormat,
) -> Result<ExportReport, Failure> {
    if format == ExportFormat::Json {
        return Err(Failure::new("export.format", "The changes are exported as CSV."));
    }
    export_list(app, "changes", format, move |_, _, out| fmlibre_core::export_changes(rows, format, out)).await
}

/// Writes an export of `what` ("players", "staff", "clubs", "changes") with `write` to a new file in the exports
/// folder, named after it and the in-game date. Only reads memory.
async fn export_list(
    app: tauri::AppHandle,
    what: &'static str,
    format: ExportFormat,
    write: impl FnOnce(&Connection, &ExportHeader, &mut std::io::BufWriter<std::fs::File>) -> std::io::Result<Exported>
    + Send
    + 'static,
) -> Result<ExportReport, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ExportReport, Failure> {
        let folder = app.state::<ExportsFolder>().0.clone();
        let folder = folder.ok_or_else(|| Failure::new("export.noFolder", "There is no folder to export to."))?;
        let failed = |err: std::io::Error| export_failure(&folder, err);
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        let header = ExportHeader {
            writer: format!("FMLibreEditor {}", app.package_info().version),
            game: connection.session.game.name(),
            game_date: connection.session.game_date(),
        };
        std::fs::create_dir_all(&folder).map_err(failed)?;
        let (path, file) = new_export_file(&folder, what, header.game_date, format.extension()).map_err(failed)?;
        let mut out = std::io::BufWriter::new(file);
        let exported = write(connection, &header, &mut out).map_err(failed)?;
        std::io::Write::flush(&mut out).map_err(failed)?;
        let file = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
        Ok(ExportReport { path, file, folder, count: exported.count, skipped: exported.skipped })
    })
    .await?
}

/// What a failed write to the exports `folder` says. macOS may ask the user before an app first writes to the Documents
/// folder (see Info.plist): a no is said as such, with where to change it.
fn export_failure(folder: &Path, err: std::io::Error) -> Failure {
    if cfg!(target_os = "macos") && err.kind() == std::io::ErrorKind::PermissionDenied {
        Failure::new("export.notAllowed", format!("FMLibreEditor may not write to {}: {err}", folder.display()))
            .with("folder", folder.display())
    } else {
        Failure::new("export.failed", err.to_string()).with("reason", err)
    }
}

/// A new file for an export of `what` ("players", "staff", "clubs", "changes") in `folder`, named after the in-game date:
/// the first of "players-2027-01-02.json", "players-2027-01-02-2.json", ... that is not there yet.
fn new_export_file(
    folder: &Path,
    what: &str,
    date: Option<FmDate>,
    extension: &str,
) -> std::io::Result<(PathBuf, std::fs::File)> {
    let stem = date
        .map_or_else(|| what.to_owned(), |date| format!("{what}-{:04}-{:02}-{:02}", date.year, date.month, date.day));
    for n in 1.. {
        let name = if n == 1 { format!("{stem}.{extension}") } else { format!("{stem}-{n}.{extension}") };
        let path = folder.join(name);
        match std::fs::File::create_new(&path) {
            Ok(file) => return Ok((path, file)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists && n < 1000 => continue,
            Err(err) => return Err(err),
        }
    }
    unreachable!("the loop returns")
}

/// `path`, when it is a file an export wrote: the only files the app opens or shows.
fn exported_file(folder: &ExportsFolder, path: &Path) -> Result<PathBuf, Failure> {
    let inside = folder.0.as_deref().is_some_and(|folder| path.parent() == Some(folder));
    if inside && path.is_file() {
        Ok(path.to_owned())
    } else {
        Err(Failure::new("export.notExported", "That is not a file FMLibreEditor exported."))
    }
}

/// Opens the file `path`, which an export wrote, in the app the system opens such files with (a spreadsheet, say).
#[tauri::command]
fn open_export(folder: State<'_, ExportsFolder>, path: PathBuf) -> Result<(), Failure> {
    let path = exported_file(&folder, &path)?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|err| Failure::new("export.openFailed", err.to_string()).with("reason", err))
}

/// Shows the file `path`, which an export wrote, in its folder: in Explorer, or in Finder on macOS.
#[tauri::command]
fn show_export(folder: State<'_, ExportsFolder>, path: PathBuf) -> Result<(), Failure> {
    let path = exported_file(&folder, &path)?;
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|err| Failure::new("export.openFailed", err.to_string()).with("reason", err))
}

/// The full profile of the club with `uid`. Only reads memory.
#[tauri::command]
fn club_details(state: State<'_, AppState>, uid: u32) -> Result<ClubDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?;
    connection.session.club_details(club)?.ok_or_else(data_changed)
}

/// The full profile of the player with `uid`. Only reads memory.
#[tauri::command]
fn player_details(state: State<'_, AppState>, uid: u32) -> Result<PlayerDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let mut details = connection.session.player_details(player)?.ok_or_else(data_changed)?;
    // The teammates his reasons to be unhappy are about, by name.
    if let Some(contract) = details.contract.as_mut().filter(|contract| !contract.concerns.is_empty()) {
        connection.session.name_concerns(&mut contract.concerns, connection.people(), &connection.players);
    }
    // A loan that ends on the day this session's recall wrote, not undone, is the editor's doing.
    if let Some(loan) = details.loan.as_mut() {
        let until = loan.until.map(FmDate::to_number);
        loan.recalled = connection.log.iter().any(|logged| {
            let change = &logged.change;
            change.entity == Entity::Player
                && change.uid == uid
                && change.field == LOAN_EXPIRES
                && logged.undone_at.is_none()
                && Some(change.new) == until
        });
    }
    Ok(details)
}

/// The full profile of the member of staff with `uid`. Only reads memory.
#[tauri::command]
fn staff_details(state: State<'_, AppState>, uid: u32) -> Result<StaffDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let member = connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
    connection.session.staff_details(member)?.ok_or_else(data_changed)
}

/// The nations of the players and staff in the lists, by name: what a nation field can be set to.
#[tauri::command]
fn list_nations(state: State<'_, AppState>) -> Result<Vec<Nation>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.nations())
}

/// The game's competitions, by name: what the standings page offers. Nothing else the editor reads points at them, so
/// they are found by their class: in the game's pool of stages, a few hundred kilobytes, or by one pass over the game's
/// memory where no pool holds them; off the window's thread either way (see `standings.rs`).
#[tauri::command]
async fn list_competitions(app: tauri::AppHandle) -> Result<CompetitionList, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<CompetitionList, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        match connection.session.competitions() {
            Ok(competitions) => Ok(CompetitionList { readable: true, competitions }),
            // A build the editor knows no competitions of: the page says so, as it does for a competition with no
            // table yet. Another build may name the class otherwise.
            Err(StandingsError::NotInLayout | StandingsError::NoClass) => {
                Ok(CompetitionList { readable: false, competitions: Vec::new() })
            }
            Err(err @ StandingsError::Memory(_)) => Err(Failure::coded(&err)),
        }
    })
    .await?
}

/// The tables of `competitions`, read from the stages that play them as leagues, in the order the game shows them. Off
/// the window's thread, as reading them can find the stages first (see `standings.rs`).
#[tauri::command]
async fn league_tables(app: tauri::AppHandle, competitions: Vec<u32>) -> Result<LeagueTables, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LeagueTables, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        match connection.session.league_tables(&competitions) {
            Ok(tables) => Ok(LeagueTables { supported: true, tables }),
            // A build its layout places no table in: the page says so, as it does when it cannot read the
            // competitions.
            Err(StandingsError::NotInLayout | StandingsError::NoClass) => {
                Ok(LeagueTables { supported: false, tables: Vec::new() })
            }
            Err(err @ StandingsError::Memory(_)) => Err(Failure::coded(&err)),
        }
    })
    .await?
}

/// The stages of `competitions`: the table of a league phase, the ties of a cup round, and which stage the calendar is
/// in. The window follows that stage until its reader picks another one by hand. Off the window's thread, as reading
/// the stages can find their classes first (see `stages.rs`).
#[tauri::command]
async fn competition_stages(app: tauri::AppHandle, competitions: Vec<u32>) -> Result<CompetitionStages, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<CompetitionStages, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        match connection.session.competition_stages(&competitions) {
            Ok(stages) => Ok(stages),
            // A build whose layout places no stage: the page keeps showing the tables it already has.
            Err(StandingsError::NotInLayout | StandingsError::NoClass) => Ok(CompetitionStages {
                supported: false,
                game_date: connection.session.game_date(),
                stages: Vec::new(),
                current: HashMap::new(),
            }),
            Err(err @ StandingsError::Memory(_)) => Err(Failure::coded(&err)),
        }
    })
    .await?
}

/// Freezes the money of the club `club`, or unfreezes it: while the app is connected, a frozen club's balance does not
/// go down. Refused while the balance may not be written. The app remembers it for this save, and freezes it again
/// when it connects to the save another time. Returns the clubs frozen now.
#[tauri::command]
fn freeze_money(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    club: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_club(club)?;
    } else {
        connection.frozen.money.remove(&club);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.clubs.insert(club);
        } else {
            save.clubs.remove(&club);
        }
    });
    Ok(connection.frozen.money.keys().copied().collect())
}

/// The clubs whose money is frozen.
#[tauri::command]
fn frozen_clubs(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.money.keys().copied().collect()).unwrap_or_default())
}

/// Freezes the attributes of the player `uid`, or unfreezes them: while the app is connected, a frozen player's
/// attributes do not get worse. Refused while the attributes may not be written. The app remembers it for this save,
/// and freezes them again when it connects to the save another time. Returns the players frozen now.
#[tauri::command]
fn freeze_attributes(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_player(uid)?;
    } else {
        connection.frozen.attributes.remove(&uid);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.players.insert(uid);
        } else {
            save.players.remove(&uid);
        }
    });
    Ok(connection.frozen.attributes.keys().copied().collect())
}

/// The players whose attributes are frozen.
#[tauri::command]
fn frozen_players(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.attributes.keys().copied().collect()).unwrap_or_default())
}

/// Marks the player `uid` as a favorite, or takes the mark away. The app remembers it for this save, and nothing in the
/// game is written: a mark is the user's own. Returns the players marked now.
#[tauri::command]
fn set_player_favorite(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    favorite: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if favorite {
        connection.favorites.insert(uid);
    } else {
        connection.favorites.remove(&uid);
    }
    connection.remember(file.0.as_deref(), |save| {
        if favorite {
            save.favorites.insert(uid);
        } else {
            save.favorites.remove(&uid);
        }
    });
    Ok(connection.favorites.iter().copied().collect())
}

/// The players the user marked as favorites in this save.
#[tauri::command]
fn favorite_players(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.favorites.iter().copied().collect()).unwrap_or_default())
}

/// Freezes the attributes of the member of staff `id`, or unfreezes them: while the app is connected, a frozen member
/// of staff's attributes do not get worse. Refused while the attributes may not be written. The app remembers it for
/// this save, and freezes them again when it connects to the save another time. Returns the members of staff frozen
/// now.
#[tauri::command]
fn freeze_staff_attributes(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    id: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_member(id)?;
    } else {
        connection.frozen.staff.remove(&id);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.staff.insert(id);
        } else {
            save.staff.remove(&id);
        }
    });
    Ok(connection.frozen.staff.keys().copied().collect())
}

/// The members of staff whose attributes are frozen.
#[tauri::command]
fn frozen_staff(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.staff.keys().copied().collect()).unwrap_or_default())
}

/// Freezes the energy and match sharpness of the player `uid`, or unfreezes them: while the app is connected, they do
/// not go down, and a player frozen at full energy stays at it. Refused while they may not be written. The app
/// remembers it for this save, and freezes them again when it connects to the save another time. Returns the players
/// whose energy and match sharpness are frozen now.
#[tauri::command]
fn freeze_fitness(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_fitness(uid)?;
    } else {
        connection.frozen.fitness.remove(&uid);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.fitness.insert(uid);
        } else {
            save.fitness.remove(&uid);
        }
    });
    Ok(connection.frozen.fitness.keys().copied().collect())
}

/// The players whose energy and match sharpness are frozen.
#[tauri::command]
fn frozen_fitness(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.fitness.keys().copied().collect()).unwrap_or_default())
}

/// Freezes the position ratings of the player `uid`, or unfreezes them: while the app is connected, they stay as
/// they are. Refused while they may not be written. The app remembers it for this save, and freezes them again when
/// it connects to the save another time. Returns the players whose positions are frozen now.
#[tauri::command]
fn freeze_positions(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.set_frozen(file.0.as_deref(), FreezeKind::Positions, &[uid], frozen)?;
    Ok(connection.frozen.positions.keys().copied().collect())
}

/// The players whose position ratings are frozen.
#[tauri::command]
fn frozen_positions(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.positions.keys().copied().collect()).unwrap_or_default())
}

/// What freezing a player holds: his attributes, his energy and match sharpness, or his position ratings.
#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
enum FreezeKind {
    Attributes,
    Fitness,
    Positions,
}

impl FreezeKind {
    /// What a player who could not be frozen is said to be refused, as the window names it (`MassFailure::field`).
    fn key(self) -> &'static str {
        match self {
            FreezeKind::Attributes => "attributes",
            FreezeKind::Fitness => "fitness",
            FreezeKind::Positions => "positions",
        }
    }
}

/// What freezing or unfreezing a team came to.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamFreeze {
    /// How many of its players were frozen, or unfrozen, now: not those that already were.
    changed: usize,
    /// Its players who could not be frozen, and why.
    failed: Vec<MassFailure>,
}

/// Freezes what `kind` names for every player of the team `team` of the club `club`, read now, those out on loan
/// too, or unfreezes it, as `freeze_attributes`, `freeze_fitness` and `freeze_positions` do for one player. Refused at
/// once while those fields may not be written. The app remembers it for this save.
#[tauri::command]
fn freeze_team(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    club: u32,
    team: usize,
    kind: FreezeKind,
    frozen: bool,
) -> Result<TeamFreeze, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let members: Vec<u32> = connection
        .session
        .club_teams(summary, &connection.players)?
        .into_iter()
        .find(|found| found.index == team)
        .ok_or(MoveError::NoTeam { index: team })?
        .players
        .iter()
        .map(|member| member.uid)
        .collect();
    connection.set_frozen(file.0.as_deref(), kind, &members, frozen)
}

/// The fields of players or of staff that the editor can change.
#[tauri::command]
fn edit_fields(state: State<'_, AppState>, entity: Entity) -> Result<Vec<Field>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.fields(entity))
}

/// The value of every field of one player, member of staff or club that can be edited
/// now, as stored, read now. Fields without their record (no contract, a club without
/// full finances), dates the game has not set and fields whose check did not pass are
/// left out.
#[tauri::command]
fn read_values(state: State<'_, AppState>, entity: Entity, uid: u32) -> Result<BTreeMap<String, i64>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let (target, _) = connection.target(entity, uid)?;
    let fields: Vec<Field> = connection
        .session
        .fields(entity)
        .into_iter()
        .filter(|field| connection.session.field_lock(field).is_none())
        .collect();
    let values = connection.session.read_fields(&target, &fields)?;
    Ok(fields
        .into_iter()
        .zip(values)
        .filter_map(|(field, value)| {
            let value = value.filter(|&value| field.is_plausible(value))?;
            (field.kind != Kind::Date || value != 0).then_some((field.key, value))
        })
        .collect())
}

/// Writes `edits` (values as stored) to one player or member of staff. Each edit is
/// checked and written on its own: the ones that fail change nothing and are reported.
#[tauri::command]
fn apply_edits(
    state: State<'_, AppState>,
    entity: Entity,
    uid: u32,
    edits: Vec<FieldEdit>,
) -> Result<ApplyReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let (target, name) = connection.target(entity, uid)?;
    let mut report = ApplyReport { applied: Vec::new(), failed: Vec::new() };
    for edit in edits {
        let written = connection
            .session
            .field(entity, &edit.field)
            .and_then(|field| connection.session.write_field(&target, &field, edit.value));
        match written {
            // Already the value asked for: nothing was written.
            Ok(change) if change.old == change.new => {}
            Ok(change) => report.applied.push(connection.log_change(change, name.clone(), None)),
            Err(err) => {
                let error = connection.with_names(err.into());
                report.failed.push(FailedEdit { field: edit.field, value: edit.value, error });
            }
        }
    }
    Ok(report)
}

/// Brings the player `uid` back from his loan: the loan now ends on the day after the game's date, and when the game
/// gets there it ends the loan and brings him back to his club. Logged as a change of the day the loan ends, which an
/// undo puts back while the game has not ended the loan. Nothing is written or logged when it ends then already.
#[tauri::command]
fn recall_loan(state: State<'_, AppState>, uid: u32) -> Result<Option<LoggedChange>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let (target, name) = connection.target(Entity::Player, uid)?;
    let session = &connection.session;
    let written = session.loan_recall_day().and_then(|day| {
        let field = session.field(Entity::Player, LOAN_EXPIRES)?;
        session.write_field(&target, &field, day.to_number())
    });
    let change = match written {
        Ok(change) if change.old == change.new => return Ok(None),
        Ok(change) => change,
        Err(err) => return Err(connection.with_names(err.into())),
    };
    // The loan's option to buy goes too: when a loan with one ends, the game may let the club he is on loan at sign him
    // for it (Anton Kade, recalled, went to Liverpool for his option). The undo writes it back with the loan's end.
    let option = session.field(Entity::Player, LOAN_OPTION_FEE).ok().and_then(|field| {
        let held = session.read_field(&target, &field).ok()?;
        (held >= 0).then(|| session.write_field_if(&target, &field, held, -1))
    });
    let option = match option {
        None => None,
        Some(Ok(option)) => Some(option),
        Some(Err(err)) => {
            // The end is written but not the option: put the end back, so that the recall is all or nothing.
            let _ = session.revert(&target, &change);
            return Err(connection.with_names(err.into()));
        }
    };
    Ok(Some(connection.log_recall(change, name, option)))
}

/// Makes the contract of the player or member of staff `uid` run `years` longer: the day it ends moves on by as many
/// years (see `Session::extend_contract`). Logged as a change of `contract.expires`, which Undo in Changes takes back.
#[tauri::command]
fn extend_contract(state: State<'_, AppState>, entity: Entity, uid: u32, years: i64) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let (target, name) = connection.target(entity, uid)?;
    match connection.session.extend_contract(&target, years) {
        Ok(change) => Ok(connection.log_change(change, name, None)),
        Err(err) => Err(connection.with_names(err.into())),
    }
}

/// Every change written to the career the game has loaded, newest first: this connection's, and the earlier ones its
/// history lists.
#[tauri::command]
fn change_log(state: State<'_, AppState>) -> Result<Vec<LoggedChange>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.log.iter().rev().cloned().collect())
}

/// Forgets the history of the career the game has loaded: its file is emptied, and the change log with it, this
/// connection's changes too. Every change stays in the game; Undo can no longer take them back.
#[tauri::command]
fn clear_history(state: State<'_, AppState>) -> Result<(), Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.history.clear().map_err(|err| {
        Failure::new("app.history", format!("The history could not be cleared: {err}")).with("reason", err)
    })?;
    connection.log.clear();
    Ok(())
}

/// Writes back the old value of the logged change `id`, provided the game still holds the
/// value that change wrote. A stadium's name is held from then on as the undo left it: back to
/// the game's own, it is let go of.
#[tauri::command]
fn undo_change(state: State<'_, AppState>, file: State<'_, FrozenFile>, id: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let logged = connection.undo(id)?;
    if let Some(names) = &logged.stadium {
        connection.hold_stadium_name(file.0.as_deref(), logged.change.uid, &names.from, &names.to);
    }
    Ok(logged)
}

/// Checks that the player `uid` can move to the club `club` on the contract `terms`, and
/// names the clubs; the error says why he cannot. With `release`, that player of the club is
/// released to make room for him (see `room_makers`). Nothing is written.
#[tauri::command]
fn plan_club_move(
    state: State<'_, AppState>,
    uid: u32,
    club: u32,
    terms: MoveTerms,
    fee: Option<i64>,
    release: Option<u32>,
) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_move(uid, club, terms, release)?;
    let fee = connection.plan_fee(plan.from_club, plan.to_club, fee)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    let from = (plan.from_club != 0).then(|| name(plan.from_club));
    Ok(MovePreview { from, to: name(plan.to_club), fee, contract: plan.contract, staff_contract: None })
}

/// The players of the senior team of the club `club` that a move to it can release to make room in a full squad list,
/// the one to suggest first: each one's list row, and whether he is injured or a captain. Off the window's thread: it
/// reads the club's teams and checks each player as a release would.
#[tauri::command]
async fn room_makers(app: tauri::AppHandle, club: u32) -> Result<Vec<RoomMakerRow>, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<RoomMakerRow>, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        let makers = connection.session.room_makers(to, &connection.players, &connection.human_clubs)?;
        Ok(makers
            .into_iter()
            .filter_map(|maker| {
                let player = connection.players.get(maker.uid)?.clone();
                Some(RoomMakerRow { player, injured: maker.injured, captain: maker.captain })
            })
            .collect())
    })
    .await?
}

/// Moves the player `uid` to the senior team of the club `club` on the contract `terms`, the club paying his old
/// one `fee` pounds if given, worked out again from the game as it is now, and logs the move. With `release`, that
/// player of the club is released in the same move, to make room for him. When the fee cannot be paid, the move is
/// undone. Off the window's thread: leaving a club a human manager runs takes a few seconds.
#[tauri::command]
async fn move_player(
    app: tauri::AppHandle,
    uid: u32,
    club: u32,
    terms: MoveTerms,
    fee: Option<i64>,
    release: Option<u32>,
) -> Result<LoggedChange, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LoggedChange, Failure> {
        let state = app.state::<AppState>();
        let mut guard = state.0.lock()?;
        let connection = guard.as_mut().ok_or_else(not_connected)?;
        let plan = connection.plan_move(uid, club, terms, release)?;
        let fee_plan = connection.plan_fee(plan.from_club, plan.to_club, fee)?;
        let club = |uid: u32| connection.clubs.get(uid).cloned().ok_or_else(|| not_found(Entity::Club, uid));
        let buyer = club(plan.to_club)?;
        // A free agent signed has no club (and pays no fee: see `plan_fee`).
        let seller = if plan.from_club == 0 { None } else { Some(club(plan.from_club)?) };
        let done = connection.session.apply_club_move(&plan)?;
        let paid = match (fee_plan, &seller) {
            (Some(fee_plan), Some(seller)) => match connection.session.pay_fee(&fee_plan, &buyer, seller) {
                Ok(paid) => paid,
                Err(err) => {
                    let _ = connection.session.undo_club_move(&done);
                    return Err(err.into());
                }
            },
            _ => Vec::new(),
        };
        // The contract made for a free agent ends on the day it says, given or not.
        let terms = MoveTerms { expires: terms.expires.or(plan.contract.map(|made| made.expires)), ..terms };
        Ok(connection.log_move(done, terms, paid, fee_plan.map(|plan| plan.fee)))
    })
    .await?
}

/// Checks that the loan of the player `uid` can be made permanent on the contract `terms`, the club he is on loan to
/// paying his own one `fee` pounds if given, and names the clubs; the error says why it cannot. Nothing is written.
#[tauri::command]
fn plan_loan_permanent(
    state: State<'_, AppState>,
    uid: u32,
    terms: MoveTerms,
    fee: Option<i64>,
) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_permanent(uid, terms)?;
    let fee = connection.plan_fee(plan.from_club, plan.to_club, fee)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview {
        from: Some(name(plan.from_club)),
        to: name(plan.to_club),
        fee,
        contract: None,
        staff_contract: None,
    })
}

/// Makes the loan of the player `uid` permanent on the contract `terms`, the club he is on loan to paying his own one
/// `fee` pounds if given, worked out again from the game as it is now: he stays where he plays, now under contract
/// with that club, and leaves his own. Logged as a move between the two clubs, which one undo takes back. When the fee
/// cannot be paid, nothing stays changed. Off the window's thread: leaving a club a human manager runs takes a few
/// seconds.
#[tauri::command]
async fn make_loan_permanent(
    app: tauri::AppHandle,
    uid: u32,
    terms: MoveTerms,
    fee: Option<i64>,
) -> Result<LoggedChange, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LoggedChange, Failure> {
        let state = app.state::<AppState>();
        let mut guard = state.0.lock()?;
        let connection = guard.as_mut().ok_or_else(not_connected)?;
        let plan = connection.plan_permanent(uid, terms)?;
        let fee_plan = connection.plan_fee(plan.from_club, plan.to_club, fee)?;
        let club = |uid: u32| connection.clubs.get(uid).cloned().ok_or_else(|| not_found(Entity::Club, uid));
        let (buyer, seller) = (club(plan.to_club)?, club(plan.from_club)?);
        let done = connection.session.apply_club_move(&plan)?;
        let paid = match fee_plan {
            Some(fee_plan) => match connection.session.pay_fee(&fee_plan, &buyer, &seller) {
                Ok(paid) => paid,
                Err(err) => {
                    let _ = connection.session.undo_club_move(&done);
                    return Err(err.into());
                }
            },
            None => Vec::new(),
        };
        Ok(connection.log_move(done, terms, paid, fee_plan.map(|plan| plan.fee)))
    })
    .await?
}

/// Checks that the player `uid` can be released from his club, and names it; the error says why he cannot. Nothing is
/// written.
#[tauri::command]
fn plan_release(state: State<'_, AppState>, uid: u32) -> Result<ClubName, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_release(uid)?;
    Ok(ClubName { uid: plan.from_club, name: connection.club_name(plan.from_club) })
}

/// Releases the player `uid` from his club, worked out again from the game as it is now, and logs it: he becomes a
/// free agent. Off the window's thread, as a move.
#[tauri::command]
async fn release_player(app: tauri::AppHandle, uid: u32) -> Result<LoggedChange, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LoggedChange, Failure> {
        let state = app.state::<AppState>();
        let mut guard = state.0.lock()?;
        let connection = guard.as_mut().ok_or_else(not_connected)?;
        let plan = connection.plan_release(uid)?;
        let done = connection.session.apply_club_move(&plan)?;
        Ok(connection.log_release(done))
    })
    .await?
}

/// Checks that the member of staff `uid` can move to the club `club`, as `job` if given (else in his own job), and
/// names the clubs; the error says why he cannot. One who has no club is signed, as `job`, on a contract the editor
/// makes on `terms`, which the answer says. Nothing is written.
#[tauri::command]
fn plan_staff_move(
    state: State<'_, AppState>,
    uid: u32,
    club: u32,
    job: Option<u8>,
    terms: Option<MoveTerms>,
) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_move(uid, club, job, terms.unwrap_or_default())?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    let from = (plan.from_club != 0).then(|| name(plan.from_club));
    Ok(MovePreview { from, to: name(plan.to_club), fee: None, contract: None, staff_contract: plan.contract })
}

/// Moves the member of staff `uid` to the club `club`, as `job` if given (else in the departments he works in), or
/// signs him for it as `job` on `terms` when he has no club, worked out again from the game as it is now, and logs it.
#[tauri::command]
fn move_staff(
    state: State<'_, AppState>,
    uid: u32,
    club: u32,
    job: Option<u8>,
    terms: Option<MoveTerms>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_move(uid, club, job, terms.unwrap_or_default())?;
    let done = connection.session.apply_staff_plan(&plan)?;
    Ok(connection.log_staff(done, plan.contract, None))
}

/// Gives the member of staff `uid` the job `job` (a contract code) at his club, and logs it.
#[tauri::command]
fn change_staff_job(state: State<'_, AppState>, uid: u32, job: u8) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_job(uid, job)?;
    let done = connection.session.apply_staff_plan(&plan)?;
    Ok(connection.log_staff(done, None, None))
}

/// Checks that the member of staff `uid` can be released from his club, and names it; the error says why he cannot.
/// Nothing is written.
#[tauri::command]
fn plan_staff_release(state: State<'_, AppState>, uid: u32) -> Result<ClubName, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_release(uid)?;
    Ok(ClubName { uid: plan.from_club, name: connection.club_name(plan.from_club) })
}

/// Releases the member of staff `uid` from his club, worked out again from the game as it is now, and logs it: he has
/// no club and no contract then, as the game's own staff without a club have none (see `Session::plan_staff_release`).
/// One undo puts him back on his contract.
#[tauri::command]
fn release_staff(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_release(uid)?;
    let done = connection.session.apply_staff_plan(&plan)?;
    Ok(connection.log_staff(done, None, None))
}

/// The staff of the club `club` as the lists have them, the human manager first and then the best, each with why
/// Release all staff would leave him at the club: the human manager, the board, a player-coach, ... (none for one it
/// releases). Off the window's thread: each is checked as his release would be.
#[tauri::command]
async fn club_staff(app: tauri::AppHandle, club: u32) -> Result<Vec<ClubStaffRow>, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<ClubStaffRow>, Failure> {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        Ok(connection
            .staff
            .iter()
            .filter(|member| member.club_uid == Some(club))
            .map(|member| ClubStaffRow {
                member: member.clone(),
                stays: connection.session.plan_staff_release(member).err().map(|err| connection.with_names(err.into())),
            })
            .collect())
    })
    .await?
}

/// Whether a release refused for `err` leaves the member of staff at his club for good, as Release all staff leaves
/// the human manager, the board, a player-coach and one his club points at in another way: not a failure to report.
fn stays_at_club(err: &MoveError) -> bool {
    matches!(err, MoveError::You | MoveError::UnusualJob { .. } | MoveError::PlayerCoach | MoveError::StaffRole)
}

/// Releases every member of staff of the club `club` that can be released, one after another, each worked out from the
/// game as the release before left it: the human manager, the board and those `stays_at_club` keeps stay. Logged as
/// one batch, which `undo_batch` undoes, the last one first; a release that fails is reported and the others go on.
/// Off the window's thread, as a club may have seventy.
#[tauri::command]
async fn release_club_staff(app: tauri::AppHandle, club: u32) -> Result<MassReport, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<MassReport, Failure> {
        let state = app.state::<AppState>();
        let mut guard = state.0.lock()?;
        let connection = guard.as_mut().ok_or_else(not_connected)?;
        connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        // A release changes the club's lists: refused once, not once for every member of staff.
        if let Some(lock) = connection.session.structure_lock() {
            return Err(MoveError::Locked(lock).into());
        }
        let members: Vec<u32> =
            connection.staff.iter().filter(|member| member.club_uid == Some(club)).map(|member| member.uid).collect();
        let batch = connection.fresh_id();
        let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
        for uid in members {
            let Some(member) = connection.staff.get(uid) else {
                continue;
            };
            let name = member.name.clone();
            let released = match connection.session.plan_staff_release(member) {
                Err(err) if stays_at_club(&err) => continue,
                planned => planned.and_then(|plan| connection.session.apply_staff_plan(&plan)),
            };
            match released {
                Ok(done) => {
                    connection.log_staff(done, None, Some(batch));
                    report.applied += 1;
                }
                Err(err) => {
                    let error = connection.with_names(err.into());
                    report.failed.push(MassFailure { uid, name, field: "club".to_owned(), error });
                }
            }
        }
        Ok(report)
    })
    .await?
}

/// The jobs `change_staff_job` gives, and a move or a signing of staff can, by contract code: in the game connected
/// to, those its layout places (see `Session::staff_jobs`).
#[tauri::command]
fn staff_jobs(state: State<'_, AppState>) -> Result<Vec<u8>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.staff_jobs())
}

/// Checks that the players `uid` and `other` can swap clubs, and names the clubs (`from` is
/// the club of `uid`); the error says why they cannot. Nothing is written.
#[tauri::command]
fn plan_club_swap(state: State<'_, AppState>, uid: u32, other: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_swap(uid, other)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview {
        from: Some(name(plan.from_club)),
        to: name(plan.to_club),
        fee: None,
        contract: None,
        staff_contract: None,
    })
}

/// Swaps the clubs of the players `uid` and `other`, worked out again from the game as it is
/// now; each keeps his contract's terms. Logged as one change of `uid`'s club. Off the
/// window's thread, as a move.
#[tauri::command]
async fn swap_players(app: tauri::AppHandle, uid: u32, other: u32) -> Result<LoggedChange, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<LoggedChange, Failure> {
        let state = app.state::<AppState>();
        let mut guard = state.0.lock()?;
        let connection = guard.as_mut().ok_or_else(not_connected)?;
        let plan = connection.plan_swap(uid, other)?;
        let done = connection.session.apply_club_move(&plan)?;
        Ok(connection.log_move(done, MoveTerms::default(), Vec::new(), None))
    })
    .await?
}

/// Heals every current injury of the player `uid`, as the game does when he gets over them,
/// and logs it as one change of his `injuries` to none.
#[tauri::command]
fn heal_player(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_heal(player)?;
    let done = connection.session.apply_heal(&plan)?;
    Ok(connection.log_heal(done, None))
}

/// Lifts every current ban of the player `uid`, as the game does once he has served them, and
/// logs it as one change of his `bans` to none.
#[tauri::command]
fn lift_bans(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_lift_bans(player)?;
    let done = connection.session.apply_lift_bans(&plan)?;
    Ok(connection.log_lift(done, None))
}

/// Keeps the player `uid` from retiring: the retirement the game has planned for him is taken out of its plans, and he
/// gets the trait "Will play football as long as possible" in place of "Will retire at top". Logged as one change of
/// his `retirement` to none, and undone as one.
#[tauri::command]
fn keep_playing(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_keep_playing(player)?;
    let done = connection.session.apply_retirement(&plan)?;
    Ok(connection.log_retirement(done))
}

/// Points the tie `index` of the player `uid` at the nation `nation` or the club `club` (by UID), and gives a
/// training the homegrown rule `rule`; what is left out stays. Logged and undone like any change.
#[tauri::command]
fn change_tie(
    state: State<'_, AppState>,
    uid: u32,
    index: usize,
    nation: Option<u32>,
    club: Option<u32>,
    rule: Option<u8>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let nation = nation.map(|nation| connection.nation(nation)).transpose()?;
    let club = club.map(|club| connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))).transpose()?;
    let target = nation.as_ref().map(TieTarget::Nation).or(club.map(TieTarget::Club));
    let plan = connection.session.plan_relation_change(player, index, target, rule)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// Takes the tie `index` of the player `uid` out of his list. Logged and undone like any change.
#[tauri::command]
fn remove_tie(state: State<'_, AppState>, uid: u32, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_relation_removal(player, index)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// Gives the player `uid` a tie of `tie` to the nation or club with the UID `target`, under the homegrown rule
/// `rule` for a training: where his list has no room, it is grown (see `relations.rs`). Logged and undone like any
/// change.
#[tauri::command]
fn add_tie(
    state: State<'_, AppState>,
    uid: u32,
    tie: Tie,
    target: u32,
    rule: Option<u8>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let nation;
    let target = if tie == Tie::TrainedAtClub {
        TieTarget::Club(connection.clubs.get(target).ok_or_else(|| not_found(Entity::Club, target))?)
    } else {
        nation = connection.nation(target)?;
        TieTarget::Nation(&nation)
    };
    let plan = connection.session.plan_relation_add(player, tie, target, rule)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// Gives the clause `index` of the contract of the player `uid` the amount `amount` and the condition `condition`;
/// what is left out stays, and only what the clause has can be changed. Logged and undone like any change.
#[tauri::command]
fn change_clause(
    state: State<'_, AppState>,
    uid: u32,
    index: usize,
    amount: Option<u32>,
    condition: Option<u16>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_clause_change(player, index, amount, condition)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// Takes the clause `index` out of the contract of the player `uid`. Logged and undone like any change.
#[tauri::command]
fn remove_clause(state: State<'_, AppState>, uid: u32, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_clause_removal(player, index)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// The name of the stadium the club `club` plays at, with the names it can take in place. Only reads memory.
#[tauri::command]
fn stadium_name(state: State<'_, AppState>, club: u32) -> Result<StadiumName, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let found = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    Ok(connection.session.stadium_name(found)?)
}

/// Renames the stadium the club `club` plays at to `name`: over the old name where it fits its block, in a string of the
/// editor's own otherwise (see `stadium_name.rs`). Logged and undone like any change. The game keeps no stadium names in
/// its saves, so the app remembers the name for this save and gives it again whenever the game gives the stadium its
/// own back, for as long as it is open (see `Connection::hold_stadiums`).
#[tauri::command]
fn rename_stadium(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    club: u32,
    name: String,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let found = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let plan = connection.session.plan_stadium_rename(found, &name)?;
    let done = connection.session.apply_stadium_rename(&plan)?;
    let (from, to) = (done.from.clone(), done.to.clone());
    let logged = connection.log_stadium(done);
    connection.hold_stadium_name(file.0.as_deref(), club, &to, &from);
    Ok(logged)
}

/// The names of the player `uid` as stored, and how many new names the game's tables of names take (see `names.rs`).
/// Only reads memory.
#[tauri::command]
fn player_names(state: State<'_, AppState>, uid: u32) -> Result<PersonNames, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    Ok(connection.session.player_names(player)?)
}

/// Gives the player `uid` the name `name` of kind `kind` (his first, last, common or full name), or with none takes his
/// common or full name away, as the game names a person it makes (see `names.rs`). Logged and undone like any change.
/// The game keeps people's names in its saves, so the name stays once the game is saved.
#[tauri::command]
fn rename_player(
    state: State<'_, AppState>,
    uid: u32,
    kind: NameKind,
    name: Option<String>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_player_name(player, kind, name.as_deref())?;
    let done = connection.session.apply_name_change(&plan)?;
    connection.renamed_player(uid);
    Ok(connection.log_name(done))
}

/// Gives the contract of the player `uid`, which has none, a release clause of `amount` pounds, where its list has
/// room. Logged and undone like any change.
#[tauri::command]
fn add_release_clause(state: State<'_, AppState>, uid: u32, amount: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_release_clause(player, amount)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// The homegrown rules `change_tie` and `add_tie` write, by the game's code.
#[tauri::command]
fn homegrown_rules() -> Vec<u8> {
    HOMEGROWN_RULES.to_vec()
}

/// What the Scouting tab starts from: the human manager's club, its money, its senior squad line by line with the
/// players a scout would let go, and the positions and roles a recommendation can be asked for.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScoutingOverview {
    club: ClubSummary,
    /// Pounds; a week for the wages.
    transfer_budget: Option<i64>,
    wage_budget: Option<i64>,
    /// What the club can still add to its wage bill a week.
    wage_room: Option<i64>,
    report: SquadReport,
    positions: &'static [ScoutPosition],
    roles: &'static [Role],
}

/// The human manager's club for scouting: the first club a human manager runs.
fn scouting_club(connection: &Connection) -> Result<&ClubSummary, Failure> {
    let uid = connection
        .human_clubs
        .first()
        .copied()
        .ok_or_else(|| Failure::new("scout.noClub", "Your manager has no club to scout for"))?;
    connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))
}

/// The club as a buyer: its transfer budget and wage budget, pounds, when its finances can be read.
fn scouting_buyer<'a>(connection: &'a Connection, club: &'a ClubSummary) -> Result<Buyer<'a>, Failure> {
    let finances = connection.session.club_details(club)?.and_then(|details| details.finances);
    Ok(Buyer {
        club,
        transfer_budget: finances.map(|f| i64::from(f.transfer_budget)),
        wage_budget: finances.map(|f| i64::from(f.wage_budget)),
    })
}

/// The Scouting tab's overview, read now. Only reads memory, in well under a second.
#[tauri::command]
fn scouting_overview(state: State<'_, AppState>) -> Result<ScoutingOverview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = scouting_club(connection)?;
    let buyer = scouting_buyer(connection, club)?;
    let report = connection.session.squad_report(club, &connection.players)?;
    Ok(ScoutingOverview {
        club: club.clone(),
        transfer_budget: buyer.transfer_budget,
        wage_budget: buyer.wage_budget,
        wage_room: connection.session.wage_room(&buyer, &connection.players),
        report,
        positions: SCOUT_POSITIONS,
        roles: ROLES,
    })
}

/// Players a scout would recommend for the position `request` describes, for the human manager's club. Only reads
/// memory.
#[tauri::command]
fn scouting_suggest(state: State<'_, AppState>, request: ScoutRequest) -> Result<Scouted, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = scouting_club(connection)?;
    let buyer = scouting_buyer(connection, club)?;
    Ok(connection.session.scout(&request, &buyer, &connection.players, &connection.clubs, &connection.human_clubs)?)
}

/// The players of one list of opportunities (contracts running out, release clauses below a player's value, unhappy
/// players, clubs in the red, the transfer and loan lists, wonderkids) for the human manager's club, and how many every
/// list holds. Only reads memory.
#[tauri::command]
fn scouting_opportunities(
    state: State<'_, AppState>,
    request: fmlibre_core::OpportunityRequest,
) -> Result<fmlibre_core::Opportunities, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = scouting_club(connection)?;
    let buyer = scouting_buyer(connection, club)?;
    let (players, clubs, humans) = (&connection.players, &connection.clubs, &connection.human_clubs);
    Ok(connection.session.opportunities(&request, &buyer, players, clubs, humans)?)
}

/// Players like the player `request.uid` at a position, most alike first, as signings for the human manager's club.
/// Only reads memory.
#[tauri::command]
fn scouting_similar(
    state: State<'_, AppState>,
    request: fmlibre_core::SimilarRequest,
) -> Result<fmlibre_core::Similar, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = scouting_club(connection)?;
    let buyer = scouting_buyer(connection, club)?;
    let reference = connection.players.get(request.uid).ok_or_else(|| not_found(Entity::Player, request.uid))?;
    let (players, clubs, humans) = (&connection.players, &connection.clubs, &connection.human_clubs);
    Ok(connection.session.similar(reference, &request, &buyer, players, clubs, humans)?)
}

/// The youth intakes of the club `club`, or of the human manager's club when none is given: the players the game made
/// who began their careers there, by the day they joined it, the newest first. Only reads memory.
#[tauri::command]
fn youth_intakes(state: State<'_, AppState>, club: Option<u32>) -> Result<fmlibre_core::YouthIntakes, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = match club {
        Some(uid) => connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?,
        None => scouting_club(connection)?,
    };
    Ok(connection.session.youth_intakes(club, &connection.players)?)
}

/// The cities the players of the save were born in, each once, by name: what a player's city of birth can be set to.
/// Only reads memory.
#[tauri::command]
fn birth_cities(state: State<'_, AppState>) -> Result<Vec<fmlibre_core::City>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.birth_cities(connection.players.iter()))
}

/// The headers of `save_scout_report`: the UID of the player the report is about, and what the body is, "png" or
/// "pdf".
const REPORT_PLAYER_HEADER: &str = "x-fmlibre-player";
const REPORT_FORMAT_HEADER: &str = "x-fmlibre-format";

/// A player's name as part of a file name: its letters and digits in lower case, words joined by dashes.
fn file_slug(name: &str) -> String {
    let words: Vec<String> =
        name.split(|c: char| !c.is_alphanumeric()).filter(|word| !word.is_empty()).map(str::to_lowercase).collect();
    words.join("-")
}

/// Saves the scout report the request's body holds, a PNG picture or a PDF (as the `x-fmlibre-format` header says), to
/// a new file in the exports folder, named after the player whose UID the `x-fmlibre-player` header gives and the
/// in-game date ("scout-report-arda-güler-2027-01-02.png").
#[tauri::command]
fn save_scout_report(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<ExportReport, Failure> {
    let header = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok());
    let (extension, signature): (&str, &[u8]) = match header(REPORT_FORMAT_HEADER) {
        Some("pdf") => ("pdf", b"%PDF-"),
        _ => ("png", b"\x89PNG\r\n\x1a\n"),
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(Failure::new("export.failed", "The report came without its file.").with("reason", "no file"));
    };
    if !bytes.starts_with(signature) {
        let reason = format!("not a {}", extension.to_uppercase());
        return Err(Failure::new("export.failed", format!("The report is {reason}.")).with("reason", reason));
    }
    let uid = header(REPORT_PLAYER_HEADER).and_then(|value| value.parse::<u32>().ok());
    let folder = app.state::<ExportsFolder>().0.clone();
    let folder = folder.ok_or_else(|| Failure::new("export.noFolder", "There is no folder to export to."))?;
    let (name, date) = {
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        let name = uid.and_then(|uid| connection.players.get(uid)).map(|player| file_slug(&player.name));
        (name.filter(|name| !name.is_empty()).unwrap_or_else(|| "player".to_owned()), connection.session.game_date())
    };
    let failed = |err: std::io::Error| export_failure(&folder, err);
    std::fs::create_dir_all(&folder).map_err(failed)?;
    let (path, mut file) =
        new_export_file(&folder, &format!("scout-report-{name}"), date, extension).map_err(failed)?;
    std::io::Write::write_all(&mut file, bytes).map_err(failed)?;
    let file = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(ExportReport { path, file, folder, count: 1, skipped: 0 })
}

/// The teams of the club `uid`, the senior team first, with their players: each one's list
/// row and the live values a squad screen shows, read now.
#[tauri::command]
fn club_squads(state: State<'_, AppState>, uid: u32) -> Result<Vec<TeamView>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?;
    let teams = connection.session.club_teams(club, &connection.players)?;
    // Cohesion is shown only where the lists checked out: a build that moved them would read other bytes. So is how
    // well the players know the tactic.
    let cohesion_read = connection.session.health().passed(fmlibre_core::Check::Cohesion);
    let tactics_read = connection.session.health().passed(fmlibre_core::Check::Tactics);
    // Who the club's players hold reasons to be unhappy about, across its teams.
    let members: BTreeSet<u32> = teams.iter().flat_map(|team| team.players.iter().map(|member| member.uid)).collect();
    let members: Vec<&PlayerSummary> = members.iter().filter_map(|&uid| connection.players.get(uid)).collect();
    let concerned = connection.session.concerned_teammates(&members);
    Ok(teams
        .into_iter()
        .map(|team| {
            let known = tactics_read
                .then(|| connection.session.team_familiarity(club, team.index, &connection.players).ok().flatten())
                .flatten()
                .unwrap_or_default();
            TeamView {
                index: team.index,
                kind: team.kind,
                age_limit: team.age_limit,
                captain: team.captain,
                vice_captain: team.vice_captain,
                players: team
                    .players
                    .into_iter()
                    .filter_map(|member| {
                        let player = connection.players.get(member.uid)?.clone();
                        let cohesion =
                            cohesion_read.then(|| connection.session.cohesion(&player, club).ok().flatten()).flatten();
                        let familiarity = known.get(&member.uid);
                        Some(SquadRow {
                            player,
                            plays_here: member.plays_here,
                            loan: member.loan,
                            condition: member.condition,
                            match_sharpness: member.match_sharpness,
                            jadedness: member.jadedness,
                            morale: member.morale,
                            cohesion,
                            tactics: familiarity.map(|f| f.overall),
                            trains: familiarity.is_some_and(|f| f.trains),
                            concerned_teammates: concerned.get(&member.uid).copied().unwrap_or(0),
                            injuries: member.injuries,
                            bans: member.bans,
                            attributes_frozen: connection.frozen.attributes.contains_key(&member.uid),
                            fitness_frozen: connection.frozen.fitness.contains_key(&member.uid),
                            positions_frozen: connection.frozen.positions.contains_key(&member.uid),
                        })
                    })
                    .collect(),
            }
        })
        .collect())
}

/// Makes the player `uid` the captain or vice-captain of the team `team` of the club `club`;
/// he must play for that team. When he held the other role, the two captains swap.
#[tauri::command]
fn set_captain(
    state: State<'_, AppState>,
    club: u32,
    team: usize,
    role: CaptainRole,
    uid: u32,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_captain(summary, team, role, player, &connection.players)?;
    if plan.writes() == 0 {
        return Err(Failure::new("captain.unchanged", "The player holds that role already."));
    }
    let done = connection.session.apply_captain(&plan)?;
    Ok(connection.log_captain(done))
}

/// Does `action` to every player of the team `team` of the club `club`, read now: those out
/// on loan too. The changes are logged as one batch, which `undo_batch` undoes.
#[tauri::command]
fn team_action(state: State<'_, AppState>, club: u32, team: usize, action: TeamAction) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    // A copy, for the log can be written while it is in use.
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?.clone();
    let members = connection
        .session
        .club_teams(&summary, &connection.players)?
        .into_iter()
        .find(|found| found.index == team)
        .ok_or(MoveError::NoTeam { index: team })?
        .players;
    // Healing and lifting bans change the players' records: refused once, not once for every player.
    if matches!(action, TeamAction::Heal | TeamAction::LiftBans)
        && let Some(lock) = connection.session.structure_lock()
    {
        return Err(MoveError::Locked(lock).into());
    }
    let batch = connection.fresh_id();
    let values: &[(&str, i64)] = match action {
        TeamAction::Heal => {
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in members.iter().filter(|member| member.injuries > 0) {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let healed = connection.session.plan_heal(player).and_then(|plan| connection.session.apply_heal(&plan));
                match healed {
                    Ok(done) => {
                        connection.log_heal(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "injuries".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        TeamAction::LiftBans => {
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in members.iter().filter(|member| member.bans > 0) {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let lifted = connection
                    .session
                    .plan_lift_bans(player)
                    .and_then(|plan| connection.session.apply_lift_bans(&plan));
                match lifted {
                    Ok(done) => {
                        connection.log_lift(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "bans".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        // Cohesion with the club at its best, as FM27 Editor saw FMRTE's Improve Team Cohesion set it, for those who
        // have an entry for the club: one is added nowhere, and the app counts those without one. The game shows the
        // team's cohesion on its Dynamics page once it moves on.
        TeamAction::MaxCohesion => {
            let (_, best) = COHESION_RANGE;
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in &members {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let planned = connection.session.plan_cohesion(player, &summary, best);
                let set = match planned {
                    Ok(Some(plan)) if plan.before == best => continue,
                    Ok(Some(plan)) => connection.session.apply_cohesion(&plan),
                    Ok(None) => continue,
                    Err(err) => Err(err),
                };
                match set {
                    Ok(done) => {
                        connection.log_cohesion(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "cohesion".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        // The tactic the human manager plays with the team known at its best: each player's record and history of
        // training (see `familiarity.rs`). One the game keeps no history for has his record written; the app counts them.
        TeamAction::MaxTactics => {
            if let Some(lock) = connection.session.tactics_lock().or_else(|| connection.session.structure_lock()) {
                return Err(MoveError::Locked(lock).into());
            }
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            let plans = connection.session.plan_max_tactics(&summary, team, &connection.players)?.unwrap_or_default();
            for plan in plans.iter().filter(|plan| plan.writes()) {
                let name = connection.player_name(plan.player);
                match connection.session.apply_tactics(plan) {
                    Ok(done) => {
                        connection.log_tactics(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: plan.player,
                        name,
                        field: "tactics".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        // Morale at its best, and the reasons to be unhappy gone, as FMRTE's Inspire does.
        TeamAction::Inspire => &[("morale", 20), ("contract.unhappiness", 0)],
        // Rested as the game rests a player: full energy and sharpness, and jadedness at its least.
        TeamAction::Refresh => &[("condition", 10_000), ("match_sharpness", 10_000), ("jadedness", -500)],
        TeamAction::MaxAttributes => &[],
    };
    let targets: Vec<(Target, String)> = members
        .iter()
        .filter_map(|member| connection.players.get(member.uid))
        .map(|player| (player.target(), player.name.clone()))
        .collect();
    let operations = if action == TeamAction::MaxAttributes {
        connection.best_attributes(Entity::Player)
    } else {
        values
            .iter()
            .map(|&(key, value)| Ok((connection.session.field(Entity::Player, key)?, Operation::Set { value })))
            .collect::<Result<Vec<_>, EditError>>()?
    };
    let plan = connection.session.plan_mass_edit(&targets, &operations)?;
    Ok(connection.write_planned(Entity::Player, plan.planned, batch))
}

/// Sets every attribute of the player `uid` to its best, as Max attributes does for a team: 20, and 1 for injury
/// proneness and dirtiness. The changes are logged as one batch, which `undo_batch` undoes.
#[tauri::command]
fn max_attributes(state: State<'_, AppState>, uid: u32) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let targets = [(player.target(), player.name.clone())];
    let plan = connection.session.plan_mass_edit(&targets, &connection.best_attributes(Entity::Player))?;
    let batch = connection.fresh_id();
    let mut report = connection.write_planned(Entity::Player, plan.planned, batch);
    // An attribute that could not be read is said, not passed over: it is one player, not a team.
    report.failed.extend(plan.skipped.into_iter().map(|skipped| MassFailure {
        uid: skipped.uid,
        name: skipped.name,
        field: skipped.field,
        error: Failure { code: skipped.code, params: skipped.params, message: skipped.reason },
    }));
    Ok(report)
}

/// The CA-growth watch: every watched player with his ability read now, and whether it can be
/// written.
#[tauri::command]
fn growth_rows(state: State<'_, AppState>) -> Result<GrowthRows, Failure> {
    let mut guard = state.0.lock()?;
    guard.as_mut().ok_or_else(not_connected)?.growth_rows()
}

/// Watches `uids` for CA growth, each starting his climb at the current ability he has now.
/// Players already watched are left as they are, and one already at his potential is watched
/// as done, so the panel says so rather than writing.
#[tauri::command]
fn growth_watch(state: State<'_, AppState>, uids: Vec<u32>) -> Result<GrowthRows, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let ability = connection.session.field(Entity::Player, CURRENT_ABILITY)?;
    let potential = connection.session.field(Entity::Player, POTENTIAL_ABILITY)?;
    if let Some(lock) = connection.session.field_lock(&ability) {
        return Err(EditError::Locked { field: ability.key.clone(), lock }.into());
    }
    let fields = [ability, potential];
    for uid in uids {
        if connection.growth.iter().any(|target| target.uid == uid) {
            continue;
        }
        let Some(target) = connection.players.get(uid).map(|player| player.target()) else {
            continue;
        };
        let Ok((ca, pa)) = growth_reading(&connection.session, &target, &fields) else {
            continue;
        };
        connection.growth.push(GrowTarget::new(uid, ca, pa));
    }
    connection.growth_rows()
}

/// Stops watching `uids` for CA growth; their climbs are forgotten.
#[tauri::command]
fn growth_unwatch(state: State<'_, AppState>, uids: Vec<u32>) -> Result<GrowthRows, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.growth.retain(|target| !uids.contains(&target.uid));
    connection.growth_rows()
}

/// Stops watching every player for CA growth.
#[tauri::command]
fn growth_clear(state: State<'_, AppState>) -> Result<GrowthRows, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.growth.clear();
    connection.growth_rows()
}

/// Spreads every watched climb over `seasons` seasons instead, the days already paid for kept:
/// the curve is re-stretched from the same start.
#[tauri::command]
fn growth_set_seasons(state: State<'_, AppState>, seasons: u32) -> Result<GrowthRows, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.growth_seasons = seasons.clamp(LEAST_SEASONS, MOST_SEASONS);
    connection.growth_rows()
}

/// Pays one in-game day of every watched player's climb by hand.
#[tauri::command]
fn growth_step(state: State<'_, AppState>) -> Result<GrowthReport, Failure> {
    let mut guard = state.0.lock()?;
    guard.as_mut().ok_or_else(not_connected)?.growth_apply(1, false)
}

/// Closes the whole gap to his potential for every watched player at once. The panel asks
/// first; FM spends the new current ability on training over the following days.
#[tauri::command]
fn growth_fill(state: State<'_, AppState>) -> Result<GrowthReport, Failure> {
    let mut guard = state.0.lock()?;
    guard.as_mut().ok_or_else(not_connected)?.growth_apply(0, true)
}

/// Sets every attribute of the member of staff `id` to its best (20), as `max_attributes` does for a player. The
/// changes are logged as one batch, which `undo_batch` undoes.
#[tauri::command]
fn max_staff_attributes(state: State<'_, AppState>, id: u32) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let member = connection.staff.get(id).ok_or_else(|| not_found(Entity::Staff, id))?;
    let targets = [(member.target(), member.name.clone())];
    let plan = connection.session.plan_mass_edit(&targets, &connection.best_attributes(Entity::Staff))?;
    let batch = connection.fresh_id();
    let mut report = connection.write_planned(Entity::Staff, plan.planned, batch);
    // An attribute that could not be read is said, not passed over: it is one member of staff, not a team.
    report.failed.extend(plan.skipped.into_iter().map(|skipped| MassFailure {
        uid: skipped.uid,
        name: skipped.name,
        field: skipped.field,
        error: Failure { code: skipped.code, params: skipped.params, message: skipped.reason },
    }));
    Ok(report)
}

/// The presets a player's template panel offers: one per position the game plays, and the abilities of a 19-year-old
/// there (see `fmlibre_core::template`). It reads nothing of the game, so it is answered before a connection too.
#[tauri::command]
fn player_template_presets() -> Vec<TemplatePreset> {
    fmlibre_core::presets()
}

/// The template to fill a player's edit in with, from the presets or from the players of the save that `query` fits:
/// abilities and attributes as the game shows them (1–20 for an attribute, 1–200 for an ability), and position
/// ratings. Only the lists are read, never the game's memory, and nothing is written.
#[tauri::command]
fn player_template(state: State<'_, AppState>, query: Option<TemplateQuery>) -> Result<TemplateProfile, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(fmlibre_core::template_profile(&connection.players, &query.unwrap_or_default()))
}

/// Works out a mass edit: `operations` applied to every player, member of staff or club
/// that `query` and the entity's filter select, from the values the game holds now.
/// Nothing is written; the plan waits for `apply_mass_edit` with the preview's id.
#[tauri::command]
fn plan_mass_edit(
    state: State<'_, AppState>,
    entity: Entity,
    query: String,
    filters: Filters,
    operations: Vec<MassOperation>,
) -> Result<MassPreview, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if operations.is_empty() {
        return Err(Failure::new("mass.noOperations", "Choose at least one field to change."));
    }
    let targets = connection.select(entity, &query, filters);
    if targets.len() > MASS_LIMIT {
        let message = format!(
            "{} match. Narrow the search or the filters to {MASS_LIMIT} or fewer for a mass edit.",
            targets.len()
        );
        return Err(Failure::new("mass.tooMany", message).with("count", targets.len()).with("limit", MASS_LIMIT));
    }
    let operations = operations
        .into_iter()
        .map(|op| Ok((connection.session.field(entity, &op.field)?, op.operation)))
        .collect::<Result<Vec<_>, EditError>>()?;
    let plan = connection.session.plan_mass_edit(&targets, &operations)?;
    let id = connection.fresh_id();
    let preview = MassPreview {
        id,
        targets: targets.len(),
        unchanged: plan.unchanged,
        changes: plan.planned.len(),
        rows: plan.planned.iter().take(PREVIEW_ROWS).cloned().collect(),
        skipped_count: plan.skipped.len(),
        skipped: plan.skipped.into_iter().take(PREVIEW_ROWS).collect(),
    };
    connection.mass = Some(PendingMass { id, entity, planned: plan.planned });
    Ok(preview)
}

/// Writes the mass edit previewed as `id`, exactly as it was shown: each change only while
/// the game still holds the value it was planned from. The changes are logged as one batch.
#[tauri::command]
fn apply_mass_edit(state: State<'_, AppState>, id: u32) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let pending = match connection.mass.take() {
        Some(pending) if pending.id == id => pending,
        other => {
            connection.mass = other;
            return Err(Failure::new("mass.outOfDate", "This preview is out of date. Preview the mass edit again."));
        }
    };
    let batch = connection.fresh_id();
    Ok(connection.write_planned(pending.entity, pending.planned, batch))
}

/// Undoes every change of the mass edit `batch` that is not undone yet, newest first.
/// Changes the game has changed since are left as they are and reported. Refused at once
/// while the game has loaded a save since the lists were read, as each undo would be.
#[tauri::command]
fn undo_batch(state: State<'_, AppState>, batch: u32) -> Result<BatchUndo, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.refuse_after_load()?;
    let ids: Vec<usize> = connection
        .log
        .iter()
        .rev()
        .filter(|logged| logged.batch == Some(batch) && logged.undone_at.is_none())
        .map(|logged| logged.id)
        .collect();
    let mut report = BatchUndo { undone: 0, failed: Vec::new() };
    for id in ids {
        match connection.undo(id) {
            Ok(_) => report.undone += 1,
            Err(error) => report.failed.push(BatchUndoFailure { id, error }),
        }
    }
    Ok(report)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Opens the page of a new release in the browser (see app/src/update.ts).
        .plugin(tauri_plugin_opener::init())
        // Downloads a new version, checks its signature against the key in tauri.conf.json and installs it: the
        // installer on Windows, the app in place of this one on macOS (see self_update.rs).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(Graphics::default())
        .setup(|app| {
            // Reading the packs' config files takes a moment: do it beside the window. FM keeps its user data
            // in the documents folder on Windows and in Application Support on macOS, or somewhere else, which
            // GRAPHICS_FOLDER can name.
            #[cfg(target_os = "macos")]
            let user_data = app.path().data_dir();
            #[cfg(not(target_os = "macos"))]
            let user_data = app.path().document_dir();
            let environment = std::env::var_os(GRAPHICS_FOLDER).map(PathBuf::from);
            let default_root = user_data.ok().map(|folder| GraphicsIndex::default_root(&folder, 27));
            let data = std::env::var_os(DATA_FOLDER)
                .map(PathBuf::from)
                .or_else(|| scoped(app.path().app_data_dir().ok(), DEVELOPMENT));
            app.manage(HistoryFolder(data.as_ref().map(|folder| folder.join(HISTORY_FOLDER))));
            app.manage(FrozenFile(data.as_ref().map(|folder| folder.join(FROZEN_FILE))));
            // The graphics folder the user chose in the window, if any, is kept beside what was frozen.
            let graphics_file = data.as_ref().map(|folder| folder.join(GRAPHICS_FILE));
            let choice = graphics_file.as_deref().map(GraphicsChoice::read).unwrap_or_default();
            app.manage(GraphicsFolders {
                chosen: Mutex::new(choice.folder.map(PathBuf::from)),
                file: graphics_file,
                environment,
                default: default_root,
            });
            let exports = std::env::var_os(EXPORTS_FOLDER).map(PathBuf::from).or_else(|| {
                scoped(
                    app.path().document_dir().ok().map(|folder| folder.join("FMLibreEditor").join("Exports")),
                    DEVELOPMENT,
                )
            });
            app.manage(ExportsFolder(exports));
            // macOS: after an update, the game is to load the bridge that came with this version.
            bridge::refresh(app.handle());
            // Frozen money, attributes, energy and sharpness: every little while, what the game took is put back.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(FREEZE_EVERY);
                    let state = handle.state::<AppState>();
                    if let Ok(mut guard) = state.0.lock()
                        && let Some(connection) = guard.as_mut()
                        && !connection.frozen.is_empty()
                    {
                        connection.hold_frozen();
                    }
                }
            });
            let graphics = app.state::<Graphics>();
            read_graphics(&graphics, app.state::<GraphicsFolders>().root().0);
            Ok(())
        })
        .register_uri_scheme_protocol("fmgfx", |ctx, request| {
            let graphics = ctx.app_handle().state::<Graphics>();
            picture_response(&graphics, request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            detect_game,
            connect,
            current_connection,
            allow_editing,
            save_changed,
            reload,
            diagnostics,
            search_players,
            search_staff,
            search_clubs,
            club_leagues,
            export_players,
            export_staff,
            export_clubs,
            export_changes,
            open_export,
            show_export,
            player_details,
            staff_details,
            club_details,
            list_nations,
            list_competitions,
            league_tables,
            competition_stages,
            freeze_money,
            frozen_clubs,
            freeze_attributes,
            frozen_players,
            set_player_favorite,
            favorite_players,
            freeze_staff_attributes,
            frozen_staff,
            max_staff_attributes,
            freeze_fitness,
            frozen_fitness,
            freeze_positions,
            frozen_positions,
            freeze_team,
            edit_fields,
            read_values,
            apply_edits,
            recall_loan,
            extend_contract,
            change_log,
            clear_history,
            undo_change,
            plan_mass_edit,
            apply_mass_edit,
            undo_batch,
            plan_club_move,
            room_makers,
            move_player,
            plan_loan_permanent,
            make_loan_permanent,
            plan_release,
            release_player,
            plan_club_swap,
            swap_players,
            plan_staff_move,
            move_staff,
            change_staff_job,
            plan_staff_release,
            release_staff,
            club_staff,
            release_club_staff,
            staff_jobs,
            heal_player,
            lift_bans,
            keep_playing,
            change_tie,
            remove_tie,
            add_tie,
            change_clause,
            remove_clause,
            add_release_clause,
            stadium_name,
            rename_stadium,
            player_names,
            rename_player,
            homegrown_rules,
            club_squads,
            scouting_overview,
            scouting_suggest,
            scouting_opportunities,
            scouting_similar,
            save_scout_report,
            youth_intakes,
            birth_cities,
            set_captain,
            team_action,
            max_attributes,
            growth_rows,
            growth_watch,
            growth_unwatch,
            growth_clear,
            growth_set_seasons,
            growth_step,
            growth_fill,
            player_template_presets,
            player_template,
            graphics_info,
            set_graphics_folder,
            self_update::can_self_update,
            self_update::install_update,
            self_update::restart_app,
            bridge::bridge_status,
            bridge::set_up_bridge,
            bridge::remove_bridge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_development_build_keeps_its_files_below_dev() {
        let folder = Some(PathBuf::from("data"));
        assert_eq!(scoped(folder.clone(), true), Some(PathBuf::from("data").join("dev")));
        assert_eq!(scoped(folder, false), Some(PathBuf::from("data")));
        assert_eq!(scoped(None, true), None);
    }

    #[test]
    fn a_chosen_graphics_folder_wins_over_the_environment_and_the_default() {
        let folders = GraphicsFolders {
            chosen: Mutex::new(None),
            file: None,
            environment: Some(PathBuf::from("environment")),
            default: Some(PathBuf::from("default")),
        };
        assert_eq!(folders.root(), (Some(PathBuf::from("environment")), GraphicsSource::Environment));
        if let Ok(mut chosen) = folders.chosen.lock() {
            *chosen = Some(PathBuf::from("chosen"));
        }
        assert_eq!(folders.root(), (Some(PathBuf::from("chosen")), GraphicsSource::User));
    }

    #[test]
    fn graphics_folders_without_an_environment_fall_back_to_the_default() {
        let folders = GraphicsFolders {
            chosen: Mutex::new(None),
            file: None,
            environment: None,
            default: Some(PathBuf::from("default")),
        };
        assert_eq!(folders.root(), (Some(PathBuf::from("default")), GraphicsSource::Default));
        let none = GraphicsFolders { chosen: Mutex::new(None), file: None, environment: None, default: None };
        assert_eq!(none.root(), (None, GraphicsSource::None));
    }

    #[test]
    fn graphics_choices_without_a_folder_are_read() {
        let choice = GraphicsChoice::read(Path::new("a-graphics-file-that-is-not-there.json"));
        assert!(choice.folder.is_none());
        let read: GraphicsChoice = serde_json::from_str(r#"{ "folder": "D:\\graphics" }"#).expect("a file");
        assert_eq!(read.folder.as_deref(), Some(r"D:\graphics"));
    }

    #[test]
    fn release_all_leaves_the_board_and_reports_what_went_wrong() {
        // Those who stay are not failures: the human manager, the board, a player-coach, one held in another way.
        for stays in [MoveError::You, MoveError::UnusualJob { job: 4 }, MoveError::PlayerCoach, MoveError::StaffRole] {
            assert!(stays_at_club(&stays), "{stays}");
        }
        // A release the game's memory did not let through is.
        for failed in [MoveError::Changed { address: 0x10 }, MoveError::NotInDepartment, MoveError::UnusualContract] {
            assert!(!stays_at_club(&failed), "{failed}");
        }
    }

    #[test]
    fn report_files_are_named_after_the_player() {
        assert_eq!(file_slug("Arda Güler"), "arda-güler");
        assert_eq!(file_slug("N'Golo Kanté"), "n-golo-kanté");
        assert_eq!(file_slug("  Vinícius Júnior / 7 "), "vinícius-júnior-7");
        assert_eq!(file_slug("?:*"), "");
    }

    #[test]
    fn frozen_files_of_earlier_versions_are_read() {
        // As 0.4.2 wrote it, before energy and match sharpness could be frozen.
        let file = r#"{ "saves": { "Steam:1000": { "players": [28122642], "clubs": [602] } } }"#;
        let remembered: Remembered = serde_json::from_str(file).expect("an earlier file");
        let save = &remembered.saves["Steam:1000"];
        assert!(save.players.contains(&28122642) && save.clubs.contains(&602) && save.fitness.is_empty());
    }

    #[test]
    fn a_stadium_keeps_the_name_the_editor_gave_it_until_it_has_its_own_back() {
        let held = |name: &str, original: &str| HeldName { name: name.to_owned(), original: original.to_owned() };
        // Renamed, renamed again, then two undos.
        let first = HeldName::after(None, "North Bank", "Emirates Stadium");
        assert_eq!(first, Some(held("North Bank", "Emirates Stadium")));
        let second = HeldName::after(first.as_ref(), "Highbury", "North Bank");
        assert_eq!(second, Some(held("Highbury", "Emirates Stadium")));
        let undone = HeldName::after(second.as_ref(), "North Bank", "Highbury");
        assert_eq!(undone, Some(held("North Bank", "Emirates Stadium")));
        assert_eq!(HeldName::after(undone.as_ref(), "Emirates Stadium", "North Bank"), None);
        // Renamed back by hand, and that undone: the editor's name is held again.
        assert_eq!(HeldName::after(first.as_ref(), "Emirates Stadium", "North Bank"), None);
        assert_eq!(HeldName::after(None, "North Bank", "Emirates Stadium"), first);
    }

    #[test]
    fn stadium_names_are_remembered_beside_what_is_frozen() {
        // As 0.4.4 wrote it, before stadium names were remembered.
        let file = r#"{ "saves": { "Steam:1000": { "players": [], "staff": [], "clubs": [602], "fitness": [] } } }"#;
        let mut remembered: Remembered = serde_json::from_str(file).expect("an earlier file");
        let save = remembered.saves.get_mut("Steam:1000").expect("the save");
        assert!(save.stadiums.is_empty());
        save.clubs.clear();
        assert!(save.is_empty());
        let name = HeldName { name: "North Bank".to_owned(), original: "Emirates Stadium".to_owned() };
        save.stadiums.insert(602, name.clone());
        assert!(!save.is_empty());
        let written = serde_json::to_string(&remembered).expect("written");
        let read: Remembered = serde_json::from_str(&written).expect("read back");
        assert_eq!(read.saves["Steam:1000"].stadiums.get(&602), Some(&name));
    }

    #[test]
    fn favorites_are_remembered_beside_what_is_frozen() {
        // As 0.4.5 wrote it, before players could be marked as favorites.
        let file = r#"{ "saves": { "Steam:1000": { "players": [], "staff": [], "clubs": [602] } } }"#;
        let mut remembered: Remembered = serde_json::from_str(file).expect("an earlier file");
        let save = remembered.saves.get_mut("Steam:1000").expect("the save");
        assert!(save.favorites.is_empty());
        save.clubs.clear();
        assert!(save.is_empty());
        save.favorites.insert(28122642);
        assert!(!save.is_empty());
        let written = serde_json::to_string(&remembered).expect("written");
        let read: Remembered = serde_json::from_str(&written).expect("read back");
        assert!(read.saves["Steam:1000"].favorites.contains(&28122642));
    }

    #[test]
    fn frozen_files_without_staff_are_read() {
        // As 0.4.3 wrote it, before the attributes of staff could be frozen.
        let file = r#"{ "saves": { "Steam:1000": { "players": [1], "clubs": [], "fitness": [] } } }"#;
        let remembered: Remembered = serde_json::from_str(file).expect("an earlier file");
        assert!(remembered.saves["Steam:1000"].staff.is_empty());
    }

    #[test]
    fn frozen_files_without_positions_are_read() {
        // As 0.4.3 wrote it, before positions could be frozen.
        let file = r#"{ "saves": { "Steam:1000": { "players": [1], "clubs": [], "fitness": [], "staff": [] } } }"#;
        let remembered: Remembered = serde_json::from_str(file).expect("an earlier file");
        assert!(remembered.saves["Steam:1000"].positions.is_empty());
    }

    #[test]
    fn remembered_staff_keep_a_save_from_being_empty() {
        let mut save = RememberedSave::default();
        assert!(save.is_empty());
        save.staff.insert(5);
        assert!(!save.is_empty());
        let mut frozen = Frozen::default();
        assert!(frozen.is_empty());
        frozen.staff.insert(5, BTreeMap::new());
        assert!(!frozen.is_empty());
    }

    #[test]
    fn each_kind_of_freeze_is_remembered_apart() {
        let mut save = RememberedSave::default();
        save.of(FreezeKind::Fitness).insert(7);
        assert!(save.fitness.contains(&7) && save.players.is_empty() && !save.is_empty());
        save.of(FreezeKind::Attributes).insert(8);
        save.of(FreezeKind::Positions).insert(9);
        let written = serde_json::to_string(&save).expect("written");
        let read: RememberedSave = serde_json::from_str(&written).expect("read back");
        assert!(read.players.contains(&8) && read.fitness.contains(&7) && read.positions.contains(&9));
    }

    /// A change of a player of this connection, as the log keeps it.
    fn logged(id: usize, field: &str, old: i64, new: i64, batch: Option<u32>) -> LoggedChange {
        LoggedChange {
            id,
            at: 1_700_000_000_000 + id as u64,
            name: format!("Player {id}"),
            change: Change { entity: Entity::Player, uid: 1000 + id as u32, field: field.to_owned(), old, new },
            undone_at: None,
            batch,
            earlier: false,
            undoable: true,
            in_game: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            recall: None,
            stadium: None,
            person_name: None,
            objects: None,
            stored: None,
            undo: None,
        }
    }

    /// `logged` as a line of the history of the connection called `session`.
    fn line(logged: &LoggedChange, session: &str) -> HistoryLine {
        HistoryLine::Change(Box::new(StoredChange::of(logged, session)))
    }

    /// A folder of a test's own under the system's temporary folder, empty.
    fn test_folder(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("fmlibre-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        folder
    }

    #[test]
    fn history_files_are_named_after_the_career() {
        assert_eq!(history_file_name("Steam:28122642"), "Steam-28122642.jsonl");
        assert_eq!(history_file_name("GamePass:1+2"), "GamePass-1+2.jsonl");
        assert_eq!(history_file_name(r"Steam:..\x"), "Steam----x.jsonl");
    }

    #[test]
    fn the_history_lists_the_changes_of_two_connections_again_with_their_undos() {
        let folder = test_folder("history");
        let career = Some("Steam:1");
        let (mut first, log) = History::open(Some(&folder), career);
        assert!(log.is_empty());
        first.session = "first".to_owned();
        let (mut second, _) = History::open(Some(&folder), career);
        second.session = "second".to_owned();
        // A value, a recall from loan that took the option to buy away, and a mass edit, which both connections number 1.
        let value = logged(1, "attribute.finishing", 70, 100, None);
        let option =
            Change { entity: Entity::Player, uid: 1002, field: LOAN_OPTION_FEE.to_owned(), old: 5_000_000, new: -1 };
        let recall = LoggedChange {
            recall: Some(RecallNote { option_fee: 5_000_000 }),
            undo: Some(Undo::Recall(option)),
            ..logged(2, LOAN_EXPIRES, 20270630, 20261115, None)
        };
        for change in [&value, &recall, &logged(3, "morale", 10, 20, Some(1)), &logged(4, "morale", 12, 20, Some(1))] {
            first.add(&line(change, "first"));
        }
        // A move, whose undo needed the game's memory as it was.
        let mut moved = StoredChange::of(&logged(1, "club", 728, 1139, None), "second");
        moved.plain = false;
        moved.moved = Some(MovedClubs {
            from: Some("Tottenham".to_owned()),
            to: Some("Juventus".to_owned()),
            with: None,
            released: None,
            fee: None,
        });
        second.add(&HistoryLine::Change(Box::new(moved)));
        second.add(&line(&logged(2, "morale", 9, 20, Some(1)), "second"));
        first.add(&HistoryLine::Undone { session: "first".to_owned(), id: 1, at: 99 });
        // A change listed twice, a line that is no JSON and one cut short by a crash: passed over.
        first.add(&line(&value, "first"));
        drop((first, second));
        let path = folder.join(history_file_name("Steam:1"));
        let mut file = OpenOptions::new().append(true).open(&path).expect("the history file");
        file.write_all(b"not json\n{\"line\":\"change\",\"sess").expect("written");
        drop(file);

        let (_, log) = History::open(Some(&folder), career);
        assert_eq!(log.iter().map(|logged| logged.id).collect::<Vec<_>>(), [1, 2, 3, 4, 5, 6]);
        assert!(log.iter().all(|logged| logged.earlier));
        let [value, recall, mass, same_mass, moved, other_mass] = &log[..] else {
            panic!("six changes");
        };
        assert_eq!(value.undone_at, Some(99));
        assert_eq!((value.change.old, value.change.new, value.undoable), (70, 100, true));
        assert!(recall.undoable && matches!(&recall.undo, Some(Undo::Recall(option)) if option.old == 5_000_000));
        assert_eq!(recall.recall.as_ref().map(|note| note.option_fee), Some(5_000_000));
        assert!(mass.batch.is_some() && mass.batch == same_mass.batch);
        assert_ne!(mass.batch, other_mass.batch, "the mass edits of two connections are told apart");
        assert!(!moved.undoable && moved.undo.is_none());
        assert_eq!(moved.moved.as_ref().and_then(|clubs| clubs.to.as_deref()), Some("Juventus"));
        assert_eq!(moved.stored, Some(StoredKey { session: "second".to_owned(), id: 1 }));
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn a_cleared_history_lists_nothing_and_goes_on_after() {
        let folder = test_folder("history-clear");
        let career = Some("GamePass:7");
        let (mut history, _) = History::open(Some(&folder), career);
        history.add(&line(&logged(1, "morale", 10, 20, None), "one"));
        assert_eq!(History::open(Some(&folder), career).1.len(), 1);
        history.clear().expect("cleared");
        assert!(History::open(Some(&folder), career).1.is_empty());
        history.add(&line(&logged(1, "morale", 20, 15, None), "two"));
        let (_, log) = History::open(Some(&folder), career);
        assert_eq!(log.iter().map(|logged| logged.change.new).collect::<Vec<_>>(), [15]);
        // Without a data folder, or a career, nothing is kept and nothing fails.
        let (mut nowhere, log) = History::open(None, career);
        assert!(log.is_empty() && nowhere.clear().is_ok());
        nowhere.add(&HistoryLine::Undone { session: "x".to_owned(), id: 1, at: 1 });
        assert!(History::open(Some(&folder), None).1.is_empty());
        let _ = std::fs::remove_dir_all(&folder);
    }
}
