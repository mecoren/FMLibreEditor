# FM27 Game Pass build 0.9.2355.0 (Launch Preview)

Observed on 2026-10-30 from the installed package
`SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm`
under `C:\Program Files\WindowsApps\`. The full release (2026-11-10) will be a
different build; re-check everything here against it.

## Install

- GDK (MSIXVC) package: `MicrosoftGame.config`, `gamelaunchhelper.exe`,
  `libHttpClient.GDK.dll`, `PlayFabMultiplayerGDK.dll`, `Party.dll`, `XCurl.dll`.
- Entry point `GameLaunchHelper.exe` (`runFullTrust`, not an AppContainer); the
  running process is `fm.exe`.
- `fm.exe` cannot be read from disk (ACL protected). Every other file can, which is
  all the editor needs.

## Engine

- Unity `6000.3.18f1-custom`, IL2CPP backend.
- `fm_Data/il2cpp_data/Metadata/global-metadata.dat`: not encrypted, metadata
  version 39 (`AF 1B B1 FA 27 00 00 00`). The original Il2CppDumper rejects v39; use
  Cpp2IL or a v39 fork.
- Managed names are not obfuscated (`SI.UI`, `SI.Bindable`, `FM.GamePlugin`,
  `SI.Interop`, `FM.Match`, ...).
- `GameAssembly.dll` exports 241 `il2cpp_*` API functions.
- `fm_Data/il2cpp_data/il2cpp.usym` (87 MB) ships too.

## Native game core: `fm_Data/Plugins/x86_64/game_plugin.dll`

- 423 MB on disk. Section names are rewritten and code sits outside `.text`
  (`.text` 4 KB, `.debug` 327 MB, `.trace` 78 MB, `.xpdata`, `.xtext`, `.xtls`,
  `.sdata`, `.sbss`, ...): anti-tamper protection. FM26 used Denuvo.
- The Steam build of the same module uses different section names (`.srdata`,
  `.arch`, `.sdata`, `.code` per fm-editor's notes), so it is a different binary.
- 282 exports. The UI talks to the core through an `IGamePlugin` interface
  (`Initialise`, `Tick`, `OpenChannels`, `PerformChannelActions`, `SendEvent`,
  `UpdateChannelData`, `Shutdown`) and receives data through `IPluginDataReceiver`
  callbacks (`SendDataResponse`, `SendEvent`), plus `get_*_layout_signature`
  exports for marshalling checks. The managed side only mirrors what the UI shows;
  the full database is on the native heap.
- Export `game_plugin_plugin_build_timestamp` may serve as a build fingerprint.

## Steam reference layout (from fm-editor)

From [fm-editor's FM27 notes](https://github.com/barak14/fm-editor/blob/main/docs/fm27/memory-layout.md)
(Steam build; GPL-3.0-or-later). Entities live in heap arrays referenced by
`(begin, end)` pointer pairs in a writable section of `game_plugin.dll`; objects are
told apart by vtable.

| What | Steam RVA |
|---|---|
| Players `(begin, end)` | `0x57037D0` |
| Staff `(begin, end)` | `0x5703818` |
| Clubs `(begin, end)` | `0x5703988` |
| Plain player vtable | `0x4D27228` |
| Player-coach vtable | `0x4F75A08` |
| Real club vtable | `0x4CDA1F8` |

Expected on Game Pass: different RVAs and vtables (different binary), probably the
same field offsets inside objects (same source). Field offsets such as the player
UID at `+0x294` and the person block at `+0x288` are the first things to verify.

## Game Pass findings

### Attaching (`fmlibre-probe info`)

- `OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ)` on the Game Pass
  `fm.exe` works **without administrator rights**.
- The running executable lives in the folder chosen in the Xbox app, here
  `D:\Games\Football Manager 27\Content\fm.exe`, not under `WindowsApps`. The
  package identity (`GetPackageFullName`) and `MicrosoftGame.config` next to the
  exe still identify the build as Game Pass.
- `fm.exe`, `UnityPlayer.dll` and `GameAssembly.dll` load at start-up;
  `game_plugin.dll` loads later, during start-up loading.

### `game_plugin.dll` as mapped

Size of image `0x19436000`. Section table read from memory:

| Section | RVA | Size | Access |
|---|---|---|---|
| `.trace` | `0x1000` | `0x4a96000` | R-X (code) |
| `.xpdata` | `0x4a97000` | `0xb50000` | R-- (vtables live here) |
| `.ecode` | `0x55e7000` | `0x100000` | RW- (entity array pairs live here) |
| `.xdata` | `0x56e7000` | `0x19b000` | R-- |
| `.sxdata` | `0x5884000` | `0xd000` | RW- |
| `.debug` | `0x58e7000` | `0x13812ea8` | RWX (protector) |

Plus small `.udata`, `.sdata`, `.bss`, `.rdata`, `.impdata`, `.xtext`, `.text`,
`.link`, `.tls`, `.xtls`, `.rsrc` and `.sbss` sections. Writable memory in the
module: 84 regions, 313 MiB.

The `game_plugin_plugin_build_timestamp` export points into `.debug` and starts
with `call`/`jmp`: it is code, so it cannot serve as a data fingerprint. Use the
package version instead.

### Entity arrays (`fmlibre-probe scan`)

The scan took 2.3 s (debug build) and found 20 arrays, all with their
`(begin, end)` pairs in `.ecode`. The cluster sits at the same relative offsets as
on Steam, shifted as a block by `-0x81A10`.

| Array | Steam RVA | Game Pass RVA | Elements | Vtables (Game Pass RVA × count) |
|---|---|---|---|---|
| People | — | `0x5681DA8` | 88,630 | `0x4cd47f8` ×59,130, `0x4d39378` ×29,324, `0x4f1f208` ×174, `0x4c6e218` ×2 |
| Players | `0x57037D0` | `0x5681DC0` | 59,304 | `0x4cd4318` ×59,130 (player), `0x4f1ed28` ×174 (player-coach) |
| Players (second list) | — | `0x5681DD8` | 59,304 | same as players |
| Staff | `0x5703818` | `0x5681E08` | 29,500 | `0x4d39358` ×29,324, `0x4f1ed0c` ×174, `0x4c6e1fc` ×2 |
| Clubs | `0x5703988` | `0x5681F78` | 31,233 | `0x4c87b68` ×31,227, `0x4f0e3f8` ×6 |

The people array points at the person sub-object at player `+0x2B0` (vtable
`0x4cd47f8`), the players array at the player object itself. Other arrays in the
cluster (teams, club subsets, about 3.7k objects of vtable `0x4ad55c8`) are not
identified yet. Element counts depend on the leagues loaded in the save.

### Player layout: same as Steam

Verified with `fmlibre-probe column game_plugin.dll+0x5681dc0 0x294 --find <UID>`:
Lionel Messi (UID 7458500) is element 360 and Erling Haaland (UID 29179241)
element 6975 of the players array, both at the Steam offset.

| Offset | Content |
|---|---|
| `+0x288` | person block vtable (`0x4cd4848`) |
| `+0x294` | UID (`u32`); `+0x298` holds the same value again |
| `+0x2B0` | person sub-object vtable (`0x4cd47f8`) |
| `+0x2C8` | full name: pointer to an FM string |
| `+0x2D8` / `+0x2E0` | first / last name: pointer to a name-table entry |
| `+0x2E8` | common name entry, null when there is none |

FM strings are a `u32` byte length followed by NUL-terminated UTF-8 text, packed in
a pool (pointers are only 4-byte aligned). Messi's full name reads
`Lionel Andrés Messi Cuccittini`. A name-table entry starts with a pointer to its
FM string, then a `u32` id; entries are 24 bytes apart.

More player fields, checked on Messi's object against the Steam offsets:

| Offset | Content | Messi |
|---|---|---|
| `+0x150..+0x15E` | 15 position ratings, 1–20 | AMR 20, AMC 19, ST 19, MR 12 |
| `+0x15F..+0x194` | attributes, raw 0–100, shown as `(raw + 2) / 5` | dribbling 97 → 19, left foot 100 → 20, work rate 28 → 6 |
| `+0x25E` / `+0x260` / `+0x262` | home / current / world reputation (`u16`) | 9838 / 8750 / 8750 |
| `+0x264` / `+0x266` | current / potential ability | 170 / 200 |
| `+0x2F8..+0x2FF` | personality, 1–20 | ambition 18, pressure 19 |
| `+0x310` | date of birth: `u16` day of year (1-based) + `u16` year | 175, 1987 → 24 June 1987 |

More fields, read with `fmlibre-probe player 7458500`:

| Offset | Content | Messi |
|---|---|---|
| `+0x22E` | height in cm (`u16`) | 171 |
| `+0x238` | asking price in pounds (`i32`), -1 when not set | -1 |
| `+0x3BC` / `+0x3BE` | international caps / goals (`u16`) | 207 / 125 |
| `+0x3C0` / `+0x3C1` | U21 caps / goals (`u8`) | 18 / 14, his real U20 record |
| `+0x330` | contract pointer | see below |

`+0x234` reads 300,000,000 for Messi, so it is not the market value fm-editor's
FM26 notes suggest; left unmapped.

Contract fields (from the contract pointer), checked on Messi:

| Offset | Content | Messi |
|---|---|---|
| `+0x08` | pointer back to the player's person block (`player+0x288`) | ✓ |
| `+0x20` | wage, pounds per week (`i32`) | 404,321 |
| `+0x44` | signed (date) | 1 Dec 2025 |
| `+0x48` | expires (date) | 31 Dec 2028 |
| `+0x4C` | joined the club (date) | 15 Jul 2023, his real Inter Miami signing date |
| `+0x54` | squad status (`u8`) | 1 (star player) |
| `+0x57` | listing flags: bit 0 transfer, bit 1 loan | 0 |
| `+0x5D` | squad number (`u8`, 255 = none) | 10 |

FM stores unset dates as zero or as days in 1900 (a rolling contract "expires"
1900-01-02); the decoder treats both as no date.

### In-game date

The current in-game date sits in static data right after the entity-array cluster,
at RVA `0x5682608` = players pair `+0x848`: a `u16` day of year with a flag in the
high bit (`0x80C7` → day 199) and a `u16` year (2026), i.e. 18 July 2026 in the
test save. Confirmed with `fmlibre-probe find "18 Temmuz 2026"` and
`find "18 Tem"`: the game's UI strings read "18 Temmuz 2026" and "Cts 18 Tem"
(18 July 2026 is a Saturday), and there is no trace of the other candidate.

That other candidate, RVA `0x56823F8`, is a real-world timestamp, not the game
date: 14 October 2026, next to a 64-bit count of milliseconds since 0001-01-01
reading 2026-10-14 11:13:04, probably when the database was built.

### Player-coaches

174 objects in the players array have their own vtable (`0x4f1ed28`). In them the
person block, everything from `+0x288` on, sits `0xF8` further: the UID is at
`+0x38C`, the full name at `+0x3C0`, and so on. Fields before `+0x288` (team,
positions, attributes, height, reputations, CA/PA) do not move. Verified with Paul
Ifill (UID 109160, born 20 October 1979, player-coach at Greytown AFC). The reader
works out the shift once per vtable by trying each candidate and keeping the one
under which the name decodes, so no build-specific vtable is needed.

### Staff

Staff offsets follow fm-editor's FM27 notes and read correctly on Game Pass
(`fmlibre-probe staff`, `staff-member <id>`):

| Offset | Content |
|---|---|
| `+0x10..+0x43` | attributes: raw 0–100 ones such as attacking `+0x32`, tactical `+0x37`, judging potential `+0x2D`; ratings stored as shown, such as authority `+0x14`, working with youngsters `+0x1C` |
| `+0xD4` / `+0xD6` / `+0xD8` | home / current / world reputation |
| `+0xDA` / `+0xDC` | CA / PA |
| `+0x100` | start of the person block (a contract's `+0x08` points here) |
| `+0x10C` | staff id (`u32`) |
| `+0x140` / `+0x150` / `+0x158` / `+0x160` | full name / first / last / common name |
| `+0x168` | nation pointer |
| `+0x170` | personality, 8 ratings |
| `+0x188` | date of birth |
| `+0x1A8` | contract pointer: the same record as a player's, with the employer's team at `+0x10` and a `u8` job code at `+0x26` |

Witnesses: Mikel Arteta (manager, Arsenal, £375,000 a week until 30 June 2030,
joined 19 December 2019), Hansi Flick (manager, Barcelona, £99,218 a week), Enzo
Maresca (manager, Manchester City), Alex Ferguson (director, Manchester United).
Pep Guardiola, Jürgen Klopp and Antonio Conte have no contract. Job code 70 is
"president" (Giuseppe Marotta at Inter, Florentino Pérez at Real Madrid).

The human manager's class keeps the whole person block `0x340` further, including
nation (`+0x4A8`) and contract (`+0x4E8`), not only the identity fields fm-editor
lists. The reader detects the shift per vtable, as for player-coaches. The same
class also holds an account placeholder with no birth date, nation or contract;
the reader skips it.

### Clubs

`fmlibre-probe clubs` reads 31,227 clubs in 0.3 s (debug build); the six entries
without a name share the array but are not clubs, and are skipped. Checked on
Tottenham Hotspur (UID 728) against fm-editor's Steam witnesses:

| Where | Content | Spurs |
|---|---|---|
| club `+0x0C` | UID (`u32`) | 728 |
| club `+0xC0` / `+0xC8` | full / short name (FM strings) | Tottenham Hotspur / Tottenham |
| club `+0xB9` | women's club flag | 0 |
| club `+0x18` → `[0]` `+0xA8` | reputation, on the senior team (`u16`) | 7650 |
| club `+0x100` → `+0xC0` / `+0xD8` / `+0xF8` | season tickets / founded / social followers | 50,000 / 1882 / 6,835,276 |
| info `+0x106..+0x10B` | supporter mix, % | 10 / 37 / 15 / 19 / 5 / 14 |
| info `+0x114..+0x119` | supporter traits, 1–20 | 18 / 14 / 7 / 14 / 7 / 14 |
| info `+0x120` / `+0x12B` / `+0x12C` / `+0x12D` | training / youth facilities / youth coaching / youth recruitment | 20 / 20 / 16 / 16 |
| club `+0x150` → `+0x0C` | balance (`i32` pounds) | 161,320,637 |
| finance `+0x7C4` | transfer budget | 24,250,000 |
| finance `+0x808` / `+0x814` | total / spending wage budget per week | 4,627,024 / 4,438,849 |
| finance `+0x864` | average ticket price (`f32` pounds) | 65 |
| finance `+0x8A9` | corporate facilities | 20 |

More reputations and founding years: Manchester City 9150 / 1894, Arsenal 8950 /
1886 (both as on Steam), Barcelona 9100 / 1899, Real Madrid 9100 / 1902.

Only clubs in the leagues being played have the full finance record; the others use
a smaller class that ends before the budget fields. The reader keeps finances only
when the ticket price, budgets and corporate rating look like a real club's.

### Staff and club layouts

`fmlibre-probe calibrate` decodes 100% of sampled staff (name-table entries at
`+0x150` / `+0x158`) and clubs (name at `+0xC0`), both with and without the build
profile (`--scan`). Clubs are reached from players through the team pointer at
`+0x130` and `team+0x30`; nations through `+0x2F0` with the name at `nation+0x18`.
Nation names come from the game's own translations, so they follow the game
language (e.g. `Arjantin` in a Turkish game).

`fmlibre-probe players` reads all 59,304 players in 0.5 s (debug build).

### Writing

`fmlibre-probe set` opens the process with `PROCESS_VM_WRITE | PROCESS_VM_OPERATION`
on top of the read rights. Like reading, this works on the Game Pass build without
administrator rights. Every write goes through `WriteProcessMemory`, and only after
these checks:

- The whole range lies in one region of committed, private, writable,
  non-executable memory, that is the game's heap. Module images, including code and
  the `.ecode` array pairs, are refused before Windows is asked, because
  `WriteProcessMemory` would otherwise lift a page's protection to write it.
- The object at the address still carries the target's UID.
- The new value is in the field's range, and the current value is plausible for the
  field. If it is not, the layout does not fit this object and nothing is written.
- The value is read back afterwards. If it differs, the old value is put back.

`fmlibre-probe fields player --stats` reads every object and checks each field
against its range. All 59,304 players and 29,499 staff hold plausible values in every
field. Every player rates 1 as a sweeper (`+0x151`): the game no longer uses that
position, so it is not offered for editing.

Each editable field has two confirmations: the offset from fm-editor's Steam notes,
and a live read on this build matching known data, such as Messi's ratings above,
Paul Ifill's player-coach record and Mikel Arteta's staff profile.

These values were written, read back and restored on the test save with
`set ... --restore`:

| Who | Field | Old → new → restored |
|---|---|---|
| Lionel Messi | finishing (raw) | 85 → 90 → 85 |
| Lionel Messi | current / potential ability | 170 → 171 → 170 / 200 → 199 → 200 |
| Lionel Messi | ambition, international caps (person block) | 18 → 17 → 18 / 207 → 208 → 207 |
| Lionel Messi | DC rating | 1 → 15 → 1 |
| Paul Ifill (player-coach, shift `0xF8`) | ambition, international caps | 13 → 20 → 13 / 10 → 3 → 10 |
| Mikel Arteta (staff) | tactical (raw), authority, ambition | 80 → 99 → 80 / 16 → 19 → 16 / 18 → 1 → 18 |

It has not been checked yet whether the game's own screens show an edited value.

### Writing contracts and clubs

These fields sit in records reached through pointers. A write follows a pointer only
to a record that checks out:

- **Contracts (players and staff):** the contract's `+0x08` must point back at the
  owner's person block, including its shift. All checked cases pass: Messi,
  Arteta, and the player-coach Paul Ifill, whose person block is shifted by
  `0xF8`.
  - 6,795 players and 12,606 staff have no contract that passes this check. They
    are free agents and the unemployed.
  - A contract end the game has not set (a rolling contract) is left alone.
  - Dates are written with the flag bits the game keeps above the day.
- **Club reputation:** it is on the senior team. The team's `+0x30` must point back
  at the club.
- **Facilities:** they are in the club's info record, a plain struct without a
  vtable.
  - Training facilities read 1–20 for every club.
  - The youth fields read 255 for a few hundred clubs. 255 looks like "not set", so
    those fields are not plausible and not offered there.
- **Finances:** only clubs in the leagues being played have the full finance record;
  the rest use a smaller class that ends before the budgets.
  - The full class is the vtable shared by the records whose values look real. On
    this save that is 274 clubs, one class.
  - A finance write needs that class and real-looking values, so a club outside
    the played leagues (Kayserispor here) is refused.

These values were written, read back and restored on the test save with
`set ... --restore`:

| Who | Field | Old → new → restored |
|---|---|---|
| Lionel Messi | wage per week | 404,321 → 404,322 → 404,321 |
| Lionel Messi | contract end | 2028-12-31 → 2029-06-30 → 2028-12-31 |
| Mikel Arteta | wage per week, contract end | 375,000 → 400,000 → 375,000 / 2030-06-30 → 2031-06-30 → 2030-06-30 |
| Tottenham Hotspur | reputation | 7650 → 7651 → 7650 |
| Tottenham Hotspur | training, corporate facilities | 20 → 19 → 20 |
| Tottenham Hotspur | balance | 161,320,637 → 200,000,000 → 161,320,637 |
| Tottenham Hotspur | transfer budget | 24,250,000 → 50,000,000 → 24,250,000 |
| Tottenham Hotspur | wage budget, total wage budget | 4,438,849 → 5,000,000 → 4,438,849 / 4,627,024 → 5,000,000 → 4,627,024 |

These were refused, and nothing was written:
- Kayserispor's transfer budget (no full finance record);
- Paul Ifill's unset contract end;
- 30 February as a date;
- 21 as training facilities.

### Mass edits

How a mass edit works:
- **Planning:** a mass edit is planned from the values the game holds when it is
  previewed.
- **Applying:** each change is then written only if the game still holds the
  previewed old value, so nothing written after the preview is overwritten.
- **Undo:** works on the whole batch.
- **Restoring:** a value being undone only has to be plausible, not in the range the
  editor writes, so a database value outside that range, such as a negative
  potential ability, can go back.

These were tried live on the test save through the release app's commands:
- **Tottenham Hotspur's 81 players:** finishing +2 (shown) and CA +1 gave 162
  changes. They were applied, read back and undone as one batch, and every value
  ended as it started.
- **Messi:** his contract end was set.
- **Tottenham:** its transfer budget was doubled.

These were refused:
- a selection of all 59,304 players (over the limit);
- a preview replaced by a newer one;
- adding to a date.

### Nations and graphics packs

- **Nation UID:** a nation object holds its UID at `+0x0C`, with its name at `+0x18`,
  the same layout as a club's. Messi's nation reads 1649, the UID graphics packs give
  Argentina's flag.
- **Graphics packs:** they live in
  `Documents\Sports Interactive\Football Manager 27\graphics`. Each folder's
  `config.xml` maps picture files to what they show:
  - `<record from="TCM1_728" to="graphics/pictures/club/728/logo"/>` is Tottenham's
    logo, from the same folder;
  - `from` can also name a file in a subfolder, e.g. `africa/alg` for a flag;
  - faces map to `graphics/pictures/person/<uid>/portrait`.
- **On the test machine:** the "Logos TCM26" pack gives 68,131 club logos, 250 flags
  and 5,802 competition logos, read in 0.2 s. Among the 200 best players, every club
  had a logo and every nation a flag.

### Squad lists and moving players between clubs

Mapped with the probe's `refs` (every pointer to an object), `holders` (the arrays
that hold an address), `lists` (the arrays inside an object) and `squads`.

- **Teams:** a club's `+0x18` is a `(begin, end, capacity)` vector of its teams; the
  first is the senior team. A team object is `0xB8` bytes:
  - `+0x08`: its id and its club's UID;
  - `+0x30`: the club;
  - `+0x38`: the player list, as `(begin, end, capacity)`;
  - `+0xA8`: the reputation.
- **Who is in a team's list:** the players under contract with the team, those
  out on loan included, and the players on loan to it. Every player with a team is
  in that team's list. A youngster who plays for the U18 side while under contract
  with the senior team is in the U18 list, and sometimes in the senior list too.
- **Pointers:** a player's `+0x130` points at the team he plays for. His contract's
  `+0x10` points at the team that employs him, and `+0x18` at the employer's senior
  team.
  - The two contract pointers differ only for player-coaches, 766 of them.
  - A player on loan has a second contract, of another class, with the club he is
    on loan to.
- **References:** for a player at an AI club, everything else that points at him is
  game-wide (the people arrays), national squads, or match records. A player at the
  human manager's club is also pointed at by its tactics, training and similar
  records: 53 references for Youri Tielemans, against 21 for Mohammed Kudus at
  Tottenham.

**The allocator.** List buffers have no header. They sit in blocks of fixed size
classes, and the bytes from a list's end to its block's end are zero. Across the
5,881 non-empty team lists of the test save:
- 19 or 20 pointers sit in 160-byte blocks, then 192, 224, 256, 288 and 320;
- from 41 pointers the classes go up in steps of 64 bytes, to 512;
- capacity equals length for nearly every list. In 374 lists the capacity was
  above the length.

`profiles/fm27/layout.toml` keeps these sizes. The editor relies on them only for
buffers above 144 bytes and up to 512.

**A move** takes nothing new from the game's allocator; the editor cannot allocate
there. It writes:
1. the player into the first free slot of the new senior team's list, then the
   list's end, and its capacity when the block has room beyond it;
2. both team pointers of the contract, the signed and joined dates (the game's
   date), the squad number (none) and the listing bits (off the transfer and loan
   lists), plus a new wage and contract end when they are given;
3. the player's team;
4. for each old list that holds him: the later players move up one, the end goes
   back one, and the slot given up is cleared. The list never holds a null on the
   way.

Each write keeps the bytes it found, so an undo writes them back in reverse order.
It does so only while memory still holds every byte the move wrote.

These moves were made and undone on the test save with `move ... --restore`, and
the lists, contract dates and squad number read as before each time:

| Who | From → to | Writes |
|---|---|---|
| Mohammed Kudus | Tottenham → Juventus | 11 |
| Mohammed Kudus | Tottenham → Juventus, new wage and contract end | 13 |
| Mohammed Kudus | Tottenham → Manchester United (the human club) | 11 |
| Luca Williams-Barnett (plays for Tottenham U18) | Tottenham → Juventus | 10 |

While Kudus was held at Juventus for 20 seconds, the lists read as follows:
- **Tottenham:** 36 players in its 37-slot buffer, in their old order.
- **Juventus:** 35 players. Its 34-slot buffer had grown into the 288-byte block,
  and the slot after it was still zero.
- **Kudus's contract:** signed and joined on the game's date, with no squad number.

These were refused, and nothing was written:
- a player at the human manager's club;
- a player on loan;
- a free agent;
- a player-coach;
- a move to his own club;
- a move to a women's club;
- a contract end in the past.

**In the game:** Arda Güler was moved through the app to Manchester United, the
human manager's club. The game was played on for several days and took a work
permit application for him; nothing went wrong.

**A swap** of two players needs no room in either list: each player takes the
other's slot in his new senior team's list (a list without that slot gets him
added at its end, as in a move). Both contracts then get the writes of a move,
without new terms, and each player keeps his wage and contract end. Mohammed
Kudus and Weston McKennie (Juventus) swapped and swapped back with
`swap ... --restore` in 14 writes; a swap is refused for the same reasons as a
move.

### Squad numbers, squad status and listing

These sit in a player's contract (see the table above).
- **Squad status:** Bruno Fernandes reads 1, and the game calls him a star player
  ("Forma süresi" in the Turkish game). 2 is an important player and 5 an impact
  sub. Amad reads 4, which the game calls a rotation player ("Rotasyon
  Oyuncusu"). The editor offers 1 to 5 and leaves other codes the game holds as
  they are.
- **Squad numbers:** 97 numbers on the test save are worn twice within one team's
  list, by a player out on loan and a player who plays for the team. So a number
  counts as taken only when a player who plays for the team (his `+0x130`) wears
  it. An undo is checked the same way: a number goes back only while no such
  player wears it, and so does the number a player wore when the undo of his
  move, swap or release puts him back in his team.
- **Listing:** bit 0 puts the player on the transfer list and bit 1 on the loan
  list. The game uses the byte's other bits too, so a write keeps them.

### Injuries and live values

- **Injuries:** a player's `+0xF8` points at his injury record, or is null for a
  player who was never injured. The record's first field is the list, as
  `(begin, end, capacity)`, of his current injuries.
  - When he gets over them the game empties that list and keeps the record. On the
    test save 5,354 players had an empty list and 2,563 one injury.
  - Only the record points at the list's buffer, and only the player points at the
    record.
  - An injury has the kind of injury at `+0x08` (its name, an FM string, is at the
    kind's `+0x18`), the team at `+0x18` and the start date at `+0x20`. The days
    from that date until he is back are at `+0x28` (at the latest) and `+0x2A` (at
    the soonest).
  - Matthijs de Ligt, for example, has one injury, a spinal bruise ("omurgada
    zedelenme"), since 30 November 2025, with him back between 22 August and
    21 September 2026.
- **Healing** does what the game does and empties the list: its end is set to its
  begin. Undoing it sets the end back, if the list is still empty.
- **Live values,** checked against the game's own words on the test save:

| Offset | Value | Witness |
|---|---|---|
| `+0x25C` | energy (`u16`, 0–10000 for 0–100%) | Joshua Zirkzee, 6950 → 10000: "Dinç" (fresh) |
| `+0x258` | match sharpness (`u16`, 0–10000) | de Ligt, injured, 3500: "Maç Kondisyonu Eksik" (lacking match fitness); no player had less |
| `+0x26C` | morale (`u8`, 1–20), shown as overall happiness ("Genel Mutluluk") | Arda Güler: "Memnun" (content) at 10, "Biraz Mutlu" (slightly happy) at 11, "Aşırı Mutlu" (extremely happy) at 20; Amad "Aşırı Mutlu" at 15 |

- **Morale:** FM Live Editor 27 calls this byte morale. Its words for 15
  Manchester United players matched it: Okay 10, Fairly Good 11, Quite Good 12,
  Good 13, Really Good 14, Very Good 15. On the test save it runs from 1 to 20.
- **The byte at `+0x1F1`** (0–20) moves with morale, but it is not what the game
  shows. It was first taken for happiness after setting it to 20 left Güler
  "Memnun", but that was his morale, 10 at the time. The editor no longer reads it.

These were held in the game for 15 to 25 minutes with the probe's `--hold`, then
restored:
- Zirkzee's energy;
- de Ligt's match sharpness;
- Güler's morale, twice;
- de Ligt's healing: the game showed him fit, and his injury was listed again
  afterwards.

The game's screens show an edited value only after the game has moved on once
(Continue): its interface keeps a copy of the data and refreshes it then.

### Teams and captains

A club's teams (`club+0x18`, the senior team first) each say what kind of team they
are. The probe's `teams <club>` lists them with their players:

| Offset | Value | Seen on the test save |
|---|---|---|
| `+0x28` | kind (`u8`) | 0 first team, 3 B team (Juventus Next Gen), 10 under-21s, 18 under-20s, 12 under-18s |
| `+0x2C` | age limit (`u8`) | 21, 20, 18; 100 for a team without one |
| `+0x88` | captain: pointer to his person block | Manchester United: Bruno Fernandes; Tottenham: Micky van de Ven; Juventus: Manuel Locatelli |
| `+0x90` | vice-captain, the same way | Lisandro Martínez; Pedro Porro; Bremer |

- **What the lists hold:** Manchester United's senior list holds the 30 players
  FM Live Editor 27 shows for it. André Onana and Altay Bayındır are under contract
  with it while on loan elsewhere: the club of the team a player plays for differs
  from the club of his contract's team.
- **Youth teams:** the under-21s and under-18s had no captains. Juventus Next Gen,
  a B team, had both.
- **Writing a captaincy** points the role at the player's person block, in one
  write. When he held the other role, the two captains swap, in two writes.
  - A player who does not play for the team is refused: an under-21 player for the
    senior team, and a player out on loan.
- **Tried live:** Amad as captain, the swap both ways, and these refusals were each
  done and undone with `captain ... --restore`.
- **In the game:** Amad was held as Manchester United's captain for 20 minutes
  while the game ran, and then restored. The game carried on without trouble.
  Amad's mood screen listed no captaincy among his reasons to be happy. Whether the
  squad screen showed him as captain was not checked.
