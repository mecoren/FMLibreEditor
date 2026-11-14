//! Who a player's reasons to be unhappy are about, and the groups they form.
//!
//! An entry of the record a contract's `unhappiness` points at (see `details.rs`) holds, besides its dates, motive and
//! kind, the category of its motive and an id (see [`ConcernLayout`]). In the two categories of the reasons a player
//! holds about a teammate ([`ABOUT_A_TEAMMATE`]) the id is the one the game gives the person: on the macOS Steam save
//! it named a player in all 578 such entries, a teammate in 564. In the other categories it is something else, so no
//! name is read from it there.
//!
//! The game keeps no record of a group of unhappy players: a group is the entries teammates hold about one player.
//! On that save they were 342 of the 422 entries not over, in 41 groups, and in every group the player had an entry
//! of his own, of another category. Once he has none (the count of his record set to none, as Remove all does), the
//! game ends his teammates' entries itself within two days: so the editor only reads them, to say whose unhappiness
//! settles a group.
//!
//! [`ConcernLayout`]: crate::profile::ConcernLayout

use std::collections::HashMap;

use fmlibre_mem::is_user_pointer;

use crate::details::{Concern, ConcernSubject, read_concerns};
use crate::players::{PlayerIndex, PlayerSummary};
use crate::session::Session;

/// The categories of the motives a player holds about a teammate: 19 (motive 808, thinks a teammate has been treated
/// unfairly) and 20 (926, doesn't believe a teammate deserves the playing time he wants).
pub const ABOUT_A_TEAMMATE: [u8; 2] = [19, 20];

/// Whom the game's ids of people name: the UID of each player by the id the game gives the person. Empty where the
/// layout does not place it. Good for the list it was made from: a reload makes another.
#[derive(Debug, Default)]
pub struct People(HashMap<u32, u32>);

impl Concern {
    /// The game's id of the teammate it is about, for a reason held about one.
    fn teammate(&self) -> Option<u32> {
        self.about_id.filter(|_| self.category.is_some_and(|category| ABOUT_A_TEAMMATE.contains(&category)))
    }
}

impl Session {
    /// Reads the id the game gives each of `players`: one read each. Only reads memory.
    pub fn people(&self, players: &PlayerIndex) -> People {
        People(players.iter().filter_map(|player| Some((self.game_person(player)?, player.uid))).collect())
    }

    /// Names the teammate each of `concerns` is about, for those held about one: only a player `people` and the list
    /// know, so an id that is nobody's, or not a person's at all, shows nothing.
    pub fn name_concerns(&self, concerns: &mut [Concern], people: &People, players: &PlayerIndex) {
        for concern in concerns {
            concern.about = concern
                .teammate()
                .and_then(|id| players.get(*people.0.get(&id)?))
                .map(|player| ConcernSubject { uid: player.uid, name: player.name.clone() });
        }
    }

    /// For each of `players` others of them hold a reason about that is not over, by his UID: how many of them do.
    /// Empty where the layout does not place who a reason is about. Only reads memory.
    pub fn concerned_teammates(&self, players: &[&PlayerSummary]) -> HashMap<u32, usize> {
        if self.layout.concern.is_none() {
            return HashMap::new();
        }
        let people: HashMap<u32, u32> =
            players.iter().filter_map(|player| Some((self.game_person(player)?, player.uid))).collect();
        let held = players.iter().map(|player| (player.uid, self.concerns(player)));
        count_concerned(held, &people)
    }

    /// The id the game gives the person `player` is; none where the layout does not place it or it cannot be read.
    fn game_person(&self, player: &PlayerSummary) -> Option<u32> {
        let c = self.layout.concern.as_ref()?;
        let p = &self.layout.player;
        self.process.read_u32(player.address + p.at(c.player_person, player.shift)).ok()
    }

    /// The reasons to be unhappy of `player`, over ones too; none for one without a contract or a record. Only reads
    /// memory.
    pub fn concerns(&self, player: &PlayerSummary) -> Vec<Concern> {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        let pointer = |address: u64| self.process.read_u64(address).ok().filter(|&pointer| is_user_pointer(pointer));
        pointer(player.address + p.at(p.contract, player.shift))
            .and_then(|contract| pointer(contract + c.unhappiness))
            .map_or_else(Vec::new, |record| read_concerns(&self.process, &self.layout, record))
    }
}

/// How many players hold a reason that lasts about each player, by his UID: `held` is each player's UID and his
/// reasons, `people` the UID of each by the game's id of him. A player's reasons about himself, or about somebody
/// who is not among them, count for nothing, and a player with several about one teammate counts once.
fn count_concerned(held: impl Iterator<Item = (u32, Vec<Concern>)>, people: &HashMap<u32, u32>) -> HashMap<u32, usize> {
    let mut counts: HashMap<u32, usize> = HashMap::new();
    for (holder, concerns) in held {
        let mut about: Vec<u32> = concerns
            .iter()
            .filter(|concern| concern.ended.is_none())
            .filter_map(|concern| people.get(&concern.teammate()?).copied())
            .filter(|&uid| uid != holder)
            .collect();
        about.sort_unstable();
        about.dedup();
        for uid in about {
            *counts.entry(uid).or_default() += 1;
        }
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::date::FmDate;

    fn concern(about: Option<u32>, category: u8, over: bool) -> Concern {
        let day = FmDate::from_raw(224, 2026);
        Concern {
            started: day,
            ended: if over { day } else { None },
            motive: 830,
            kind: 1,
            wording: Some(0),
            flags: Some(0),
            about: None,
            about_id: about,
            category: Some(category),
        }
    }

    #[test]
    fn a_group_is_the_teammates_with_a_lasting_reason_about_one_player() {
        // The game's ids 500, 501 and 502 are the players 1, 2 and 3; 900 is nobody of the squad.
        let people = HashMap::from([(500, 1), (501, 2), (502, 3)]);
        let held = vec![
            // Player 1 is the one the group is about: his own reason, of another category, names nobody.
            (1, vec![concern(None, 37, false)]),
            // Player 2 holds two about player 1, of both categories: he counts once.
            (2, vec![concern(Some(500), 19, false), concern(Some(500), 20, false)]),
            // Player 3 holds one about player 1 that lasts, one about player 2 that is over, one about somebody
            // outside the squad, one about himself, and one of another category about player 2.
            (
                3,
                vec![
                    concern(Some(500), 19, false),
                    concern(Some(501), 19, true),
                    concern(Some(900), 19, false),
                    concern(Some(502), 20, false),
                    concern(Some(501), 13, false),
                ],
            ),
        ];
        assert_eq!(count_concerned(held.into_iter(), &people), HashMap::from([(1, 2)]));
    }
}
