# FM27 on macOS: the Steam build 26227640

Observed on 2026-10-31 on an Apple silicon Mac with macOS 27.0.1 and System Integrity
Protection on, from the Steam install under
`~/Library/Application Support/Steam/steamapps/common/Football Manager 27/` (app 4530370,
build 26227640, depot 4530373). Steam gives the Mac build the same build id as the Windows
one. The game had not been started on this Mac before; the layout below was then measured on
a new save (Tyrone Demarcus at Arsenal, 14 July 2026), with the game started by Steam through
the bridge's launcher.

## The app

`fm.app` is a Unity 6000.3.18f1 player, universal (arm64 and x86_64):

| | |
|---|---|
| Bundle id | `com.SportsInteractive.FootballManager27`, version 27.0.0.2486716 |
| Executable | `fm.app/Contents/MacOS/Football Manager 27`, the process name too |
| Game plugin | `fm.app/Contents/PlugIns/game_plugin.bundle/Contents/MacOS/game_plugin`, a Mach-O bundle |
| Other modules | `UnityPlayer.dylib` and `GameAssembly.dylib` in `Contents/Frameworks` |

`game_plugin` has a `LC_UUID` per architecture, which identifies the build as the PE header
does on Windows:

| | arm64 | x86_64 |
|---|---|---|
| `LC_UUID` | `9E8E47DE-F704-314C-917D-C32D12637678` | `22CFE5C3-B5CF-3C00-8043-1EA190A69B89` |

The arm64 image is `0x58F4000` bytes: `__TEXT` `0x54B0000`, `__DATA_CONST` `0x1F4000`,
`__DATA` `0x9C000` (with `__common` at `0x56D10D0` and `__bss` at `0x5721BA0`) and
`__LINKEDIT`. The `(begin, end)` pairs of the entity arrays are globals, so they should be in
`__DATA`; `calibrate --scan` scans the writable segments as it scans `.data` on Windows.

## Why macOS keeps the editor out

The app and `game_plugin` are signed by SEGA's Developer ID (`3JJX9QL35J`), notarized, and
built with the **hardened runtime**. Their entitlements:

```text
com.apple.security.cs.allow-dyld-environment-variables   true
com.apple.security.cs.disable-library-validation         true
com.apple.security.device.camera                         true
com.apple.security.personal-information.photos-library   true
```

There is no `com.apple.security.get-task-allow`, so macOS hands the game's task port, the
handle to its memory, to no debugger. A test process signed the same way confirmed it:
`task_for_pid` from the same user fails with `KERN_FAILURE` (5) while SIP is on. That is why
earlier Mac editors asked players to turn SIP off.

The first two entitlements are the way in. With them, dyld loads the libraries named in
`DYLD_INSERT_LIBRARIES`, signed by anyone; Steam relies on them for its overlay. FMRTE 27 for
Mac no longer needs SIP off either: its notes speak of a plug-in, set up through the
launchers' settings, that only loads after Steam has been quit.

## The bridge

`crates/fmlibre-bridge` builds `libfmlibre_bridge.dylib`. Loaded, it checks that the process
is Football Manager, checks in the Mach service `io.github.tozmoz.fmlibreeditor.bridge.<pid>`
and waits on it in a thread of its own. A request from a process of the same user, by the
audit token the kernel attaches, gets `mach_task_self()` back as a port descriptor; anyone
else gets an empty answer. The editor checks with `pid_for_task` that the port it got is the
game's. It hooks nothing and reads nothing of the game.

What the test process showed on macOS 27:

- `bootstrap_check_in` of a name launchd has never heard of works for a process of the GUI
  session, as Chromium uses it, and `bootstrap_look_up` finds it from another one.
- `mach_task_self()` of a third-party app may be sent to another process, which Chromium and
  Electron apps rely on. The **read** port, `TASK_READ_PORT`, may not: sending it killed the
  process with `EXC_GUARD` (`ILLEGAL_MOVE`). The bridge never sends it.
  `task_get_special_port(TASK_KERNEL_PORT)` is refused (`KERN_DENIED`).
- With the port, `mach_vm_read_overwrite`, `mach_vm_write`, `mach_vm_region_recurse` and
  `task_info(TASK_DYLD_INFO)` work as for a debugger. An 8-byte read takes about 0.9 µs, the
  list of 84 modules 3 ms.
- dyld stops the game before it starts when an inserted library is missing or has no slice
  for the game's architecture (`terminating because inserted dylib ... could not be loaded`).
  So the bridge is universal, it is replaced with a new file rather than overwritten, and
  removing it takes the launch option out first.
- SIP strips the `DYLD_*` variables from the environment of protected programs, and so
  from what they start: `DYLD_INSERT_LIBRARIES=... arch -x86_64 game` loses it on the way,
  `arch -x86_64 -e DYLD_INSERT_LIBRARIES=... game` does not.

## Heap-only writes

`mach_vm_region_recurse` reports a module's `__DATA` page that the process has written to as
private memory that no file backs: the copy-on-write copy is the process's own. So the write
guard also refuses any range that overlaps a module, as dyld lists them (read again after
30 seconds). `proc_regionfilename` was tried first: it names the module for such a page and
fails with `EINVAL` for heap memory. Under Rosetta, though, it names
`/usr/libexec/rosetta/runtime` for every region of the game, heap included, which would
refuse every write.

The game's objects live in memory it gets from macOS's allocator: the players' pool in
`MALLOC_LARGE` regions (tag 3); the teams' lists, under Rosetta, in a `MALLOC_MEDIUM` one
(tag 12), and natively in `MALLOC_SMALL` ones (tag 2) of 4 MiB. The lists themselves come
from the game's own allocator (see [below](#the-games-allocator)).

## Steam's launch options

Steam on macOS starts a game's app bundle (`'…/fm.app'` in its logs). It runs **no shell** for
a launch option: it replaces `%command%` with the bundle's path, in single quotes, splits the
option into words and starts the first word as a program. The first launch option of the
bridge, `DYLD_INSERT_LIBRARIES="…" %command%`, which a shell would take, made it fail:

```text
Failed running GameID 4530370: "DYLD_INSERT_LIBRARIES="…/libfmlibre_bridge.dylib" '…/fm.app'" (OS Error 260)
```

Error 260 is Cocoa's "no such file": the variable was taken for the program. So the launch
option is `'…/fmlibre-launch' %command%`, quoted the way Steam quotes the game. The launcher
is a small program of `fmlibre-bridge`: it finds the bundle's executable from its
`Info.plist`, puts the bridge in front of the libraries `DYLD_INSERT_LIBRARIES` already names,
and `exec`s the game, which keeps the process id Steam follows. Without the bridge beside it,
it starts the game as it is. Started that way, FM27 (pid 14183) loaded the bridge next to the
two libraries Steam names, `steamloader.dylib` and `gameoverlayrenderer.dylib`, and the probe
attached to it with SIP on.

Steam starts the launch option's program as **Intel code**: FM27, started through a launcher
that simply `exec`'d it, ran under Rosetta, with the Intel half of `game_plugin` (UUID
`22CFE5C3-…`), though Steam itself and the game are universal. The launcher now becomes the
game with `posix_spawn`, `POSIX_SPAWN_SETEXEC` and the Mac's own architecture first: started
as Intel code itself, it brought a stand-in for the game up natively, with the bridge and the
other inserted library.

Why Intel code: `steamclient.dylib` (both halves) starts the program with `posix_spawn` and
`posix_spawnattr_setbinpref_np` set to x86_64, then arm64. That function keeps only the pid,
so when the start fails Steam shows errno, which `posix_spawn` leaves at 0. An M4 Mac, most
likely without Rosetta, got "Failed to start process for this game: OS Error 0" with the
universal launcher (November 2026). A stand-in for Steam's start on this Mac showed why:

- a universal program ran as x86_64 under Rosetta, an arm64-only one natively;
- a `#!/bin/sh` script ran under Rosetta too: `/bin/sh` and `/usr/bin/arch` still have an
  x86_64 half on macOS 27;
- a start the kernel refused returned 86 (`EBADARCH`), with errno still 0.

So the editor installs only the launcher's half for the Mac's own architecture, cut out of the
universal one as `lipo -thin` does; each half has its own signature. A stand-in for the game
started through the universal launcher also kept `P_AFFINITY` (0x10000 in `ps -o flags`), the
kernel's mark to prefer x86_64, as FM27 did (0x14004). Started through the arm64 half, it did
not. On 2026-11-04 Steam started FM27 through the arm64 half of the 0.4.2 launcher (Developer
ID, cut out by the probe's `bridge setup`): flags 0x4004, the arm64 `game_plugin`, the bridge
and both of Steam's libraries loaded, and `health` passed all ten checks.

The release build signs the launcher with the hardened runtime, which notarization requires.
dyld then takes every `DYLD_*` variable out of the launcher's environment before it runs: a
launcher signed that way (ad hoc, with `--options runtime`) passed only the bridge on, and a
stand-in for the game lost the library a stand-in for Steam had named. The kernel's copy of
the environment the program was started with (`sysctl` `KERN_PROCARGS2`) still holds them, so
the launcher reads back the `DYLD_*` variables missing from its own and passes them on. It
loads none of them itself. The entitlement that lets dyld keep them
(`com.apple.security.cs.allow-dyld-environment-variables`) would also have the launcher load
Steam's libraries, which another team signs, so library validation would have to be turned
off as well.

Each Steam account keeps them in
`~/Library/Application Support/Steam/userdata/<account>/config/localconfig.vdf`, under
`UserLocalConfigStore/Software/Valve/Steam/apps/4530370/LaunchOptions`. Steam reads the file
when it starts and writes it back when it quits, so the editor changes it only while Steam is
closed, keeps a `.fmlibre-backup` of the first version it changed, and edits the one value in
place. Set up and taken out again on a copy of a real file, it came back byte for byte.

## The object layout

`calibrate` found the arrays where Windows has them relative to each other: players at
`game_plugin+0x5C891C8` (38,007, the same as the Windows Steam test save), staff `0x48` and
clubs `0x1B8` after them. With the Windows layout no name decoded, as clang lays classes with
virtual bases out by the Itanium C++ ABI, not MSVC's. `profiles/fm27/layout-macos.toml` holds
the Mac offsets:

| | Windows | macOS |
|---|---|---|
| Player's own fields (positions, attributes, CA/PA, condition, morale, team, injuries) | | 8 bytes earlier: no vbptr |
| Person (names, nation, personality, birth date, contract, caps) | after the identity block, `+0x2B0` | first, `+0x278`; its fields 0x40 earlier |
| Identity block (UID; what contracts and captaincies point at) | `+0x288`, before the person | `+0x388`, after it |
| Player-coach shift | `0xF8` | `0xF8` (Paul Ifill's UID at `+0x48C`) |
| Staff's own fields (attributes, reputation, CA/PA) | | the same |
| Staff person / identity block | `+0x128` / `+0x100` | `+0xF8` / `+0x208` |
| Human manager shift | `0x340` | `0x340` (the save's own manager) |
| In-game date | `+0x848` from the players pair | a variable of its own (below) |

Contracts, clubs, club info, club finances, teams, nations and injuries are laid out as on
Windows. Witnesses on the running game:

- Lionel Messi: born 24 June 1987, 207 caps and 125 goals, 18 and 14 for the U21s, his
  positions and attributes, a contract that ends on 31 December 2028 with squad number 10.
- Tottenham Hotspur: 50,000 season tickets, founded 1882, supporter traits 18/14/7/14/7/14,
  £65 tickets, corporate facilities 20, reputation 7650; captain Micky van de Ven and
  vice-captain Pedro Porro, whose captaincies point at their identity blocks.
- Injuries: David Wotherspoon's moderate calf muscle strain, among others.

With the build profile of the Intel half, `calibrate` decoded 100% of the sampled players,
staff and clubs. The probe then wrote, read back and restored right away: Messi's finishing,
his ambition and his squad number; Pedro Porro as Tottenham's captain (the two captains
swap); Mikel Arteta's tactical attribute; Tottenham's balance; and a swap of Ben Davies with
Tom Heaton (14 writes).

## Natively, on Apple silicon

Started again from Steam through the native-first launcher, FM27 (pid 17731) ran natively,
with the arm64 half of `game_plugin` (UUID `9E8E47DE-F704-314C-917D-C32D12637678`). With no
profile yet, `calibrate` found its arrays by scanning, at `0x56D2E18`, `0x56D2E60` and
`0x56D2FD0`, 100% decoded with the same layout, which clang lays out alike for both
architectures. The reads and the restored writes above passed again (the swap took 10
writes this time).

The in-game date is not with the arrays, though. At `+0x908` from the players pair the arm64
half held an unset date (1 January 1900) right after the save was loaded; the Intel half had
read 14 July 2026 there in a new game. The date itself is a variable of its own: 14 July 2026
at `0x56B1DB8` on arm64, the only such value in `__DATA` besides the database's timestamp. The
Intel half had the same value at `0x5C69700`, at about the same place among the globals. The
build profiles name these (`current_date`); without a profile the reader falls back to the
cluster's field. When the game moved on a day, the variable read 15 July 2026, and the
cluster's field stayed unset.

## The game's allocator

Before it was measured, the Mac layout let no list grow past its capacity, and moves to
most clubs were refused: moving Ben Davies to Juventus, Manchester United and five other
clubs failed. Natively, the 4,096 team lists with a buffer sat in 21 `MALLOC_SMALL` regions,
but not in malloc's blocks: lists of one pointer sit 8 bytes apart, while malloc's blocks are
16-byte aligned and at least 16 bytes long. The game carves the chunks it gets from malloc
into blocks of its own size classes, the same as on Windows. `squads` groups the lists by
capacity, which decides the block:

- **Spacing:** buffers of one capacity are spaced by their class on shared pages. That is
  144 bytes for 17 and 18 pointers, 160 for 19 and 20, 192 for 21 to 24, and so on up to 512.
- **Zeroed blocks:** after the capacity, the rest of the class's block is zero. This held
  for 837 of the 853 lists from 145 to 512 bytes.
- **Old data:** the other 16 had grown past their length (13 players with room for 26, 25
  with room for 50, …). They held old data after their capacity, at their class's spacing.
  The editor leaves such a block at the list's capacity.

So `layout-macos.toml` takes Windows' `heap.block_sizes`. Moves then worked, each undone
right away:

- **Juventus:** Ben Davies joined their 34 players, whose list sits in a 288-byte block.
- **FC Bayern München:** 22 players in a 192-byte block. During the move the list read 23 of
  23, with him in the slot after the old capacity.
- **After the undo:** both blocks were byte for byte as before.
- **Manchester United:** the 28 pointers fill their 224-byte block, so a move there is still
  refused.

These sizes were measured on the arm64 half only. The Intel half, which Intel Macs and Rosetta run, was not measured.

### Its classes, and how it takes a block back

Read on 7 November 2026 (Arsenal save, 5 July 2027, arm64) with the probe's `allocators`, which finds the game's
allocators in the plugin's writable data by their shape: a list of their size classes, a list of one entry per size
asked for (each pointing at the class that serves it), the size of the header they write before a block, and a byte
that is 1 while they are in use. Four were found:

| Where | Header | Classes | Sizes it serves | Used for |
| --- | --- | --- | --- | --- |
| `game_plugin+0x56C1630` | none | 34 | up to 4,096 bytes | the lists of the game's objects |
| `game_plugin+0x56C1670` | none | 29 | up to 1,536 | |
| `game_plugin+0x56C16B0` | 8 bytes | 14 | up to 512 | |
| `game_plugin+0x56C18D8` | 8 bytes | 43 | up to 3,088 | strings, such as stadium names |

The first one's classes are 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 192, 224, 256, 288, 320,
384, 448, 512, 640, 768, 896, 1,024, 1,280, 1,536, 2,048, 2,560, 3,072, 3,584 and 4,096 bytes: the layout's
`block_sizes` were the part of them the team lists had shown.

How it hands out and takes back a block (`game_plugin+0x4355A04` and `+0x4355ED4` on arm64):

- **Handing out.** A size it serves takes the first block on its class's list of free blocks, under the class's
  mutex, or carves a new one from a chunk. With a header, the size asked for goes into the header's first `u32` and the
  caller gets the bytes after it. A larger size comes from `malloc`.
- **Taking back.** The caller gives the size, or the allocator reads it from the header. A size it serves puts the
  block first on its class's list of free blocks: the next block's address in its first 8 bytes. It does not look at
  where the block is, and no class counts its blocks or gives chunks back (the counts' flags are clear in every
  class). A larger size goes to `free()`.
- **The lists' buffers.** A list's destructor gives its capacity in bytes: `free(allocator, begin, capacity - begin)`.
  The lists of players' relations, of clubs' departments of staff and of teams' players all come from the first
  allocator: none has a header (no department list of 91 read had its size before it), and buffers of one capacity sit
  their class apart (relations: 16 bytes apart for 16, 192 for 176, 640 for 544).

So a block of memory the editor takes in the game can stand in for one of a list's: the game takes it into its class's
list of free blocks when it lets the list go, and hands it out again later, as on Windows. The block has to be as large
as the class of the list's capacity, and the capacity at most 4,096 bytes: a larger one would go to `free()`, which
stops the game (`pointer being freed was not allocated`) for a block `malloc` never gave out.

**Strings** come from the fourth allocator, with a header of 8 bytes: the size asked for (the text and 9: the count of
holders, the length and the NUL), then 4 bytes left from the address of the next free block when it was free. Its
blocks come in steps of 8 bytes up to 136 (16 up to 288, then wider), not 16 as on Windows. On the save, Leicester City
Stadium (22 bytes, asked for 31), The Odsal Stadium (17), the Emirates Stadium (16) and The Archibalds' Stadium (23)
sit 40 bytes apart, in a chunk of 1,638 blocks of 40: walked block by block from Leicester City Stadium's, the next 644
held strings, up to the chunk's end. The Tottenham Hotspur Stadium (25 bytes, asked for 34) sits in a run of 1,365
blocks of 48, a name asked for 42 in a run of 1,170 of 56. So a new name written over an old one on the Mac must keep a block of steps of 8 (the
layout's `string_step`): the Emirates Stadium takes 16 to 23 bytes there, where the steps of 16 would let a name of up
to 31 run 8 bytes into the next string's header.

## The features first mapped on Windows

Jadedness, traits, the contract's extras, the reasons to be unhappy, stadiums and planned retirements were first
mapped on the Windows Game Pass build. On 2026-11-01 they were read on the Mac, natively, on the maintainer's save
(Arsenal, autumn 2026). Each write below was restored right away.

| Feature | Where on the Mac | Read and written |
|---|---|---|
| Jadedness | player `+0x252`, 8 bytes before Windows' `+0x25A` | all 37,980 players from -500 to 643, 1,835 at -500; Arsenal's regular starters 255 to 391, its injured -500. Alex Scott 258 → -500 → 258. |
| Traits | player `+0x308`, 0x40 before Windows' `+0x348` | Messi's bits 7 10 16 17 19 20 49 51, as FMRTE shows them. Harry Kane's bit 49 set and cleared. |
| Loyalty bonus, happiness | the contract, as on Windows | Kylian Mbappé's loyalty bonus 50,098 a week and Erling Haaland's 43,634, as on Windows. Mbappé's happiness 60 → 100 → 60, his loyalty bonus 50,098 → 60,000 → 50,098. |
| Clauses and bonuses | the contract's `+0x68`, as on Windows | Mbappé's release clause (859,031,872 pounds) and three bonuses. Kane's goal bonus changed; Mbappé's first and last entries removed; his list then read as before. |
| Reasons to be unhappy | the contract's `+0x30`, as on Windows | 1,998 players have a record, of 1 to 6 entries. Mbappé's count 1 → 0 → 1. |
| Stadium | the senior team's `+0x78`, and `db::STADIUM`, as on Windows | Old Trafford 74,879 (74,310 in use, up to 95,285), the Emirates 60,704, the Tottenham Hotspur Stadium 62,850, the Amex 31,876. Across all 24,471 stadiums, no seats above the capacity and 28 ceilings below it (31 on Windows). Old Trafford 74,879 → 80,000 → 74,879. |
| Planned retirements | below | |

No contract on this save has room in its list of clauses: 0 of 33,770, where the Game Pass save had 384 of 53,356. A
release clause can therefore not be added here, and the editor refuses it, as it does for a full list on Windows.

### The retirement manager

The probe's `types` and `instances` now read Itanium type info on the Mac (`fmlibre_core::rtti`). `RETIREMENT_MANAGER`
(`18RETIREMENT_MANAGER`) has one vtable, `game_plugin+0x55F7DA0`, and one object. It is laid out as on Windows:

- the planned retirements at `+0x30`: 13 pointers to 24-byte entries;
- their index by person id at `+0x90`;
- a second list at `+0x18`, of 6, with its own index at `+0x78`.

The entries match those on Windows: Cristiano Ronaldo on 30 June 2027, Daniel Wass on 1 July 2027, Iago Aspas, and
Hugo Broos (staff). A player keeps the game's id of the person 8 bytes into his identity block, at `+0x390`.

One pointer leads to the manager: `game_plugin+0x56A82A8`, in `__DATA`. That is 0x2AB70 before the players pair,
where Windows keeps it 0xED60 (Game Pass) or 0xDAC0 (Steam) before. Like the date, it is a variable of its own, so
the arm64 build profile names it (`retirement_manager`), as the Windows ones now do. Ronaldo, Wass and Aspas were each
kept from retiring and restored, and the list then read as before.

The Intel half was not running, so its static was found in the file:

1. Both halves keep their functions in the same order. Strings that each half references once gave 19,461 matching
   addresses to map one half's code onto the other's.
2. The arm64 half loads `0x56A82A8` at 48 places. Mapped over, 46 of them sit next to a load of `0x5C5FEF0`. That
   global is loaded only 60 times in the whole Intel half.
3. The calls that follow those loads go to the same methods in both halves, a few hundred bytes from where the
   mapping puts them.

The x86_64 build profile takes `0x5C5FEF0`; it was not read in a running game. The editor checks the manager's class
before it uses it, so a wrong static would only hide the feature.

## Men and women

A person's identity block holds a byte of flags 0x19 in: player `+0x3A1`, staff `+0x221`. The flag `0x10` is set for
women. It was found on the maintainer's save (Arsenal, November 2026) by sorting the players by their club's women's
flag (club `+0xB9`) and looking for a byte of the player object whose values never overlap between the two:

| Players | `0x10` set | `0x10` clear |
|---|---|---|
| of women's clubs | 6,964 | 0 |
| of men's clubs | 0 | 26,476 |
| without a club | 1,325 (Sophia Wilson, Emma Sears, Cristiane) | 3,203 (Christian Eriksen, Karim Benzema) |

Every player reads one way or the other: 8,289 women and 29,679 men of 37,968. Among staff, the flag is set for
Sarina Wiegman, Emma Hayes, Sonia Bompastor, Pia Sundhage and Renée Slegers, and clear for the 947 men who work for
women's clubs, so it is the person's, not the club's. The other flags are not known: `0x02` is set for about half the
players and for staff such as Pep Guardiola and Jürgen Klopp, `0x01` for Alex Ferguson and some chairmen and owners,
and `0x20`, `0x40` and `0x80` for a few hundred people.

The layout's `gender` places the byte (`fmlibre_core::is_woman` reads it), and the player and staff lists filter on it.
On Windows the identity block sits at player `+0x288` and staff `+0x100` (see the table above), and the byte 0x19 in,
at `+0x2A1` and `+0x119`, as `layout.toml` places it:

- Steam build 26340721, on a save with women's football (1 July 2027), against the clubs' women's flag:

  | Players | `0x10` set | `0x10` clear |
  |---|---|---|
  | of women's clubs | 6,434 | 0 |
  | of men's clubs | 0 | 26,948 |
  | without a club | 1,956 | 4,931 |

  Every player reads one way or the other: 8,390 women and 31,879 men of 40,269. Among staff it is set for 2,548 of
  25,776 (Emma Hayes, Sarina Wiegman, Jill Ellis), and clear for the 846 men who work for women's clubs.
- Game Pass 0.9.2409.0, on a save without women's football (15 September 2026): no player has the flag, so all
  59,284 read as men, and the byte's other flags read as on the Mac: `0x02` for about half the players, `0x40` and
  `0x80` for a few hundred. Among staff it is set for 851 of 29,512, all women: Carolina Morace, Ria Ledwaba and Isha
  Johansen among them.

`fmlibre-probe players --women` and `--men` list each.

## 27.0.0 (Steam build 26340721)

The release that followed the Launch Preview, on 2 November 2026, gave both halves of `game_plugin` new UUIDs: arm64
`F4540355-…`, Intel `0981AB31-…`. With no profile for them the app found the arrays by scanning but read no date, so
it showed no ages.

- **arm64:** `calibrate --scan` found the arrays at the Launch Preview's RVAs. The date variable was still at
  `0x56B1DB8`: 16 November 2026 on a save whose screens read 16/11/2026, then 17 November once the game moved on a
  day. The retirement manager's static, `0x56A82A8`, listed the planned retirements (Cristiano Ronaldo and Karim
  Benzema among them).
- **Intel:** not run; checked in the file. Its code's RIP-relative loads still peak at the Launch Preview's RVAs:
  7,730 at the date `0x5C69700`, 184 and 170 at the players' begin and end, 18 and 18 at the staff's, 105 and 93 at
  the clubs', 61 at the retirement manager's static. The arm64 half loads the same variables 6,977, 123, 18, 104 and
  50 times.

The new profiles take the Launch Preview's RVAs with the new UUIDs.

With the arm64 profile, on a save dated 15 November 2026, the checks the editor makes before it writes
(`fmlibre-probe health`) all passed, in 62 ms. Their gaps were close to Game Pass's:
- **Players:** goalkeeping 43, finishing 36, tackling 35.
- **Staff:** goalkeeping 45, physiotherapy 49, judging potential 32.
- **Contracts:** 1,790 of 1,790 pointed back at their players, and 727 were signed after the player joined.
- **Date:** none of the 3,580 contract dates came after it; the latest came 4 days before it.

## 27.0.1 (Steam build 26385295)

The update of 10 November 2026 (version 27.0.1.2494769) gave both halves of `game_plugin` new UUIDs again: arm64
`2A2D0ED6-…`, Intel `94CDDC80-…`. Unlike 27.0.0 it moved every place: the code grew, so `__DATA` starts 0x9C000
further on in the arm64 half (`0x5740000`) and 0x7A000 further on in the Intel half (`0x5CD6000`). The editor still
found everything without a profile, as it is meant to: the arrays by scanning, the date and the retirement manager by
searching. The retirement manager's guess from the players' array missed, as the arrays moved a little more than the
other variables. Until Edit anyway, the game stayed read-only.

- **arm64:** read on the maintainer's save (Arsenal, 12 July 2027) with `fmlibre-probe profile`. The date at
  `0x574DDB8` and the retirement manager's static at `0x57442A8` sit as far into `__DATA` as in 27.0.0 (0xDDB8 and
  0x42A8). The arrays sit at `0x576EE50`, `0x576EE98` and `0x576F008`, 0x38 further on. Of the 25 values in the
  plugin's writable data that read as a date, only the date fitted the contracts and the current injuries. The
  allocators' classes, the pools (the contracts' at `0x574BE10`) and the fields of the Mac layout read as before:
  `fields --stats` found no implausible value in any field of the players, staff and clubs, besides the youth
  facilities of 255 known before.
- **Intel:** not run; checked in the file. Its code's RIP-relative loads peak as they did in 27.0.0, 0x7A000 further
  on: 7,625 at the date `0x5CE3700`, 185 and 173 at the players' begin and end `0x5D031E8`, 18 and 18 at the staff's,
  105 and 93 at the clubs'. The arrays moved 0x20 more than the date. The retirement manager's static `0x5CD9EF0`
  is loaded 63 times and still sits 0x9810 before the date.

With the arm64 profile all ten checks passed (35 ms). With the probe, each of these writes was made and undone, and the
objects then read as before: 59 fields of players, staff and clubs (attributes, positions, personality, contract and
loan terms, a club's budgets, facilities and stadium capacity); moves to a club with room, into a full squad (grown),
with a player released to make room, and out of the human manager's club (7 selections); a swap, a release, a loan made
permanent, two free agents signed (one into a full squad, each in a slot of the contracts' pool); an injury healed, a
ban lifted, a retirement called off; a stadium renamed in place, into a string of the editor's own, and a shared name;
ties changed, added (a full list grown), and removed; a release clause changed and one removed; captains; a coach moved
into a full department, new jobs, a member of staff with no club signed, a manager moved and one signed, and a director
of football moved.

## The update of 12 November 2026 (Steam build 26577676)

Steam's update of 12 November 2026 (version 27.0.1.2503222; the Windows side has its own profile) gave both halves of
`game_plugin` new UUIDs again: arm64 `A8550B47-…`, Intel `DD0EE157-…`. Nothing moved this time: `__DATA` starts where
27.0.1's does in both halves (`0x5740000`, `0x5CD6000`), and every variable sits where 27.0.1 keeps it. Without a
profile the editor found them all by itself, and the game stayed read-only until Edit anyway.

- **arm64:** read on the maintainer's save (Arsenal, 12 July 2027). `fmlibre-probe profile` found the date, the
  retirement manager, the game's own object and the arrays at 27.0.1's places, and all twelve checks passed. The two
  managers Max tactics reads sit at 27.0.1's places too: `instances` finds one `TACTICS_MANAGER` and one
  `TRAINING_MANAGER`, and `refs` one pointer in the plugin to each, `game_plugin+0x5744310` and `+0x5741740`.
- **Intel:** not run; checked in the file. Its code's RIP-relative loads peak at 27.0.1's places exactly as often: 7,625
  at the date, 185 and 173 at the players' begin and end, 18 and 18 at the staff's, 105 and 93 at the clubs', 63 at
  the retirement manager's static and 527 at the game's own object's.

The new profiles take 27.0.1's places with the new UUIDs. With the arm64 one the `tactics` check passed (1,059 of 1,059
records, 40 histories of training), and Max tactics, written to Arsenal's 25 senior players and undone, left every
record and every history entry as it was.

## The game's own object and its count of saves loaded

The object of the class `game_plugin::GAME_UI` (see `layout.toml`'s `[game]`) is laid out as on Windows: at `+0x100`
the count of the saves the game has loaded since it started, 1 on the Arsenal save (Steam build 26385295, Apple
silicon) after one load. Loading the same save again raised it to 2: the editor's core, watching meanwhile, said the
save had changed within half a second and refused every write (`SaveChanged`), and after `recheck` (what Reload data
runs) every check passed and writes were allowed again. Two statics of the plugin point at the object, as on Windows:

| | arm64 | Intel (in the file) | Loaded at |
|---|---|---|---|
| Among other singletons' (the multiplayer manager's, the match coordinator's) | `0x5740B60` | not told apart | 5 places |
| The one the code goes through | `0x57708F0` | `0x5D04CA8` | 470 (arm64), 527 (Intel) |

A search finds the first one first, so the arm64 profile places it. In the Intel half the second one's neighbours are
loaded as the arm64 one's, 0x20 further from the players' pair: 12, 20 or 24 times, then the static, then 23, 19 and 5.

**In the app, with a renamed stadium** (11 November 2026, main after #142, the Arsenal save of 12 July 2027).
Brentford's stadium was renamed in the app to "Gtech Community Stadium FMLibre Test" (36 bytes, so a string of the
editor's own), then the same save was loaded again in the game:

- The app said the save had changed as soon as the count read 2, and the notice showed 5 seconds later (its 3-second
  poll). `read_values` gave no field, and an edit of the value already there was refused with `guard.saveChanged`.
- The game let go of the old stadium without a crash. The count of holders of the editor's string went from
  `0x40000000` to `0x3FFFFFFF`, so the game never frees it.
- Within 2 seconds of the count changing, the hold had found the same human manager and given the new stadium the name
  again, in a second string of the editor's own. Nothing points at the first one any more.
- Reload data took the notice away in 0.6 seconds and edits were allowed again. Undo then named the stadium Gtech
  Community Stadium again, by renaming it back.
- After it, `fmlibre-probe health` passed every check.

The class's name was not found at first: the editor took a name to start only where no letter came before it, as one
that ends a longer name ("P15X" is a pointer's) would. In this plugin `N11game_plugin7GAME_UIE` follows random-looking
text with no NUL between. The type info that points at a name tells where it starts, so the editor now goes by that
(`rtti::vtables`), and so does the probe's `types`: it lists 5,364 class names where it listed 4,748.

## Team cohesion

The roadmap had set team cohesion aside, as no stored value matched ten clubs' readings in FM Live Editor (see the
Steam notes). The game works a team's cohesion out from each player's cohesion with his club, which [FM27
Editor](https://github.com/Jackhamerp24/Football-Manager-27-Editor) (GPL-3.0) found on Windows. It reads the same on
the Mac:

- The record a player's `relations` pointer leads to (`+0x2C0`; `+0x300` on Windows) starts with the list of his
  ties (`[relation]`), and holds a second list at `+0x18`. Its entries are 8 bytes: the `i32` index of a club or a
  nation, a `u8` kind at `+4` (1 a club, 2 a nation) and the `i8` cohesion at `+5`, from 1 to 100.
- An entry names a club by the `i32` at club `+0x8`. On the Steam save (25 July 2026): Arsenal 331, Manchester United
  408, Barcelona 1152, Juventus 738, Benevento 1522.
- Kobbie Mainoo's list there reads `98010000015b0000 8b00000002470000`: 91 with Manchester United, and 71 with
  England (139). FM27 Editor's tests hold the same entries from a Windows save, at 87 and 67.
- A player keeps an entry for each club he has played for: Saka 99 with Arsenal, and 13 to 17 for clubs players had
  left.

`fmlibre-probe cohesion <club> [--raw]` lists each senior player's entries:

| Club | Mean with the club | With an entry | Without |
|---|---|---|---|
| Arsenal | 56.1 | 20 | 4 |
| Manchester United | 64.6 | 22 | 4 |
| Barcelona | 62.1 | 21 | 6 |
| Juventus | 46.1 | 19 | 9 |
| Benevento | 26.4 | 28 | 2 |

The game uses them. On one Benevento save the Dynamics page read the team's cohesion as:

- Poor, on loading the save, with the entries as they were;
- Excellent, "significantly improved", with all 28 at 100;
- fallen, on a copy, a day after all 28 were set to 1. The day did not change the entries: they were still at 1.

The page shows the cohesion as the game last worked it out, and works it out again once the game moves on
(Continue). After the entries were put back from 100, it still read Excellent.

**Who has no entry.** The game gives a player an entry for his club when it signs him. On Game Pass two players had
one at 2 two days after joining (#140), and Piero Hincapié, whose move the game made on 1 July 2026, had 27 here.
Those without one had all joined in the save's first weeks (1 to 20 July 2026), and two at least by an editor's move:
Nick Woltemade and Kamil Grabara are at Juventus with the joined dates of their real moves to Newcastle (30 August
2025) and Wolfsburg (1 July 2024). The app's own move skips the game's transfer code too. Whether the game gives
such a player an entry later is not known yet. Players here on loan, such as Pape Matar Sarr at Juventus, have only
their own club's.

The `cohesion` check (`fmlibre-probe health`) asks that nearly all the lists it samples hold only kinds 1 and 2 with
values of 1 to 100, and that at least half the players have an entry for their club. On this save 1,663 of 1,663
lists held, and 1,259 had one.

**Tactical familiarity was not found then.** What FM27 Editor edits as a player's tactical familiarity, player `+0x190` on
Windows (`+0x188` here), is his versatility: Saliba's 35 and Saka's 90 there are `attribute.versatility`. FM27's
Tactical Effectiveness screen has four parts, and its familiarity is the first, the team's tactical knowledge. That
covers eight tactical areas: the shape in and out of possession, passing style, build-up, chance creation, line of
engagement, pressing intensity and pressing trap. FM27 Editor reads six of them in a team block at an address found
by hand: `dword`s every `0x10` from `+0xC0` to `+0x110`, the value × 100 in their low 14 bits. No team keeps such a
block: the game works the areas out for each player (see [Tactical familiarity](#tactical-familiarity)).

## Who a reason to be unhappy is about

An entry of the record a contract's `unhappiness` points at (28 bytes: see `[contract]`) holds more than its dates,
motive and kind. Read with `fmlibre-probe concerns --all` on the Steam save (build 26385295, 30 August 2026): 915
entries of 843 players, 422 of them not over.

- `+0x19`, a `u8`: the category of the motive. Every one of the 50 motives of this save has one category, of 16.
- `+0x08`, an `i32`, -1 for none: in the entries of categories 19 and 20, the game's id of a person (a player's
  `player_person`). It named a player in all 578 of them, a teammate in 564; the rest were players who had played
  with him and moved on. Motive 808 (thinks a teammate has been treated unfairly) is in category 19, 926 (doesn't
  believe a teammate deserves the playing time he wants) in 20.
- In the other categories the same place holds something else, and so does the `i32` at `+0x0C` in some entries of
  every category: one value for the players of a club, at times the same in both places. It is not a person's id, a
  club's index or a club's UID. The app reads neither.
- `+0x18`, the kind: 3, 4, 5 and 255 turn up besides 1 and 2. `+0x1B` is 0, 4 or 6.

**Groups.** The game keeps no record of a group of unhappy players. A group is the entries of categories 19 and 20
that teammates hold about one player:

- 342 of the 422 entries not over were of these two categories;
- they formed 41 groups of two or more players, in 32 clubs, the largest 18 about one player;
- in all 41 the player they were about had an entry of his own, of another category, that was not over.

**The game ends a group itself.** On a copy of the save, the count of two such players' records was set to none, as
Remove all does, and their teammates' entries left alone:

| Teammates' entries about | Not over | Ended after one day | Ended after two days |
|---|---|---|---|
| Sydney Leroux (Angel City) | 18 | 16 | 18 |
| Ryan Manning (Southampton) | 11 | 3 | 11 |
| Anyone else, untouched | 312 | 6 | 38 |

The entries ended on the day the game moved on, and those teammates' morale and happiness rose. Among the untouched
ones, those that ended did so a whole group at a time, as when a player's own reason ends. So the app writes
nothing more than Remove all does: it names the teammate a reason is about, and marks in the squad tab the players
their teammates hold reasons about.

## Tactical familiarity

The Tactical Effectiveness screen shows a player's eight tactical areas from two places. Read on the Benevento save,
on 27.0.0 (Steam build 26340721) and 27.0.1 (26385295), August to September 2026 in the game:

- **His record**, which `player +0xF8` points at (`[familiarity]`; the game makes one at game_plugin+0xd47b38 on
  26340721 when it is missing). Six lists `(begin, end, capacity)` `0x20` apart, each naming its area by the byte at
  `+0x18`, of 4-byte entries: an option's code in six bits from bit 14 and the value × 100 in bits 0–13. Giacomo
  Ricci's area 0 read `0x65C0`, option 1 at 96.64. Then, at `+0xC0`, a list of 16-byte entries for his shapes, keyed by
  the formation's places, with the value × 100 in the `u16` at `+0xE`. For the option a tactic plays, the screen takes
  the best of his entries less 10 a step between codes, and 10 at least (game_plugin+0x47fe108). On the save 27,081
  players had a record; 201 of them had six empty lists, with no buffer.
- **His history of training**, which the training manager keeps for each human manager's players
  (`TRAINING_MANAGER`, the profile's `training_manager`): a map from a person's id to 12-byte entries, each the day of
  the year from 0, the tag `0x0C8C` (or the code of his place in the formation, for a shape), the area, the kind, the
  option and three factors. game_plugin+0x486d408 adds them up for the screen: a weight for the entry's age (12 up to 6
  days, then 9, 7, 6, 4 and 2, and none after 251), times 1 less 0.1 for each step from the tactic's option, times the
  factors; an area holds at most 100. The map held the 56 players of the senior team, the B team and the under-19s,
  with 72 to 170 entries; one injured since February had none.
- **The options** are the tactic in use's, worked out from its team instructions (`tactical_areas.rs`): 5, 17, 10, 4,
  20 and 10 for Benevento's Tiki-Taka, 19 in area 0 with a high press.

The circles look like the mean of the two. With the line of engagement moved to a high press, the record at 100 for
option 19 and the history at 0 for it, the line's circle read half full for everyone; with the history rewritten on
the new option, it was full again.

**Max tactics**, tried with the probe's `familiarity --set --add` and `training-history --max --grow` on copies of the
save:

- With the record's entries for the tactic at 100 and the history rewritten as today's training on its options, the
  eight circles of every senior player were full, in the player's view and the team's. A save made then loaded with
  both as they were written, and five days with a match passed without an error.
- A player new to the club had only his old club's options in his record (Ricci: 1, 3, 1, 12, 1, 15) and 7 entries
  of history. With his history at 100 his circles read about 70%: an entry for each of the tactic's options had to be
  added to his record, as for 7 players of the 27.
- **How many entries.** Dated today, 9 entries for each area fill it, but fall below 100 after a week, when each adds
  9; 10 for each area read 70 after 19 days. 18 for each area, as players long at the club have, keep it full for six
  weeks.

**Growing the lists.** Both kinds come from the game's first allocator (`game_plugin+0x575d630` on 27.0.1, see
[The game's allocator](#the-games-allocator)): history buffers sit their class apart (1024 bytes for 80 entries, 3584
for 276) with nothing before them, and the record lists of players new to the club are full, one entry in an 8-byte
block. Grown into the editor's memory as relations are: Ricci's history (14 entries to 72, in a 1024-byte block with
room for 3 more) and 33 record lists of 7 players. Within a week the game filled the history's room and moved it into
a buffer of its own (80 entries, room for 150), letting the editor's block go; a save, a load and another week
passed without an error, with the entries added to the records still there.

The Windows layout does not place the record or the training manager yet, so Max tactics stays off there.

## How the game words a reason to be unhappy

The game's code that words a reason (Steam build 26340721) takes the entry's motive and picks a sentence of
`languages.fmf` by it: each motive from 500 to 1362 maps to the key of a sentence, which it then fills with what the
entry names. The same keys hold on Game Pass, and they give the same sentences there.

- 471 motives have a sentence, 391 none; 1102 is worded elsewhere. Several motives share one: 700 to 724 all read
  "Disappointed to not be able to join [team]".
- The category of each motive, which `+0x19` holds, is in a table of the game, one byte a motive: 19 is 800 to 834, 20
  is 900 to 1030. Only their sentences name the teammate the app knows.
- A few motives pick their sentence by more of the entry. For the motives about playing time, 648 to 654, the `i16`
  at `+0x14` says it: 3 is "Wants to leave to get better playing time", 1 "Unhappy with his amount of playing time",
  the other values a loan, while the kind is under 5 (for 651, 652 and 654, whatever the kind). For 1300 and 1301, 3
  is wanting to leave and the others wanting to play more. 594 depends on the team he was moved to: "moved to" or
  "placed in" it.
- With the high bit of the `u8` at `+0x1B` set, a motive of category 8 (628 to 638, a new contract) reads "Unhappy how
  new contract negotiations are going" instead.
- The other things a sentence names (a team, a competition, a second player) come from `+0x08` and `+0x0C` in the
  categories but 19 and 20, which the app does not read: its dictionaries word those sentences without them.
