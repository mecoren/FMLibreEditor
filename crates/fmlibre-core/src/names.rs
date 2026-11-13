//! A person's names: his first, last and common names, entries of the game's tables of names, and his full name, a
//! string of his own. Changed as the game names a person it makes.
//!
//! The game keeps a table of first names, one of last names and one of common names (see docs/recon/fm27-names.md).
//! A player or member of staff points at an entry of each, or at none of common names when he has no common name. An
//! entry (`[names]` in the layout) holds the text, an FM string; the `u32` id the save knows it by, which is its place
//! in the table's list by id; the nation it was made for and the weight the game gives it when it picks a name for a
//! new person of that nation; and a few bytes more. Entries are the slots of one of the game's pools (see
//! `object_pool.rs`). A save holds each table as its texts by id, and each person's names by their ids, with his full
//! name as text.
//!
//! The game makes a new entry for nearly every person it makes, even for a name it has (each new Thomas gets his own
//! entry, pointing at the same string), and has people share one now and then (brothers share their last name). For
//! a person it names by hand, such as the human manager, it makes one of weight 0, which it never picks for anyone
//! else. A new first, last or common name is made the same way: a slot of the pool is taken as the game takes one; the
//! entry is written into it with the next id (the length of the table's list by id), weight 0, and the nation and the
//! other bytes of the entry it replaces (for a common name he has none of, his last name's); the list by id gets it
//! at its end; and the person points at it. The list has room for a few more than the save held (32 each on Game
//! Pass 0.9.2435.0), and the editor never makes it bigger: once it is full, no new name of that kind until the game
//! makes room itself, as it does when it names people, or the save is loaded again. The text is a string in memory of
//! the editor's own laid out as the game's are, with a count of holders that never runs out (see `stadium_name.rs`).
//!
//! The full name is a string the person points at himself, outside the tables: he is pointed at such a string. A
//! common name or a full name can be taken away, the pointer then null, as many people have none; a first or last
//! name cannot.
//!
//! An undo points the person at his old entry or string again. A new entry stays in its table, used by no one as some
//! of the game's own are, and is saved with it.

use fmlibre_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::own_memory::CAN_ALLOCATE;
use crate::players::PlayerSummary;
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::text::{display_name, read_fm_string, read_name_entry};
use crate::transfer::{MoveError, Patch, Patches};

/// The longest name the editor writes, in bytes of UTF-8.
pub const LONGEST_PERSON_NAME: usize = 80;

/// The fewest and the most entries a table of names is taken to have.
const FEWEST_ENTRIES: u64 = 100;
const MOST_ENTRIES: u64 = 20_000_000;

/// Which of a person's names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NameKind {
    First,
    Last,
    Common,
    Full,
}

impl NameKind {
    pub const ALL: [NameKind; 4] = [NameKind::First, NameKind::Last, NameKind::Common, NameKind::Full];

    /// The name of the kind in error codes' parameters and in the app.
    pub fn key(self) -> &'static str {
        match self {
            NameKind::First => "first",
            NameKind::Last => "last",
            NameKind::Common => "common",
            NameKind::Full => "full",
        }
    }

    /// The table of names it is an entry of, by its place in `[names] lists_before_players`: none for the full name.
    fn table(self) -> Option<usize> {
        match self {
            NameKind::First => Some(0),
            NameKind::Last => Some(1),
            NameKind::Common => Some(2),
            NameKind::Full => None,
        }
    }

    /// Whether a person may have none.
    fn optional(self) -> bool {
        matches!(self, NameKind::Common | NameKind::Full)
    }

    /// Its place in [`NameKind::ALL`] and in a person's fields.
    fn index(self) -> usize {
        match self {
            NameKind::First => 0,
            NameKind::Last => 1,
            NameKind::Common => 2,
            NameKind::Full => 3,
        }
    }
}

/// A person's names as stored, and what the editor can make of them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonNames {
    pub first: Option<String>,
    pub last: Option<String>,
    pub common: Option<String>,
    pub full: Option<String>,
    /// How many more new first, last and common names the game's lists take before it makes room itself; none where
    /// the editor cannot find the tables or they do not check out, and cannot change the names.
    pub room: Option<[u64; 3]>,
    /// The most bytes of UTF-8 a name may take.
    pub longest: usize,
}

impl PersonNames {
    /// The name the game shows for the person with the UID or id `uid`: the common name if set, otherwise first and
    /// last name, otherwise the full name.
    pub fn shown(&self, uid: u32) -> String {
        display_name(self.common.clone(), self.first.clone(), self.last.clone(), self.full.as_ref(), uid)
    }
}

/// A change of one of a person's names, planned or made.
#[derive(Debug, Clone)]
pub struct NameChange {
    /// The player's UID, or the member of staff's id.
    pub person: u32,
    pub kind: NameKind,
    pub from: Option<String>,
    pub to: Option<String>,
    /// The entry it makes in a table of names, for a first, last or common name.
    entry: Option<NewEntry>,
    /// The write that points the person at his new name, or at none. Planned, it writes nothing for a new string, which
    /// is made as it is applied; applied, it is the one write its undo puts back.
    field: Patch,
    /// Every write made, the person's last; empty in a plan.
    pub(crate) patches: Vec<Patch>,
}

impl NameChange {
    /// Whether it made a new entry in a table of names.
    pub fn made_entry(&self) -> bool {
        self.entry.is_some()
    }
}

/// A new entry in a table of names, planned: the slot of the pool it takes and the writes that take it, the entry
/// but for its text, and the writes that put it at the end of the table's list by id.
#[derive(Debug, Clone)]
struct NewEntry {
    pool: Patch,
    slot: u64,
    was: Vec<u8>,
    bytes: Vec<u8>,
    list: Vec<Patch>,
}

/// A table's list of entries by id: where the game keeps its `(begin, end, capacity)`, and what they hold.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NameList {
    header: u64,
    begin: u64,
    end: u64,
    capacity: u64,
}

impl NameList {
    fn count(&self) -> u64 {
        (self.end - self.begin) / 8
    }

    /// How many more entries it holds before the game has to give it a bigger buffer.
    fn room(&self) -> u64 {
        (self.capacity - self.end) / 8
    }
}

/// Where a person keeps his UID or id and his names: the first, last and common names' entries and the full name's
/// string, in [`NameKind::ALL`] order.
#[derive(Debug, Clone, Copy)]
struct Person {
    id: u32,
    id_at: u64,
    fields: [u64; 4],
}

/// Whether `text` can be a name: no spaces at its ends, no control characters, not too long; and not empty for a
/// name a person needs.
fn check_text(kind: NameKind, text: Option<&str>) -> Result<(), MoveError> {
    let bad = MoveError::BadPersonName { max: LONGEST_PERSON_NAME };
    match text {
        None if kind.optional() => Ok(()),
        None => Err(bad),
        Some(text) => {
            let fits = !text.is_empty()
                && text.trim() == text
                && !text.chars().any(char::is_control)
                && text.len() <= LONGEST_PERSON_NAME;
            if fits { Ok(()) } else { Err(bad) }
        }
    }
}

impl Session {
    /// The names of `player` as stored, with how many new names the game's tables take.
    pub fn player_names(&self, player: &PlayerSummary) -> Result<PersonNames, MoveError> {
        let person = self.player_person(player)?;
        self.person_names(&person)
    }

    /// The names of the member of staff `member` as stored, with how many new names the game's tables take.
    pub fn staff_names(&self, member: &StaffSummary) -> Result<PersonNames, MoveError> {
        let person = self.staff_person(member)?;
        self.person_names(&person)
    }

    /// Works out giving `player` the name `to` of kind `kind`, or none (a common or full name only), from the game as
    /// it is now (see the module's notes). Nothing is written.
    pub fn plan_player_name(
        &self,
        player: &PlayerSummary,
        kind: NameKind,
        to: Option<&str>,
    ) -> Result<NameChange, MoveError> {
        let person = self.player_person(player)?;
        self.plan_name(&person, kind, to)
    }

    /// Works out giving the member of staff `member` the name `to` of kind `kind`, or none (a common or full name
    /// only), from the game as it is now. Nothing is written.
    pub fn plan_staff_name(
        &self,
        member: &StaffSummary,
        kind: NameKind,
        to: Option<&str>,
    ) -> Result<NameChange, MoveError> {
        let person = self.staff_person(member)?;
        self.plan_name(&person, kind, to)
    }

    /// Writes a planned change of name and returns what it wrote, for its undo: the new name's string, then the new
    /// entry, the list by id and the person. Each write lands only on the bytes the plan found, and is read back; when
    /// one fails, the ones before it are put back.
    pub fn apply_name_change(&self, plan: &NameChange) -> Result<NameChange, MoveError> {
        let mut done = plan.clone();
        let string = plan.to.as_deref().map(|text| self.own_string(text)).transpose()?;
        let mut patches = Vec::new();
        match &plan.entry {
            Some(entry) => {
                let string = string.ok_or(MoveError::BadPersonName { max: LONGEST_PERSON_NAME })?;
                let mut bytes = entry.bytes.clone();
                bytes[..8].copy_from_slice(&string.to_le_bytes());
                patches.push(entry.pool.clone());
                patches.push(Patch { address: entry.slot, before: entry.was.clone(), after: bytes });
                patches.extend(entry.list.iter().cloned());
                done.field.after = entry.slot.to_le_bytes().into();
            }
            None => done.field.after = string.unwrap_or(0).to_le_bytes().into(),
        }
        if done.field.after == done.field.before {
            return Err(MoveError::SameName);
        }
        patches.push(done.field.clone());
        self.apply_patches(&patches)?;
        done.patches = patches;
        Ok(done)
    }

    /// Points the person at the name he had before `done` again, provided he still points at the one it gave him.
    pub fn undo_name_change(&self, done: &NameChange) -> Result<(), MoveError> {
        self.undo_patches(std::slice::from_ref(&done.field))
    }

    /// Where `player` keeps his UID and names, checked to carry his UID still.
    fn player_person(&self, player: &PlayerSummary) -> Result<Person, MoveError> {
        let p = &self.layout.player;
        let at = |offset: u64| player.address + p.at(offset, player.shift);
        let person = Person {
            id: player.uid,
            id_at: at(p.uid),
            fields: [at(p.first_name), at(p.last_name), at(p.common_name), at(p.full_name)],
        };
        if self.process.read_u32(person.id_at)? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        Ok(person)
    }

    /// Where `member` keeps his id and names, checked to carry his id still.
    fn staff_person(&self, member: &StaffSummary) -> Result<Person, MoveError> {
        let s = &self.layout.staff;
        let at = |offset: u64| member.address + s.at(offset, member.shift);
        let person = Person {
            id: member.uid,
            id_at: at(s.uid),
            fields: [at(s.first_name), at(s.last_name), at(s.common_name), at(s.full_name)],
        };
        if self.process.read_u32(person.id_at)? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        Ok(person)
    }

    /// What `person` is called, and how many new names the tables take: none when one of them, or one of his entries,
    /// does not check out.
    fn person_names(&self, person: &Person) -> Result<PersonNames, MoveError> {
        let pointer = |kind: NameKind| self.process.read_u64(person.fields[kind.index()]);
        let entry = |kind: NameKind| -> Result<Option<String>, MoveError> {
            Ok(read_name_entry(&self.process, pointer(kind)?))
        };
        let room = (0..3)
            .map(|table| {
                let list = self.name_list(table)?;
                let own = pointer(NameKind::ALL[table])?;
                if own != 0 && !self.holds_entry(&list, own, false)? {
                    return Err(MoveError::NoNames);
                }
                Ok(list.room())
            })
            .collect::<Result<Vec<u64>, MoveError>>()
            .ok()
            .filter(|_| CAN_ALLOCATE)
            .map(|room| [room[0], room[1], room[2]]);
        Ok(PersonNames {
            first: entry(NameKind::First)?,
            last: entry(NameKind::Last)?,
            common: entry(NameKind::Common)?,
            full: read_fm_string(&self.process, pointer(NameKind::Full)?),
            room,
            longest: LONGEST_PERSON_NAME,
        })
    }

    /// Works out giving `person` the name `to` of kind `kind`, or none (see [`Session::plan_player_name`]).
    fn plan_name(&self, person: &Person, kind: NameKind, to: Option<&str>) -> Result<NameChange, MoveError> {
        check_text(kind, to)?;
        if !CAN_ALLOCATE && to.is_some() {
            return Err(MoveError::NoNames);
        }
        let process = &self.process;
        let field_at = person.fields[kind.index()];
        let old = process.read_u64(field_at)?;
        let from = match kind.table() {
            Some(_) => read_name_entry(process, old),
            None => read_fm_string(process, old),
        };
        let to = to.map(str::to_owned);
        if from == to {
            return Err(MoveError::SameName);
        }
        let field = Patch { address: field_at, before: old.to_le_bytes().into(), after: old.to_le_bytes().into() };
        let mut change = NameChange { person: person.id, kind, from, to, entry: None, field, patches: Vec::new() };
        let Some(table) = kind.table() else {
            return Ok(change);
        };
        let list = self.name_list(table)?;
        // The entry he has is the table's, where its id says.
        if old != 0 && !self.holds_entry(&list, old, false)? {
            return Err(MoveError::NoNames);
        }
        if change.to.is_none() {
            change.field.after = 0u64.to_le_bytes().into();
            return Ok(change);
        }
        change.entry = Some(self.new_entry(person, kind, &list, old)?);
        Ok(change)
    }

    /// Plans a new entry for `person`'s name of kind `kind` in the table whose list by id is `list`: in a slot of the
    /// pool of entries, modelled on `old`, the entry he has (or, for a common name he has none of, his last name's),
    /// with the next id and weight 0, at the end of the list.
    fn new_entry(&self, person: &Person, kind: NameKind, list: &NameList, old: u64) -> Result<NewEntry, MoveError> {
        let process = &self.process;
        let names = self.layout.names.as_ref().ok_or(MoveError::NoNames)?;
        let pools = self.layout.pool.as_ref().ok_or(MoveError::NoNames)?;
        if list.room() == 0 {
            return Err(MoveError::NamesFull { table: kind.key() });
        }
        let model = match old {
            0 => {
                let last = process.read_u64(person.fields[NameKind::Last.index()])?;
                if !self.holds_entry(&self.name_list(NameKind::Last.index())?, last, false)? {
                    return Err(MoveError::NoNames);
                }
                last
            }
            old => old,
        };
        let pool = self.pool_holding(model, names.entry_size).map_err(|err| match err {
            MoveError::NoPool => MoveError::NoNames,
            err => err,
        })?;
        let taken = pool.take(process, pools).map_err(|err| match err {
            MoveError::NoPool => MoveError::NoNames,
            MoveError::PoolFull => MoveError::NamesFull { table: kind.key() },
            err => err,
        })?;
        let mut bytes = process.read_bytes(model, names.entry_size as usize)?;
        let mut put = |offset: u64, value: &[u8]| {
            bytes[offset as usize..offset as usize + value.len()].copy_from_slice(value);
        };
        put(0, &0u64.to_le_bytes());
        put(names.id, &(list.count() as u32).to_le_bytes());
        put(names.weight, &0u16.to_le_bytes());
        let mut patches = Patches::default();
        patches.push(list.end, process.read_bytes(list.end, 8)?, taken.slot.to_le_bytes());
        patches.push(list.header + 8, list.end.to_le_bytes(), (list.end + 8).to_le_bytes());
        Ok(NewEntry { pool: taken.pool, slot: taken.slot, was: taken.was, bytes, list: patches.0 })
    }

    /// The list by id of the table `table` (0 first, 1 last, 2 common names), checked: where the layout says the game
    /// keeps a pointer to it, a list of a table's length whose first and last entries sit where their ids say, with a
    /// text.
    fn name_list(&self, table: usize) -> Result<NameList, MoveError> {
        let names = self.layout.names.as_ref().ok_or(MoveError::NoNames)?;
        let players = self.arrays.players.as_ref().ok_or(MoveError::NoNames)?;
        let pointer_at = (self.plugin.base + players.pair_rva)
            .checked_sub(names.lists_before_players[table])
            .filter(|&at| self.plugin.contains(at))
            .ok_or(MoveError::NoNames)?;
        let header = self.process.read_u64(pointer_at)?;
        if !is_user_pointer(header) {
            return Err(MoveError::NoNames);
        }
        let words = self.process.read_bytes(header, 24)?;
        let word = |at: usize| u64::from_le_bytes(words[at..at + 8].try_into().expect("8 bytes"));
        let list = NameList { header, begin: word(0), end: word(8), capacity: word(16) };
        let fits = is_user_pointer(list.begin)
            && list.begin <= list.end
            && list.end <= list.capacity
            && (list.end - list.begin).is_multiple_of(8)
            && (list.capacity - list.begin).is_multiple_of(8)
            && (FEWEST_ENTRIES..=MOST_ENTRIES).contains(&list.count());
        if !fits {
            return Err(MoveError::NoNames);
        }
        for index in [0, list.count() / 2, list.count() - 1] {
            let entry = self.process.read_u64(list.begin + index * 8)?;
            if !self.holds_entry(&list, entry, true)? {
                return Err(MoveError::NoNames);
            }
        }
        Ok(list)
    }

    /// Whether `entry` is an entry of the table whose list by id is `list`: at the place its id says, and, with
    /// `text`, holding a text that reads (the game has an entry or two with none).
    fn holds_entry(&self, list: &NameList, entry: u64, text: bool) -> Result<bool, MoveError> {
        let names = self.layout.names.as_ref().ok_or(MoveError::NoNames)?;
        if !is_user_pointer(entry) {
            return Ok(false);
        }
        let id = u64::from(self.process.read_u32(entry + names.id)?);
        if id >= list.count() || self.process.read_u64(list.begin + id * 8)? != entry {
            return Ok(false);
        }
        Ok(!text || read_name_entry(&self.process, entry).is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_a_person_can_take() {
        assert!(check_text(NameKind::First, Some("Bukayo")).is_ok());
        assert!(check_text(NameKind::Last, Some("Veloso dos Santos")).is_ok());
        assert!(check_text(NameKind::Common, Some("Pedri")).is_ok());
        assert!(check_text(NameKind::Full, Some("Lionel Andrés Messi Cuccittini")).is_ok());
        // Only a common or full name can be taken away.
        assert!(check_text(NameKind::Common, None).is_ok());
        assert!(check_text(NameKind::Full, None).is_ok());
        assert!(check_text(NameKind::First, None).is_err());
        assert!(check_text(NameKind::Last, None).is_err());
        // Empty, spaces at the ends, control characters, too long.
        assert!(check_text(NameKind::First, Some("")).is_err());
        assert!(check_text(NameKind::First, Some(" Bukayo")).is_err());
        assert!(check_text(NameKind::Last, Some("Saka ")).is_err());
        assert!(check_text(NameKind::Common, Some("Pe\ndri")).is_err());
        let long = "a".repeat(LONGEST_PERSON_NAME);
        assert!(check_text(NameKind::Full, Some(&long)).is_ok());
        assert!(check_text(NameKind::Full, Some(&format!("{long}a"))).is_err());
        // Bytes, not characters: 40 two-byte letters fit, 41 do not.
        assert!(check_text(NameKind::Last, Some(&"ö".repeat(40))).is_ok());
        assert!(check_text(NameKind::Last, Some(&"ö".repeat(41))).is_err());
    }

    #[test]
    fn kinds_keep_their_places() {
        for (index, kind) in NameKind::ALL.into_iter().enumerate() {
            assert_eq!(kind.index(), index);
            assert_eq!(kind.table(), (index < 3).then_some(index));
        }
        assert_eq!(NameKind::ALL.map(NameKind::key), ["first", "last", "common", "full"]);
    }

    #[test]
    fn a_list_counts_its_entries_and_room() {
        // The first names' list on Game Pass 0.9.2435.0: 321,748 entries and room for 32 more.
        let list = NameList {
            header: 0x19c_145f_10b0,
            begin: 0x19c_d009_1040,
            end: 0x19c_d030_56e0,
            capacity: 0x19c_d030_57e0,
        };
        assert_eq!(list.count(), 321_748);
        assert_eq!(list.room(), 32);
    }
}
