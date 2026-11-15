# FM27: where the game keeps a player's career

Notes behind the two pages of a player's profile the app does not read yet: his seasons (Career) and his milestones.
Read on the Windows Steam build 26577676 (FM27, save of 30 May 2030, Chinese game language, Rodri, UID 67217524, at
Barcelona), with `fmlibre-probe`. Nothing here is written to the game: the probe only reads.

**State: the seasons are found and their figures read, but not the links that say whose they are; the milestones are
derived from the seasons, so they wait on the same thing.** This note records what is confirmed and what was ruled
out, so that the next pass does not walk it again.

## What the pages show

- **Career**: one row a season, club and competition — season, competition, club, appearances, goals, assists, times
  in the best XI, average rating, and a total row. The app's page is `PlayerCareerPage` in `app/src/PlayerPages.tsx`,
  which says the figures are not read yet.
- **Milestones**: a timeline by year (awards, cups, best XIs, placings), each with a date. `PlayerMilestonesPage`, the
  same way.

## Not in the person

Rodri's object is at `0x1fae3f70f90`, his person block at `+0x288` (`0x1fae3f71218`, whose `+0x08` reads `30046` and
`+0x0C` his UID).

| Offset | What it holds |
| --- | --- |
| `+0x010` | list of 6 pointers to `sicomps::PLAYER_BOOKING_COUNT` (0x10-byte slots, 0x10 apart): one per competition, this season |
| `+0x100` | a record whose `+0xC0` list holds 6 packed `u64`s, one per competition |
| `+0x108` | a record with nine small lists (`begin, end, capacity`) at `+0x00`, `+0x28`, `+0x30`, `+0x48`, `+0x50`, `+0xF0`, `+0x150`, `+0x190`, `+0x198`; each entry is `{pointer, packed u64, packed u64, word}`, and each pointer leads to a 0x88-byte record of packed `u16` statistics (e.g. `0x1faf810fdb8`) that holds no id |
| `+0x300` | his relations, as `layout.toml` places them |

- `refs` on the person block (span 0x40) found 47 pointers: thread stacks and scratch, none an array of his seasons.
- `pools` has no pool of them. It lists `OBJECT_STORAGE_ENTRY<TEAM_AWARD_HISTORY_ID>` (24-byte slots, 256 slots, 126
  used) and `AWARD_PACKED_MATCH_ID`.
- `instances db::PLAYING_HISTORY` found **0 objects** in 6,299 MiB, though the class has a vtable
  (`game_plugin.dll+0x4db3f18`, which `instances` prints before its pass): the table's rows are not objects of it, so a
  pass over memory cannot find them that way.
- `vtable ?$DATABASE_TABLE@VPLAYING_HISTORY@db@@@db` is `game_plugin.dll+0x4da97f8`, and exactly one object starts
  with it (`0x1f95754d6e0`). It is a **descriptor**, not the table: a GameData path string, a hash map of class
  handlers (`STATS_OUTPUT_MANAGER`, `MUST_MEET_EXPECTATIONS_RULE`, …), and no `(begin, end, capacity)` of rows.

## Where the numbers are

Fingerprints taken from the game's Career page, as `u16` sequences (appearances, goals, assists, best XI):

| Season | Fingerprint | Found at (one hit each) |
| --- | --- | --- |
| 2029/30 | 32, 2, 8, 1 | `0x1faf862990a` |
| 2028/29 | 31, 1, 9, 3 | `0x1fafa20dad2` |
| 2027/28 | 32, 2, 12, 2 | `0x1faf93f11fa` |
| 2026/27 | 30, 3, 10, 2 | in none of the arenas above |

The totals (459 appearances, 34 goals, 37 assists, 8 best XIs, 7.29) are **not** stored: a search for them found
nothing, and the page adds them up itself.

### The row, and the buffer it lives in (2029/30)

- The buffer: `begin` `0x1faf8624ab0`, `end` `0x1faf8646af0` — 0x22040 bytes, about 1024 rows of 0x88 and 0x40 more.
- The row is 0x88 bytes; the stride is **0x88**, from the same field hitting 0x88 apart in a run: in the 2 MiB read at
  `0x1faf8629000`, `(31,1)` sits at `+0xaf7c`, `+0xb004`, `+0xb08c` and `(37,1)` at `+0xaf52`, `+0xafda`, `+0xb062`.
- Rodri's 2029/30 row begins at the buffer's `+0x4E58` (`0x1faf8629908`). Its `u16` fields, the zero ones left out:

  | Offset | Value | Offset | Value |
  | --- | --- | --- | --- |
  | `+0x00` | 40 | `+0x02` | 32 |
  | `+0x04` | 2 | `+0x06` | 8 |
  | `+0x08` | 1 | `+0x0A` | 2 |
  | `+0x1E` | 870 | `+0x50` | 22 |
  | `+0x54` | 27 | `+0x56` | 14 |
  | `+0x58` | 3 | `+0x5A` | 2 |
  | `+0x5C` | 2 | `+0x64` | 3 |
  | `+0x66` | 8 | `+0x78` | 4 |
  | `+0x7A` | 6 | `+0x80` | 301 |
  | `+0x82` | 278 | `+0x84` | 4 |
  | `+0x86` | 4 | | |

  Only `+0x02` to `+0x08` are identified: they are the four figures the page shows for the row. The rest is not.
- The row holds no UID, no person pointer, no club UID (1708, 679 and 1777, Barcelona, Manchester City and Villarreal,
  are nowhere in it), no competition and no season.

### The buffer's header

At `begin - 0x20` (`0x1faf8624a90`): `{pointer 0x1faf86469d0, u16 0x0339, u16 0x0438, u16 12, u16 268, 0,
0x00020000, 12}`, then the same 0x20-byte block again, ending 21. The memory around it holds symbol-like strings
(`Gt_tStRtItPtCtGtLtPtStDtD…`), and the only pointer to the buffer's `begin` in the whole memory is the
`(begin, end)` pair at `0x1faf6efc628`, in that same region of metadata and names. `holders` and `refs` both land
there.

## What that means

The seasons are kept **page-serialized**: dense `u16` fields, no pointers and no ids in the rows, and a typed header
whose descriptors name the fields rather than give their offsets. Reading a row therefore needs the page's field
table, not just a stride; a reader would have to rebuild FM's serialization metadata, and follow it from one patch to
the next. That is a larger piece of work than the two pages, and it was not attempted.

## Where the milestones come from

They are **derived**, as the page's own rows show: `db::AWARD` (the awards) × `YEAR_AWARD_DATA` (one edition a year) ×
`TEAM_AWARD_HISTORY` (a team's honours) × the player's seasons. Without the seasons there is no way to say which
editions were his.

- `db::AWARD`: 3902 objects, vtable `game_plugin.dll+0x4dfa1e8`. A row reads: `+0x0C`/`+0x10` the award's UID as `u32`
  (102406 on the one read), `+0x18`/`+0x20` its colour (RGBA), `+0x30` a string object whose UTF-8 text is its name
  ("世界杯金球奖", the World Cup's golden ball), `+0x48` date pairs, `+0x70` the first of its `YEAR_AWARD_DATA`.
- `YEAR_AWARD_DATA`: vtable `game_plugin.dll+0x4dfc058`, 0xC0 bytes, one after another. `+0x08` points back at the
  award; the dates at `+0x18` onwards are pairs — a day of the year in the low 9 bits, then the year (299 and 2029,
  299 and 2030); `+0x28` holds `1` and `37`.
- `PERSON_AWARD_DATA` (vtable `game_plugin.dll+0x4dfc158`): the class is there, **0 objects** in memory — a person's
  awards are not kept a person at a time.
- `AWARD_WITH_PERSON_TIMELINE_EVENT` (vtable `game_plugin.dll+0x4fde808`): **one object** while the Milestones page is
  open — `+0x18` a person, `+0x20` a team, `+0x28`/`+0x30` dates, `+0x38` an award, `+0x48` another person. The page
  shows dozens of rows, so they are made for the rows on show and released again: not a source either.
  `AWARD_TIMELINE_EVENT` had 0 objects and `PERSON_TIMELINE_EVENT` 3.

## Reproducing what was read

Build 26577676, in-game date 30 May 2030. The commands (a player is named by `--uid`, and a record inside him by
`--record`, so a restart of the game does not change them):

```sh
fmlibre-probe vtable db::AWARD
fmlibre-probe vtable '?$MANUAL_SINGLETON@VAWARD_MANAGER@@@sicore'
fmlibre-probe instances db::AWARD --holds "74 a8 01 04" --span 0x60 --names
fmlibre-probe find "20 00 02 00 08 00 01 00" --as hex --max 3
fmlibre-probe holders 0x1faf8629908
fmlibre-probe refs 0x1faf8624ab0 --span 0x8
fmlibre-probe lists --uid 67217524 --record 0x108 --len 0x700 --depth 1 --words 12
```

`vtable`, and `lists` with `--uid`, `--record`, `--depth` and `--words`, came with this pass (the first names a class's
vtable in a pass over game_plugin alone rather than over memory; the others let a person's records be walked without
quoting addresses that move).

## Open questions

- Which field of the row is which beyond the four the page shows.
- What in the buffer's typed header finds a row's person, club, competition and season.
- Whether a buffer is one season or one competition of one season: 2029/30 sits in one, 2028/29 and 2027/28 in two
  others.
- Whether a person's rows are found through an index kept elsewhere. `30046`, read at his person block's `+0x08`, was
  tried and ruled out: it repeats every 0x18 bytes through a table of other values, so it is not a person's index.
