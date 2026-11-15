# FM27: transfer offers, and contracts that are not in force yet

Where the game keeps a bid for a player, the contract he is offered, and a move agreed for a later day. RootTourist
worked it out on the Windows Steam build 26340721 (#81), following eleven players day by day in a VfB Stuttgart save
of July 2028 against the game's screens, and one transfer from the bid to the move. heval99 read it on a second save
of 169,023 players (#117). It was read again on the Windows Game Pass build 0.9.2435.0, on a save of 12 January 2028:
633 offers and 1,045 entries, joined to each other and to the players' running contracts.

The editor now reads the offers and the contracts of transfers agreed for a later day (see "What the editor reads"
below), and writes the start and the wage of such a contract. Everything else here was read, not written to.

## A contract that is not in force yet

Every contract offered or agreed is an object of its own: a `db::FULL_CONTRACT`, or a `db::LOAN_CONTRACT` for a loan,
laid out as a running contract (the player's person block at `+0x08`, the team at `+0x10`, the wage at `+0x20`, the
start at `+0x44`, the end at `+0x48`, the squad status at `+0x54`, the kind at `+0xC3`). The player points only at
his running one (`+0x330`). `fmlibre-probe instances db::FULL_CONTRACT --holds <his person block> --span 0x10` finds
them all.

Jordy Makengo of Freiburg had three on the Game Pass save: his running contract (43,188 a week, since 19.2.2027, to
30.6.2031), the one Stuttgart offered him after Freiburg took their bid of 11,096,419 (44,082 a week, from 9.1.2028 to
30.6.2031), and a new one from Freiburg (51,138 a week, from 10.1.2028 to 30.6.2032).

## The entries

Each such contract is held by an entry of `0x48` bytes. The entries lie one after another in one run of memory.

| Offset | Type | What it holds |
| --- | --- | --- |
| `+0x00` | `u32` | 1 in every entry |
| `+0x10` | pointer | the contract; null in many entries (360 of the 1,045 on Game Pass), which are to be left out |
| `+0x20` | pointer | set only when the human manager's club is the one the player would join (RootTourist); set in none with a contract on Game Pass |
| `+0x28` | `i32` | the number of the transfer offer it came from (`FULL_TRANSFER_OFFER +0x5C`); -1 for a contract at his own club |
| `+0x3E` | `u8` | state: 1 offered, 2 agreed and waiting for its day, 3 turned down or lost; 4 in two entries |
| `+0x3F` | `u8` | 1 in every entry |
| `+0x40` | `u8` | 0 while offered and once lost, 1 once agreed (2 in 23 agreed entries, 5 in one) |
| `+0x41` | `u8` | kind (below) |

The kinds, with the 685 entries that have a contract on Game Pass:

| `+0x41` | What it is | Entries | What they hold |
| --- | --- | --- | --- |
| 8 | a contract at his own club: a renewal, a youngster's first professional contract | 396 | all with his own club, none with an offer's number |
| 7 | a move without a fee | 103 | all with another club; the offer has no selling team in any, a fee in one |
| 2 | a transfer | 31 | all with another club; the offer has a selling team, and a fee in 25 |
| 1 | a loan, and also a transfer | 104 | 20 loan contracts; 83 full contracts with another club, Makengo's among them |
| 6 | not clear | 51 | 20 with his own club and no number, 17 with another club, 14 for players without a club |

- RootTourist had 1 as a loan and 2 as a transfer with a fee. On Game Pass 1 is on bids with a fee too, so a loan is
  told by the class of the contract, not by the kind. What separates 1 from 2 is not known.
- Kind 6 is from heval99: 980 entries on his save, 657 of them without a contract; the rest mostly non-contract
  terms (kind of contract 4, a wage of £0 to £800, often no end date) and a move to another club (303 of 323). On Game
  Pass 195 of 246 have no contract, and the others are full-time as often as non-contract.
- The entries without a contract are all in state 2, of kinds 6, 1, 2 and 7.

The contracts of the entries in state 2 start in the future: 453 of 454 on Game Pass start after the game's date.

## What happens, day by day

From RootTourist's eleven players:

1. A new offer (a renewal, a transfer or a loan) shows up as an object only after the next day is processed, in
   state 1.
2. A bid to the human manager's club is not a contract while he decides.
3. When an offer is accepted, the offered contract itself becomes the running one: the player points at it, its
   start is rewritten to the day it is completed, the entry is gone and so is the old contract. Seen on two renewals,
   two transfers and two loans, the object at the same address before and after.
4. Offers that lost stay in memory in state 3: six for one player, two for another.
5. A transfer agreed for a later day waits in state 2 with its start already the day of the move. Two players moved
   on that day and then had one contract, with the wage and dates of the state 2 object.

So a player has a move agreed for a later day when an entry in state 2 of a kind other than 8 holds a contract of
his: the new club is the contract's team, the day its start, the wage its wage. State 2 with kind 8 is an agreed
contract at his own club.

## The transfer offer

Class `FULL_TRANSFER_OFFER` (no `db::`), `0xD0` bytes apart; its vtable is `game_plugin.dll+0x4f3b2e8` on Steam
26340721 and `+0x4c26c48` on Game Pass 0.9.2435.0. RootTourist's save held about 4,650 to 4,900, heval99's 10,893,
the Game Pass one 633. `fmlibre-probe instances FULL_TRANSFER_OFFER --holds <person block> --span 0x40` finds the bids
for one player.

| Offset | Type | What it holds |
| --- | --- | --- |
| `+0x08` | `u32` | 1; 2 on some finished offers (RootTourist: after completion; 27 on Game Pass, in states 15 and 20) |
| `+0x38` | pointer | the player's person block |
| `+0x40`, `+0x48` | pointers | the buying team, twice (the same in 606 of the 633) |
| `+0x50` | pointer | the selling team; null for a player without a club (331) |
| `+0x58` | `u32` pounds | the fee paid up front |
| `+0x5C` | `u32` | the offer's number, which the entry of its contract holds at `+0x28` |
| `+0x60` | `u32` | a count of the offers made in the save: 1 for one of 30 November 2024, 3,887 for the newest |
| `+0x6C` | date | the day after `+0x70` on open offers, a week after it on accepted ones, unset on most finished ones |
| `+0x70` | date | RootTourist: the day of acceptance, then the day of the move; open offers already hold the day they were made |
| `+0x74` | date | the day the offer was made |
| `+0x78` | date | a later day, often a month after the offer |
| `+0x8D` | `u8` | state (below) |
| `+0xA8` | pointer | how the fee is paid (below); null for most offers without a fee |

The number at `+0x5C` is not a count: numbers come back (the newest offer on Game Pass is 536, one of September 2027
is 1,596), so an entry is matched to its offer by the number and the player together. That way 206 of the Game Pass
entries found their offer.

| `+0x8D` | What it is | On Game Pass | The entry of its contract |
| --- | --- | --- | --- |
| 0 | open: the selling club has not answered | 5 | none yet |
| 2 | turned down by the club, or lost | 48 | |
| 8 | accepted by the club; the player has the contract to answer | 12 | state 1 (11 matched) |
| 19 | agreed with the player, waiting for the day of the move | 51 | state 2 (51) |
| 15 | not named before: the contract came to nothing | 143 | state 3 (141) |
| 20 | completed | 370 | gone (one left, in state 3) |
| 16 | not known | 2 | state 4 (2) |
| 3 | not known | 2 | |

## How the fee is paid

The record behind `+0xA8` holds three `(begin, end, capacity)` lists, at `+0x00`, `+0x18` and `+0x30`. On Game Pass
240 of the 273 offers with a fee have the record, and 2 of the 360 without.

- **Instalments** (`+0x00`), entries of 12 bytes: `u32` the whole amount, `u8` the months it is paid over, a `u8`
  mark, and at `+0x08` a `u8`, the months between two payments (6 or 12). RootTourist's case: 31,859,970 over 24
  months, every 12, which the game shows as "£32,000,000 over 2 Instalments (12 monthly)" in the bid and as £15.93M
  a payment after the move. Every list read on Game Pass has one entry.
- **Add-ons** (`+0x18` and `+0x30`), entries of 8 bytes: `u32` an amount, `u8` a number, and the same `u8` mark.
  RootTourist saw 10,000,000 with 20 on a bid the game showed with "after 20 international appearances". On Game
  Pass the numbers at `+0x18` are such as 20, 25, 50, 75 and 80, and at `+0x30` 1, 3 and 10. Which list is paid
  after what is not known.
- **The mark** is 0 or 1 on an open or accepted offer and `0x7F` on a finished one (states 2 and 20). The amounts
  of RootTourist's bid with `0x7F` did not match its screen, so a finished offer's amounts may not be what was
  offered.
- The amounts are exact pounds, and the screen rounds them (a fee of 35,046,002 shows as £35M): looking for the
  number the screen shows does not find the bid.

## When the move is completed

From RootTourist's one case, Bilal El Khannouss from Stuttgart to Al Ittihad: the contract Al Ittihad offered is his
running contract, its start rewritten from the day of the offer to the day of the move, and Stuttgart's is gone. The
offer stays in memory in state 20; a bid from Brighton that was turned down keeps state 2. His transfer value
(`player +0x234`) was set on acceptance to 66,906,004: the fee and the instalments (66,905,972), within 32.

## Not known yet

- What holds the run of entries. They were found from the one pointer to a contract known to be an offer, then
  followed in both directions.
- Kind 1 against kind 2, and kind 6. Offer states 3 and 16, entry state 4. The offer's `+0x6C` and `+0x78`, and its
  `+0x30` (mostly `0x10000000`, `0x10000040` or `0x40`).
- Which of the two add-on lists is which, and where a sell-on share and the solidarity payments are kept.
- A bid to the human manager's club while he decides: RootTourist found no contract for it, and thought of
  `db::TRANSFER_INFO` or `db::EXTRA_TRANSFER_PAYMENT_INFO` for the fee.
- The kinds of contract 9 and 13, which only contracts not yet in force hold (see `fm27-contracts.md`).
- Changing any of it: whether the game takes a changed fee, day or wage, or an entry taken out.

## What the editor reads

Read again on the Windows Steam build 26577676, on a save of 20 February 2027, with `fmlibre-probe` and a scratch
tool; the offsets are in `profiles/fm27/layout.toml` under `[transfer_offer]`.

- The offers are in a pool of their own, in slots of `0xD0` bytes, which `[pool]` and `[transfer_offer] size` place.
  That save held 1,700 of them, in every state named above: 0 (7), 2 (67), 8 (11), 14 (2), 15 (254), 16 (12), 19 (112)
  and 20 (445) among the ones whose player the lists know.
- **An offer in state 19 is a transfer the player has agreed and waits for its day.** The contract behind it is a
  `db::FULL_CONTRACT` of the contracts' pool, owned by him (`+0x08`) with the offer's buying team (`+0x40`) as its team
  (`+0x10`): 112 offers, each with exactly one such contract. Finding both takes the editor a few tens of milliseconds:
  it reads the pool of offers, and the pool of contracts only for a player who has one.
- **The move happens on the contract's start (`+0x44`), not on the offer's dates.** Alexander Sørloth (Atlético →
  PSV, start 4 January 2027) and Javairo Dilrosun (Al Sadd → Utrecht, the same day) were in state 19 on 30 December
  2026; by 5 February both were at the club their contract named and their offers were in state 20. Their `+0x70` held
  the day of the move only once it was made: on the 112 waiting offers it was unset.
- `future_transfer.rs` reads the player's offer in state 19 and the contract behind it, and shows the club, the day,
  the contract's end and wage, and the fee of the offer (`+0x58`). `edit.rs` writes the contract's start (the field
  `future_transfer.starts`) and its wage (`future_transfer.wage`); it writes no other part of an offer or an entry.

### Still to find

- Whether the game takes a changed start or wage of an agreed transfer: nothing has been written to a save and played on
  to see the move happen. The editor writes the start only between the day after the game's date and the day before that
  contract ends, and reads every write back.
- What the game's own words for a pending move read. On 30 May 2034 a start was moved from 15 May 2035 to 28 May 2048 and
  read back as written, while the tooltip on the player's transfer tag still said 15 May 2035. Nothing in the process holds
  a pointer to the agreed contract (a search for its address found no hit anywhere, while the offer is found by owner and
  buying team as the editor does), so a second copy to write instead is unlikely; the tooltip is more likely the text the
  game wrote when the deal was struck. That write also left the contract ending a decade before its start: the editor now
  refuses a day on or after the contract's end, since the move happens on that start.
- Taking an agreement away, or making one: which byte stops a move (the entry's state at `+0x3E`, its `+0x40`, the
  offer's `+0x8D`), and what makes the game agree a contract for a later day. The editor offers neither.
- An agreed loan for a later day: its contract is a `db::LOAN_CONTRACT`, in a pool of another slot size, which the
  editor does not look in, so it shows no future loan as a future transfer.
- Offers in state 2 and 14: what they are, and whether the game moves anyone on them.
