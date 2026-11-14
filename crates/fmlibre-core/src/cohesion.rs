//! A player's cohesion with his club: the value FM27 Editor (Jackhamerp24's, GPL-3.0) changes as team cohesion, as it
//! saw FMRTE 27 change it.
//!
//! The record a player's `relations` pointer leads to holds, after his list of ties (see `relations.rs`), a second
//! list (see [`CohesionLayout`]): 8-byte entries, each the index of a club or a nation, what it is for, and a value
//! of 1..100. The entry for a club is his cohesion with it. On the macOS Steam save it was 99 for Saka at Arsenal and
//! 2 for Kepa, and 13 to 17 for clubs players had left; the game works a team's cohesion out from it (see the Steam
//! macOS notes). The game gives a player an entry for his club when it signs him; some who had come in by an
//! editor's move had none. FMRTE 27's Improve Team Cohesion, as FM27 Editor observed it, sets the club's entries to
//! 100 and adds none; so does the editor.
//!
//! [`CohesionLayout`]: crate::profile::CohesionLayout

use fmlibre_mem::{Process, is_user_pointer};

use crate::clubs::ClubSummary;
use crate::players::PlayerSummary;
use crate::profile::CohesionLayout;
use crate::session::Session;
use crate::transfer::{MoveError, Patch, Patches};

/// The kinds of entry: for a club, and for a nation.
const CLUB: u8 = 1;
const NATION: u8 = 2;

/// The longest list of cohesion entries the editor reads, as FM27 Editor.
const MOST_ENTRIES: u64 = 500;

/// The lowest and the highest cohesion the editor writes, as FM27 Editor saw FMRTE 27's "Destroy" and "Improve" write.
pub const COHESION_RANGE: (i8, i8) = (1, 100);

/// Setting a player's cohesion with a club worked out: the write that sets his entry for it.
#[derive(Debug, Clone)]
pub struct CohesionPlan {
    pub player: u32,
    pub club: u32,
    /// His cohesion with the club before, and the one written.
    pub before: i8,
    pub value: i8,
    patches: Vec<Patch>,
}

/// Cohesion that was set: what undoing it takes.
#[derive(Debug, Clone)]
pub struct CohesionSet {
    pub player: u32,
    pub club: u32,
    pub before: i8,
    pub value: i8,
    patches: Vec<Patch>,
}

/// One entry of a list of cohesion entries: the index it is for, its kind, its value, and where the value is.
struct Entry {
    index: i32,
    kind: u8,
    value: i8,
    at: u64,
}

impl Session {
    /// The cohesion of `player` with `club`; `None` where the layout has not placed it, or he has no entry for it.
    pub fn cohesion(&self, player: &PlayerSummary, club: &ClubSummary) -> Result<Option<i8>, MoveError> {
        let Some(c) = &self.layout.cohesion else {
            return Ok(None);
        };
        let index = self.club_cohesion_index(c, club)?;
        Ok(self.cohesion_entries(c, player)?.into_iter().find(|e| e.kind == CLUB && e.index == index).map(|e| e.value))
    }

    /// Works out setting the cohesion of `player` with `club` to `value`. `None` where the layout has not placed
    /// cohesion, or he has no entry for the club, which the editor does not add. Nothing is written.
    pub fn plan_cohesion(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        value: i8,
    ) -> Result<Option<CohesionPlan>, MoveError> {
        let Some(c) = &self.layout.cohesion else {
            return Ok(None);
        };
        let (min, max) = COHESION_RANGE;
        if !(min..=max).contains(&value) {
            let (value, min, max) = (i64::from(value), i64::from(min), i64::from(max));
            return Err(MoveError::OutOfRange { field: "cohesion", value, min, max });
        }
        let index = self.club_cohesion_index(c, club)?;
        let entries = self.cohesion_entries(c, player)?;
        let Some(entry) = entries.into_iter().find(|e| e.kind == CLUB && e.index == index) else {
            return Ok(None);
        };
        let mut patches = Patches::default();
        patches.push(entry.at, entry.value.to_le_bytes(), value.to_le_bytes());
        Ok(Some(CohesionPlan { player: player.uid, club: club.uid, before: entry.value, value, patches: patches.0 }))
    }

    /// Writes planned cohesion, only over what the plan found.
    pub fn apply_cohesion(&self, plan: &CohesionPlan) -> Result<CohesionSet, MoveError> {
        if let Some(lock) = self.cohesion_lock() {
            return Err(MoveError::Locked(lock));
        }
        self.apply_patches(&plan.patches)?;
        let CohesionPlan { player, club, before, value, ref patches } = *plan;
        Ok(CohesionSet { player, club, before, value, patches: patches.clone() })
    }

    /// Puts the cohesion back as it was, provided it is still what the change wrote.
    pub fn undo_cohesion(&self, done: &CohesionSet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The index the cohesion entries name `club` by.
    fn club_cohesion_index(&self, c: &CohesionLayout, club: &ClubSummary) -> Result<i32, MoveError> {
        if self.process.read_u32(club.address + self.layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let bytes = self.process.read_bytes(club.address + c.club_index, 4)?;
        Ok(i32::from_le_bytes(bytes.try_into().expect("4 bytes")))
    }

    /// The entries of the list of cohesion entries of `player`: none when he has no record of relations.
    fn cohesion_entries(&self, c: &CohesionLayout, player: &PlayerSummary) -> Result<Vec<Entry>, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let record = self.process.read_u64(player.address + p.at(p.relations, player.shift))?;
        if !is_user_pointer(record) {
            return Ok(Vec::new());
        }
        let (begin, bytes) = read_list(&self.process, c, record)?.ok_or(MoveError::NotListed)?;
        Ok(entries(c, begin, &bytes))
    }
}

/// The list of cohesion entries in the record of relations at `record`: where it begins and its bytes, none for an
/// empty list; `None` where the words there are not those of a list.
pub(crate) fn read_list(
    process: &Process,
    c: &CohesionLayout,
    record: u64,
) -> fmlibre_mem::Result<Option<(u64, Vec<u8>)>> {
    let words = process.read_bytes(record + c.list, 24)?;
    let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
    let (begin, end, capacity) = (word(0), word(1), word(2));
    if begin == 0 && end == 0 && capacity == 0 {
        return Ok(Some((0, Vec::new())));
    }
    if !is_cohesion_list(begin, end, capacity, c.size) {
        return Ok(None);
    }
    Ok(Some((begin, process.read_bytes(begin, (end - begin) as usize)?)))
}

/// The entries of a list of cohesion entries that begins at `begin`, from its bytes.
fn entries(c: &CohesionLayout, begin: u64, bytes: &[u8]) -> Vec<Entry> {
    let (index, kind, value) = (c.index as usize, c.kind as usize, c.value as usize);
    bytes
        .chunks_exact(c.size as usize)
        .zip((begin..).step_by(c.size as usize))
        .map(|(entry, at)| Entry {
            index: i32::from_le_bytes(entry[index..index + 4].try_into().expect("4 bytes")),
            kind: entry[kind],
            value: i8::from_le_bytes([entry[value]]),
            at: at + c.value,
        })
        .collect()
}

/// Whether an entry of a list of cohesion entries is one the game keeps: for a club or a nation, valued 1 to 100.
fn kept(e: &Entry) -> bool {
    matches!(e.kind, CLUB | NATION) && (1..=100).contains(&e.value)
}

/// What the health check asks of a player's list of cohesion entries, from its bytes: whether every entry is one the
/// game keeps (see [`kept`]), and whether one is for the club whose index is `club`.
pub(crate) fn list_holds(c: &CohesionLayout, bytes: &[u8], club: i32) -> (bool, bool) {
    let entries = entries(c, 0, bytes);
    (entries.iter().all(kept), entries.iter().any(|e| e.kind == CLUB && e.index == club))
}

/// The kind and value of each entry of a list of cohesion entries that is not one the game keeps, for the diagnostics
/// report: bytes read from a place the list is not show here as kinds and values the game does not keep.
pub(crate) fn list_faults(c: &CohesionLayout, bytes: &[u8]) -> Vec<(u8, i8)> {
    entries(c, 0, bytes).into_iter().filter(|e| !kept(e)).map(|e| (e.kind, e.value)).collect()
}

/// Whether the words `begin`, `end` and `capacity` are those of a list of whole entries of `size` bytes, within its
/// capacity and no longer than any the editor reads.
fn is_cohesion_list(begin: u64, end: u64, capacity: u64, size: u64) -> bool {
    size > 0
        && is_user_pointer(begin)
        && begin <= end
        && end <= capacity
        && (end - begin).is_multiple_of(size)
        && (capacity - begin).is_multiple_of(size)
        && (end - begin) / size <= MOST_ENTRIES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_is_whole_entries_within_its_capacity() {
        let begin = 0x6000_0000_1000;
        assert!(is_cohesion_list(begin, begin, begin, 8));
        assert!(is_cohesion_list(begin, begin + 16, begin + 32, 8));
        assert!(!is_cohesion_list(begin, begin + 12, begin + 32, 8), "not whole entries");
        assert!(!is_cohesion_list(begin, begin + 40, begin + 32, 8), "past its capacity");
        assert!(!is_cohesion_list(begin + 3, begin + 19, begin + 35, 8), "not a pointer");
        assert!(!is_cohesion_list(begin, begin + 8 * 501, begin + 8 * 501, 8), "longer than any");
        assert!(!is_cohesion_list(begin, begin, begin, 0), "no size");
    }

    /// The places of the macOS and Windows layouts.
    const LAYOUT: CohesionLayout = CohesionLayout { list: 0x18, size: 8, index: 0, kind: 4, value: 5, club_index: 8 };

    fn bytes(hex: &str) -> Vec<u8> {
        (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hexadecimal")).collect()
    }

    #[test]
    fn a_list_holds_clubs_and_nations_from_1_to_100() {
        // Kobbie Mainoo's list on the macOS save: Manchester United (408) at 91, England (139) at 71.
        let mainoo = bytes("98010000015b00008b00000002470000");
        assert_eq!(list_holds(&LAYOUT, &mainoo, 408), (true, true));
        assert_eq!(list_holds(&LAYOUT, &mainoo, 331), (true, false), "no entry for Arsenal");
        assert_eq!(list_holds(&LAYOUT, &[], 408), (true, false), "an empty list");
        for (entry, why) in [
            ("98010000035b0000", "a kind past 2"),
            ("9801000001000000", "a value of 0"),
            ("9801000001650000", "a value past 100"),
            ("9801000001ff0000", "a negative value"),
        ] {
            assert!(!list_holds(&LAYOUT, &bytes(entry), 408).0, "{why}");
            assert_eq!(list_faults(&LAYOUT, &bytes(entry)).len(), 1, "{why}");
        }
    }

    #[test]
    fn a_fault_is_the_kind_and_value_of_an_entry_the_game_does_not_keep() {
        // Mainoo's list, then a third entry for a club at 0 and a fourth of kind 3 at 12.
        let entries = bytes("98010000015b00008b00000002470000000000000100000000000000030c0000");
        assert!(list_faults(&LAYOUT, &bytes("98010000015b00008b00000002470000")).is_empty());
        assert_eq!(list_faults(&LAYOUT, &entries), vec![(1, 0), (3, 12)]);
    }
}
