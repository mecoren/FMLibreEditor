//! The game's competitions, and the league tables the window shows.
//!
//! A competition with a table is one whose stage is played as a league: a league, a league phase, a group. Those stages
//! are `sicomps::LEAGUE_STAGE` objects, and `sicomps::FUTURE_STAGE` for one that has not started yet; either points at
//! its competition, keeps its clubs' records in the order the table shows them, and keeps the figures the table prints
//! (see `[league_table]` in `profiles/fm27/layout.toml`, and `docs/recon/fm27-league-tables.md` for how they were read
//! beside the game's own table). Nothing else the editor reads points at all of them, so they are found by their class,
//! in one pass over the game's memory, which takes some twenty seconds; the list is kept for the session, as a
//! competition does not change while the game runs.

use std::collections::HashSet;
use std::fmt;
use std::sync::{Arc, PoisonError};

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::coded::Coded;
use crate::prize_money::Competition;
use crate::profile::{ClubLayout, CompetitionLayout, LeagueTableLayout, TeamLayout};
use crate::rtti;
use crate::session::Session;
use crate::text::read_fm_string;

/// The most clubs a table can hold: the largest leagues the game has are well under it, and a longer list read where a
/// record was expected is not one.
const MOST_CLUBS: u64 = 100;

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
    /// Every stage played as a league, once each, with the competition it plays. One pass over the game's memory the
    /// first time it is asked for, which takes some twenty seconds; the list is kept until the game has loaded another
    /// save.
    pub fn league_stages(&self) -> Result<Arc<Vec<LeagueStage>>, StandingsError> {
        let loads = self.loads();
        let cached = self.league_stages.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some((then, stages)) = cached
            && then == loads
        {
            return Ok(stages);
        }
        let found = Arc::new(self.scan_stages()?);
        *self.league_stages.lock().unwrap_or_else(PoisonError::into_inner) = Some((loads, Arc::clone(&found)));
        Ok(found)
    }

    /// The competitions whose stages are played as leagues, which are the ones with a table to show: once each, by
    /// name.
    pub fn competitions(&self) -> Result<Vec<Competition>, StandingsError> {
        let stages = self.league_stages()?;
        Ok(tidy(stages.iter().map(|stage| stage.competition.clone()).collect()))
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

    /// Reads the stages from their classes. Only reads memory.
    fn scan_stages(&self) -> Result<Vec<LeagueStage>, StandingsError> {
        let competition = self.layout.competition.as_ref().ok_or(StandingsError::NotInLayout)?;
        let layout = self.layout.league_table.as_ref().ok_or(StandingsError::NotInLayout)?;
        let mut vtables = rtti::vtables(&self.process, &self.plugin, &layout.stage);
        vtables.extend(rtti::vtables(&self.process, &self.plugin, &layout.future_stage));
        if vtables.is_empty() {
            return Err(StandingsError::NoClass);
        }
        let objects = rtti::objects(&self.process, &self.plugin, &vtables)?;
        let mut found = Vec::new();
        for address in objects.values().flatten() {
            let Ok(pointer) = self.process.read_u64(address + layout.competition) else {
                continue;
            };
            if let Some(named) = self.read_competition_at(pointer, competition) {
                found.push(LeagueStage { competition: named, address: *address });
            }
        }
        Ok(found)
    }

    /// The competition at `address`, or `None` when what is there is not one: no UID, or no name to show.
    fn read_competition_at(&self, address: u64, layout: &CompetitionLayout) -> Option<Competition> {
        if !is_user_pointer(address) {
            return None;
        }
        let uid = self.process.read_u32(address + layout.uid).ok()?;
        if uid == 0 {
            return None;
        }
        let text = |at: u64| {
            self.process.read_u64(address + at).ok().and_then(|pointer| read_fm_string(&self.process, pointer))
        };
        Some(Competition { uid, name: text(layout.name)?, short_name: text(layout.short_name) })
    }

    /// The rows of the table the stage at `address` keeps, in its order; `None` when its list is not one.
    fn read_table(
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
    fn read_list(&self, at: u64) -> Option<(u64, u64)> {
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
        Competition { uid, name: name.to_owned(), short_name: None }
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
