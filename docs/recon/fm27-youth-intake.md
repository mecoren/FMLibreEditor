# FM27: youth intakes, the players the game makes, cities of birth

Read on the Game Pass build 0.9.2435.0 (a save of 16 January 2028, 10,837 players) with the probe (`column`,
`histogram`, `ties --all`, `player`, `youth`). What the Scouting tab's Youth intake section is built on
(`crates/fmlibre-core/src/youth_intake.rs`).

## The players the game made

The byte before the gender flags in the identity block (`player +0x2A0` on Windows, 0x18 into it) holds a flag
`0x08` for a player the game made. It was set for 1,783 players, 16.2 years old on average, and they were exactly
the players with a UID from 2,002,068,314 up: the game numbers the people it makes itself, in the order it makes
them, after the database's own. The rest of the byte read 0, 1, 2 and 4 on others (1 for players of 35.8 on average,
which this note does not name), and `0x40` is set for 43 of the game's players.

Players of the database have UIDs up to about 2,001,000,000 (newer real players included), so a UID says nothing
for sure; the flag does.

`player +0x36C` (u32) is `-1` for 1,823 players: the 1,783 and 40 players of the database (Japanese and Chilean
clubs' players added to the database late, such as Sota Nakamura of Sanfrecce Hiroshima). Other players hold a
number of their own there (Toni Micevski 1,947). It is not used.

On the Mac the identity block is laid out alike (`gender = 0x3A1` there), so the flag is at `0x3A0` (see "On the
Mac" below).

## A club's youth intake

The game keeps no list of a club's intakes. On the day of a nation's intake, every club of it with a youth setup gets
its players: they join it that day, at 15 or 16 (a few at 17), and all of them share the day of joining in their
contract (`[contract] joined`). On the save:

- Fenerbahçe's intake of 11 March 2027: twelve players, UIDs 2,002,069,121 to 2,002,069,132, all born in 2011; one
  of them, Ahmet Beytaş, is on loan at Yalova FK. In January 2028 all twelve held full-time contracts (kind 1), some
  signed later than the intake (Osman Sütlü's on 28 September 2027), all of them joined on 11 March 2027.
- The largest days: 7 April 2027 (152 players at 140 clubs), 10 March 2027 (119 players), 20 March 2027 (96). A day
  of 14 January 2028 (52 players, 29 clubs, two days before the save's date) still had youth contracts and no ties at
  all.
- 421 of the game's players had no club: youth candidates the clubs let go.

A player the game made can leave his club: Engin Demirtas (Kasımpaşa's intake of 18 March 2027) joined Fenerbahçe on
21 August 2027, and Onuralp Balcıoğlu, let go by the club whose candidate he was, on 8 January 2028.

**The relations tell the first club apart** (see `fm27-nationality.md`): some time after the intake the game ties a
player to his club as one trained there (kind 72, with its homegrown rules), and to that club only. Engin Demirtas's
ties name Kasımpaşa, not Fenerbahçe. Onuralp Balcıoğlu has no tie to a club: he began his career at Fenerbahçe. The
players of 14 January 2028 had no tie yet.

So the editor takes for a club's youth intake the players under contract with it (those it has lent out included),
whom the game made, who joined it at 17 or younger, and whose ties name no other club they were trained at; by the day
they joined. It lists Fenerbahçe's twelve of 11 March 2027 and Onuralp Balcıoğlu (8 January 2028), not Engin Demirtas.
Beşiktaş, the save's human club, had none left.

## Cities

`player +0x308` (Windows; `+0x2C8` on the Mac, where it was read for Yıldız: Regensburg) points at the city he was
born in, a `db::CITY` of 0x58 bytes:

| Offset | Holds | Istanbul |
| --- | --- | --- |
| `+0x08` | u32, its place in the game's table | 7,990 |
| `+0x0C` | u32 UID, again at `+0x10` | 1,301,222 |
| `+0x18` | FM string pointer, its name | İstanbul |
| `+0x20` | nation pointer | Türkiye |
| `+0x28` | pointer, perhaps its region | |
| `+0x48` | two f32: latitude and longitude | 41.0, 28.98 |

The save holds 58,475 cities in one block, the place at `+0x08` counting down as the address goes up. Every player
the game made has a city of birth; 1,948 players of the database have none. The players were born in 4,313 different
cities, which the editor offers when a city of birth is changed (by the nation they are in).

The editor writes the city of birth as a pointer field (`city_of_birth`): only a city takes the place of a city (the
class of the old and the new object must match, so a nation is refused), and a player without a city keeps none.

## On the Mac

Read on the Steam build 26577676 (Apple silicon), on the Arsenal save of 13 July 2027 (40,379 players, 2,913 of them
with the player-coach's shift):

- The flag at `player +0x3A0` is set for 7,204 players, exactly those with a UID from 2,002,069,481 up (the highest
  UID without it is 2,001,040,995); 6,211 of them were born in 2011.
- `player +0x2C8` points at a city for every player but two: 8,007 cities, named as on Windows.
- The intakes read as on Windows: Tottenham's seven of 17 March 2027 (born in Huddersfield, Enfield, Croydon and
  more), Chelsea's eight of 15 March, Sevilla's 13 of 2 April. Arsenal, the save's human club, has none left.
- A city of birth set in the youth section (Sergio Marqués, Sanlúcar de Barrameda to Sevilla) was named so in the
  Changes view and undone from there.
