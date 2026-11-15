//! The stages a competition is played in, and the ties of its knockout rounds.
//!
//! The standings page reads a competition's league table from one `sicomps::LEAGUE_STAGE` (see `standings.rs`). A cup
//! plays more than one stage, though: a league phase, then rounds of ties. This module gathers every stage of the
//! competitions the page shows, so the page can follow the calendar and show a knockout round as pairs of clubs
//! rather than as a table.
//!
//! Only offsets that `docs/recon/fm27-league-tables.md` and `fm27-prize-money.md` have read beside the game are used:
//! a stage points at its competition at +0x70 and keeps its clubs' records at +0xC0; a record points at its team at
//! +0x88 and keeps its fixtures at +0x90 as (pointer, matchdays) pairs 0x20 bytes apart. Every pointer is checked
//! against what it should point at before it is used, so a stage of another shape yields no ties rather than wrong
//! ones. The fixtures list is read as the same `(begin, end, capacity)` list as the records at +0xC0: where it is not
//! one, the check rejects it and the stage simply has no ties. The classes of cup stages are candidates named in the
//! layout, and the pointer at +0x70 is checked as a competition before a stage is kept. Where the game keeps a
//! round's score or its date is not known yet, those are left unset (see the recon notes); the window then shows the
//! pairing without a result.
//!
//! The classes of the stages played as cups are named in `[competition_stage]` of the layout. They are looked up by
//! their RTTI name and read from the game's pools of objects first: on the build read here the pools hold none of
//! them, so one pass over the game's memory finds them instead (see `rtti::objects`). That pass reads gigabytes and
//! takes tens of seconds, so its addresses are kept for as long as this save is loaded. A class the build does not
//! have leaves the page with the league stages alone.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, PoisonError};

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::prize_money::Competition;
use crate::profile::{CompetitionStageLayout, LeagueTableLayout};
use crate::rtti;
use crate::session::Session;
use crate::standings::{MOST_CLUBS, StandingsError};
use crate::text::read_fm_string;

/// How a stage is played, and therefore how the window shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StageKind {
    /// A league, a league phase or a group: a table of clubs.
    League,
    /// A round of ties: one club against another.
    Knockout,
    /// A stage that has not started: neither a table nor a tie yet.
    Upcoming,
}

/// A club in a tie, named as the game names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageClub {
    pub club_uid: u32,
    pub club: String,
    pub short_name: Option<String>,
}

/// One club against another. `round` is 0 where the game's round could not be read; the scores and the date are
/// `None` until their place in the game's objects is known.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnockoutTie {
    pub round: u32,
    pub home: StageClub,
    pub away: StageClub,
    pub home_goals: Option<u16>,
    pub away_goals: Option<u16>,
    pub date: Option<FmDate>,
}

/// One stage of one competition. `id` is the stage's address, which stays the same while the save is loaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionStage {
    pub id: String,
    pub competition_uid: u32,
    pub kind: StageKind,
    /// The game's own name for the stage, where the layout places one and it can be read.
    pub name: Option<String>,
    pub start_date: Option<FmDate>,
    pub end_date: Option<FmDate>,
    pub rows: Vec<crate::standings::StandingRow>,
    pub ties: Vec<KnockoutTie>,
    /// Whether the game gave this stage a table or ties to show.
    pub readable: bool,
}

/// What `competition_stages` answers. `current` is worked out here from the game's date, not in the window: the
/// window only shows the stage it is told to, or the one its reader picked by hand.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionStages {
    pub supported: bool,
    pub game_date: Option<FmDate>,
    pub stages: Vec<CompetitionStage>,
    pub current: HashMap<u32, String>,
}

/// The order the stages of a competition are shown in: a table first, then the rounds of ties, then what has not
/// started. Within a kind the game's memory order is kept.
fn stage_order(kind: StageKind) -> u8 {
    match kind {
        StageKind::League => 0,
        StageKind::Knockout => 1,
        StageKind::Upcoming => 2,
    }
}

impl Session {
    /// The stages of `competitions`, with the table or ties each holds, and the stage the calendar is in. Only reads
    /// memory. `supported` is false on a build whose layout places none of it, as the standings page already says of
    /// its tables.
    pub fn competition_stages(&self, competitions: &[u32]) -> Result<CompetitionStages, StandingsError> {
        let game_date = self.game_date();
        let Some(table) = self.layout.league_table.as_ref() else {
            return Ok(CompetitionStages { supported: false, game_date, stages: Vec::new(), current: HashMap::new() });
        };
        let Some(layout) = self.layout.competition_stage.as_ref() else {
            return Ok(CompetitionStages { supported: false, game_date, stages: Vec::new(), current: HashMap::new() });
        };
        self.layout.competition.as_ref().ok_or(StandingsError::NotInLayout)?;

        let mut stages = Vec::new();
        let mut seen = HashSet::new();
        // The league stages and the stages not started yet, read once for the session (see `standings.rs`).
        for stage in self.league_stages()?.iter() {
            if !competitions.contains(&stage.competition.uid) {
                continue;
            }
            if let Some(found) = self.read_stage(stage.address, stage.competition.uid, None, table, layout) {
                stages.push(found);
                seen.insert(stage.address);
            }
        }
        // The stages played as cups, where this build's layout names their classes. A class the game does not have
        // adds nothing; the pools are tried first, and a pass over memory only where they hold no cup stage.
        let mut vtables = Vec::new();
        for class in &layout.cup_stages {
            vtables.extend(rtti::vtables(&self.process, &self.plugin, class));
        }
        if !vtables.is_empty() {
            let least = table.competition.max(table.rows) + 8;
            for &address in self.cup_stage_addresses(&vtables, least)?.iter() {
                if !seen.insert(address) {
                    continue;
                }
                let pointer = self.process.read_u64(address + table.competition).unwrap_or(0);
                let Some(competition) = Competition::read(&self.process, pointer, &self.layout) else {
                    continue;
                };
                if !competitions.contains(&competition.uid) {
                    continue;
                }
                if let Some(found) = self.read_stage(address, competition.uid, Some(StageKind::Knockout), table, layout)
                {
                    stages.push(found);
                }
            }
        }

        stages.sort_by(|a, b| {
            a.competition_uid
                .cmp(&b.competition_uid)
                .then_with(|| stage_order(a.kind).cmp(&stage_order(b.kind)))
                .then_with(|| a.id.cmp(&b.id))
        });
        let current = current_stages(&stages, game_date);
        Ok(CompetitionStages { supported: true, game_date, stages, current })
    }

    /// Where the game's cup stages are. Their class's objects are not among the pooled objects on the build read,
    /// though the pools are still worth trying first: where they hold none, one pass over the game's data memory
    /// finds them. A pass reads gigabytes, so the addresses are kept until the game has loaded another save, as
    /// `league_stages` keeps its own. A second request waits for the pass rather than starting another one.
    fn cup_stage_addresses(&self, vtables: &[u64], least: u64) -> Result<Arc<Vec<u64>>, StandingsError> {
        let loads = self.loads();
        if let Some(addresses) = self.cached_cup_stages(loads) {
            return Ok(addresses);
        }
        let _scanning = self.cup_scan.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(addresses) = self.cached_cup_stages(loads) {
            return Ok(addresses);
        }
        let mut found = self.pooled_stages(vtables, least);
        if found.is_empty() {
            found = rtti::objects(&self.process, &self.plugin, vtables)?.into_values().flatten().collect();
            found.sort_unstable();
        }
        let found = Arc::new(found);
        *self.cup_stages.lock().unwrap_or_else(PoisonError::into_inner) = Some((loads, Arc::clone(&found)));
        Ok(found)
    }

    /// The cup stage addresses found before, those found with `loads` saves loaded.
    fn cached_cup_stages(&self, loads: Option<u64>) -> Option<Arc<Vec<u64>>> {
        let cached = self.cup_stages.lock().unwrap_or_else(PoisonError::into_inner).clone();
        cached.filter(|(then, _)| *then == loads).map(|(_, addresses)| addresses)
    }

    /// One stage. `forced` says a cup stage is a knockout round even before its ties are read; otherwise the shape of
    /// what the stage holds says what kind it is. Every pointer is checked before it is followed.
    fn read_stage(
        &self,
        address: u64,
        competition_uid: u32,
        forced: Option<StageKind>,
        table: &LeagueTableLayout,
        layout: &CompetitionStageLayout,
    ) -> Option<CompetitionStage> {
        let rows = self.read_table(address, table, &self.layout.team, &self.layout.club).unwrap_or_default();
        // A league phase has a table of its own to show, and its fixtures list every round of the season: reading it
        // would cost hundreds of reads for nothing. A cup stage has no table, so its ties are what it shows.
        let ties = if rows.is_empty() || forced == Some(StageKind::Knockout) {
            self.read_ties(address, table, layout)
        } else {
            Vec::new()
        };
        let kind = forced.unwrap_or(if !rows.is_empty() {
            StageKind::League
        } else if !ties.is_empty() {
            StageKind::Knockout
        } else {
            StageKind::Upcoming
        });
        let dates = ties.iter().filter_map(|tie| tie.date).collect::<Vec<_>>();
        Some(CompetitionStage {
            id: format!("{address:x}"),
            competition_uid,
            kind,
            name: None,
            start_date: dates.iter().min().copied(),
            end_date: dates.iter().max().copied(),
            readable: !rows.is_empty() || !ties.is_empty(),
            rows,
            ties,
        })
    }

    /// The ties a stage's records hold. A record's list at `layout.fixtures` holds (pointer, matchdays) pairs: the
    /// pointer is followed only where it leads to another record of the same stage, whose club can be read. Each pair
    /// is kept once, whichever record listed it first. Only reads memory.
    fn read_ties(&self, address: u64, table: &LeagueTableLayout, layout: &CompetitionStageLayout) -> Vec<KnockoutTie> {
        let stride = layout.fixture_stride;
        if stride < 8 {
            return Vec::new();
        }
        let Some((begin, end)) = self.read_list(address + table.rows) else {
            return Vec::new();
        };
        let count = (end - begin) / 8;
        if count == 0 || count > MOST_CLUBS {
            return Vec::new();
        }
        let Some(pointers) = self.process.read_bytes(begin, (count * 8) as usize).ok() else {
            return Vec::new();
        };
        let mut seen = HashSet::new();
        let mut ties = Vec::new();
        for pointer in pointers.chunks_exact(8) {
            let record = u64::from_le_bytes(pointer.try_into().expect("8 bytes"));
            let Some(home) = self.read_stage_club(record, table) else {
                continue;
            };
            let Some((fixtures_begin, fixtures_end)) = self.read_list(record + layout.fixtures) else {
                continue;
            };
            let length = fixtures_end.saturating_sub(fixtures_begin);
            if length == 0 || length % stride != 0 || length / stride > MOST_CLUBS {
                continue;
            }
            let Some(entries) = self.process.read_bytes(fixtures_begin, length as usize).ok() else {
                continue;
            };
            for entry in entries.chunks_exact(stride as usize) {
                let opponent = u64::from_le_bytes(entry[..8].try_into().expect("8 bytes"));
                let Some(away) = self.read_stage_club(opponent, table) else {
                    continue;
                };
                if away.club_uid == home.club_uid {
                    continue;
                }
                let pair = (home.club_uid.min(away.club_uid), home.club_uid.max(away.club_uid));
                if !seen.insert(pair) {
                    continue;
                }
                ties.push(KnockoutTie {
                    round: 0,
                    home: home.clone(),
                    away,
                    home_goals: None,
                    away_goals: None,
                    date: None,
                });
            }
        }
        ties.sort_by(|a, b| a.home.club.cmp(&b.home.club).then_with(|| a.away.club.cmp(&b.away.club)));
        ties
    }

    /// The club of a stage's record, or `None` where the pointer does not lead to one: the check that keeps a
    /// fixture's pointer from another object being read as a club.
    fn read_stage_club(&self, record: u64, table: &LeagueTableLayout) -> Option<StageClub> {
        if !is_user_pointer(record) {
            return None;
        }
        let team = self.process.read_u64(record + table.team).ok()?;
        if !is_user_pointer(team) {
            return None;
        }
        let club = self.process.read_u64(team + self.layout.team.club).ok()?;
        if !is_user_pointer(club) {
            return None;
        }
        let uid = self.process.read_u32(club + self.layout.club.uid).ok()?;
        if uid == 0 {
            return None;
        }
        let text =
            |at: u64| self.process.read_u64(club + at).ok().and_then(|pointer| read_fm_string(&self.process, pointer));
        Some(StageClub {
            club_uid: uid,
            club: text(self.layout.club.name)?,
            short_name: text(self.layout.club.short_name),
        })
    }
}

/// The stage each competition is in now. Where the game gave a stage dates, the calendar decides; where it did not,
/// the last stage that has ties, or else the first with a table, stands for the round being played. A stage the game
/// has not started yet is never picked while another has something to show.
fn current_stages(stages: &[CompetitionStage], game_date: Option<FmDate>) -> HashMap<u32, String> {
    let mut by_competition: BTreeMap<u32, Vec<&CompetitionStage>> = BTreeMap::new();
    for stage in stages {
        by_competition.entry(stage.competition_uid).or_default().push(stage);
    }
    let mut current = HashMap::new();
    for (uid, of_competition) in by_competition {
        let dated: Vec<&CompetitionStage> = of_competition
            .iter()
            .copied()
            .filter(|stage| stage.start_date.is_some() || stage.end_date.is_some())
            .collect();
        let chosen = if dated.is_empty() {
            None
        } else {
            match game_date {
                Some(today) => dated
                    .iter()
                    .copied()
                    .find(|stage| {
                        stage.start_date.is_some_and(|from| from <= today)
                            && stage.end_date.is_some_and(|to| today <= to)
                    })
                    .or_else(|| {
                        dated.iter().rev().copied().find(|stage| stage.start_date.is_some_and(|from| from <= today))
                    })
                    .or_else(|| dated.first().copied()),
                None => dated.first().copied(),
            }
        };
        let chosen = chosen
            .or_else(|| {
                of_competition
                    .iter()
                    .rev()
                    .copied()
                    .find(|stage| stage.kind == StageKind::Knockout && !stage.ties.is_empty())
            })
            .or_else(|| of_competition.iter().copied().find(|stage| !stage.rows.is_empty()))
            .or_else(|| of_competition.first().copied());
        if let Some(stage) = chosen {
            current.insert(uid, stage.id.clone());
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::standings::StandingRow;

    fn stage(
        id: &str,
        uid: u32,
        kind: StageKind,
        from: Option<FmDate>,
        to: Option<FmDate>,
        rows: bool,
    ) -> CompetitionStage {
        CompetitionStage {
            id: id.to_owned(),
            competition_uid: uid,
            kind,
            name: None,
            start_date: from,
            end_date: to,
            rows: if rows {
                vec![StandingRow {
                    club_uid: 1,
                    club: "Club".to_owned(),
                    short_name: None,
                    played: 1,
                    won: 1,
                    drawn: 0,
                    lost: 0,
                    goals_for: 1,
                    goals_against: 0,
                    points: 3,
                }]
            } else {
                Vec::new()
            },
            ties: Vec::new(),
            readable: rows,
        }
    }

    fn date(month: u8, day: u8) -> FmDate {
        FmDate { year: 2026, month, day }
    }

    #[test]
    fn the_stage_the_calendar_is_in_wins() {
        let stages = vec![
            stage("league", 1, StageKind::League, Some(date(1, 1)), Some(date(1, 31)), true),
            stage("round", 1, StageKind::Knockout, Some(date(2, 1)), Some(date(2, 28)), false),
        ];
        assert_eq!(current_stages(&stages, Some(date(1, 15))).get(&1).map(String::as_str), Some("league"));
        assert_eq!(current_stages(&stages, Some(date(2, 10))).get(&1).map(String::as_str), Some("round"));
    }

    #[test]
    fn a_date_past_every_stage_keeps_the_last_one_started() {
        let stages = vec![
            stage("league", 1, StageKind::League, Some(date(1, 1)), Some(date(1, 31)), true),
            stage("round", 1, StageKind::Knockout, Some(date(2, 1)), Some(date(2, 28)), false),
        ];
        assert_eq!(current_stages(&stages, Some(date(7, 18))).get(&1).map(String::as_str), Some("round"));
    }

    #[test]
    fn without_dates_the_round_with_ties_comes_before_a_table() {
        let mut knockout = stage("round", 1, StageKind::Knockout, None, None, false);
        knockout.ties.push(KnockoutTie {
            round: 1,
            home: StageClub { club_uid: 1, club: "A".to_owned(), short_name: None },
            away: StageClub { club_uid: 2, club: "B".to_owned(), short_name: None },
            home_goals: None,
            away_goals: None,
            date: None,
        });
        let stages = vec![stage("league", 1, StageKind::League, None, None, true), knockout];
        assert_eq!(current_stages(&stages, None).get(&1).map(String::as_str), Some("round"));
    }

    #[test]
    fn without_dates_a_table_is_shown_when_no_round_has_ties() {
        let stages = vec![
            stage("future", 1, StageKind::Upcoming, None, None, false),
            stage("league", 1, StageKind::League, None, None, true),
        ];
        assert_eq!(current_stages(&stages, None).get(&1).map(String::as_str), Some("league"));
    }
}
