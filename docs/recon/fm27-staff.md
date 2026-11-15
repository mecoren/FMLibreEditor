# FM27: staff jobs, where clubs keep their staff, and staff contracts

Read on the Windows Game Pass build 0.9.2409.0, on a save of 17 November 2026 (59,305 players, 29,569 staff, 31,227
clubs), for issue #120: some jobs had no name in the editor (Head Performance Analyst, Director of Football, the
doctors), their staff could not be moved, and staff with no club could not be signed.

## Job codes

A contract's job is a `u8` at `+0x26` (`[contract] job`); a player-coach has the code of his coaching job plus one.
The game's English names come from its own text, which the install carries in full as
`data/game_simulation/templates/user_folder/languages/example.ltf` (each string with its key and a comment, such as
`KEY-412812: Chief Doctor[COMMENT: job title; FR 15703]`), and in every language in `languages.fmf` (zstd frames one after
another; decoded and searched, they give the Turkish and Spanish names in the same order). Which code is which job comes
from who holds it, and how many each club has:

| Code | Job | Holders | Per club | Seen holding it |
|---|---|---|---|---|
| 38 | Chief Doctor (TR Sağlık Ekibi Sorumlusu, ES Médico jefe) | 307 | 1 at 297 clubs, 2 at 5 | Ricard Pruna (Barcelona), Max Sala (Manchester City), José María Villalón (Atlético), Niko Mihić (Real Madrid) |
| 46 | Doctor (Doktor, Médico) | 436 | up to 9 (Lecce), 7 at Juventus | Eduardo Mauri (Manchester City), Óscar Celada (Atlético) |
| 62 | Head Performance Analyst (Kıdemli Performans Analisti, Analista jefe de rendimiento) | 205 | exactly 1 | Harry Dunn (Manchester City), Ben Chadwick (Arsenal), Michael Niemeyer (Bayern) |
| 66 | Owner (Kulübün Sahibi, Propietario) | 143 | mostly 1 | John Henry (Liverpool), Al Waleed bin Talal (Al Hilal), Peter Holt (San Antonio FC) |
| 8 | not told apart yet: a chief executive's (Managing Director?) | 183 | mostly 1 | Ferran Soriano, David Hopkinson (Newcastle), José Ángel Sánchez (Real Madrid) |
| 24 | not told apart yet | 5 | 1 | at Famalicão, Estoril, Sparta Rotterdam |

The other codes the editor names (2 Coach, 10 Director of Football, 12 Physio, ..., 88 Technical Director) are in
`job_name` in `staff.rs`.

## Where a club keeps its staff

`fmlibre-probe staff-places` counts, job by job, which of the club's department lists hold its staff (`M`edical
`+0x60`, `C`oaching `+0x78`, `S`couting `+0x90`), and at which offsets the club (its first `0x400` bytes) or one of its
teams (`0x800`, which takes in the teams that follow it in memory: see Managers below) points at them itself:

- Chief doctors and doctors: all in the medical list (307 and 436). Head performance analysts: the coaching list (199,
  6 in coaching and scouting). Loan managers (89 + 2) and technical directors (223 + 5): the scouting list. So these move
  as other staff do; until issue #120 the editor only had no name for the first three and did not give these jobs.
- Directors of football (job 10): 350 of 362 in no list, and every one of them held by his club at `+0x148`
  (`[club] director_of_football`). `staff-places --club-offset 0x148` reads that place of every club: null at 30,831,
  a director of football at each of the 362 clubs that have one, and at 34 more someone else who does that job too
  (25 managers, 4 directors, 2 presidents, a goalkeeping coach, a head of youth development, a recruitment analyst),
  always of that club. The place holds the member of staff's object, not his person block.
- Managers: held by their team at `+0x80` (3,056 at a senior team, the rest at youth and reserve teams; see Managers
  below). The board (chairpersons, directors, presidents, owners, codes 8 and 24): in no list and held by neither the
  club nor a team in those bytes, and left to the game.

A move takes a director of football out of his club's place and puts him in the new club's, which must be empty: the
game has no club with two, and a club with one refuses another (`staff.directorTaken`, naming him). Given another job,
he leaves the place and joins that job's department; given the job, a member of staff leaves his departments and takes
his club's place, if it is empty. A club whose place holds someone who is not a director of football by job (a manager
who does the job too) leaves him to the game.

## Managers

Read on the Windows Steam build 26340721, on a save of 19 August 2027 (28,221 staff, 23,609 clubs), whose human manager
runs Monza.

**The team's place.** A team points at its manager's object (not his person block) at `+0x80` (`[team] manager`), null
for none. `staff-places --team-offset 0x80` reads that place of every team, by kind: a manager under contract with that
team at 2,048 senior teams, and at 384 youth and reserve teams (91 under-21, 110 under-18 and 105 of kind 11 among
them); at six small clubs' senior teams a chairperson, owner, president or director of football who runs the team;
null at 21,549 senior teams. A youth or reserve team's manager is also in the club's coaching list (that is the `C 384`
among the 2,426 managers); a senior team's is in no list. The human manager's club points at his object too (his
person block lies `0x340` further on). Some managers are player-managers, whose job is 17 (a manager's code plus one):
32 of the 3,090 at a senior team on the Game Pass save of 21 November 2026 (`--job 16` leaves them out). The editor
moves them as players or not at all, as other player-coaches.

A manager can be another team's too, of another club: the Game Pass save's MLS All-Stars team held Dean Smith,
Charlotte FC's manager, at its `+0x80`, as a national team does a club's manager it shares (on the Steam save Jürgen
Klopp, an assistant coach at Monza, was a national team's: `db::NATIONAL_TEAM+0x80`). Those are other jobs: a move
leaves them as they are, as the game lets a manager hold both.

A team takes `0xB8` bytes, and the teams lie one after another in memory, in alphabetical order: Arsenal's senior team
at `…200c8`, Aston Villa's at `…20180`, and Barnet's two teams on. So `+0x138` and `+0x1F0` of a team are the next two
teams' `+0x80`: Parma's read Aimo Diana and Antonio Buscè, Perugia's and Pescara's managers. What `staff-places` counts
for a team at those offsets (some youth and reserve teams seemed to hold their manager at `+0x138`) is its neighbours'.

**What else points at a manager.** `fmlibre-probe staff-refs` finds every pointer to a member of staff's object or
person block and says what holds it. For four managers (Diego Simeone, Luis Enrique, Arne Slot, Xabi Alonso), against a
coach, a fitness coach, an assistant coach and Pep Guardiola (with no club): his object is held only by his team's
`+0x80` and the game's list of staff. His person block, by his contract (`+0x08`), entries of other people's relations
(70 to 150 for a manager, a few for a coach), the game's lists of people, and records of what happened: match records
(the senior team, the club and him), news items (`TRANSFER_OFFER_NEWS`, `PLAYER_CLUB_DEBUT_NEWS`, press conferences),
`MANAGER_DESCRIPTION` (him at `+0xd8`, his club after him), and a few `db::CLUB_VISION_OBJECTIVE`. His id (a `u32`) is
in about twenty records `0x140` bytes apart, likely one a match. None of these says who manages a club now: a move
leaves them as they are, as the game does when a manager leaves.

**Clubs between managers.** Of the clubs whose finances the game keeps (those of the leagues being played), ten had no
manager at `+0x80`: Parma, Al Taawoun, Laguna, Albacete, US Orléans, Al Faisaly, Ceuta, Quevilly-Rouen, Exeter City and
Crawley Town. So an empty place is a state the game itself leaves a club in. The game's job adverts (`JOB_ADVERT`, 0x50
bytes: the team at `+0x20`, the job's code at `+0x3C`) numbered 125, five of them a manager's (Qingdao West Coast,
Al-Wakrah, Al-Nasr, Sharjah, Shenzhen Peng City), none for those ten: an empty place is not tied to an advert there.

**What the editor does** (the user chose to fill only an empty place, rather than put the manager there out of his
job): a member of staff becomes a club's manager, moved or signed, or given the job at his club, only when its senior
team's place is empty, and is refused otherwise (`staff.managerTaken`, naming the manager, or `staff.yourClub` at the human manager's
club). A manager who is moved, or given another job, leaves his team's place empty, for the club to fill as the game
does between two managers; a youth team's manager given the job at another club becomes its senior team's. His contract
is with the senior team, as every manager's the game has is. Someone else in a team's place (a chairperson who runs the
team) or a manager who is also his club's director of football is left to the game (`staff.role`).

## Staff contracts

`fmlibre-probe contract-classes` counts the classes of the contracts: every one of the 53,396 players' contracts is a
`db::FULL_CONTRACT` (200 bytes), but of the staff's, 14,925 are and 2,271 are `db::BASIC_CONTRACT`: the board, and most
doctors (303 of 307 chief doctors, 432 of 436 doctors). A basic contract is 40 bytes, packed one after another: the
owner (`+0x08`), the team and senior team (`+0x10`, `+0x18`), the wage (`+0x20`, 0 for most doctors), a `u16` at
`+0x24` and the job (`+0x26`). It has no dates. A move of a member of staff writes only those fields of a basic
contract, never the dates a full one has at `+0x44` and `+0x4C` (which, 0x28 bytes on, are the next contract's).

`+0xA0` of a full staff contract (`staff-places --contract-offset 0xA0`) is zero for most and the contract's own team
for a few hundred (Jonathan Power, Liverpool's chief doctor; Conall Murtagh, their fitness coach); a move leaves it.

## Signing a member of staff with no club

As a free agent's (see `fm27-object-pools.md`): a slot of the game's pool of full contracts holds a copy of the full
contract of the member of the club's staff whose job is the one given (else one in the same department, else any),
nearest his current ability; his own owner, the club's senior team as his team and senior team, the job, signed and
joined today, the end date given or 30 June at the end of next season, the wage given or the model's, no loyalty bonus,
squad number, listing, unhappiness, clauses or bonuses, and zero at `+0x28`, `+0x98` and `+0xA0`. He joins the job's
department (grown when full) or the club's place for a director of football (if empty), and his object's contract
(`+0x1A8`) points at the slot. The undo takes it all back, the slot free again and first in the pool's chain.

Right after a save is loaded the pool has no free slot (70,826 used, 0 free on this save), and the signing is refused
until the game makes a contract itself, as it does when the days go by.

## Releasing staff

Read on the Windows Steam build 26577676, on the test save of October 2027 (28,250 staff, 13,522 of them without a
club), whose human manager runs Monza, for issue #170.

**A contract's end moved to the game's date does not release.** On 3 October 2027 the end of four coaches' contracts
was set with the probe: three of Brentford's (Jon-Paul Pittman to that day, Jack Lester to the day before, Mehmet Ali
to the day after) and one of Monza's (Riccardo Terrinoni, to that day). One Continue took the game to 9 October. It
ended none of them: all four were still in their clubs' coaching lists under their contracts, and the game's own
screen showed Terrinoni's contract as ending on 3 October. No member of staff at all had changed clubs in those six
days. (On the Mac, a contributor saw three such Brentford coaches without a club a week on, on 26385295; when the game
gets to them is not known.) The four ends were written back.

**What a member of staff without a club is.** His object's contract (`+0x1A8`) is null, and no department list holds
him. The pointer at `+0x90`, which most employed staff have, is no sign of it: 788 staff without a contract have one
and 5,640 under contract do not. Only the member of staff points at his contract (`refs` over Pittman's and Mehmet
Ali's found one pointer each, at their `+0x1A8`).

**What else points at a member of staff** (`staff-refs`). At a club no human runs, little: Pittman (coach) is held by
the coaching list, his contract's owner, the game's arrays of people and one 40-byte record that starts with a date
and holds a figure out of 100, a person and him (records like it list Bradford City's and Brentford's staff, and a
scout's reports of players); Brentford's director of football, chief scout, head performance analyst and technical
director the same, beside their club's places. At the human manager's club much more: Jürgen Klopp, Monza's assistant
coach, by 48 objects of the assistant's advice (`backroom_advice_*::*_ADVICE_SUGGESTION`, `+0x08`), inbox items
(`STAFF_RESPONSIBILITIES_CHANGE_RESPONSE`, match previews and roundups), match records, a national team he manages too
(`NATIONAL_TEAM +0x80`, with a manager's contract of its own), and a list of Monza's coaches that holds him six times
(the coaches of the training's parts, it seems); the chief scout by hundreds of records and, at that moment, by a
thread's stack. As the game's own release of a player leaves the advice pointing at him (see `fm27-transfers.md`),
such pointers are not in the way, provided the game copes with the rest.

**The editor's release** (`Session::plan_staff_release`, the probe's `staff-release`) takes him out of every department
list of his club that holds him, and out of its place for a director of football or a team's place for a manager
(left empty, as a move leaves it), and only then clears his contract pointer. The contract is left as it was. It is
refused as a move is: the human manager (`staff.you`), the board and jobs the editor does not give (`staff.job`),
player-coaches, and one the club or its teams point at in another way (`staff.role`). Release all staff releases each
one of the club's staff the list has, one after another, each worked out from the game as the one before left it, and
leaves those refused that way; it is logged as one batch, which `undo_batch` undoes from the last.

**In the game** (the same save on 9 October, with the probe, not undone): Pittman, Chris Bradley (chief scout), Keith
Andrews (manager) and Charlie McPhee (chief doctor, basic contract) of Brentford, and Klopp, Giovanni Vallelonga
(chief scout) and Vincenzo Costa (doctor, basic contract) of Monza, released. The user looked at both clubs' Staff
screens, Klopp's profile and Monza's responsibilities and training, and found nothing wrong; then one Continue (10
October), a save under another name and its load (every object at a new address). The seven were still without a club
or a contract. The list that had held Klopp six times held him no more, nor did anything else of Monza's; his Monza
contract was gone from memory, and so was Pittman's, while his national team's still owned him. Brentford's
senior team had no manager a day on, as a club the editor's move leaves without one has until the game fills the place.

## In the game

The game shows doctors only in a club's Staff screen: their profiles do not open and the search does not find them,
a club's own doctors as much as one the editor moved (checked on Game Pass with Manchester United's Tony Gill, £2,500 a
week, Atlético's Lucía Costafreda, £0, and Óscar Celada, moved). So a doctor moved or signed is found in the Staff
screen of his new club, not by the search. The game keeps doctors per team, as the board allows them ("Board agree to
appointment of team doctor"), but nothing that points at a club's own doctors and not at one moved there was found in
memory: the same department list, the same arrays of people, the team's staff (which the game builds again on
Continue, the moved one with them).

Managers, left in the Steam save of 19 August 2027 with the probe: Pep Guardiola, who had no club, signed as Parma's
manager on £50,000 a week to 30 June 2029; Xabi Alonso moved from Chelsea to Exeter City as its manager, which left
Chelsea's place empty; Julian Gray, Crawley Town's assistant coach, made its manager. The user looked at them in the
game and found nothing wrong. A day on (20 August 2027), after a save and a load (every object at a new address), the
three were still their clubs' managers, Guardiola under the contract the editor made, and Chelsea's place was still
empty. A month on (21 September 2027), the game quit and started again in between, the three were still their clubs'
managers, and the game had filled Chelsea's place itself: Cesc Fàbregas, signed on 19 September on £63,229 a week to
30 June 2030, held as the editor holds one, by Chelsea's `+0x80` and his contract alone. Lago (Como), which had a
manager in August, had none now. Of the clubs of the played leagues, eight had an empty place: Lago, and seven of the
ten the game had left empty in August (Al Taawoun, Laguna, Albacete, US Orléans, Al Faisaly, Ceuta, Quevilly-Rouen),
which it had not filled in a month either.

## Checked

With the probe on Steam 26340721 (19 August 2027), each undone, for a manager: Pep Guardiola signed as Parma's manager
(£1,211 a week, the contract of Parma's youth team's manager, to 30 June 2029); Arne Slot from Arsenal to Parma, which
left Arsenal's place empty; Xabi Alonso from Chelsea to Parma as a coach (Chelsea's place empty, Parma's coaching list
grown); Slot an assistant coach at Arsenal; Luca Mondini, Parma's goalkeeping coach, its manager; David Horseman,
Arsenal's under-21 manager, to Parma as its manager, and a coach at Arsenal (the under-21 team's place emptied). Refused:
Guardiola and Xabi Alonso at Arsenal (Arne Slot), Guardiola at Monza (the human manager's club). Afterwards `staff-places
--team-offset 0x80` read as before.

With the probe on Game Pass 0.9.2409.0 (21 November 2026), each undone, for a manager: Pep Guardiola signed as West
Bromwich Albion's manager (its place empty; £850 a week, the model's, to 30 June 2028); Mikel Arteta from Arsenal to
West Brom, Arsenal's place left empty; Arteta an assistant coach at Arsenal (its coaching list grown); Matt Gill, West
Brom's assistant coach, its manager; Dean Smith from Charlotte FC to Atlanta United, the MLS All-Stars' place left
holding him. Refused: Guardiola at Manchester United (the human manager's club) and at Arsenal (Arteta). Afterwards
`staff-places --team-offset 0x80` read as before.

With the probe on Game Pass 0.9.2409.0, each undone: Óscar Celada (doctor, basic contract) Atlético → Tottenham;
Jonathan Power (chief doctor) Liverpool → Tottenham as a doctor; Ben Chadwick (head performance analyst) Arsenal →
Tottenham; Deco (director of football) Barcelona → Real Madrid, refused at Liverpool (Julian Ward), to Liverpool as a
technical director, and a technical director at Barcelona; Juni Calafat (chief scout) made Real Madrid's director of
football, and refused as Barcelona's. Afterwards `staff-places --club-offset 0x148` read as before.

Two days on (19 November 2026), the game had made contracts and taken a second chunk of 1,024 slots (1,019 free), and
signings went through, each undone with the pool read back as before: Jürgen Klopp to Tottenham as a coach (£7,746 a
week, the model's, to 30 June 2028); Rodolfo Borrell to Tottenham as a doctor (the medical list grown); Txiki
Begiristain to Real Madrid as director of football, and refused at Liverpool; Carlo Ancelotti to Tottenham as an
assistant coach on £50,000 a week to 30 June 2028. With the app, `tools/smoke --writes --only connect,staff,sign`: 64
passed, the staff signing through the command and through the Transfer dialog (Klopp to Manchester City, £12,345 a
week), each one slot taken from the pool and given back by the undo.

Left in the save for a look in the game (19 November 2026): Klopp signed for Manchester United as a coach, Celada
moved there as a doctor, Ben Chadwick from Arsenal as a performance analyst (he was the head performance analyst), and
Deco to Real Madrid as director of football. After Continue the game showed each at his new club in his job, Klopp
with the contract the editor made, and Celada in Manchester United's Staff screen (his profile does not open, as no
doctor's does).

### On the Mac

The Mac Steam build (26340721, Apple silicon) keeps its clubs alike: on the Arsenal save of 12 July 2027,
`staff-places --club-offset 0x148` read null at 23,299 of 23,606 clubs and each of the 293 directors of football at his
own club (Pablo Longoria, River Plate), at 14 more one of the club's own staff with another job (seven managers, three
directors); so `layout-macos.toml` places `[club] director_of_football` at `+0x148` too. Chief doctors, doctors, head
performance analysts, loan managers and technical directors sit in the same lists as on Windows, and `contract-classes`
tells the contracts apart by the same class names (12,748 staff contracts full, 1,705 basic).

With the probe, each undone: Óscar Celada (doctor, basic contract) A. Madrid → Tottenham (the medical list grown);
Ricard Pruna (chief doctor) Barcelona → Tottenham as a doctor; Ben Chadwick Arsenal → Tottenham; Deco Barcelona →
R. Madrid, refused at Liverpool (Julian Ward), to Liverpool as a technical director, a technical director at
Barcelona. The pool had free slots on this save, and signings went through: Jürgen Klopp to Tottenham as a coach (the
model's £7,746 a week, to 30 June 2029) and as a doctor, Pep Guardiola as an assistant coach on £40,000 a week, and as
R. Madrid's director of football, refused at Liverpool's. `staff-places --club-offset 0x148` read as before
afterwards.

Managers are held alike: `staff-places --team-offset 0x80` read a manager under contract with that team at 2,041 senior
teams and at youth and reserve teams (Arsenal's under-21s: David Horseman), at six senior teams a chairperson, owner,
president or director of football, null at 21,559; so `layout-macos.toml` places `[team] manager` at `+0x80` too. On
this save Parma had a manager (Vincenzo Montella) and Nottingham Forest none. With the probe, each undone: Hans-Dieter
Flick Barcelona → Nottingham Forest (Barcelona's place empty meanwhile), and an assistant coach at Barcelona; Pep
Guardiola signed as Nottingham Forest's manager on £50,000 a week; David Horseman to Nottingham Forest as its manager,
and a coach at Arsenal; Arne Slot Chelsea → Nottingham Forest as a coach (Chelsea's place empty meanwhile). Refused:
Slot at Arsenal, the human manager's club (`staff.yourClub`); Guardiola at Barcelona (named: Flick); Luca Mondini made
Parma's manager (named: Montella). `staff-places --team-offset 0x80` read as before afterwards.

In the Mac app (`tauri dev --release`, the same save): `staff_jobs` gave every job, director of football (10) and
manager (16) among them; the Transfer dialog offered both in its Job select, moved Flick to Nottingham Forest as its
manager and signed Jürgen Klopp as R. Madrid's director of football (£5,295 a week, the model's, to 30 June 2029),
each read back with the probe and undone from Changes, the clubs' places read as before afterwards.
