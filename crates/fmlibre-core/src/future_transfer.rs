//! A transfer a player has agreed, for a later day: where he will go, when, and the contract he has agreed there.
//!
//! The game keeps the agreement as a transfer offer of its own (see [`TransferOfferLayout`]), whose state says what came
//! of it: 19 is an offer agreed with the player and waiting for the day of the move, 20 one whose move the game has made,
//! 2 and 15 ones that came to nothing (see docs/recon/fm27-transfer-offers.md). The contract he agreed is a
//! `db::FULL_CONTRACT` of the contracts' pool: its team is the club he joins and its start the day the game moves him.
//! The editor reads it and changes that day and the wage he agreed there (the fields `future_transfer.starts` and
//! `future_transfer.wage`, see [`crate::fields`]); it neither makes such an agreement nor takes one away.
//!
//! Neither the offer nor the contract is pointed at by the player: only his running contract is. The offers are found in
//! the pool of offers and the agreed contract in the pool of contracts, by the player's person block (see
//! [`crate::ObjectPool`]). On the Windows Steam build 26577676 the game held 1,700 offers, and 30,000 contracts in the
//! pools of that save; one player's transfer takes a few tens of milliseconds to find.
//!
//! [`TransferOfferLayout`]: crate::profile::TransferOfferLayout

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::object_pool::ObjectPool;
use crate::players::PlayerSummary;
use crate::profile::TransferOfferLayout;
use crate::session::Session;

/// The state of an offer the player has agreed, which waits for the day of the move.
pub const AGREED: u8 = 19;

/// A transfer the player has agreed, for a later day.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FutureTransfer {
    /// The club he joins.
    pub club_uid: Option<u32>,
    pub club: Option<String>,
    /// The day the game moves him: the day the contract he agreed starts.
    pub starts: FmDate,
    /// The day that contract ends, when the game has set one.
    pub expires: Option<FmDate>,
    /// Pounds the buying club pays up front, as the offer holds it; none when it pays nothing.
    pub fee: Option<i32>,
    /// Pounds a week he will be paid, as the contract he agreed holds it.
    pub wage: Option<i32>,
}

/// What the offer the player agreed says, besides the contract it is with.
#[derive(Debug, Clone, Copy)]
struct Agreed {
    buying_team: u64,
    fee: i32,
}

impl Agreed {
    /// The offer in `slot`, the bytes of one slot of the game's pool of offers, when it is one the player whose person
    /// block is at `person` agreed: its buying team and its fee. `None` for a slot of any other offer.
    fn of(slot: &[u8], layout: &TransferOfferLayout, person: u64) -> Option<Self> {
        let word = |at: u64| u64::from_le_bytes(slot[at as usize..at as usize + 8].try_into().expect("8 bytes"));
        let fee = i32::from_le_bytes(slot[layout.fee as usize..layout.fee as usize + 4].try_into().expect("4 bytes"));
        (word(layout.player) == person && slot[layout.state as usize] == AGREED)
            .then_some(Self { buying_team: word(layout.buying_team), fee })
    }
}

impl Session {
    /// The transfer `player` has agreed for a later day; `None` when he has none, or when this build's layout does not
    /// place the game's offers. Only reads memory.
    pub fn future_transfer(&self, player: &PlayerSummary) -> fmlibre_mem::Result<Option<FutureTransfer>> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Ok(None);
        }
        let Some((agreed, contract)) = self.agreed_transfer(player.address, player.shift)? else {
            return Ok(None);
        };
        let c = &self.layout.contract;
        // A contract at the club he is under contract with is a renewal, not a move: the game keeps those in offers too.
        let own = self.process.read_u64(player.address + p.at(p.contract, player.shift))?;
        if is_user_pointer(own) && self.process.read_u64(own + c.team)? == agreed.buying_team {
            return Ok(None);
        }
        let bytes = self.process.read_bytes(contract, c.end() as usize)?;
        let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
        let i32_at = |at: u64| i32::from_le_bytes(bytes[at as usize..at as usize + 4].try_into().expect("4 bytes"));
        // Without a day to start on the game moves him on no day: there is nothing to show and nothing to change.
        let Some(starts) = FmDate::from_raw(u16_at(c.signed), u16_at(c.signed + 2)) else {
            return Ok(None);
        };
        let (club_uid, club) = self.club_of_team(agreed.buying_team);
        let money = |value: i32| (value > 0).then_some(value);
        Ok(Some(FutureTransfer {
            club_uid,
            club,
            starts,
            expires: FmDate::from_raw(u16_at(c.expires), u16_at(c.expires + 2)),
            fee: money(agreed.fee),
            wage: money(i32_at(c.wage)),
        }))
    }

    /// The contract behind the transfer the player whose object is at `address` agreed, for the editor's writes to it
    /// (see [`crate::Session::write`]): `None` when he has agreed none, or when the layout does not place them.
    pub(crate) fn future_transfer_contract(&self, address: u64, shift: u64) -> fmlibre_mem::Result<Option<u64>> {
        Ok(self.agreed_transfer(address, shift)?.map(|(_, contract)| contract))
    }

    /// The day the contract of the transfer he agreed ends, as a number like 20400630, when it has a day to end on: the
    /// move has to come before it, or the contract would end before it starts.
    pub(crate) fn future_transfer_end(&self, address: u64, shift: u64) -> fmlibre_mem::Result<Option<i64>> {
        let Some(contract) = self.future_transfer_contract(address, shift)? else {
            return Ok(None);
        };
        let c = &self.layout.contract;
        let bytes = self.process.read_bytes(contract + c.expires, 4)?;
        let day = u16::from_le_bytes([bytes[0], bytes[1]]);
        let year = u16::from_le_bytes([bytes[2], bytes[3]]);
        Ok(FmDate::from_raw(day, year).map(FmDate::to_number))
    }

    /// The offer `player` agreed and the contract behind it, where the game holds both: the offer of his in state
    /// [`AGREED`] whose buying team the contract is with.
    fn agreed_transfer(&self, address: u64, shift: u64) -> fmlibre_mem::Result<Option<(Agreed, u64)>> {
        let (Some(offers), Some(size)) = (self.layout.transfer_offer.as_ref(), self.layout.contract.size) else {
            return Ok(None);
        };
        // A layout that places more of an offer than a slot of its pool holds is not one this game has.
        if [offers.player, offers.buying_team, offers.fee].iter().any(|&at| at + 8 > offers.size)
            || offers.state >= offers.size
        {
            return Ok(None);
        }
        let person = address + self.layout.player.identity() + shift;
        let pools = self.object_pools();
        let offers_pool: Vec<ObjectPool> =
            pools.iter().filter(|pool| u64::from(pool.slot_size) == offers.size).cloned().collect();
        let Some(agreed) = self.agreed_offer(person, &offers_pool, offers) else {
            return Ok(None);
        };
        let contracts: Vec<ObjectPool> =
            pools.iter().filter(|pool| u64::from(pool.slot_size) == size).cloned().collect();
        Ok(self
            .agreed_contract(person, &agreed, &contracts, size, self.running_contract(address, shift))
            .map(|contract| (agreed, contract)))
    }

    /// The first offer of the pools whose player is the person block at `person` and whose state is [`AGREED`].
    fn agreed_offer(&self, person: u64, pools: &[ObjectPool], layout: &TransferOfferLayout) -> Option<Agreed> {
        pools.iter().flat_map(|pool| pool.chunk_bytes(&self.process)).find_map(|(_, bytes)| {
            bytes.chunks_exact(layout.size as usize).find_map(|slot| Agreed::of(slot, layout, person))
        })
    }

    /// The contract of the pools that is with the buying team of `agreed` and belongs to the person block at `person`:
    /// the first that starts after the game's date, and one that does not when there is none. Where `running` holds the
    /// contract he is on now, only a contract of its class counts, and not itself.
    fn agreed_contract(
        &self,
        person: u64,
        agreed: &Agreed,
        pools: &[ObjectPool],
        size: u64,
        running: Option<(u64, u64)>,
    ) -> Option<u64> {
        let c = &self.layout.contract;
        let today = self.game_date();
        let mut fallback = None;
        for pool in pools {
            for (chunk, bytes) in pool.chunk_bytes(&self.process) {
                for (index, slot) in bytes.chunks_exact(size as usize).enumerate() {
                    let word =
                        |at: u64| u64::from_le_bytes(slot[at as usize..at as usize + 8].try_into().expect("8 bytes"));
                    if word(c.owner) != person || word(c.team) != agreed.buying_team {
                        continue;
                    }
                    let at = chunk + index as u64 * size;
                    if running.is_some_and(|(address, class)| at == address || word(0) != class) {
                        continue;
                    }
                    let u16_at = |at: u64| u16::from_le_bytes([slot[at as usize], slot[at as usize + 1]]);
                    let start = FmDate::from_raw(u16_at(c.signed), u16_at(c.signed + 2));
                    if start.is_some_and(|start| today.is_none_or(|today| start > today)) {
                        return Some(at);
                    }
                    fallback.get_or_insert(at);
                }
            }
        }
        fallback
    }

    /// The contract the player at `address` is on now, with its class, which the contract he agreed shares; `None` when
    /// he has none to compare with.
    fn running_contract(&self, address: u64, shift: u64) -> Option<(u64, u64)> {
        let pointer =
            self.process.read_u64(address + self.layout.player.at(self.layout.player.contract, shift)).ok()?;
        let class = is_user_pointer(pointer).then(|| self.process.read_u64(pointer).ok()).flatten()?;
        Some((pointer, class))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout() -> TransferOfferLayout {
        TransferOfferLayout { size: 0xD0, player: 0x38, buying_team: 0x40, selling_team: 0x50, fee: 0x58, state: 0x8D }
    }

    /// An offer as the game keeps it (see `[transfer_offer]`): the player's person block at +0x38, the team he joins at
    /// +0x40 and +0x48, the one he leaves at +0x50, the fee at +0x58 and the state of the offer at +0x8D.
    fn slot(person: u64, buying: u64, fee: u32, state: u8) -> Vec<u8> {
        let mut slot = vec![0u8; 0xD0];
        slot[0x38..0x40].copy_from_slice(&person.to_le_bytes());
        slot[0x40..0x48].copy_from_slice(&buying.to_le_bytes());
        slot[0x48..0x50].copy_from_slice(&buying.to_le_bytes());
        slot[0x50..0x58].copy_from_slice(&0x2_0000_u64.to_le_bytes());
        slot[0x58..0x5C].copy_from_slice(&fee.to_le_bytes());
        slot[0x8D] = state;
        slot
    }

    #[test]
    fn an_agreed_offer_waits_for_its_day() {
        // A transfer agreed with the player reads with its team and its fee; offers in any other state do not, and
        // neither do the offers of other players.
        let person = 0x1c8_b34a_1900;
        let agreed =
            Agreed::of(&slot(person, 0x1c8_aa85_3988, 10_833_988, AGREED), &layout(), person).expect("an offer");
        assert_eq!((agreed.buying_team, agreed.fee), (0x1c8_aa85_3988, 10_833_988));
        assert_eq!(AGREED, 19);
        for state in [0, 2, 8, 15, 16, 20] {
            assert!(Agreed::of(&slot(person, 0x1c8_aa85_3988, 0, state), &layout(), person).is_none(), "{state}");
        }
        assert!(Agreed::of(&slot(person + 0x10, 0x1c8_aa85_3988, 0, AGREED), &layout(), person).is_none());
    }
}
