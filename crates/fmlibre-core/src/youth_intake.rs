//! A club's youth intakes: the players the game made at its youth intakes who began their careers at the club, by the
//! day they joined it, and the cities people were born in, which a player's city of birth can be set to.
//!
//! The game marks a player it makes (at a youth intake, or as a youth candidate it lets go) with a flag in his
//! identity block (see [`PlayerLayout::made_by_game`]). It keeps no list of a club's intakes, but every player of one
//! joins the club on the intake's day, at 14 to 17, and has been trained at no other club. So a club's intake players
//! are the players it holds under contract (those it has lent out too) whom the game made, who joined it at 17 or
//! younger, and whose ties name no other club they were trained at: one the club bought from another club's intake has
//! a tie to that club. A player who joined from no club, as a youth candidate another club let go, counts too: he
//! began his career at the club. The game ties a player to his club as trained there some time after the intake, so
//! the newest intake's players have no tie yet. Where the layout does not place the flag, the club's players who
//! joined it young and were trained nowhere else are listed, the database's own among them.
//!
//! Only reads memory.
//!
//! [`PlayerLayout::made_by_game`]: crate::profile::PlayerLayout::made_by_game

use std::collections::{BTreeMap, HashMap, HashSet};

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::clubs::ClubSummary;
use crate::date::FmDate;
use crate::players::{PlayerIndex, PlayerSummary, nation_uid};
use crate::relations::Tie;
use crate::session::Session;
use crate::squad::Loan;
use crate::text::{fold, read_fm_string};
use crate::transfer::MoveError;

/// The flag the game sets in the byte `PlayerLayout::made_by_game` places for a player it made.
pub const MADE_BY_GAME: u8 = 0x08;

/// The oldest a player joins a club at its youth intake: 14 to 16 in most nations, 17 in some. On the Game Pass save of
/// January 2028 the game's 1,783 players had joined their clubs at 15 (the most), 16 and 17.
pub const INTAKE_AGE: u16 = 17;

/// A city, as a player's city of birth points at it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct City {
    /// Address of the city: what a city of birth holds, and what the field is set to.
    pub address: u64,
    pub uid: Option<u32>,
    pub name: String,
    /// The nation it is in, for its flag and for the cities a nation offers.
    pub nation_uid: Option<u32>,
}

/// The team of the club that lists a player: the first team, a B team or one with an age limit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeTeam {
    /// Where it is in the club's list of teams; 0 is the first team.
    pub index: usize,
    pub kind: u8,
    pub age_limit: Option<u8>,
}

/// A player of a club's youth intake.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakePlayer {
    pub player: PlayerSummary,
    pub city: Option<City>,
    /// The day he joined the club: his intake's day.
    pub joined: Option<FmDate>,
    /// How old he was then.
    pub joined_age: Option<u16>,
    /// The kind of his contract (3 is a youth contract), where the layout places it.
    pub contract_type: Option<u8>,
    /// The club's team that lists him: the one he plays for, else the first.
    pub team: Option<IntakeTeam>,
    /// The club he is on loan at.
    pub on_loan_at: Option<String>,
    pub on_loan_at_uid: Option<u32>,
}

/// The players of a club who joined it on one day: one of its youth intakes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Intake {
    pub joined: Option<FmDate>,
    /// Best potential first.
    pub players: Vec<IntakePlayer>,
}

/// A club's youth intakes, the newest first.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouthIntakes {
    pub club_uid: u32,
    pub club: String,
    /// Whether the editor knows the game's mark of the players it made in this game; when not, the club's players who
    /// joined it young and were trained nowhere else are listed, the database's own among them.
    pub marked: bool,
    pub intakes: Vec<Intake>,
}

/// A player of the club as one of its teams lists him.
struct Listed {
    uid: u32,
    team: IntakeTeam,
    loan: Option<Loan>,
}

impl Session {
    /// The youth intakes of `club`: the players under contract with it, those it has lent out too, whom the game made
    /// and who began their careers there (see the module's notes), by the day they joined it, the newest first.
    pub fn youth_intakes(&self, club: &ClubSummary, players: &PlayerIndex) -> Result<YouthIntakes, MoveError> {
        let teams = self.club_teams(club, players)?;
        // Each player once, with the team he plays for, else the first that lists him; not those here on loan.
        let mut listed: Vec<Listed> = Vec::new();
        let mut seen: HashMap<u32, usize> = HashMap::new();
        for team in &teams {
            let id = IntakeTeam { index: team.index, kind: team.kind, age_limit: team.age_limit };
            for member in team.players.iter().filter(|member| member.loan != Some(Loan::In)) {
                match seen.get(&member.uid) {
                    Some(&at) if member.plays_here => listed[at].team = id,
                    Some(_) => {}
                    None => {
                        seen.insert(member.uid, listed.len());
                        listed.push(Listed { uid: member.uid, team: id, loan: member.loan });
                    }
                }
            }
        }

        let mut by_day: BTreeMap<i64, Vec<IntakePlayer>> = BTreeMap::new();
        for Listed { uid, team, loan } in listed {
            let Some(player) = players.get(uid) else {
                continue;
            };
            if self.made_by_game(player) == Some(false) {
                continue;
            }
            let (joined, contract_type) = self.contract_start(player);
            let joined_age = player.date_of_birth.zip(joined).and_then(|(born, joined)| born.age_on(joined));
            if joined_age.is_none_or(|age| age > INTAKE_AGE) || self.trained_elsewhere(player, club.uid) {
                continue;
            }
            let lent = loan == Some(Loan::Out);
            by_day.entry(joined.map_or(0, FmDate::to_number)).or_default().push(IntakePlayer {
                player: player.clone(),
                city: self.city_of_birth(player),
                joined,
                joined_age,
                contract_type,
                team: Some(team),
                on_loan_at: if lent { player.club.clone() } else { None },
                on_loan_at_uid: if lent { player.club_uid } else { None },
            });
        }
        let intakes = by_day
            .into_iter()
            .rev()
            .map(|(_, mut players)| {
                players.sort_by(|a, b| {
                    let (a, b) = (&a.player, &b.player);
                    b.potential_ability
                        .cmp(&a.potential_ability)
                        .then(b.current_ability.cmp(&a.current_ability))
                        .then_with(|| a.name.cmp(&b.name))
                });
                Intake { joined: players[0].joined, players }
            })
            .collect();
        Ok(YouthIntakes {
            club_uid: club.uid,
            club: club.name.clone(),
            marked: self.layout.player.made_by_game.is_some(),
            intakes,
        })
    }

    /// Whether the game made `player`: `None` where the layout does not place its mark, and no when it cannot be read.
    pub fn made_by_game(&self, player: &PlayerSummary) -> Option<bool> {
        let p = &self.layout.player;
        let at = player.address + p.at(p.made_by_game?, player.shift);
        Some(self.process.read_bytes(at, 1).is_ok_and(|flags| flags[0] & MADE_BY_GAME != 0))
    }

    /// The city `player` was born in, as far as it can be read.
    pub fn city_of_birth(&self, player: &PlayerSummary) -> Option<City> {
        let p = &self.layout.player;
        let address = self.process.read_u64(player.address + p.at(p.city_of_birth?, player.shift)).ok()?;
        self.city_at(address)
    }

    /// The cities `players` were born in, each once, by name (accents and case ignored): what a city of birth can be
    /// set to. The game has a city for every town a person of its database comes from; the ones people of the save
    /// were born in are offered.
    pub fn birth_cities<'a>(&self, players: impl IntoIterator<Item = &'a PlayerSummary>) -> Vec<City> {
        let p = &self.layout.player;
        let Some(offset) = p.city_of_birth else {
            return Vec::new();
        };
        let mut seen = HashSet::new();
        let mut cities = Vec::new();
        for player in players {
            let Ok(address) = self.process.read_u64(player.address + p.at(offset, player.shift)) else {
                continue;
            };
            if is_user_pointer(address) && seen.insert(address) {
                cities.extend(self.city_at(address));
            }
        }
        cities.sort_by_cached_key(|city| (fold(&city.name), city.uid));
        cities
    }

    /// The city at `address`: its name must read as one.
    fn city_at(&self, address: u64) -> Option<City> {
        let layout = self.layout.city.as_ref()?;
        if !is_user_pointer(address) {
            return None;
        }
        let name = read_fm_string(&self.process, self.process.read_u64(address + layout.name).ok()?)?;
        let nation = self.process.read_u64(address + layout.nation).unwrap_or(0);
        Some(City {
            address,
            uid: self.process.read_u32(address + layout.uid).ok(),
            name,
            nation_uid: nation_uid(&self.process, &self.layout, nation),
        })
    }

    /// The day `player` joined his club, and the kind of his contract, from his own contract (not a loan's).
    fn contract_start(&self, player: &PlayerSummary) -> (Option<FmDate>, Option<u8>) {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        let contract = self.process.read_u64(player.address + p.at(p.contract, player.shift)).unwrap_or(0);
        if !is_user_pointer(contract) {
            return (None, None);
        }
        let joined = self.process.read_bytes(contract + c.joined, 4).ok().and_then(|bytes| {
            FmDate::from_raw(u16::from_le_bytes([bytes[0], bytes[1]]), u16::from_le_bytes([bytes[2], bytes[3]]))
        });
        let kind = c.contract_type.and_then(|offset| self.process.read_bytes(contract + offset, 1).ok()).map(|b| b[0]);
        (joined, kind)
    }

    /// Whether `player` has a tie to a club other than `club` as one he was trained at: he came from another club.
    fn trained_elsewhere(&self, player: &PlayerSummary, club: u32) -> bool {
        self.relations(player)
            .is_ok_and(|ties| ties.iter().any(|tie| tie.tie == Tie::TrainedAtClub && tie.target_uid != club))
    }
}
