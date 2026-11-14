//! Templates for a player: a set of abilities, attributes and position ratings that the profile's editor can fill in,
//! either from a preset of a position at 19 or from what the players of the save of the same kind average.
//!
//! A preset is the editor's own reading of what a 19-year-old at a position looks like: the game's own CA weights are
//! not known, so the attributes lean on the ones the position asks for and fall away from the rest. The sample weighs
//! the players the save has: those of the chosen position, age and nation, averaged attribute by attribute, without a
//! single read of the game's memory (the lists already hold every player). Everything here only reads what the caller
//! passes in.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::details::{ATTRIBUTE_GROUPS, POSITIONS};
use crate::filter::attribute_keys;
use crate::players::{PLAYABLE_RATING, PlayerIndex, PlayerSummary};
use crate::text::fold;

/// The fewest players a sample may hold: fewer, and its average says more about who the save happens to have than
/// about the kind of player asked for, so the preset is used instead.
pub const MIN_SAMPLE: usize = 8;

/// The age the presets are written for, and the one an age on its own is scaled from.
pub const PRESET_AGE: u16 = 19;

/// A position's preset: the abilities of a 19-year-old there, and the attributes it leans on.
struct Preset {
    /// A [`POSITIONS`] key.
    position: &'static str,
    /// Current and potential ability at [`PRESET_AGE`].
    ca: u16,
    pa: i16,
    /// The attributes the position leans on most, then the ones that help.
    key_attributes: &'static [&'static str],
    other_attributes: &'static [&'static str],
    /// The position ratings it writes: its own position, and the ones beside it lower.
    ratings: &'static [(&'static str, u8)],
}

/// The presets, one per position the game plays: the sweepers and the wing-backs are left out, as the game rates every
/// player 1 at sweeper and a wing-back is a full-back with a side (see [`preset_for`]).
const PRESETS: &[Preset] = &[
    Preset {
        position: "gk",
        ca: 92,
        pa: 140,
        key_attributes: &[
            "handling",
            "reflexes",
            "one_on_ones",
            "command_of_area",
            "aerial_reach",
            "kicking",
            "rushing_out",
            "throwing",
            "communication",
            "concentration",
            "positioning",
            "agility",
        ],
        other_attributes: &[
            "punching",
            "composure",
            "decisions",
            "anticipation",
            "bravery",
            "determination",
            "jumping_reach",
            "strength",
        ],
        ratings: &[("gk", 20)],
    },
    Preset {
        position: "dc",
        ca: 95,
        pa: 145,
        key_attributes: &[
            "marking",
            "tackling",
            "heading",
            "positioning",
            "strength",
            "concentration",
            "bravery",
            "anticipation",
            "jumping_reach",
        ],
        other_attributes: &[
            "passing",
            "composure",
            "decisions",
            "determination",
            "aggression",
            "pace",
            "balance",
            "teamwork",
            "leadership",
        ],
        ratings: &[("dc", 20), ("dm", 12), ("dr", 10), ("dl", 10)],
    },
    Preset {
        position: "dl",
        ca: 92,
        pa: 140,
        key_attributes: &[
            "crossing",
            "tackling",
            "marking",
            "positioning",
            "stamina",
            "pace",
            "acceleration",
            "work_rate",
            "anticipation",
        ],
        other_attributes: &[
            "dribbling",
            "passing",
            "first_touch",
            "technique",
            "composure",
            "decisions",
            "concentration",
            "teamwork",
            "agility",
            "balance",
        ],
        ratings: &[("dl", 20), ("wbl", 16), ("ml", 13), ("dr", 8)],
    },
    Preset {
        position: "dr",
        ca: 92,
        pa: 140,
        key_attributes: &[
            "crossing",
            "tackling",
            "marking",
            "positioning",
            "stamina",
            "pace",
            "acceleration",
            "work_rate",
            "anticipation",
        ],
        other_attributes: &[
            "dribbling",
            "passing",
            "first_touch",
            "technique",
            "composure",
            "decisions",
            "concentration",
            "teamwork",
            "agility",
            "balance",
        ],
        ratings: &[("dr", 20), ("wbr", 16), ("mr", 13), ("dl", 8)],
    },
    Preset {
        position: "dm",
        ca: 95,
        pa: 145,
        key_attributes: &[
            "tackling",
            "marking",
            "positioning",
            "passing",
            "work_rate",
            "teamwork",
            "anticipation",
            "concentration",
            "stamina",
        ],
        other_attributes: &[
            "first_touch",
            "technique",
            "composure",
            "decisions",
            "determination",
            "aggression",
            "strength",
            "vision",
            "bravery",
        ],
        ratings: &[("dm", 20), ("mc", 14), ("dc", 12)],
    },
    Preset {
        position: "mc",
        ca: 100,
        pa: 150,
        key_attributes: &[
            "passing",
            "first_touch",
            "technique",
            "vision",
            "decisions",
            "teamwork",
            "work_rate",
            "stamina",
            "off_the_ball",
        ],
        other_attributes: &[
            "dribbling",
            "long_shots",
            "composure",
            "anticipation",
            "concentration",
            "determination",
            "agility",
            "balance",
            "flair",
        ],
        ratings: &[("mc", 20), ("dm", 14), ("amc", 14)],
    },
    Preset {
        position: "ml",
        ca: 98,
        pa: 148,
        key_attributes: &[
            "crossing",
            "dribbling",
            "first_touch",
            "technique",
            "pace",
            "acceleration",
            "stamina",
            "work_rate",
            "off_the_ball",
        ],
        other_attributes: &[
            "passing",
            "flair",
            "vision",
            "decisions",
            "agility",
            "balance",
            "teamwork",
            "anticipation",
        ],
        ratings: &[("ml", 20), ("aml", 16), ("wbl", 13), ("mr", 8)],
    },
    Preset {
        position: "mr",
        ca: 98,
        pa: 148,
        key_attributes: &[
            "crossing",
            "dribbling",
            "first_touch",
            "technique",
            "pace",
            "acceleration",
            "stamina",
            "work_rate",
            "off_the_ball",
        ],
        other_attributes: &[
            "passing",
            "flair",
            "vision",
            "decisions",
            "agility",
            "balance",
            "teamwork",
            "anticipation",
        ],
        ratings: &[("mr", 20), ("amr", 16), ("wbr", 13), ("ml", 8)],
    },
    Preset {
        position: "amc",
        ca: 100,
        pa: 150,
        key_attributes: &[
            "passing",
            "first_touch",
            "technique",
            "vision",
            "decisions",
            "flair",
            "off_the_ball",
            "composure",
        ],
        other_attributes: &[
            "dribbling",
            "long_shots",
            "finishing",
            "anticipation",
            "concentration",
            "determination",
            "agility",
            "balance",
            "work_rate",
        ],
        ratings: &[("amc", 20), ("mc", 16), ("st", 12), ("aml", 12), ("amr", 12)],
    },
    Preset {
        position: "aml",
        ca: 100,
        pa: 150,
        key_attributes: &[
            "dribbling",
            "crossing",
            "first_touch",
            "technique",
            "pace",
            "acceleration",
            "flair",
            "off_the_ball",
        ],
        other_attributes: &[
            "finishing",
            "passing",
            "long_shots",
            "vision",
            "decisions",
            "agility",
            "balance",
            "work_rate",
            "composure",
        ],
        ratings: &[("aml", 20), ("ml", 16), ("amr", 12), ("st", 10)],
    },
    Preset {
        position: "amr",
        ca: 100,
        pa: 150,
        key_attributes: &[
            "dribbling",
            "crossing",
            "first_touch",
            "technique",
            "pace",
            "acceleration",
            "flair",
            "off_the_ball",
        ],
        other_attributes: &[
            "finishing",
            "passing",
            "long_shots",
            "vision",
            "decisions",
            "agility",
            "balance",
            "work_rate",
            "composure",
        ],
        ratings: &[("amr", 20), ("mr", 16), ("aml", 12), ("st", 10)],
    },
    Preset {
        position: "st",
        ca: 105,
        pa: 155,
        key_attributes: &[
            "finishing",
            "off_the_ball",
            "first_touch",
            "heading",
            "composure",
            "anticipation",
            "acceleration",
            "pace",
        ],
        other_attributes: &[
            "dribbling",
            "technique",
            "long_shots",
            "decisions",
            "determination",
            "bravery",
            "strength",
            "jumping_reach",
            "work_rate",
        ],
        ratings: &[("st", 20), ("amc", 12), ("aml", 10), ("amr", 10)],
    },
];

/// A preset as the editor's panel lists it: the position it is for, and the abilities of a [`PRESET_AGE`]-year-old
/// there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePreset {
    /// A [`POSITIONS`] key.
    pub position: &'static str,
    pub ca: u16,
    pub pa: i16,
}

/// The presets, in the order of [`POSITIONS`], for the panel that offers them.
pub fn presets() -> Vec<TemplatePreset> {
    PRESETS.iter().map(|preset| TemplatePreset { position: preset.position, ca: preset.ca, pa: preset.pa }).collect()
}

/// What the panel asks for: any of these may be left out, and the preset of the position is used when all are.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TemplateQuery {
    /// A [`POSITIONS`] key the template is for; the best position of the player being edited when left out.
    pub position: Option<String>,
    /// The age of the players sampled: those a year either way; no sample when left out.
    pub age: Option<u16>,
    /// The name of the nation of the players sampled, exactly (accents and case ignored): no sample when left out.
    pub nation: Option<String>,
    /// The player the template is for: left out of the sample (his own attributes are what is being replaced), and
    /// whose gender and best position the sample follows.
    pub exclude_uid: Option<u32>,
}

/// Where a profile's numbers came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TemplateSource {
    /// The average of the players of the save that fit, by [`MIN_SAMPLE`] or more of them.
    Sample,
    /// A preset, scaled by the age asked for.
    Preset,
}

/// A template to fill an edit in with.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateProfile {
    /// The edit fields and their values, in the units the fields are shown in: `current_ability` and
    /// `potential_ability` 1–200, `attribute.*` 1–20 and `position.*` 1–20 (see `shownValue` in the app).
    pub values: BTreeMap<String, i64>,
    /// How many players the sample held; 0 when none was asked for, and below [`MIN_SAMPLE`] when it fell back.
    pub sampled: usize,
    pub source: TemplateSource,
}

impl TemplateProfile {
    /// The value of `key`, for the tests.
    #[cfg(test)]
    fn value(&self, key: &str) -> Option<i64> {
        self.values.get(key).copied()
    }
}

/// The preset of `position`; a wing-back is a full-back of its side, and a sweeper a centre-back.
fn preset_for(position: &str) -> Option<&'static Preset> {
    let position = match position {
        "wbl" => "dl",
        "wbr" => "dr",
        "sw" => "dc",
        other => other,
    };
    PRESETS.iter().find(|preset| preset.position == position)
}

/// The position ratings and the attributes of `preset` scaled to `age`, and its abilities: 1 for the age that is not
/// known, so that the preset reads as its own 19.
fn preset_at(preset: &Preset, age: Option<u16>) -> BTreeMap<String, i64> {
    let factor = age.map(age_factor).unwrap_or(1.0);
    let ca = (f64::from(preset.ca) * f64::from(factor)).round().clamp(1.0, 200.0) as i64;
    // The attributes of a player at the preset's own age, before the age moves them.
    let base = (f64::from(preset.ca) / 9.0).round().clamp(2.0, 18.0);
    let base = (base * f64::from(factor)).round().clamp(1.0, 20.0) as i64;
    let pa = i64::from(preset.pa).max(ca + 15).clamp(1, 200);
    let mut values = BTreeMap::new();
    values.insert("current_ability".to_owned(), ca);
    values.insert("potential_ability".to_owned(), pa);
    for key in attribute_keys(ATTRIBUTE_GROUPS) {
        values.insert(format!("attribute.{key}"), attribute_value(preset, key, base));
    }
    for &(position, rating) in preset.ratings {
        values.insert(format!("position.{position}"), i64::from(rating));
    }
    values
}

/// How good a player of `preset` is at `key`, on the 1–20 scale, with `base` the value of an attribute it does not
/// lean on either way.
fn attribute_value(preset: &Preset, key: &str, base: i64) -> i64 {
    let goalkeeper = preset.position == "gk";
    let group = |name: &str| {
        ATTRIBUTE_GROUPS.iter().find(|(group, _)| *group == name).is_some_and(|(_, keys)| keys.contains(&key))
    };
    let left_sided = matches!(preset.position, "dl" | "ml" | "aml");
    let value = match key {
        // What the game is better at the lower it is, and what tells a 19-year-old from a finished player.
        "injury_proneness" => 3,
        "dirtiness" => 4,
        "consistency" | "important_matches" => base + 2,
        "versatility" => base - 1,
        "left_foot" => {
            if left_sided {
                18
            } else {
                8
            }
        }
        "right_foot" => {
            if left_sided {
                8
            } else {
                18
            }
        }
        // A keeper's eccentricity is his own; no one else has any to speak of.
        "eccentricity" => {
            if goalkeeper {
                base
            } else {
                2
            }
        }
        _ if group("goalkeeping") => {
            if goalkeeper {
                base + 4
            } else {
                2
            }
        }
        _ if group("technical") && goalkeeper => base - 5,
        _ if preset.key_attributes.contains(&key) => base + 3,
        _ if preset.other_attributes.contains(&key) => base + 1,
        _ => base - 2,
    };
    value.clamp(1, 20)
}

/// How much of his ability a player has at `age`, against the [`PRESET_AGE`] the presets are written for: a rough
/// growth curve, the only thing the editor can say about an age the save has no players of.
fn age_factor(age: u16) -> f32 {
    match age {
        ..=15 => 0.60,
        16 => 0.72,
        17 => 0.82,
        18 => 0.91,
        19 => 1.00,
        20 => 1.07,
        21 => 1.12,
        22 => 1.16,
        _ => 1.18,
    }
}

/// The best position of `player`, by his ratings, the first of [`POSITIONS`] on a tie: the one a preset is for when
/// the query names none.
fn best_position(player: &PlayerSummary) -> &'static str {
    let mut best = 0;
    for (index, &rating) in player.position_ratings.iter().enumerate() {
        if rating > player.position_ratings[best] {
            best = index;
        }
    }
    if player.position_ratings[best] == 0 {
        return "st";
    }
    POSITIONS[best]
}

/// The average of the players that fit `query`, while there are enough of them to say anything.
struct Sample {
    count: usize,
    ca: f64,
    pa: f64,
    /// Sum and count per attribute, in [`ATTRIBUTE_GROUPS`] order: 0 players had the layout place an attribute.
    attributes: Vec<(&'static str, f64, usize)>,
}

/// The players of `players` that fit `query` at `position`, and `women` as the player being edited is: those of the
/// position ([`PLAYABLE_RATING`] or more there), a year either way of the age, and of the nation, by name.
fn sample(players: &PlayerIndex, query: &TemplateQuery, position: &str, women: Option<bool>) -> Sample {
    let index = POSITIONS.iter().position(|&key| key == position).unwrap_or(POSITIONS.len() - 1);
    let nation = query.nation.as_deref().map(fold);
    let mut sample = Sample {
        count: 0,
        ca: 0.0,
        pa: 0.0,
        attributes: attribute_keys(ATTRIBUTE_GROUPS).map(|key| (key, 0.0, 0)).collect(),
    };
    for player in players.iter() {
        if Some(player.uid) == query.exclude_uid || women.is_some_and(|woman| player.woman != Some(woman)) {
            continue;
        }
        if let Some(age) = query.age {
            // A player whose age the game does not show (no date of birth) cannot fit an age.
            if player.age.is_none_or(|his| his.abs_diff(age) > 1) {
                continue;
            }
        }
        if let Some(nation) = &nation
            && player.nation.as_deref().map(fold).as_deref() != Some(nation.as_str())
        {
            continue;
        }
        if player.position_ratings[index] < PLAYABLE_RATING {
            continue;
        }
        sample.count += 1;
        sample.ca += f64::from(player.current_ability);
        sample.pa += f64::from(player.potential_ability);
        for (slot, &value) in sample.attributes.iter_mut().zip(player.attributes.iter()) {
            // 0 is an attribute the game's layout does not place: it says nothing about the player.
            if value > 0 {
                slot.1 += f64::from(value);
                slot.2 += 1;
            }
        }
    }
    sample
}

/// The template for `query`: the average of the players of the save that fit, while there are [`MIN_SAMPLE`] of them,
/// and the preset of the position (scaled by the age) otherwise. Without an age or a nation there is nothing to
/// sample, and it is the preset.
pub fn template_profile(players: &PlayerIndex, query: &TemplateQuery) -> TemplateProfile {
    let subject = query.exclude_uid.and_then(|uid| players.get(uid));
    let position = query
        .position
        .as_deref()
        .and_then(|key| POSITIONS.iter().copied().find(|&known| known == key))
        .or_else(|| subject.map(best_position))
        .unwrap_or("st");
    let preset = preset_for(position).unwrap_or(&PRESETS[PRESETS.len() - 1]);
    let complex = query.age.is_some() || query.nation.is_some();
    let sample = complex.then(|| sample(players, query, position, subject.and_then(|player| player.woman)));
    let sampled = sample.as_ref().map_or(0, |sample| sample.count);
    if let Some(sample) = sample.filter(|sample| sample.count >= MIN_SAMPLE) {
        return TemplateProfile { values: sampled_values(preset, &sample), sampled, source: TemplateSource::Sample };
    }
    TemplateProfile { values: preset_at(preset, query.age), sampled, source: TemplateSource::Preset }
}

/// The template of a sample: its average abilities and attributes, and the position ratings of `preset` (the players
/// of a position all rate high there, so their average says nothing the ratings do not already).
fn sampled_values(preset: &Preset, sample: &Sample) -> BTreeMap<String, i64> {
    let count = sample.count as f64;
    let ca = (sample.ca / count).round().clamp(1.0, 200.0) as i64;
    let pa = ((sample.pa / count).round() as i64).max(ca).clamp(1, 200);
    let mut values = preset_at(preset, None);
    for (key, sum, players) in &sample.attributes {
        if *players > 0 {
            values.insert(format!("attribute.{key}"), (sum / *players as f64).round().clamp(1.0, 20.0) as i64);
        }
    }
    values.insert("current_ability".to_owned(), ca);
    values.insert("potential_ability".to_owned(), pa);
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(uid: u32, age: u16, nation: &str, ca: u16, position: &str, attributes: u8) -> PlayerSummary {
        let mut position_ratings = [1u8; POSITIONS.len()];
        if let Some(index) = POSITIONS.iter().position(|&key| key == position) {
            position_ratings[index] = 20;
        }
        PlayerSummary {
            uid,
            name: format!("Player {uid}"),
            full_name: None,
            date_of_birth: None,
            age: Some(age),
            nation: Some(nation.to_owned()),
            nation_uid: None,
            nation_address: 0,
            club: None,
            club_uid: None,
            positions: vec![],
            contract_expires: None,
            current_ability: ca,
            potential_ability: ca as i16 + 20,
            position_ratings,
            attributes: vec![attributes; attribute_keys(ATTRIBUTE_GROUPS).count()],
            transfer_listed: false,
            loan_listed: false,
            transfer_value: None,
            woman: Some(false),
            address: 0,
            shift: 0,
        }
    }

    #[test]
    fn presets_cover_the_positions_the_game_plays() {
        assert_eq!(presets().len(), 12);
        let attributes: Vec<&str> = attribute_keys(ATTRIBUTE_GROUPS).collect();
        for preset in PRESETS {
            assert!(POSITIONS.contains(&preset.position), "{} is no position", preset.position);
            assert!(preset.ca >= 1 && preset.ca <= 200);
            assert!(preset.pa >= preset.ca as i16, "{} may not be worse than he is", preset.position);
            // Every position it rates is one the game has, and its own is the best of them.
            for &(position, rating) in preset.ratings {
                assert!(POSITIONS.contains(&position), "{position} is no position");
                assert!((1..=20).contains(&rating), "{position} at {rating}");
            }
            assert_eq!(preset.ratings[0], (preset.position, 20));
            // Every attribute it leans on is one the game has.
            assert!(preset.key_attributes.iter().chain(preset.other_attributes).all(|key| attributes.contains(key)));
        }
        assert!(preset_for("wbl").is_some_and(|preset| preset.position == "dl"));
        assert!(preset_for("wbr").is_some_and(|preset| preset.position == "dr"));
    }

    #[test]
    fn a_preset_paints_the_position_and_the_rest() {
        let striker = preset_for("st").expect("the striker preset");
        let values = preset_at(striker, Some(PRESET_AGE));
        assert_eq!(values["current_ability"], 105);
        assert_eq!(values["position.st"], 20);
        assert_eq!(values["attribute.injury_proneness"], 3);
        assert!(values["attribute.finishing"] > values["attribute.marking"], "a striker finishes better than he marks");
        assert!(values["attribute.finishing"] >= 14, "a 19-year-old striker finishes at 15 or so");
        assert!(
            values.iter().filter(|(key, _)| key.starts_with("attribute.")).all(|(_, &value)| (1..=20).contains(&value))
        );
        let keeper = preset_at(preset_for("gk").expect("the keeper preset"), None);
        assert!(keeper["attribute.reflexes"] > keeper["attribute.finishing"]);
        assert!(keeper["attribute.finishing"] <= 5);
    }

    #[test]
    fn age_scales_the_preset_both_ways() {
        let preset = preset_for("mc").expect("the midfielder preset");
        let young = preset_at(preset, Some(16));
        let old = preset_at(preset, Some(26));
        assert!(young["current_ability"] < old["current_ability"]);
        assert!(young["attribute.passing"] < old["attribute.passing"]);
        assert!(young["potential_ability"] >= young["current_ability"]);
        assert!(old["potential_ability"] >= old["current_ability"]);
    }

    #[test]
    fn a_sample_averages_the_players_that_fit() {
        let mut players: Vec<PlayerSummary> =
            (0..10).map(|n| player(n + 1, 19, "Türkiye", 100 + n as u16, "st", 12)).collect();
        // One who plays elsewhere, one too old, one of another nation: none of them may weigh in.
        players.push(player(101, 19, "Türkiye", 200, "dc", 20));
        players.push(player(102, 30, "Türkiye", 200, "st", 20));
        players.push(player(103, 19, "Brazil", 200, "st", 20));
        let index = PlayerIndex::new(players);
        let query = TemplateQuery {
            position: Some("st".to_owned()),
            age: Some(19),
            nation: Some("Türkiye".to_owned()),
            ..TemplateQuery::default()
        };
        let profile = template_profile(&index, &query);
        assert_eq!(profile.source, TemplateSource::Sample);
        assert_eq!(profile.sampled, 10);
        assert_eq!(profile.value("attribute.finishing"), Some(12));
        // The average of 100, 101, … 109.
        assert_eq!(profile.value("current_ability"), Some(105));
        assert_eq!(profile.value("position.st"), Some(20));
    }

    #[test]
    fn a_thin_sample_falls_back_to_the_preset() {
        let players = vec![player(1, 19, "Türkiye", 100, "st", 12), player(2, 19, "Türkiye", 110, "st", 14)];
        let index = PlayerIndex::new(players);
        let query = TemplateQuery { position: Some("st".to_owned()), age: Some(19), ..TemplateQuery::default() };
        let profile = template_profile(&index, &query);
        assert_eq!(profile.source, TemplateSource::Preset);
        assert_eq!(profile.sampled, 2);
        assert_eq!(profile.value("current_ability"), Some(105));
    }

    #[test]
    fn without_a_condition_the_preset_of_the_best_position_is_used() {
        let subject = player(7, 19, "Türkiye", 90, "amc", 10);
        let index = PlayerIndex::new(vec![subject]);
        let profile = template_profile(&index, &TemplateQuery { exclude_uid: Some(7), ..TemplateQuery::default() });
        assert_eq!(profile.source, TemplateSource::Preset);
        assert_eq!(profile.sampled, 0);
        assert_eq!(profile.value("position.amc"), Some(20));
        assert_eq!(profile.value("current_ability"), Some(100));
    }

    #[test]
    fn a_nation_is_matched_without_accents_or_case() {
        let players: Vec<PlayerSummary> =
            (0..MIN_SAMPLE as u32).map(|n| player(n + 1, 19, "Türkiye", 120, "mc", 15)).collect();
        let index = PlayerIndex::new(players);
        let query = TemplateQuery {
            position: Some("mc".to_owned()),
            age: Some(19),
            nation: Some("turkiye".to_owned()),
            ..TemplateQuery::default()
        };
        assert_eq!(template_profile(&index, &query).source, TemplateSource::Sample);
    }
}
