//! Growing a player's current ability up to his potential along a natural curve: how many
//! game days a climb is spread over, the ceiling a potential stands for, and the value to
//! write once a number of those days have been paid for.
//!
//! The curve is `f(t) = t * (2 - t)`: three quarters of the gap in the first half of the
//! climb, slower and slower towards the ceiling, and exactly at the ceiling when the time
//! is up. A climb never pulls a player back: where the game itself moved him further than
//! the curve asks, nothing is written that day. Nothing is ever written past the ceiling.

use serde::{Deserialize, Serialize};

/// In-game days in one season: a climb is spread over whole seasons.
pub const SEASON_DAYS: u32 = 365;

/// The most and fewest seasons a climb may be spread over, and the one the panel starts on.
pub const MOST_SEASONS: u32 = 5;
pub const LEAST_SEASONS: u32 = 1;
pub const DEFAULT_SEASONS: u32 = 2;

/// The current ability the game stores: the editor writes the same range.
pub const LEAST_CA: u16 = 1;
pub const MOST_CA: u16 = 200;

/// The ceiling `pa` stands for. A negative potential is the random range the game settled
/// from: `-n` means `2n - 30` to `2n` (for example -95 is 160 to 190), and the climb stops
/// at the top of it. Anything past 200 is capped, as the field is.
pub fn ability_cap(pa: i16) -> u16 {
    if pa > 0 {
        (pa as u16).min(MOST_CA)
    } else {
        let top = u32::from(pa.unsigned_abs()).saturating_mul(2);
        top.min(u32::from(MOST_CA)) as u16
    }
}

/// The share of the gap a climb has closed after `t` of its time: `f(0) = 0`, `f(1) = 1`,
/// `f(t) = t * (2 - t)` in between.
pub fn curve(t: f64) -> f64 {
    if t <= 0.0 {
        0.0
    } else if t >= 1.0 {
        1.0
    } else {
        t * (2.0 - t)
    }
}

/// The game days a climb over `seasons` seasons takes, one season being [`SEASON_DAYS`].
pub fn span_days(seasons: u32) -> u32 {
    seasons.clamp(LEAST_SEASONS, MOST_SEASONS) * SEASON_DAYS
}

/// The current ability to write after `elapsed` of `span` game days of a climb from
/// `start_ca` to `cap`, the game holding `ca` now; `fill` closes the whole gap at once.
///
/// `None` when there is nothing to write: he is at his ceiling already, the game moved him
/// past what the curve asks (a climb never pulls a player back), or the curve still rounds
/// down to the value he has. The caller pays for the days either way, as a day whose gain
/// rounds to nothing still moves the climb on.
pub fn wanted_ca(start_ca: u16, cap: u16, ca: u16, elapsed: u32, span: u32, fill: bool) -> Option<u16> {
    if cap <= ca {
        return None;
    }
    let start = start_ca.min(cap);
    let want = if fill || span == 0 || elapsed >= span {
        cap
    } else {
        let gap = f64::from(cap - start);
        let gain = (gap * curve(f64::from(elapsed) / f64::from(span))).round();
        start + gain.min(gap) as u16
    };
    (want > ca).then_some(want)
}

/// Why a watched player is no longer growing, or that he still is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GrowNote {
    /// The curve has not reached his potential yet.
    Growing,
    /// This step took him to his potential.
    AtPa,
    /// He was already at his potential when he was watched.
    WasAtPa,
    /// The game moved his object: what the editor read is no longer his.
    Moved,
    /// His current ability could not be read.
    Unreadable,
    /// His current ability is not one the game stores (1–200).
    OutOfRange,
    /// The game changed his current ability between the read and the write.
    Changed,
}

/// A player watched for growth, by UID: where his climb started, how many of its days have
/// been paid for and whether it is over. His ability itself is read again for every step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowTarget {
    pub uid: u32,
    /// The current ability he had when he was watched: the curve starts there.
    pub start_ca: u16,
    /// The game days of his climb already paid for.
    pub elapsed: u32,
    /// The current ability the editor has added to him so far.
    pub added: u16,
    /// Whether his climb is over: at his potential, or stopped for a reason in `note`.
    pub done: bool,
    pub note: GrowNote,
}

impl GrowTarget {
    /// Watches the player `uid`, at `ca` current ability and `pa` potential now. A player
    /// already at his potential is watched as done, so the panel says so rather than writing.
    pub fn new(uid: u32, ca: u16, pa: i16) -> Self {
        let at_pa = ca >= ability_cap(pa);
        Self {
            uid,
            start_ca: ca,
            elapsed: 0,
            added: 0,
            done: at_pa,
            note: if at_pa { GrowNote::WasAtPa } else { GrowNote::Growing },
        }
    }

    /// The player at his potential now, his climb over.
    pub fn reached(&mut self) {
        self.done = true;
        self.note = GrowNote::AtPa;
    }

    /// The player's climb stopped for `note`: his object moved, he could not be read, or
    /// the game changed him between the read and the write.
    pub fn stopped(&mut self, note: GrowNote) {
        self.done = true;
        self.note = note;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_positive_potential_is_its_own_ceiling() {
        assert_eq!(ability_cap(150), 150);
        assert_eq!(ability_cap(200), 200);
    }

    #[test]
    fn a_negative_potential_is_the_top_of_its_range() {
        // -95 is 160 to 190.
        assert_eq!(ability_cap(-95), 190);
        assert_eq!(ability_cap(-1), 2);
        // The top is never past what the field holds.
        assert_eq!(ability_cap(-200), 200);
        assert_eq!(ability_cap(i16::MIN), 200);
    }

    #[test]
    fn the_curve_runs_from_nothing_to_all_of_it() {
        assert_eq!(curve(0.0), 0.0);
        assert_eq!(curve(1.0), 1.0);
        assert!((curve(0.5) - 0.75).abs() < f64::EPSILON);
        // Slower and slower: each quarter closes less than the one before.
        let q = [0.25, 0.5, 0.75, 1.0].map(curve);
        assert!(q[1] - q[0] > q[2] - q[1] && q[2] - q[1] > q[3] - q[2]);
    }

    #[test]
    fn a_season_is_a_year_of_game_days() {
        assert_eq!(span_days(DEFAULT_SEASONS), 730);
        assert_eq!(span_days(0), SEASON_DAYS);
        assert_eq!(span_days(9), MOST_SEASONS * SEASON_DAYS);
    }

    #[test]
    fn the_climb_is_exactly_at_the_ceiling_when_the_time_is_up() {
        assert_eq!(wanted_ca(100, 160, 100, 730, 730, false), Some(160));
        // Past the end it stays at the ceiling, never above it.
        assert_eq!(wanted_ca(100, 160, 100, 900, 730, false), Some(160));
    }

    #[test]
    fn the_first_half_of_the_climb_closes_three_quarters_of_the_gap() {
        assert_eq!(wanted_ca(100, 200, 100, 365, 730, false), Some(175));
    }

    #[test]
    fn a_climb_never_pulls_a_player_back() {
        // The game already moved him to 180, past the 175 the curve asks.
        assert_eq!(wanted_ca(100, 200, 180, 365, 730, false), None);
        // Nor is he written past his ceiling.
        assert_eq!(wanted_ca(100, 160, 100, 5000, 730, false), Some(160));
    }

    #[test]
    fn nothing_is_written_until_the_curve_beats_what_he_has() {
        // One day of two seasons rounds to nothing yet.
        assert_eq!(wanted_ca(100, 160, 100, 1, 730, false), None);
        // 30 of 730 days: 60 * f(0.041) rounds to 5.
        assert_eq!(wanted_ca(100, 160, 100, 30, 730, false), Some(105));
    }

    #[test]
    fn filling_closes_the_whole_gap() {
        assert_eq!(wanted_ca(100, 160, 100, 0, 730, true), Some(160));
        assert_eq!(wanted_ca(100, 160, 160, 0, 730, true), None);
    }

    #[test]
    fn a_player_at_his_potential_is_watched_as_done() {
        let target = GrowTarget::new(1, 150, 150);
        assert!(target.done);
        assert_eq!(target.note, GrowNote::WasAtPa);
        // A negative potential is the range's top.
        let ranged = GrowTarget::new(2, 150, -95);
        assert!(!ranged.done);
        assert_eq!(ranged.note, GrowNote::Growing);
        let reached = GrowTarget::new(3, 190, -95);
        assert!(reached.done);
    }
}
