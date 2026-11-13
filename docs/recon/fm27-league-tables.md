# FM27: where the game keeps a league table

Notes behind the standings page of the app. Read on the Windows Steam build 26577676 (FM27, save of 21 July 2040,
Chinese game language, no club managed), with `fmlibre-probe`. Nothing here is written to the game: the probe only
reads.

## The competitions with a table

A competition is played as a league by a stage: `sicomps::LEAGUE_STAGE` for one that is being played or played,
`sicomps::FUTURE_STAGE` for one that has not started yet. Either points at its competition (`db::COMP`) and at its
settings, at the same places the prize money recon found them (see
[fm27-prize-money.md](fm27-prize-money.md)).

| Class | Offset | What it holds |
| --- | --- | --- |
| `sicomps::LEAGUE_STAGE` | `+0x70` | pointer to the competition (`db::COMP`) |
| | `+0xF0` | pointer to its settings (`sicomps::LEAGUE_SETTINGS`) |
| | `+0xC0` | list of pointers to its teams' records, one per club of the table (20 in a 20-club league) |
| | `+0x140` | a second list of the same records, in another order |
| | `+0x48` | a four-byte stage code, reversed ("gael" for a league stage, "LLUN" for a stage that plays none) |

The stages are found by their class (`rtti::vtables` and `rtti::objects`), which is one pass over the game's memory and
takes about twenty seconds on the build above (5.6 GiB of readable memory). The save had 419 league stages, holding 94
distinct competitions: the five English divisions, Spain, Italy, Germany, France, China, and the continental cups that
play a league phase or groups.

A competition that has no stage in memory has no table either: the Brazilian league (UID 102423) and the Norwegian one
(1300397) had none in that save.

## A team's record

Each entry of the list at `+0xC0` is a pointer to a 0x100-byte record, and the records of a list are 0x100 bytes apart.

| Offset | What it holds |
| --- | --- |
| `+0x08` | five blocks of 0x18 bytes, one after another: all competitions, then what adds up to it in two halves, then two that add up to it in another pair |
| `+0x88` | pointer to the team (`db::TEAM`) |
| `+0x90` | list of `(pointer, u64 matchdays)` pairs, 0x20 bytes each: the team's fixtures in the stage |

A block of 0x18 bytes, the first of them, reads as:

| In the block | Type | What it holds |
| --- | --- | --- |
| `+0x00` | `u16` | goals for |
| `+0x02` | `u16` | goals against |
| `+0x04` | `u16` | points |
| `+0x06` | `u8` | not known (the same byte twice, 15 to 17 a club: the players used, perhaps) |
| `+0x08` | `u8` | matches won |
| `+0x09` | `u8` | matches drawn |
| `+0x0A` | `u8` | matches lost |

Played is the three matches added, and the goal difference is the goals for less the goals against. The five blocks add
up: for one club, 15 matches in the fourth and 1 in the fifth make the 16 of the first, and its 6 home and 4 away
matches are the second and third.

## Checked against the game's table

The Chinese Super League's table was read on the game's screen on 21 July 2040 (UID 130931, 16 clubs) and beside it the
records of the stage's list at `+0xC0`. Every position matched, in the order of the list, and for each of the 16 clubs
the played, won, drawn, lost, goal difference and points as the game printed them:

| Club (position) | Played | Won | Drawn | Lost | Difference | Points | Goals for | Goals against |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zhejiang (1) | 16 | 10 | 5 | 1 | 12 | 35 | 22 | 10 |
| Shanghai Port (2) | 17 | 9 | 5 | 3 | 11 | 32 | 31 | 20 |
| Shandong Taishan (3) | 17 | 9 | 4 | 4 | 12 | 31 | 27 | 15 |
| Wuhan Three Towns (16) | 16 | 1 | 6 | 9 | −16 | 9 | 18 | 34 |

The goals for and against are not printed by that screen; they are the two `u16`s that make the difference it prints
(22 − 10 = 12, 18 − 34 = −16). The other 12 clubs match in the same way.

## What it means

The offsets are in `profiles/fm27/layout.toml` as `[league_table]`, and `standings.rs` reads tables through them. The
block read is the first of the five; what the other four hold (another competition's matches, or another part of the
season) is not known, and nothing reads them.

Not known yet:

- what the five blocks are, beyond the first: read on a save whose clubs play in more than one competition, they look
  like all competitions, two halves of them, and two more that add up to the first;
- whether the list at `+0x140` (the same records in another order) is a second table, and what orders it;
- the Mac build: the block was not read there, so `layout-macos.toml` has no `[league_table]` and the page says its
  tables cannot be read.
