//! The game's competitions, and the league tables the window shows.
//!
//! A competition with a table is one whose stage is played as a league: a league, a league phase, a group. Those stages
//! are `sicomps::LEAGUE_STAGE` objects, and `sicomps::FUTURE_STAGE` for one that has not started yet; either points at
//! its competition, keeps its clubs' records in the order the table shows them, and keeps the figures the table prints
//! (see `[league_table]` in `profiles/fm27/layout.toml`, and `docs/recon/fm27-league-tables.md` for how they were read
//! beside the game's own table). Nothing else the editor reads points at all of them, so they are found by their class;
//! the game keeps a stage it plays in a pool of objects, so they are read from it (a few hundred kilobytes, see
//! `object_pool.rs`), and by one pass over the game's memory only where no pool holds them: that pass reads gigabytes
//! and takes the better part of a minute. The list is kept for the session, as a competition does not change while the
//! game runs.

use std::collections::HashSet;
use std::fmt;
use std::sync::{Arc, PoisonError};

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::coded::Coded;
use crate::prize_money::Competition;
use crate::profile::{ClubLayout, LeagueTableLayout, TeamLayout};
use crate::rtti;
use crate::session::Session;
use crate::text::read_fm_string;

/// The most clubs a table can hold: the largest leagues the game has are well under it, and a longer list read where a
/// record was expected is not one.
pub(crate) const MOST_CLUBS: u64 = 100;

/// A stage that plays a competition as a league: where it is, and which competition it plays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeagueStage {
    pub competition: Competition,
    pub address: u64,
}

/// One club's line in a league table, as its stage holds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingRow {
    pub club_uid: u32,
    /// The club's name, in the game's language.
    pub club: String,
    pub short_name: Option<String>,
    pub played: u16,
    pub won: u8,
    pub drawn: u8,
    pub lost: u8,
    pub goals_for: u16,
    pub goals_against: u16,
    pub points: u16,
}

/// A competition's table: its clubs, in the order the game shows them, the first place first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueTable {
    pub competition_uid: u32,
    pub rows: Vec<StandingRow>,
}

/// Why the competitions or their tables cannot be read.
#[derive(Debug)]
pub enum StandingsError {
    /// The layout does not place the competitions, the stages that lead to them, or a table.
    NotInLayout,
    /// The game names none of the classes of a league stage: another build may call them otherwise.
    NoClass,
    /// A read of memory failed.
    Memory(fmlibre_mem::Error),
}

impl fmt::Display for StandingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StandingsError::NotInLayout => {
                f.write_str("the layout does not place the competitions, the stages of a league, or their tables")
            }
            StandingsError::NoClass => {
                f.write_str("the game names no class of a league stage: another build may call it otherwise")
            }
            StandingsError::Memory(err) => err.fmt(f),
        }
    }
}

impl std::error::Error for StandingsError {}

impl Coded for StandingsError {
    fn code(&self) -> &'static str {
        match self {
            StandingsError::NotInLayout => "standings.notInLayout",
            StandingsError::NoClass => "standings.noClass",
            StandingsError::Memory(err) => err.code(),
        }
    }

    fn params(&self) -> Vec<(&'static str, String)> {
        match self {
            StandingsError::Memory(err) => err.params(),
            _ => Vec::new(),
        }
    }
}

impl From<fmlibre_mem::Error> for StandingsError {
    fn from(err: fmlibre_mem::Error) -> Self {
        StandingsError::Memory(err)
    }
}

impl Session {
    /// Every stage played as a league, once each, with the competition it plays. Read the first time it is asked for,
    /// from the game's pools of objects where they hold the stages; the list is kept until the game has loaded another
    /// save.
    pub fn league_stages(&self) -> Result<Arc<Vec<LeagueStage>>, StandingsError> {
        let loads = self.loads();
        if let Some(stages) = self.cached_stages(loads) {
            return Ok(stages);
        }
        // One read at a time: the page asks for the competitions and for the tables of the cards as it opens, and the
        // second of the two waits for the first to have read the stages rather than read them again.
        let _scanning = self.league_scan.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(stages) = self.cached_stages(loads) {
            return Ok(stages);
        }
        let found = Arc::new(self.scan_stages()?);
        *self.league_stages.lock().unwrap_or_else(PoisonError::into_inner) = Some((loads, Arc::clone(&found)));
        Ok(found)
    }

    /// The stages read before, those that were read with `loads` saves loaded: none when the game has loaded another
    /// save since, as the stages of that one are to be read.
    fn cached_stages(&self, loads: Option<u64>) -> Option<Arc<Vec<LeagueStage>>> {
        let cached = self.league_stages.lock().unwrap_or_else(PoisonError::into_inner).clone();
        cached.filter(|(then, _)| *then == loads).map(|(_, stages)| stages)
    }

    /// The competitions whose stages are played as leagues, which are the ones with a table to show: once each, by
    /// name, with how famous each one's football is.
    pub fn competitions(&self) -> Result<Vec<Competition>, StandingsError> {
        let stages = self.league_stages()?;
        let mut found = tidy(stages.iter().map(|stage| stage.competition.clone()).collect());
        // The first stage of a competition, read in memory order, is the one its table is read from (see
        // `league_tables`): the reputation of its clubs is the competition's.
        let mut seen = HashSet::new();
        if let Some(layout) = self.layout.league_table.as_ref() {
            for stage in stages.iter() {
                if !seen.insert(stage.competition.uid) {
                    continue;
                }
                let Some(reputation) = self.stage_reputation(stage.address, layout) else {
                    continue;
                };
                if let Some(competition) = found.iter_mut().find(|each| each.uid == stage.competition.uid) {
                    competition.reputation = Some(reputation);
                }
            }
        }
        Ok(found)
    }

    /// The tables of `competitions`, read just now, those the game has a stage for. Only reads memory.
    pub fn league_tables(&self, competitions: &[u32]) -> Result<Vec<LeagueTable>, StandingsError> {
        let layout = self.layout.league_table.as_ref().ok_or(StandingsError::NotInLayout)?;
        let (team, club) = (&self.layout.team, &self.layout.club);
        let mut tables = Vec::new();
        let mut seen = HashSet::new();
        for stage in self.league_stages()?.iter() {
            // A competition may have more than one stage played as a league: the first one read is its table.
            if !competitions.contains(&stage.competition.uid) || !seen.insert(stage.competition.uid) {
                continue;
            }
            let Some(rows) = self.read_table(stage.address, layout, team, club) else {
                continue;
            };
            tables.push(LeagueTable { competition_uid: stage.competition.uid, rows });
        }
        Ok(tables)
    }

    /// Reads the stages from their classes: from the game's pools of objects where the game keeps them, which is a
    /// few hundred kilobytes read, or else by one pass over the game's memory (see [`Session::pooled_stages`]). Only
    /// reads memory.
    fn scan_stages(&self) -> Result<Vec<LeagueStage>, StandingsError> {
        self.layout.competition.as_ref().ok_or(StandingsError::NotInLayout)?;
        let layout = self.layout.league_table.as_ref().ok_or(StandingsError::NotInLayout)?;
        let mut vtables = rtti::vtables(&self.process, &self.plugin, &layout.stage);
        vtables.extend(rtti::vtables(&self.process, &self.plugin, &layout.future_stage));
        if vtables.is_empty() {
            return Err(StandingsError::NoClass);
        }
        // The smallest a stage can be while holding what is read of it: a pool of smaller slots holds no stage.
        let least = layout.competition.max(layout.rows) + 8;
        let mut addresses = self.pooled_stages(&vtables, least);
        if addresses.is_empty() {
            addresses = rtti::objects(&self.process, &self.plugin, &vtables)?.into_values().flatten().collect();
        }
        let mut found = Vec::new();
        for address in addresses {
            let Ok(pointer) = self.process.read_u64(address + layout.competition) else {
                continue;
            };
            if let Some(named) = Competition::read(&self.process, pointer, &self.layout) {
                found.push(LeagueStage { competition: named, address });
            }
        }
        Ok(found)
    }

    /// The objects of `vtables` in the game's pools (see `object_pool.rs`) with slots of at least `least` bytes, the
    /// smallest a stage can be to hold the fields the editor reads of it: where a slot's first word is one of
    /// `vtables`, in the order of the memory they sit in. A stage played as a league is one of the game's pooled
    /// objects, so the stages are read from its pool rather than by a pass over the game's whole memory, which reads
    /// gigabytes of it and takes the better part of a minute. Empty where the layout does not place the pools or none
    /// of them holds such an object, as a build that keeps them elsewhere. Only reads memory.
    pub(crate) fn pooled_stages(&self, vtables: &[u64], least: u64) -> Vec<u64> {
        let mut found = Vec::new();
        for pool in self.object_pools().into_iter().filter(|pool| u64::from(pool.slot_size) >= least) {
            let size = pool.slot_size as usize;
            for (index, &chunk) in pool.chunks.iter().enumerate() {
                let Ok(bytes) = self.process.read_bytes(chunk, (pool.slots_of(index) as usize) * size) else {
                    continue;
                };
                for (slot, object) in bytes.chunks_exact(size).enumerate() {
                    let vtable = u64::from_le_bytes(object[..8].try_into().expect("8 bytes"));
                    if vtables.contains(&vtable) {
                        found.push(chunk + (slot * size) as u64);
                    }
                }
            }
        }
        found.sort_unstable();
        found
    }

    /// The mean reputation (0–10000) of the clubs of the table the stage at `address` keeps: how famous its football
    /// is, which the page orders its picks by. `None` where its table cannot be read.
    fn stage_reputation(&self, address: u64, layout: &LeagueTableLayout) -> Option<u16> {
        let (begin, end) = self.read_list(address + layout.rows)?;
        let count = (end - begin) / 8;
        if count == 0 || count > MOST_CLUBS {
            return None;
        }
        let pointers = self.process.read_bytes(begin, (count * 8) as usize).ok()?;
        let (mut total, mut seen) = (0u64, 0u64);
        for pointer in pointers.as_chunks::<8>().0 {
            let record = u64::from_le_bytes(*pointer);
            if !is_user_pointer(record) {
                continue;
            }
            let team = self.process.read_u64(record + layout.team).ok().filter(|&team| is_user_pointer(team));
            let Some(team) = team else {
                continue;
            };
            let Some(reputation) = self.process.read_bytes(team + self.layout.team.reputation, 2).ok() else {
                continue;
            };
            let reputation = u16::from_le_bytes([reputation[0], reputation[1]]);
            if reputation > 0 && reputation <= 10_000 {
                total += u64::from(reputation);
                seen += 1;
            }
        }
        (seen > 0).then(|| u16::try_from(total / seen).unwrap_or(10_000))
    }

    /// The rows of the table the stage at `address` keeps, in its order; `None` when its list is not one.
    pub(crate) fn read_table(
        &self,
        address: u64,
        layout: &LeagueTableLayout,
        team: &TeamLayout,
        club: &ClubLayout,
    ) -> Option<Vec<StandingRow>> {
        let (begin, end) = self.read_list(address + layout.rows)?;
        let count = (end - begin) / 8;
        if count == 0 || count > MOST_CLUBS {
            return None;
        }
        let pointers = self.process.read_bytes(begin, (count * 8) as usize).ok()?;
        let mut rows = Vec::with_capacity(count as usize);
        for pointer in pointers.as_chunks::<8>().0 {
            let record = u64::from_le_bytes(*pointer);
            if let Some(row) = self.read_row(record, layout, team, club) {
                rows.push(row);
            }
        }
        Some(rows)
    }

    /// One club's line: the figures the block at `layout.figures` holds, and the club its record points at.
    fn read_row(
        &self,
        record: u64,
        layout: &LeagueTableLayout,
        team: &TeamLayout,
        club: &ClubLayout,
    ) -> Option<StandingRow> {
        if !is_user_pointer(record) {
            return None;
        }
        let figures = record + layout.figures;
        let bytes = self.process.read_bytes(figures, 0x10).ok()?;
        let u16_at = |at: u64| u16::from_le_bytes(bytes[at as usize..at as usize + 2].try_into().expect("2 bytes"));
        let u8_at = |at: u64| bytes[at as usize];
        let team_address = self.process.read_u64(record + layout.team).ok()?;
        if !is_user_pointer(team_address) {
            return None;
        }
        let club_address = self.process.read_u64(team_address + team.club).ok()?;
        if !is_user_pointer(club_address) {
            return None;
        }
        let uid = self.process.read_u32(club_address + club.uid).ok()?;
        if uid == 0 {
            return None;
        }
        let text = |at: u64| {
            self.process.read_u64(club_address + at).ok().and_then(|pointer| read_fm_string(&self.process, pointer))
        };
        let (won, drawn, lost) = (u8_at(layout.won), u8_at(layout.drawn), u8_at(layout.lost));
        Some(StandingRow {
            club_uid: uid,
            club: text(club.name)?,
            short_name: text(club.short_name),
            played: u16::from(won) + u16::from(drawn) + u16::from(lost),
            won,
            drawn,
            lost,
            goals_for: u16_at(layout.goals_for),
            goals_against: u16_at(layout.goals_against),
            points: u16_at(layout.points),
        })
    }

    /// The `(begin, end)` a list of pointers of at most [`MOST_CLUBS`] entries is at, or `None` when what is there is
    /// not one.
    pub(crate) fn read_list(&self, at: u64) -> Option<(u64, u64)> {
        let bytes = self.process.read_bytes(at, 24).ok()?;
        let word = |at: usize| u64::from_le_bytes(bytes[at..at + 8].try_into().expect("8 bytes"));
        let (begin, end) = (word(0), word(8));
        let fits =
            is_user_pointer(begin) && end > begin && (end - begin).is_multiple_of(8) && end - begin <= 8 * MOST_CLUBS;
        fits.then_some((begin, end))
    }
}

/// The competitions seen, once each by UID, in order by name whatever its capitals, then by UID: the list reads the
/// same on every run, and the window's first choice of a competition is the same one.
fn tidy(found: Vec<Competition>) -> Vec<Competition> {
    let mut seen = HashSet::new();
    let mut kept: Vec<Competition> = found.into_iter().filter(|competition| seen.insert(competition.uid)).collect();
    kept.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then_with(|| a.uid.cmp(&b.uid)));
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    fn competition(uid: u32, name: &str) -> Competition {
        Competition { uid, name: name.to_owned(), short_name: None, nation: None, women: false, reputation: None }
    }

    #[test]
    fn a_competition_is_kept_once_by_its_uid() {
        let found = tidy(vec![
            competition(1301394, "UEFA Champions League"),
            competition(130286, "Süper Lig"),
            // The same object found again, or a second object holding the same UID.
            competition(1301394, "UEFA Champions League"),
            competition(130286, "Süper Lig"),
        ]);
        assert_eq!(found, vec![competition(130286, "Süper Lig"), competition(1301394, "UEFA Champions League")]);
    }

    #[test]
    fn names_are_sorted_whatever_their_capitals() {
        let found = tidy(vec![
            competition(3, "eredivisie"),
            competition(2, "Bundesliga"),
            competition(1, "Allsvenskan"),
            competition(4, "Eredivisie"),
        ]);
        // The two spellings of the same league differ only by a capital: the UID decides between them.
        assert_eq!(
            found,
            vec![
                competition(1, "Allsvenskan"),
                competition(2, "Bundesliga"),
                competition(3, "eredivisie"),
                competition(4, "Eredivisie"),
            ]
        );
    }
}
