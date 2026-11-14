//! The prize money a competition's stages pay: by final position, and per match (#123).
//!
//! A stage played as a league (`[prize_money] stage`: a league, a league phase, a group) points at its competition and
//! at its settings, which hold the amounts in pounds: a list by final position, the first place first, and the amounts
//! per win, draw and loss. A stage that has not started yet (`future_stage`) points at the settings it will be played
//! with, of whichever class; only a league's settings hold these amounts. The game takes them from its database (saves
//! seasons apart hold the same ones) and makes a stage's settings when it sets the stage up. Nothing else the editor
//! reads leads to them, so they are found by their class, in one pass over the game's memory.
//!
//! Settings no stage holds are left over, for instance from setting up a career in the same session, and the editor
//! never changes them. A change is written over the amounts it found and read back, and its undo puts those back the
//! same way. Whether the game pays from these amounts, and whether a change lasts through a save and a reload, is what
//! the probe's `prizes` is there to find out.

use std::collections::{HashMap, HashSet};
use std::fmt;

use fmlibre_mem::{Process, is_user_pointer};
use serde::Serialize;

use crate::players::nation_name;
use crate::profile::{CompetitionLayout, Layout, PrizeMoneyLayout};
use crate::rtti;
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, Patch, Patches};

/// The most places a list by position is taken to have: far more than any competition seen (36).
const MOST_PLACES: u64 = 128;

/// The most the editor writes as one amount, in pounds: almost four times the most any list held on the saves seen
/// (£54,098,526, the Bundesliga's champion's), and far from what the game's money fields hold.
pub const MOST_PRIZE: u32 = 200_000_000;

/// A competition, as its stages point at it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Competition {
    pub uid: u32,
    /// In the game's language.
    pub name: String,
    pub short_name: Option<String>,
    /// The name of the nation it belongs to, in the game's language; none where the layout does not place it.
    pub nation: Option<String>,
    /// A women's competition.
    pub women: bool,
    /// How famous its football is: the mean reputation (0–10000) of the clubs of its table, which the standings page
    /// orders its picks by. Read by `Session::competitions`; none where its table cannot be read.
    pub reputation: Option<u16>,
}

impl Competition {
    /// The competition at `address`, or `None` when what is there is not one: no UID, or no name to show. Only reads
    /// memory.
    pub(crate) fn read(process: &Process, address: u64, layout: &Layout) -> Option<Self> {
        let fields = layout.competition.as_ref()?;
        if !is_user_pointer(address) {
            return None;
        }
        let uid = process.read_u32(address + fields.uid).ok().filter(|&uid| uid != 0)?;
        let word = |at: u64| process.read_u64(address + at).ok();
        let text = |at: u64| word(at).and_then(|pointer| read_fm_string(process, pointer));
        let nation = fields
            .nation
            .and_then(word)
            .filter(|&nation| is_user_pointer(nation))
            .and_then(|nation| nation_name(process, layout, nation));
        let women = fields.women.is_some_and(|at| process.read_bytes(address + at, 1).is_ok_and(|bytes| bytes[0] == 1));
        Some(Self {
            uid,
            name: text(fields.name)?,
            short_name: text(fields.short_name),
            nation,
            women,
            reputation: None,
        })
    }
}

/// Which kind of stage holds a league's settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrizeStage {
    /// A stage being played, or played already.
    Started,
    /// A stage that has not started yet.
    Future,
    /// None: settings left over, which the editor leaves as they are.
    Unheld,
}

/// What a league's settings pay, in pounds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrizeMoney {
    /// The settings, as a change names them.
    pub settings: u64,
    /// The stage that holds them, and its competition; none for settings left over.
    pub stage: PrizeStage,
    pub stage_address: Option<u64>,
    pub competition: Option<Competition>,
    /// By final position, the first place first.
    pub by_position: Vec<u32>,
    /// Per win (kept twice, the same in every settings seen), per draw and per loss.
    pub win: u32,
    pub win_again: u32,
    pub draw: u32,
    pub loss: u32,
    /// Where the list's first amount is, the settings' vtable, and where the stage keeps the pointer to them.
    #[serde(skip)]
    by_position_at: u64,
    #[serde(skip)]
    vtable: u64,
    #[serde(skip)]
    pointer_at: Option<u64>,
}

impl PrizeMoney {
    /// Whether the settings pay anything at all.
    pub fn pays(&self) -> bool {
        self.by_position.iter().chain([&self.win, &self.win_again, &self.draw, &self.loss]).any(|&amount| amount > 0)
    }
}

/// One amount a league's settings pay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrizeAmount {
    /// For a final position, 1 for the first place.
    Place(usize),
    /// Per win: both of the words the game keeps for it.
    Win,
    Draw,
    Loss,
}

impl fmt::Display for PrizeAmount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PrizeAmount::Place(place) => write!(f, "position {place}"),
            PrizeAmount::Win => f.write_str("per win"),
            PrizeAmount::Draw => f.write_str("per draw"),
            PrizeAmount::Loss => f.write_str("per loss"),
        }
    }
}

/// One amount changed in one league's settings, in pounds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrizeEdit {
    pub settings: u64,
    pub amount: PrizeAmount,
    pub from: u32,
    pub to: u32,
}

/// Amounts changed, or to be: what each changes from and to, and the bytes written, which the undo writes back.
#[derive(Debug, Clone)]
pub struct PrizeChange {
    pub edits: Vec<PrizeEdit>,
    patches: Vec<Patch>,
    /// For each settings changed: what the stage that holds them and the settings held when they were read.
    holders: Vec<Holder>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Holder {
    pointer_at: u64,
    settings: u64,
    vtable: u64,
}

#[derive(Debug)]
pub enum PrizeError {
    /// The layout does not place competitions' prize money.
    NotInLayout,
    /// The game names no class of this name: another build may call it otherwise.
    NoClass {
        class: String,
    },
    /// No stage holds these settings: they are left over, and stay as they are.
    Unheld {
        settings: u64,
    },
    /// The list by position has no such place.
    NoPlace {
        place: usize,
        places: usize,
    },
    /// More than the editor writes as one amount.
    TooMuch {
        amount: u32,
    },
    /// The settings, or the stage that held them, are no longer what they were: the game has moved on.
    Gone {
        settings: u64,
    },
    /// A write did not land, or memory no longer holds what was read.
    Write(MoveError),
    Memory(fmlibre_mem::Error),
}

impl fmt::Display for PrizeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PrizeError::NotInLayout => f.write_str("the layout does not place competitions' prize money"),
            PrizeError::NoClass { class } => write!(f, "the game names no class {class}"),
            PrizeError::Unheld { settings } => {
                write!(f, "no stage holds the settings at {settings:#x}: they are left over, and stay as they are")
            }
            PrizeError::NoPlace { place, places } => {
                write!(f, "no position {place}: the list by position has {places} places")
            }
            PrizeError::TooMuch { amount } => write!(f, "{amount} is more than the {MOST_PRIZE} the editor writes"),
            PrizeError::Gone { settings } => write!(f, "the settings at {settings:#x} are not what they were"),
            PrizeError::Write(err) => err.fmt(f),
            PrizeError::Memory(err) => err.fmt(f),
        }
    }
}

impl std::error::Error for PrizeError {}

impl From<fmlibre_mem::Error> for PrizeError {
    fn from(err: fmlibre_mem::Error) -> Self {
        PrizeError::Memory(err)
    }
}

impl From<MoveError> for PrizeError {
    fn from(err: MoveError) -> Self {
        PrizeError::Write(err)
    }
}

/// The vtables of the classes the prize money is found by.
struct Classes {
    stage: Vec<u64>,
    future_stage: Vec<u64>,
    settings: Vec<u64>,
}

impl Session {
    /// Every league's settings in the game, with the stage that holds them and its competition, those that pay
    /// nothing among them. One pass over the game's memory, which takes a few seconds.
    pub fn prize_money(&self) -> Result<Vec<PrizeMoney>, PrizeError> {
        let (layout, _competition) = self.prize_layouts()?;
        let classes = self.prize_classes(layout)?;
        let all: Vec<u64> =
            [&classes.stage, &classes.future_stage, &classes.settings].into_iter().flatten().copied().collect();
        let objects = rtti::objects(&self.process, &self.plugin, &all)?;
        let of = |vtables: &[u64]| -> Vec<u64> {
            let mut found: Vec<u64> = vtables.iter().flat_map(|vtable| objects[vtable].iter().copied()).collect();
            found.sort_unstable();
            found
        };
        let settings = of(&classes.settings);
        let known: HashSet<u64> = settings.iter().copied().collect();
        // The stage that holds each settings; a stage being played before one that has not started.
        let mut holders: HashMap<u64, (PrizeStage, u64, u64)> = HashMap::new();
        for (kind, vtables, pointer) in [
            (PrizeStage::Started, &classes.stage, layout.stage_settings),
            (PrizeStage::Future, &classes.future_stage, layout.future_settings),
        ] {
            for stage in of(vtables) {
                if let Ok(held) = self.process.read_u64(stage + pointer)
                    && known.contains(&held)
                {
                    holders.entry(held).or_insert((kind, stage, stage + pointer));
                }
            }
        }
        let mut competitions: HashMap<u64, Option<Competition>> = HashMap::new();
        let mut found = Vec::new();
        for address in settings {
            let Some(mut prize) = self.read_prize_settings(address, layout) else {
                continue;
            };
            if let Some(&(kind, stage, pointer_at)) = holders.get(&address) {
                prize.stage = kind;
                prize.stage_address = Some(stage);
                prize.pointer_at = Some(pointer_at);
                prize.competition = self.process.read_u64(stage + layout.competition).ok().and_then(|comp| {
                    competitions
                        .entry(comp)
                        .or_insert_with(|| Competition::read(&self.process, comp, &self.layout))
                        .clone()
                });
            }
            found.push(prize);
        }
        Ok(found)
    }

    /// Works out changing each of `amounts` to its new value, in pounds, in every one of `targets`, as read just now.
    /// Nothing is written.
    pub fn plan_prize_change(
        &self,
        targets: &[&PrizeMoney],
        amounts: &[(PrizeAmount, u32)],
    ) -> Result<PrizeChange, PrizeError> {
        let (layout, _) = self.prize_layouts()?;
        let mut change = PrizeChange { edits: Vec::new(), patches: Vec::new(), holders: Vec::new() };
        let mut patches = Patches::default();
        for prize in targets {
            let pointer_at = prize.pointer_at.ok_or(PrizeError::Unheld { settings: prize.settings })?;
            change.holders.push(Holder { pointer_at, settings: prize.settings, vtable: prize.vtable });
            for &(amount, to) in amounts {
                if to > MOST_PRIZE {
                    return Err(PrizeError::TooMuch { amount: to });
                }
                let words = match amount {
                    PrizeAmount::Place(place) => {
                        let places = prize.by_position.len();
                        if place == 0 || place > places {
                            return Err(PrizeError::NoPlace { place, places });
                        }
                        vec![(prize.by_position_at + 4 * (place as u64 - 1), prize.by_position[place - 1])]
                    }
                    PrizeAmount::Win => vec![
                        (prize.settings + layout.win, prize.win),
                        (prize.settings + layout.win_again, prize.win_again),
                    ],
                    PrizeAmount::Draw => vec![(prize.settings + layout.draw, prize.draw)],
                    PrizeAmount::Loss => vec![(prize.settings + layout.loss, prize.loss)],
                };
                change.edits.push(PrizeEdit { settings: prize.settings, amount, from: words[0].1, to });
                for (address, from) in words {
                    patches.push(address, from.to_le_bytes(), to.to_le_bytes());
                }
            }
        }
        change.patches = patches.0;
        Ok(change)
    }

    /// Writes a planned change and returns it, for its undo. Each stage must still hold its settings, and each amount
    /// still be what the plan read; when a write fails, the ones before it are put back.
    pub fn apply_prize_change(&self, plan: &PrizeChange) -> Result<PrizeChange, PrizeError> {
        self.check_holders(&plan.holders)?;
        self.write_patches(&plan.patches)?;
        Ok(plan.clone())
    }

    /// Puts back what a change found, provided the stages still hold their settings and memory still holds what the
    /// change wrote.
    pub fn undo_prize_change(&self, done: &PrizeChange) -> Result<(), PrizeError> {
        self.check_holders(&done.holders)?;
        self.undo_patches(&done.patches)?;
        Ok(())
    }

    fn prize_layouts(&self) -> Result<(&PrizeMoneyLayout, &CompetitionLayout), PrizeError> {
        match (&self.layout.prize_money, &self.layout.competition) {
            (Some(prize), Some(competition)) => Ok((prize, competition)),
            _ => Err(PrizeError::NotInLayout),
        }
    }

    fn prize_classes(&self, layout: &PrizeMoneyLayout) -> Result<Classes, PrizeError> {
        let vtables = |class: &str| rtti::vtables(&self.process, &self.plugin, class);
        let classes = Classes {
            stage: vtables(&layout.stage),
            future_stage: vtables(&layout.future_stage),
            settings: vtables(&layout.settings),
        };
        if classes.settings.is_empty() {
            return Err(PrizeError::NoClass { class: layout.settings.clone() });
        }
        Ok(classes)
    }

    fn check_holders(&self, holders: &[Holder]) -> Result<(), PrizeError> {
        for holder in holders {
            let held = self.process.read_u64(holder.pointer_at).ok() == Some(holder.settings)
                && self.process.read_u64(holder.settings).ok() == Some(holder.vtable);
            if !held {
                return Err(PrizeError::Gone { settings: holder.settings });
            }
        }
        Ok(())
    }

    /// The amounts of the settings at `address`, not yet tied to a stage; `None` when their list is not one.
    fn read_prize_settings(&self, address: u64, layout: &PrizeMoneyLayout) -> Option<PrizeMoney> {
        let bytes = self.process.read_bytes(address, (layout.by_position + 24) as usize).ok()?;
        let u32_at = |at: u64| u32::from_le_bytes(bytes[at as usize..at as usize + 4].try_into().expect("4 bytes"));
        let u64_at = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8 bytes"));
        let (begin, end) = (u64_at(layout.by_position), u64_at(layout.by_position + 8));
        let places = list_places(begin, end)?;
        let by_position = match places {
            0 => Vec::new(),
            _ => {
                let list = self.process.read_bytes(begin, places * 4).ok()?;
                list.as_chunks::<4>().0.iter().map(|amount| u32::from_le_bytes(*amount)).collect()
            }
        };
        Some(PrizeMoney {
            settings: address,
            stage: PrizeStage::Unheld,
            stage_address: None,
            competition: None,
            by_position,
            win: u32_at(layout.win),
            win_again: u32_at(layout.win_again),
            draw: u32_at(layout.draw),
            loss: u32_at(layout.loss),
            by_position_at: begin,
            vtable: u64_at(0),
            pointer_at: None,
        })
    }
}

/// How many `u32` amounts a list `(begin, end)` holds: none for an empty list, `None` for one that is not a list.
fn list_places(begin: u64, end: u64) -> Option<usize> {
    if begin == 0 && end == 0 {
        return Some(0);
    }
    let bytes = end.checked_sub(begin)?;
    let fits = is_user_pointer(begin) && bytes.is_multiple_of(4) && bytes / 4 <= MOST_PLACES;
    fits.then_some((bytes / 4) as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_is_told_from_anything_else() {
        let begin = 0x1b5_1173_7700;
        assert_eq!(list_places(0, 0), Some(0));
        assert_eq!(list_places(begin, begin), Some(0));
        // The Champions League's 36 places.
        assert_eq!(list_places(begin, begin + 36 * 4), Some(36));
        // An end before the begin, an odd length, a null begin with an end, too many places.
        assert_eq!(list_places(begin, begin - 4), None);
        assert_eq!(list_places(begin, begin + 6), None);
        assert_eq!(list_places(0, 0x10), None);
        assert_eq!(list_places(begin, begin + (MOST_PLACES + 1) * 4), None);
    }

    #[test]
    fn settings_pay_when_any_amount_is_more_than_nothing() {
        let prize = |by_position: Vec<u32>, win: u32| PrizeMoney {
            settings: 0,
            stage: PrizeStage::Started,
            stage_address: None,
            competition: None,
            by_position,
            win,
            win_again: win,
            draw: 0,
            loss: 0,
            by_position_at: 0,
            vtable: 0,
            pointer_at: None,
        };
        assert!(!prize(Vec::new(), 0).pays());
        assert!(!prize(vec![0, 0, 0], 0).pays());
        // The CAF group stages' lists hold nothing for the first place, but something further down.
        assert!(prize(vec![0, 519_435], 0).pays());
        // The Süper Lig pays per match only.
        assert!(prize(Vec::new(), 114_699).pays());
    }
}
