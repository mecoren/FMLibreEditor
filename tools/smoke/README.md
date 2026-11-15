# Smoke tests

These tests start the built app, drive it against the running game over the Chrome DevTools Protocol (CDP) of its
WebView2, and check what it shows and writes with `fmlibre-probe`, which reads the game on its own. They are the
checks every release goes through, the same on Game Pass and on Steam.

## What you need

- Windows, Node.js 22 or later (the tests use its built-in `fetch` and `WebSocket`, and no packages).
- The app and the probe, built:

  ```powershell
  cd app; npm run release; cd ..          # target\release\FMLibreEditor.exe
  cargo build --release -p fmlibre-probe  # target\release\fmlibre-probe.exe
  ```

- FM27 running, with a save loaded.

## Running them

```powershell
node tools/smoke/run.mjs                     # the tests that only read
node tools/smoke/run.mjs --writes            # all of them, on a save you can lose
node tools/smoke/run.mjs --only connect,unknown
node tools/smoke/run.mjs --exe C:\path\to\FMLibreEditor.exe --probe C:\path\to\fmlibre-probe.exe
```

Each check prints a line: `PASS`, `FAIL` or `SKIP`. The screenshots and `results.json` go to
`tools/smoke/out/<date-time>/`, which git ignores. The run exits with 1 when a check failed.

The copy of the app the tests start has its own WebView2 profile and its own data folder (`FMLIBRE_DATA`) under that
folder, so it neither joins the copy you have open nor touches your `frozen.json`. It debugs on port 9341, as does the
copy for the unknown build once the first is closed; the `history` and `freeze` tests start copies beside the
first, on the data folder of the first, which debug two and four ports higher, on 9343 and 9345, and the `whatsnew`
test one of its own, as a new install, on 9347 (`--port` moves them all).

## What they write

By default nothing that changes the game. With `--writes`, the tests change the game and undo every change:
- only on a save you can lose, such as a test save, never your career;
- not while you play: if the game moves on a day meanwhile, an undo can meet a value the game has changed. At the end
  the runner undoes whatever a test left and says what it could not put back.

| Test | Writes | What it checks |
|---|---|---|
| `connect` | no | The build is known, every check passes, the in-game date and ages, no notice that the game's save has changed (its count of saves loaded is where the app read it), the app opening on My club (on the players in a save with no club of the user's), the players', staff and clubs' lists, a player's and a club's profile, an empty change log |
| `home` | no | My club: the page names the club the user manages, with its reputation; its cards count the first team's injured, banned and those with low morale as the squad command has them, over the first team's list; a name in a card opens the player over the page, and Escape closes him; Club profile opens the club in the Clubs tab, and Ctrl+1 comes back. In a save where the user has no club, the page offers to follow one |
| `dialog` | no | A player opened from a club's squad as a dialog: focus kept in it, Escape (on an (i) button it hides only the note, the next one closes the dialog), the Transfer dialog over it, the question before unapplied edits are thrown away |
| `palette` | no | The command palette and the keyboard shortcuts: Ctrl+K opens and closes the palette, its commands with their shortcuts, Escape giving the caret back to the list's search, the arrows (round from the first line to the last); the best player, a member of staff and a club found and opened, each in its own tab; Ctrl+2 and Ctrl+3 for the tabs, Ctrl+F for the list's search, Ctrl+E starting and ending the editing of the open profile; under a dialog the shortcuts wait; Ctrl+R reads the data again without the web view loading the page again |
| `scouting` | no | The Scouting tab: its six sections; every list of opportunities holds only players on it for its reason (contracts ending within six months, clauses below the value, wonderkids 19 or younger), and its card counts what the core counts; Compare puts a player beside the club's no. 1 at his position with the role's key attributes; Find a replacement looks for players like one the scout would let go, the most alike first; the scout report drawn as a picture and saved as a PNG in the exports folder; the squad on a pitch, a line picked on it shown in full, and the table a click away; the youth intakes of the club (its own players who joined it at 17 or younger, the newest intake first, or a note that it has none) and of the club with the most players of 16 or younger, picked from the section's club search, with the cities a city of birth can be set to and the inputs Edit opens. Skipped where the user manages no club |
| `clubs` | no | The club list's filters: the best known men's clubs have a nation and (nearly all) a league this season with its nation; the nation, league and reputation filters keep to what they ask through `search_clubs`, the league select (`club_leagues`) offers the club's league and counts its clubs; in the list, the nation typed and the league picked show that league's clubs, the filter button counts two; a mass edit planned over the filter takes every match (nothing is applied) |
| `whatsnew` | no | What's new, on a copy of the app of its own: started as a new install it opens nothing and keeps its version as seen; with the storage as 0.5.1 left it (no version seen, 0.5.1 in its last look for updates) it opens by itself on the next start, about this version, saying the app was updated, with the thanks, focus on Got it and All changes beside it; Got it keeps the version as seen, and the start after opens nothing; the link at the foot of the window opens it again (without saying the app was updated) and Escape closes it. Skipped where the build has no notes up to its version |
| `edit` | yes | Edits through the app's commands, read back by the probe and undone; a city of birth set to another city of the player's nation and back, a nation refused in its place; two players of one team of a club no human manages: one goes to a free squad number and the other takes the number he left, the undo that would give both that number is refused (`edit.taken`, naming the second player) with nothing written, and the two undone in turn leave both numbers as they were; one attribute through Edit mode, undone from the Changes tab |
| `history` | yes | The history of the career's changes, as after a restart: a captaincy the first copy makes is in the career's history file; a second copy of the app on the same data folder lists it as an earlier change without Undo (its undo refused) and changes a player's attribute; a third copy lists that one as an earlier change the game holds, marked so in the Changes tab, where its Undo writes the old value back (the probe reads it) while the captaincy's row has none, and the masthead counts no change of its own; Clear history empties the list and the file; the first copy undoes its captaincy |
| `mass` | yes | A mass edit over a club's players, applied, read back and undone as one batch |
| `changes` | yes | Searching, filtering and exporting the Changes view: a player's attribute changed on its own and another one of his club's players changed as one mass edit, both listed in the Changes tab; Ctrl+F in the search box; the search finding him by his UID and by his name in capitals without the accents, the mass edit listed with only his change under it ("1 of N match"); This session keeping the changes and Earlier sessions having none; his change, undone from outside, counted as undone once the view reads the log again with the search still in its box, and left out by Not undone; Export writing CSV files (with commas, then with semicolons, the second a file of its own that day) with a byte order mark, the 15 columns, and the rows the list shows, whose cells hold what the log holds as stored (read back from `change_log`) and as the list shows it, the time in ISO 8601 with its offset, and when a change was undone; Clear filter |
| `contract` | yes | Extending contracts: a player's and a member of staff's five years longer through the app's command, read back by the probe and undone; no years refused, and a basic contract (no end) refused with nothing written; Extend in the player's profile, undone from the Changes tab; a mass edit that adds a year to a club's players' contracts, read back and undone as one batch |
| `move` | yes | A transfer the app agrees to, and the undo that moves the player back; between the two, a team-mate at the old club is given the squad number he left there (the probe reads him with none at the new club), the undo that would put two players of that team on one number is refused (`edit.taken`, naming the team-mate) with nothing written, and it goes through once the team-mate's change is undone, both numbers as they were. The same for a swap with a player of the other club and for a release |
| `sign` | yes | The best free agent the app agrees to sign, signed for the best known club, whose full squad list the app grows: the probe reads him there under the contract the plan showed, in a slot of the game's pool of contracts (one fewer free), one more in the squad; the undo makes him a free agent again, the slot and the list as they were. Then through his profile: Transfer and no Release, no fee or swap in the dialog, the plan's new contract, Sign, undone. Skipped right after a save is loaded, while the game has no free contract slot (continue a day in the game) |
| `medical` | yes | Healing an injured player, and keeping a player from retiring, each undone |
| `loan` | yes | A loan's terms, as the app and the probe read them; recalling a player on loan: the game's date becomes the loan's last day, as the probe reads it, his profile says his return is pending, the option to buy is taken away (and written back by the undo), and the dialog says what the terms would not allow in the game; a day the game has finished is refused; making the loan permanent, its fee starting as the option to buy; each undone |
| `stadium` | yes | Renaming a stadium: a name over 80 bytes and one with a space at its start refused; a name of the same block's size (written over the old one), one of another size and a shared stadium name (each in a string of the editor's own), each read back by the probe and undone; then the same through the club's Stadium tab (Rename, the length as it is typed, Save); the name remembered in `frozen.json`, given back within seconds after the probe writes the old one back (as the game does when it loads the save), forgotten and left alone once undone |
| `names` | yes | Renaming a player: an empty first name, no last name, a name with a space at its start and one over the most bytes refused, and the name he has, with nothing written and no room taken; a new first name, a common name given (or taken away and given another), a new full name and the full name taken away, each read back by the probe (`rename`), found by the list's search, taking one place of the room of its table, and undone; then a new last name through the Rename dialog of his profile, the new name in its header, undone from the change log |
| `ties` | yes | Clubs a player was trained at: one pointed at another club, and one added to a full list, which the app grows (the probe reads the new club and the room left), each undone (the list back in its old buffer); England as a nation he needs no work permit in, given for as many days as the save's players of the EU have left, refused twice, undone; then Change club through his profile's dialog (the search, Escape giving up only the search, Enter on the club found) |
| `staff` | yes | A coach moved to one of the best known clubs, whose department is full (the app grows its list), as the probe reads it, and undone; then a scout's job at his own club, and a move as a head performance analyst, each undone; the jobs the app gives include a director of football's and the doctors'; a doctor moved and back; a director of football refused at a club that has one (the error names him) and moved to one that has none, undone; a member of staff with no club refused without a job, then signed as a coach under the contract the plan showed, in a slot of the game's pool (one fewer free), and undone with the slot given back; then through his profile's Transfer dialog (a Job select that offers a manager's job too, and the contract's inputs, no fee or swap, the job asked for first, a wage of its own), Sign, undone (skipped while the pool has no free slot, right after a load); a manager refused at a club that has one (the error names him) and at the human manager's, moved to a club whose leagues are played and whose senior team has none, as the probe's `club` reads it, his old club's place left empty, undone; given an assistant coach's job at his club, undone; and one with no club signed as that club's manager, undone |
| `release` | yes | Releasing staff (#170): a coach of a club no human manages released, which the probe reads as no club and no contract and his list row as unemployed, a second release refused, and undone onto the same contract; the human manager, a member of the board and one with no club refused; the whole staff of one of the best known clubs released as one batch (the probe reads only those the list says stay, the manager's place empty), and the batch undone, every one back and the manager in his place; then Release in the coach's profile (its dialog names his club, and the button goes once he has none), undone from the log; the club's Staff tab: Release all staff with how many it releases, its dialog (how many leave, who stays; Cancel changes nothing), Release all, the line under the button, and Undo there bringing them all back |
| `tactics` | yes | Max tactics for the senior team of the human manager's club (the one test that writes to his own players): none read for a team whose tactic no human picks, every player who trains at 100 afterwards and nobody lower than before, the `tactics` check still passing as the probe makes it, then the batch undone and every player back where he was; skipped where the human manager has no club |
| `freeze` | yes | Frozen attributes put back after the probe changes one as the game would; unfrozen, a changed value stays. The same for a member of staff, and Max attributes for him, undone. A player's frozen positions held exactly: a rating lowered and one raised both put back, while the editor's own edit and its undo are kept; his squad row's Frozen tag, the box under the pitch in his profile (unticked and ticked, its (i) within the window) and the team's Freeze positions box (the whole team, then none); a second copy of the app on the same data folder freezes them again on connect and says so; unfrozen, a changed rating stays |
| `unknown` | no | The day of an update rehearsed (`FMLIBRE_IGNORE_PROFILES=1`): the build is new to the app, which finds the in-game date, the planned retirements and the game's count of saves loaded by itself and writes nothing until Edit anyway, which takes its notice away |

The players and clubs they use are picked from the save on each run: the best known clubs and their best players, the
first injured player among them, the first player the game plans to retire, the first transfer the app agrees to.
Fixed ones went stale as saves moved on.

## Before a release

Run them with `--writes` on both storefronts' test saves, with the release build. After an update of the game, the
`unknown` test shows how the released app meets the new build before it has a profile; see
[After an update of the game](../../docs/DEVELOPING.md#after-an-update-of-the-game).

## Writing a test

A test is a module in `tests/` that exports `name`, `writes` and `run({ app, report, probe, connection, known })`, and
is listed in `TESTS` in `run.mjs`:
- `app` drives the app: `must(command, args)` calls one of its commands, `click`, `setInput`, `press` and `waitFor`
  work the page, `openTab(name)` opens a masthead tab by its English name ("Players", "Staff", "Clubs", "Changes"),
  `openClub(name)` a club's profile, and `shot` saves a screenshot (see `lib/app.mjs`);
- `report.check(name, ok, detail)` records a check;
- `probe.get(entity, uid, fields)` reads what the game holds, apart from the app.

Undo everything a test writes, and pick its players with `lib/witness.mjs` rather than fixed UIDs. Go by names rather
than places on screen too: builds differ in their tabs (one with a Scouting tab has it before Changes). Lessons from
CDP:
- `innerText` follows the style sheet, which upper-cases the tables' headers, for one: compare `textContent`;
- a reload cuts short the calls to the app that are out, and the console check then fails on "IPC custom protocol
  failed" and "Couldn't find callback id": `App.start` switches to English only once the first page is done starting;
- the list views that are not shown keep their layout under `visibility: hidden`, so look for elements that are on
  screen with `VIS` and `SHOWN`;
- `Runtime.evaluate` cannot hand a DOM node back by value;
- mouse coordinates are CSS pixels, right at any display scaling;
- missing logos and faces show up as failed requests to `fmgfx.localhost`, which is expected without a graphics pack.
