//! Two more ways a scout looks for players than a brief for one position (see [`Session::scout`]): the market's
//! opportunities, and players like a given one.
//!
//! **Opportunities** are players the market makes easier to sign than their ability says: no contract, or one that
//! runs out within six months; a release clause below his value; reasons to be unhappy at his club; a club in the red;
//! the transfer and the loan lists; and, apart from the rest, young players with a great future. One pass sorts the
//! players near the club's level into all the lists at once, so each list comes with how many it holds.
//!
//! **Players like one** are measured on the attributes the roles of a position lean on: mostly on how alike the shape
//! of their attributes is, and less on how alike their level is.
//!
//! Each player found is measured for a position and worked out like a recommendation (fit, probability, fee, wage), so
//! the lists read like the advice. Only reads memory.

use std::collections::HashMap;

use fmlibre_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::clubs::ClubSummary;
use crate::concerns::ABOUT_A_TEAMMATE;
use crate::date::FmDate;
use crate::details::{ATTRIBUTE_GROUPS, read_clauses, read_concerns};
use crate::filter::attribute_keys;
use crate::index::SearchIndex;
use crate::players::{PlayerIndex, PlayerSummary};
use crate::scouting::{
    Buyer, Fitting, LOWEST_RATING, Looking, Measure, Measured, NOT_FOR_SALE, Purpose, ROLES, SCOUT_POSITIONS,
    SHORTLIST, ScoutError, ScoutPosition, ScoutRequest, Suggestion, days_between, fitting, known_value, release_fee,
    score, scout_position,
};
use crate::session::Session;

/// A list of opportunities.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpportunityKind {
    /// No contract, or one that runs out within six months: free now, or nearly.
    #[default]
    Bosman,
    /// A release clause that holds and is below his value; for a player not for sale, the only way to sign him, when
    /// the club's transfer budget comes near it (within 30%).
    ReleaseClause,
    /// Reasons to be unhappy at his club that last, other than those about a teammate.
    Unhappy,
    /// His club's balance is below nothing.
    InTheRed,
    /// On his club's transfer list.
    Listed,
    /// On his club's loan list.
    LoanListed,
    /// 19 or younger, with a potential well above his ability and the club's level.
    Wonderkid,
}

/// Every list, in the order the app shows them.
pub const OPPORTUNITY_KINDS: [OpportunityKind; 7] = [
    OpportunityKind::Bosman,
    OpportunityKind::ReleaseClause,
    OpportunityKind::Unhappy,
    OpportunityKind::InTheRed,
    OpportunityKind::Listed,
    OpportunityKind::LoanListed,
    OpportunityKind::Wonderkid,
];

/// What the lists of opportunities are asked for.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OpportunityRequest {
    /// The list whose players to return; every list is counted.
    pub kind: OpportunityKind,
    /// A position among [`SCOUT_POSITIONS`]; none for any, each player then measured at the position he plays best.
    pub position: Option<String>,
    pub min_age: Option<u16>,
    pub max_age: Option<u16>,
    /// The most the club would pay, pounds.
    pub max_fee: Option<i64>,
    /// Only players who fit their position better than the club's best player there (not for the wonderkids, who are
    /// for later).
    pub better_only: bool,
    /// How many to return; 50 when none, 200 at most.
    pub limit: Option<usize>,
}

/// What makes a player an opportunity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Why {
    /// `freeAgent`, `expiring` (value: days left), `releaseClause` (value: the fee it lets a club pay, pounds;
    /// `against`: his value, none when he is not for sale), `unhappy` (value: his reasons), `inTheRed` (value: his
    /// club's balance, pounds), `listed`, `loanListed`, `wonderkid` (value: his potential ability).
    pub code: &'static str,
    pub value: Option<i64>,
    pub against: Option<i64>,
}

impl Why {
    fn new(code: &'static str, value: Option<i64>) -> Self {
        Self { code, value, against: None }
    }
}

/// A player of a list of opportunities.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunity {
    #[serde(flatten)]
    pub suggestion: Suggestion,
    /// The position he was measured for: the one asked for, or the one he plays best.
    pub position: &'static str,
    pub why: Why,
    /// Whether he fits his position better than the club's best player there.
    pub better: bool,
}

/// How many players a list holds with the filters.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KindCount {
    pub kind: OpportunityKind,
    /// At most [`KIND_MOST`]; `more` when the list holds more than that.
    pub count: usize,
    pub more: bool,
}

/// The club's best player at a position: what a player found there is compared with.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Starter {
    pub position: &'static str,
    #[serde(flatten)]
    pub fitting: Fitting,
}

/// The players of one list of opportunities, and how many every list holds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunities {
    pub kind: OpportunityKind,
    /// Best first, as the advice orders its recommendations.
    pub items: Vec<Opportunity>,
    pub counts: Vec<KindCount>,
    /// The club's best player at each position it has one for.
    pub starters: Vec<Starter>,
    /// The average current ability of the club's best eleven, and the abilities looked at around it.
    pub level: u16,
    pub lowest: u16,
    pub highest: u16,
    /// Players looked at, and those near the club's level sorted into the lists (at most [`POOL_MOST`]).
    pub examined: usize,
    pub pool: usize,
    /// The club's transfer budget and the wages it can still add, pounds (a week), when its finances are known.
    pub transfer_budget: Option<i64>,
    pub wage_room: Option<i64>,
}

/// What players like one are asked for.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SimilarRequest {
    /// The player they should be like.
    pub uid: u32,
    /// The position to compare them at, among [`SCOUT_POSITIONS`]; none for the one he plays best.
    pub position: Option<String>,
    /// Only players worth less than him.
    pub cheaper: bool,
    /// Only players younger than him.
    pub younger: bool,
    /// The most the club would pay, pounds.
    pub max_fee: Option<i64>,
    /// How many to return; 50 when none, 200 at most.
    pub limit: Option<usize>,
}

/// A player like the one asked about.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarPlayer {
    #[serde(flatten)]
    pub suggestion: Suggestion,
    /// 0–100: how alike their attributes are where the position needs them.
    pub similarity: u8,
    /// Whether he fits the position better than the club's best player there.
    pub better: bool,
}

/// Players like one player, most alike first.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Similar {
    /// The player they are like, measured for the position; none when he does not play it at all.
    pub reference: Option<Fitting>,
    pub player: PlayerSummary,
    /// His transfer value, pounds; none where the game keeps none or he is not for sale.
    pub value: Option<i32>,
    pub not_for_sale: bool,
    /// The position compared at, and the ones he can be compared at: those he plays well, best first.
    pub position: &'static str,
    pub positions: Vec<&'static str>,
    pub items: Vec<SimilarPlayer>,
    /// The club's best player at the position.
    pub starter: Option<Fitting>,
    /// Players looked at, and those who play the position and pass the filters.
    pub examined: usize,
    pub candidates: usize,
}

/// How far below and above the club's level the lists of opportunities look, in current ability.
const BELOW_LEVEL: u16 = 30;
const ABOVE_LEVEL: u16 = 45;

/// The most players near the club's level sorted into the lists: those who fit their position best.
pub const POOL_MOST: usize = 6000;

/// The most players of one list worked out like recommendations; a list with more says so.
pub const KIND_MOST: usize = 300;

/// A contract that runs out within this many days makes a Bosman: six months, when a player may agree terms with
/// another club.
const BOSMAN_DAYS: i64 = 183;

/// The oldest a wonderkid may be, the lowest potential one may have, and how far above his ability it must be.
const WONDERKID_AGE: u16 = 19;
const WONDERKID_POTENTIAL: i16 = 140;
const WONDERKID_ROOM: i16 = 20;

/// The lowest rating at a position a player like another must have there: competent at least.
const SIMILAR_RATING: u8 = 13;

/// How a player's measure at each position is taken: one [`Measure`] per position, for the best role of each.
struct Measures(Vec<(&'static ScoutPosition, usize, Measure)>);

impl Measures {
    fn new() -> Result<Self, ScoutError> {
        SCOUT_POSITIONS
            .iter()
            .map(|position| {
                let index = position_index(position.key)
                    .ok_or_else(|| ScoutError::UnknownRole { key: position.key.to_owned() })?;
                let request = ScoutRequest { position: position.key.to_owned(), ..ScoutRequest::default() };
                Ok((position, index, Measure::new(&request)?))
            })
            .collect::<Result<Vec<_>, ScoutError>>()
            .map(Self)
    }

    fn get(&self, key: &str) -> Option<&(&'static ScoutPosition, usize, Measure)> {
        self.0.iter().find(|(position, _, _)| position.key == key)
    }

    /// His measure at the position, when he plays it at all (rated 10 or more).
    fn of(&self, key: &str, player: &PlayerSummary) -> Option<Measured> {
        let (_, index, measure) = self.get(key)?;
        (player.position_ratings[*index] >= LOWEST_RATING).then(|| measure.of(player)).flatten()
    }

    /// The club's best player at each position it has one for: the best fit, then the best ability.
    fn starters(&self, own: &[&PlayerSummary]) -> Vec<Starter> {
        self.0
            .iter()
            .filter_map(|(position, _, _)| {
                let best = own
                    .iter()
                    .filter_map(|player| self.of(position.key, player).map(|m| (*player, m)))
                    .max_by(|a, b| a.1.fit.cmp(&b.1.fit).then(a.0.current_ability.cmp(&b.0.current_ability)))?;
                Some(Starter { position: position.key, fitting: fitting(best.0, best.1) })
            })
            .collect()
    }
}

/// Where a position key is in the ratings (`crate::POSITIONS` order).
fn position_index(key: &str) -> Option<usize> {
    crate::POSITIONS.iter().position(|&k| k == key)
}

/// The position among [`SCOUT_POSITIONS`] a player plays best: the first of his playable ones that is one, else the
/// one he is rated highest at (the first of a tie).
fn best_position(player: &PlayerSummary) -> &'static str {
    if let Some(key) = player.positions.iter().find_map(|key| scout_position(key).map(|p| p.key)) {
        return key;
    }
    let mut best = (SCOUT_POSITIONS[0].key, 0u8);
    for position in SCOUT_POSITIONS {
        let rating = position_index(position.key).map_or(0, |i| player.position_ratings[i]);
        if rating > best.1 {
            best = (position.key, rating);
        }
    }
    best.0
}

/// The positions among [`SCOUT_POSITIONS`] a player plays well (rated 15 or more), best first; the one he plays best
/// when there is none.
fn played_positions(player: &PlayerSummary) -> Vec<&'static str> {
    let mut out: Vec<&'static str> =
        player.positions.iter().filter_map(|key| scout_position(key).map(|p| p.key)).collect();
    out.dedup();
    if out.is_empty() {
        out.push(best_position(player));
    }
    out
}

/// The average current ability of the best eleven of `own`.
fn level_of(own: &[&PlayerSummary]) -> u16 {
    let mut abilities: Vec<u32> = own.iter().map(|player| u32::from(player.current_ability)).collect();
    abilities.sort_unstable_by(|a, b| b.cmp(a));
    abilities.truncate(11);
    if abilities.is_empty() { 0 } else { (abilities.iter().sum::<u32>() / abilities.len() as u32) as u16 }
}

/// Whether the club could sign a player at all: not its own or another human manager's, of its gender, and not a free
/// agent past 35 (mostly retired).
fn buyable(player: &PlayerSummary, buyer: &Buyer<'_>, human_clubs: &[u32]) -> bool {
    let own = player.club_uid == Some(buyer.club.uid);
    let human = player.club_uid.is_some_and(|club| human_clubs.contains(&club));
    let other_gender = player.woman.is_some_and(|woman| woman != buyer.club.women);
    let retired = player.club_uid.is_none() && player.age.is_some_and(|age| age > 35);
    !(own || human || other_gender || retired)
}

/// Whether the ages asked for take a player; one whose age is not known is taken.
fn age_fits(player: &PlayerSummary, min: Option<u16>, max: Option<u16>) -> bool {
    player.age.is_none_or(|age| min.is_none_or(|min| age >= min) && max.is_none_or(|max| age <= max))
}

/// Whether a player is a wonderkid for a club of `level`: 19 or younger, with a potential of 140 or more and above the
/// club's level, at least 20 above his ability.
fn is_wonderkid(player: &PlayerSummary, level: u16) -> bool {
    let lowest = WONDERKID_POTENTIAL.max(i16::try_from(level).unwrap_or(i16::MAX).saturating_add(10));
    player.age.is_some_and(|age| age <= WONDERKID_AGE)
        && player.potential_ability >= lowest
        && player.potential_ability - player.current_ability.min(200) as i16 >= WONDERKID_ROOM
}

/// A player sorted into the lists, measured at his position.
struct Candidate<'a> {
    player: &'a PlayerSummary,
    position: &'static str,
    m: Measured,
    better: bool,
}

/// What the market lists need of a player's contract: the fee a release clause that holds lets a club pay, and how many
/// of his reasons to be unhappy last and are not about a teammate.
#[derive(Debug, Default, Clone, Copy)]
struct Market {
    clause: Option<u32>,
    unhappy: usize,
}

impl Session {
    /// The players of the list `request` asks for, best first, and how many every list holds, for `buyer`. Only reads
    /// memory: the contracts of the players near the club's level, and the finances of their clubs.
    pub fn opportunities(
        &self,
        request: &OpportunityRequest,
        buyer: &Buyer<'_>,
        players: &PlayerIndex,
        clubs: &SearchIndex<ClubSummary>,
        human_clubs: &[u32],
    ) -> Result<Opportunities, ScoutError> {
        let today = self.game_date();
        let asked = match request.position.as_deref().filter(|key| !key.is_empty()) {
            Some(key) => Some(scout_position(key).ok_or_else(|| ScoutError::UnknownRole { key: key.to_owned() })?.key),
            None => None,
        };
        let measures = Measures::new()?;
        let own: Vec<&PlayerSummary> = players.iter().filter(|p| p.club_uid == Some(buyer.club.uid)).collect();
        let starters = measures.starters(&own);
        let best_own: HashMap<&str, u8> = starters.iter().map(|s| (s.position, s.fitting.fit)).collect();
        let level = level_of(&own);
        let (lowest, highest) = (level.saturating_sub(BELOW_LEVEL), level + ABOVE_LEVEL);

        // The players near the club's level, and the wonderkids beyond it.
        let mut examined = 0;
        let mut near: Vec<Candidate<'_>> = Vec::new();
        let mut young: Vec<Candidate<'_>> = Vec::new();
        for player in players.iter() {
            examined += 1;
            if !buyable(player, buyer, human_clubs) || !age_fits(player, request.min_age, request.max_age) {
                continue;
            }
            let near_level = (lowest..=highest).contains(&player.current_ability);
            let wonderkid = is_wonderkid(player, level);
            if !near_level && !wonderkid {
                continue;
            }
            let position = asked.unwrap_or_else(|| best_position(player));
            let Some(m) = measures.of(position, player) else {
                continue;
            };
            let better = m.fit > best_own.get(position).copied().unwrap_or(0);
            let candidate = Candidate { player, position, m, better };
            if near_level { near.push(candidate) } else { young.push(candidate) }
        }
        near.sort_by(|a, b| b.m.fit.cmp(&a.m.fit).then(b.player.current_ability.cmp(&a.player.current_ability)));
        near.truncate(POOL_MOST);
        let pool = near.len();

        // Every list, with what makes each of its players an opportunity.
        let mut lists: HashMap<OpportunityKind, Vec<(usize, Why)>> = HashMap::new();
        let mut balances: HashMap<u32, Option<i64>> = HashMap::new();
        for (i, c) in near.iter().enumerate() {
            let p = c.player;
            let free = p.club_uid.is_none();
            let mut add = |kind: OpportunityKind, why: Why| lists.entry(kind).or_default().push((i, why));
            if free {
                add(OpportunityKind::Bosman, Why::new("freeAgent", None));
            } else if let Some(days) = today.zip(p.contract_expires).map(|(today, ends)| days_between(today, ends))
                && days <= BOSMAN_DAYS
            {
                add(OpportunityKind::Bosman, Why::new("expiring", Some(days.max(0))));
            }
            if free {
                if is_wonderkid(p, level) {
                    add(OpportunityKind::Wonderkid, Why::new("wonderkid", Some(i64::from(p.potential_ability))));
                }
                continue;
            }
            if p.transfer_listed {
                add(OpportunityKind::Listed, Why::new("listed", None));
            }
            if p.loan_listed {
                add(OpportunityKind::LoanListed, Why::new("loanListed", None));
            }
            if is_wonderkid(p, level) {
                add(OpportunityKind::Wonderkid, Why::new("wonderkid", Some(i64::from(p.potential_ability))));
            }
            if let Some(club) = p.club_uid {
                let balance = *balances.entry(club).or_insert_with(|| self.balance(club, clubs));
                if let Some(balance) = balance.filter(|&balance| balance < 0) {
                    add(OpportunityKind::InTheRed, Why::new("inTheRed", Some(balance)));
                }
            }
            let market = self.market(p, today);
            if let Some(clause) = market.clause.map(i64::from) {
                let value = known_value(p.transfer_value).map(i64::from);
                // For a player who is not for sale the clause is the only way, and an opportunity only within reach.
                let not_for_sale = p.transfer_value == Some(NOT_FOR_SALE);
                let within_reach = buyer.transfer_budget.is_some_and(|budget| clause <= budget * 13 / 10);
                if value.is_some_and(|value| clause < value) || (not_for_sale && within_reach) {
                    add(
                        OpportunityKind::ReleaseClause,
                        Why { code: "releaseClause", value: Some(clause), against: value },
                    );
                }
            }
            if market.unhappy > 0 {
                add(OpportunityKind::Unhappy, Why::new("unhappy", Some(market.unhappy as i64)));
            }
        }
        let offset = near.len();
        for (i, c) in young.iter().enumerate() {
            let why = Why::new("wonderkid", Some(i64::from(c.player.potential_ability)));
            lists.entry(OpportunityKind::Wonderkid).or_default().push((offset + i, why));
        }
        let all: Vec<&Candidate<'_>> = near.iter().chain(&young).collect();

        // Each list worked out like recommendations: the players who fit best first (the wonderkids by their potential).
        let wage_room = self.wage_room(buyer, players);
        let looking = Looking { buyer, clubs, today, wage_room };
        let mut worked: HashMap<u32, Option<Suggestion>> = HashMap::new();
        let mut counts = Vec::new();
        let mut items = Vec::new();
        for kind in OPPORTUNITY_KINDS {
            let wonderkids = kind == OpportunityKind::Wonderkid;
            let mut members: Vec<(&Candidate<'_>, Why)> = lists
                .remove(&kind)
                .unwrap_or_default()
                .into_iter()
                .map(|(i, why)| (all[i], why))
                .filter(|(c, _)| wonderkids || !request.better_only || c.better)
                .collect();
            if wonderkids {
                members.sort_by(|a, b| {
                    b.0.player.potential_ability.cmp(&a.0.player.potential_ability).then(b.0.m.fit.cmp(&a.0.m.fit))
                });
            } else {
                members.sort_by(|a, b| {
                    b.0.m.fit.cmp(&a.0.m.fit).then(b.0.player.current_ability.cmp(&a.0.player.current_ability))
                });
            }
            let more = members.len() > KIND_MOST;
            members.truncate(KIND_MOST);
            let mut found: Vec<Opportunity> = Vec::new();
            for (c, why) in members {
                let suggestion = worked.entry(c.player.uid).or_insert_with(|| {
                    let owner = self.contract_club(c.player);
                    if owner == Some(buyer.club.uid) || owner.is_some_and(|club| human_clubs.contains(&club)) {
                        return None;
                    }
                    Some(self.suggestion(c.player, c.m, owner, Purpose::Any, &looking))
                });
                let Some(suggestion) = suggestion.clone() else {
                    continue;
                };
                if request.max_fee.is_some_and(|max| suggestion.fee.is_none_or(|fee| fee > max)) {
                    continue;
                }
                let mut suggestion = suggestion;
                if wonderkids {
                    suggestion.score = score(Purpose::Future, c.m.fit, suggestion.probability, c.player);
                }
                found.push(Opportunity { suggestion, position: c.position, why, better: c.better });
            }
            counts.push(KindCount { kind, count: found.len(), more });
            if kind == request.kind {
                found.sort_by(|a, b| {
                    b.suggestion
                        .score
                        .cmp(&a.suggestion.score)
                        .then(b.suggestion.fitting.fit.cmp(&a.suggestion.fitting.fit))
                });
                found.truncate(request.limit.unwrap_or(50).clamp(1, 200));
                items = found;
            }
        }
        Ok(Opportunities {
            kind: request.kind,
            items,
            counts,
            starters,
            level,
            lowest,
            highest,
            examined,
            pool,
            transfer_budget: buyer.transfer_budget,
            wage_room,
        })
    }

    /// The balance of the club `uid`, pounds, when its finances can be read.
    fn balance(&self, uid: u32, clubs: &SearchIndex<ClubSummary>) -> Option<i64> {
        let club = clubs.get(uid)?;
        let details = self.club_details(club).ok().flatten()?;
        details.finances.map(|finances| i64::from(finances.balance))
    }

    /// What the market lists need of the contract of `player`, on the game's date `today`.
    fn market(&self, player: &PlayerSummary, today: Option<FmDate>) -> Market {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        let pointer = |address: u64| self.process.read_u64(address).ok().filter(|&pointer| is_user_pointer(pointer));
        let Some(contract) = pointer(player.address + p.at(p.contract, player.shift)) else {
            return Market::default();
        };
        // The day of the year in the low half, the year in the high half.
        let signed = self.process.read_u32(contract + c.signed).ok();
        let signed = signed.and_then(|raw| FmDate::from_raw(raw as u16, (raw >> 16) as u16));
        let clause = release_fee(&read_clauses(&self.process, &self.layout, contract), signed, today);
        let unhappy = pointer(contract + c.unhappiness).map_or(0, |record| {
            read_concerns(&self.process, &self.layout, record)
                .iter()
                .filter(|concern| concern.ended.is_none())
                .filter(|concern| !concern.category.is_some_and(|category| ABOUT_A_TEAMMATE.contains(&category)))
                .count()
        });
        Market { clause, unhappy }
    }

    /// Players like `reference` at a position, most alike first, as `request` asks, for `buyer`. Only reads memory:
    /// the contracts of the most alike.
    pub fn similar(
        &self,
        reference: &PlayerSummary,
        request: &SimilarRequest,
        buyer: &Buyer<'_>,
        players: &PlayerIndex,
        clubs: &SearchIndex<ClubSummary>,
        human_clubs: &[u32],
    ) -> Result<Similar, ScoutError> {
        let measures = Measures::new()?;
        let positions = played_positions(reference);
        let position = match request.position.as_deref().filter(|key| !key.is_empty()) {
            Some(key) => scout_position(key).ok_or_else(|| ScoutError::UnknownRole { key: key.to_owned() })?,
            None => scout_position(positions[0]).ok_or_else(|| ScoutError::UnknownRole { key: positions[0].into() })?,
        };
        let index = position_index(position.key).ok_or_else(|| ScoutError::UnknownRole { key: position.key.into() })?;
        let weights = similarity_weights(position);
        let value = known_value(reference.transfer_value);
        let not_for_sale = reference.transfer_value == Some(NOT_FOR_SALE);

        let mut examined = 0;
        let mut alike: Vec<(&PlayerSummary, f32)> = Vec::new();
        for player in players.iter() {
            examined += 1;
            if player.uid == reference.uid || !buyable(player, buyer, human_clubs) {
                continue;
            }
            if player.position_ratings[index] < SIMILAR_RATING {
                continue;
            }
            if request.younger && player.age.zip(reference.age).is_none_or(|(age, theirs)| age >= theirs) {
                continue;
            }
            if request.cheaper {
                let worth = known_value(player.transfer_value);
                let cheaper = match (value, not_for_sale) {
                    (Some(value), _) => worth.is_some_and(|worth| worth < value),
                    (None, true) => worth.is_some(),
                    (None, false) => true,
                };
                if !cheaper {
                    continue;
                }
            }
            if let Some(similarity) = similarity(&weights, &reference.attributes, &player.attributes) {
                alike.push((player, similarity));
            }
        }
        let candidates = alike.len();
        alike.sort_by(|a, b| b.1.total_cmp(&a.1).then(b.0.current_ability.cmp(&a.0.current_ability)));
        alike.truncate(SHORTLIST);

        let own: Vec<&PlayerSummary> = players.iter().filter(|p| p.club_uid == Some(buyer.club.uid)).collect();
        let starter = measures.starters(&own).into_iter().find(|s| s.position == position.key).map(|s| s.fitting);
        let best_own = starter.as_ref().map_or(0, |s| s.fit);
        let wage_room = self.wage_room(buyer, players);
        let looking = Looking { buyer, clubs, today: self.game_date(), wage_room };
        let mut items = Vec::new();
        for (player, similarity) in alike {
            let Some(m) = measures.of(position.key, player) else {
                continue;
            };
            let owner = self.contract_club(player);
            if owner == Some(buyer.club.uid) || owner.is_some_and(|club| human_clubs.contains(&club)) {
                continue;
            }
            let suggestion = self.suggestion(player, m, owner, Purpose::Any, &looking);
            if request.max_fee.is_some_and(|max| suggestion.fee.is_none_or(|fee| fee > max)) {
                continue;
            }
            items.push(SimilarPlayer { suggestion, similarity: similarity.round() as u8, better: m.fit > best_own });
        }
        items.truncate(request.limit.unwrap_or(50).clamp(1, 200));
        Ok(Similar {
            reference: measures.of(position.key, reference).map(|m| fitting(reference, m)),
            player: reference.clone(),
            value,
            not_for_sale,
            position: position.key,
            positions,
            items,
            starter,
            examined,
            candidates,
        })
    }
}

/// How much every attribute counts toward how alike two players are at a position: a little for each of the groups a
/// player of the position is judged on, and more the more of the position's roles lean on it (three times for the
/// ones they lean on most), by place in [`PlayerSummary::attributes`].
fn similarity_weights(position: &ScoutPosition) -> Vec<(usize, f32)> {
    /// What every attribute of the groups counts.
    const BASE: f32 = 0.3;
    let places: HashMap<&str, usize> = attribute_keys(ATTRIBUTE_GROUPS).enumerate().map(|(i, key)| (key, i)).collect();
    let groups: &[&str] = if position.key == "gk" {
        &["goalkeeping", "mental", "physical"]
    } else {
        &["technical", "mental", "physical"]
    };
    let mut weights: HashMap<usize, f32> = HashMap::new();
    for (_, keys) in ATTRIBUTE_GROUPS.iter().filter(|(group, _)| groups.contains(group)) {
        for key in *keys {
            if let Some(&i) = places.get(key) {
                weights.insert(i, BASE);
            }
        }
    }
    let roles: Vec<_> = ROLES.iter().filter(|role| position.lines.contains(&role.line)).collect();
    let share = 1.0 / roles.len().max(1) as f32;
    for role in roles {
        let leaned =
            role.key_attributes.iter().map(|key| (key, 3.0)).chain(role.other_attributes.iter().map(|key| (key, 1.0)));
        for (key, weight) in leaned {
            if let Some(&i) = places.get(*key) {
                *weights.entry(i).or_insert(0.0) += weight * share;
            }
        }
    }
    let mut out: Vec<(usize, f32)> = weights.into_iter().collect();
    out.sort_unstable_by_key(|&(i, _)| i);
    out
}

/// How much their level counts beside the shape of their attributes, and the points of similarity a unit of
/// difference costs.
const LEVEL_WEIGHT: f32 = 0.6;
const DISTANCE_POINTS: f32 = 14.0;

/// How alike two players' attributes are, 0–100, with `weights`: the weighted distance between the shapes of their
/// attributes (each less its weighted average), and less their averages' difference. None when too few attributes are
/// known for both (an attribute of 0 is one the layout does not place).
fn similarity(weights: &[(usize, f32)], one: &[u8], other: &[u8]) -> Option<f32> {
    let pairs: Vec<(f32, f32, f32)> = weights
        .iter()
        .filter_map(|&(i, weight)| {
            let (a, b) = (*one.get(i)?, *other.get(i)?);
            (a > 0 && b > 0).then(|| (weight, f32::from(a), f32::from(b)))
        })
        .collect();
    if pairs.len() < 8 {
        return None;
    }
    let total: f32 = pairs.iter().map(|(weight, _, _)| weight).sum();
    let mean_one = pairs.iter().map(|(weight, a, _)| weight * a).sum::<f32>() / total;
    let mean_other = pairs.iter().map(|(weight, _, b)| weight * b).sum::<f32>() / total;
    let shape =
        pairs.iter().map(|(weight, a, b)| weight * ((b - mean_other) - (a - mean_one)).powi(2)).sum::<f32>() / total;
    let level = mean_other - mean_one;
    let distance = (shape + (LEVEL_WEIGHT * level).powi(2)).sqrt();
    Some((100.0 - DISTANCE_POINTS * distance).clamp(0.0, 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(uid: u32, ratings: &[(&str, u8)], positions: &[&'static str]) -> PlayerSummary {
        let mut position_ratings = [1u8; 15];
        for &(key, rating) in ratings {
            position_ratings[position_index(key).expect("position")] = rating;
        }
        PlayerSummary {
            uid,
            name: format!("Player {uid}"),
            full_name: None,
            date_of_birth: None,
            age: Some(24),
            nation: None,
            nation_uid: None,
            nation_address: 0,
            club: None,
            club_uid: None,
            positions: positions.to_vec(),
            contract_expires: None,
            current_ability: 120,
            potential_ability: 140,
            position_ratings,
            attributes: vec![10; attribute_keys(ATTRIBUTE_GROUPS).count()],
            transfer_listed: false,
            loan_listed: false,
            transfer_value: None,
            woman: None,
            address: 0,
            shift: 0,
        }
    }

    #[test]
    fn every_list_is_there_once() {
        for (i, kind) in OPPORTUNITY_KINDS.iter().enumerate() {
            assert!(!OPPORTUNITY_KINDS[i + 1..].contains(kind), "{kind:?} twice");
        }
        assert_eq!(OPPORTUNITY_KINDS[0], OpportunityKind::default());
    }

    #[test]
    fn a_player_is_measured_where_he_plays_best() {
        // The first of his playable positions that the scout knows; the sweeper is not one.
        let player = summary(1, &[("sw", 20), ("dc", 18), ("dm", 16)], &["sw", "dc", "dm"]);
        assert_eq!(best_position(&player), "dc");
        assert_eq!(played_positions(&player), vec!["dc", "dm"]);
        // Without playable positions, the highest rating.
        let player = summary(2, &[("amr", 12), ("st", 13)], &[]);
        assert_eq!(best_position(&player), "st");
        assert_eq!(played_positions(&player), vec!["st"]);
    }

    #[test]
    fn the_level_is_the_best_elevens() {
        let mut squad: Vec<PlayerSummary> = (0..14).map(|i| summary(i, &[], &[])).collect();
        for (i, player) in squad.iter_mut().enumerate() {
            player.current_ability = 100 + i as u16;
        }
        let own: Vec<&PlayerSummary> = squad.iter().collect();
        // 103..=113.
        assert_eq!(level_of(&own), 108);
        assert_eq!(level_of(&[]), 0);
    }

    #[test]
    fn wonderkids_are_young_with_room_above_the_club() {
        let mut kid = summary(1, &[], &[]);
        kid.age = Some(18);
        kid.current_ability = 110;
        kid.potential_ability = 165;
        assert!(is_wonderkid(&kid, 140));
        // Not above a club of that level.
        assert!(!is_wonderkid(&kid, 160));
        kid.age = Some(20);
        assert!(!is_wonderkid(&kid, 140));
        kid.age = Some(17);
        kid.current_ability = 150;
        assert!(!is_wonderkid(&kid, 120), "no room to grow");
        kid.age = None;
        kid.current_ability = 110;
        assert!(!is_wonderkid(&kid, 120), "age not known");
    }

    #[test]
    fn ages_not_known_pass() {
        let mut player = summary(1, &[], &[]);
        assert!(age_fits(&player, Some(20), Some(30)));
        assert!(!age_fits(&player, Some(25), None));
        assert!(!age_fits(&player, None, Some(23)));
        player.age = None;
        assert!(age_fits(&player, Some(25), Some(26)));
    }

    #[test]
    fn similarity_follows_shape_more_than_level() {
        let striker = scout_position("st").expect("st");
        let weights = similarity_weights(striker);
        let n = attribute_keys(ATTRIBUTE_GROUPS).count();
        let shape: Vec<u8> = (0..n).map(|i| 6 + (i * 7 % 11) as u8).collect();
        assert_eq!(similarity(&weights, &shape, &shape), Some(100.0));
        // The same shape two lower everywhere is close; another shape at the same level is not.
        let lower: Vec<u8> = shape.iter().map(|a| a - 2).collect();
        let other: Vec<u8> = shape.iter().rev().copied().collect();
        let close = similarity(&weights, &shape, &lower).expect("close");
        let far = similarity(&weights, &shape, &other).expect("far");
        assert!(close > 70.0 && close < 100.0, "{close}");
        assert!(far < close, "{far} {close}");
        // Attributes the layout does not place count for nothing; too few known give none.
        assert_eq!(similarity(&weights, &shape, &vec![0; n]), None);
    }

    #[test]
    fn similarity_leans_on_the_positions_roles() {
        let places: HashMap<&str, usize> =
            attribute_keys(ATTRIBUTE_GROUPS).enumerate().map(|(i, key)| (key, i)).collect();
        let weight = |position: &str, key: &str| {
            let weights = similarity_weights(scout_position(position).expect("position"));
            weights.iter().find(|(i, _)| *i == places[key]).map_or(0.0, |(_, weight)| *weight)
        };
        assert!(weight("st", "finishing") > weight("st", "marking"));
        assert!(weight("dc", "marking") > weight("dc", "finishing"));
        // A goalkeeper is judged on goalkeeping, an outfield player not.
        assert!(weight("gk", "reflexes") > 0.0);
        assert_eq!(weight("st", "reflexes"), 0.0);
        // Hidden attributes and feet count for nothing.
        assert_eq!(weight("st", "consistency"), 0.0);
        assert_eq!(weight("st", "left_foot"), 0.0);
    }
}
