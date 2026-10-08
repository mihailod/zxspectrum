# ZX Spectrum 48K games in the browser

`ZXSpectrum.html` is a single self-contained file: open it in a modern browser
(it also works straight from disk and on phones/tablets). The **Program** box
lists every entry when clicked and narrows the list as you type (word starts,
punctuation ignored: "exp fi" finds The Way of the Exploding Fist); arrow keys
and Enter, or a click/tap, boot one; the page title, help text and touch keys follow the selection,
and `ZXSpectrum.html#manicminer` opens a specific one.

**Intro.** Opened without a `#game` in the address, the page starts with every
game's opening screen flying out of the dark like a starfield (pixel stars,
CRT scanlines, the title in the ROM's own font). Pointing at a screen slows
the flight and shows the game's name; clicking or tapping it starts that game,
and any key (or "tap here to skip") goes to the emulator. The machine is paused
while it shows; the **Gallery** button brings it back. The screens are made in
the page from what it already holds (`.scr` files, snapshots read with a second
machine, tape states), so they add nothing to its size.

The menu holds 276 entries: 260 games in 270 entries (a game the 48K version loads in parts has one entry per
part, marked `partOf` after the first, which count as one game and only the first is in the gallery), five
utilities and BASIC. The games are sorted by name, then a
Utilities heading over the utilities (The Art Studio, The Artist II, Ekranski Editor, MultiCopy 2.2 and
Wham! The Music Box) and BASIC. 247 snapshots
(`roms/*.z80`), twenty-eight tapes (Renegade and Hyper Sports, both Speedlock; CRL's
Formula One, loaded with `LOAD "" CODE` as its tape has no BASIC loader;
3D Pinball, Planet 10, Splitting Images, Fairlight, iD, No 1 and the five
ex-Yugoslav tapes below from ZXDB;
Robin of the Wood and The Artist II from TOSEC; The Art Studio from ZXDB) and ZX Spectrum 48K BASIC (the machine powered on
with no game). Each entry's start sequence and controls are shown under the
screen. Games the 48K version loads in parts have one entry per part: Fairlight II, A View to a Kill and The
Way of the Tiger (three each), The NeverEnding Story (three), Short Circuit (two), Daley Thompson's Decathlon
and Supertest (two days each). Buggy Boy, which loads one course at a time, is one entry from its tape (below).

**Loading screens.** Every entry that has one is shown and held until a key:
tapes open on the machine as it is at the end of the tape (see below); a snapshot can carry a `.scr` loading
screen shown first on a halted machine, so FLASH animates (Manic Miner's
Bug-Byte MANIC/MINER screen); `holdBoot` pauses snapshots that would replace
their own loading screen or play music on it (Skool Daze, Maziacs, Moon Alert); games that already wait for a
key on it need nothing. Snapshots that don't contain their loading screen get
the one from ZXDB as a `.scr`; a tape whose loading screen is gone by the end of
the tape (3D Pinball, Planet 10) shows its `.scr` first too.

**Tunes from the start.** Some snapshots were saved part-way through the title
tune. For those, `start: { pc, sp, ei }` continues the snapshot at the game's
own entry point instead, so the tune plays from its first note. The addresses
come from disassembly: where the tape loader jumps (Sir Lancelot 0x5C08,
Skool Daze 0x6900 after its relocation, Chuckie Egg's title routine 0xA410),
the program start (Ping-Pong 0x6000) or the game's own return-to-title point
(Moon Alert 0xA544). The later batch adds Tapper, World Series Basketball,
Fairlight II, Brian Bloodaxe, Blade Runner, Cowboy Kidz, Heartland, Robin of
the Wood, The Arc of Yesod, Thunderbirds, Sabre Wulf, Nightshade, Gunfright and
Pentagram, and Cyberun, whose menu tune at 0xF26C had already finished in the
snapshot (restarted at its main loop 0xF422; checked against an alternate
snapshot saved mid-tune). See the comments in `src/games.mjs`. For each, the
snapshot's music was found again 0.1–15.7 s into the restarted tune.
Fairlight's title tune is played by code at the end of its tape that the game
then overwrites, so no snapshot can play it: Fairlight is booted from the tape
(The Edge's release 2, the one the old snapshot was made from). iD is booted
from its tape too: its snapshot was a Microdrive conversion saved while the
title was being drawn, which left the title and shatter screens garbled.
Robin of the Wood too: its snapshot's speech sample (E502–FB45) had been
overwritten by the game's screen buffers, so the speech came out garbled, and
ZXDB only has the 128K loading screen. Odin's 48K tape (TOSEC; the same game
relocated, its speech identical to what survives in the snapshot and to all
other TOSEC copies, unlike TOSEC's `.tap`, whose speech ends in a copy of the
ROM) has the 48K screen; see `stopAt` below for why its state is not taken at the tape end.

The third batch adds Wanted: Monty Mole (tune at 0xD29D), Starquake (menu
0x5EC8), Booty (start-up 0xCD22: its tune is played by the interrupt routine,
so the restart has to repoint it), The Birds and the Bees (0x92FD), Wham!
(0xA7F8), Pyjamarama (title 0xB2D1) and Jet Set Willy (title 0x87CA); for
Beach-Head the snapshot was in the attract demo and 0x8000 restarts the title.
Ant Attack's title is a BASIC program saved mid-animation: `basicLine: 10`
runs it from its first line (the ROM statement loop picks up NEWPPC). N.O.M.A.D.'s snapshot
was saved 56 notes into its tune, which its interrupt routine plays from a
position in memory; `pokes: { 0xef8e: 1 }` puts back the state that makes the
routine start the tune from its first note. Jet Set
Willy's snapshot had found a Kempston interface and reads its fire button
during the title tune; without one the port's noise starts the game by itself,
so it gets `kempston: true` (as does The Birds and the Bees, whose bee flew by
itself). Its plain snapshot stops at the colour-code card, so the `[a]` one,
saved after the code was entered, is used. The "Wizard's Lair (Bubble Bus)"
file was really Mastertronic's Wizard's Warriors; the S.J. Crow file is the
game. Football Manager, Ant Attack and Hacker have no loading screen anywhere
(the first is one BASIC program, the last loads with a blank screen), so they
open on their first screen. Aquaplane splits the border mid-frame into sky and
sea; the border is drawn with the beam, so this shows as it should (within the
16-pixel border the page displays).

Commando uses the `[a4]` snapshot, saved just before the title is drawn, so its
drum roll plays from the start (the other 48K snapshots were saved after it, on
the silent title; their game code and keys are the same). Its default keys are
2/W/9/0 with Z fire and M grenade. Elite uses `[a3]`, which has no Lenslok
check: the plain snapshot stops on a still title and `[a2]` was saved at "Load
New Commander". Its loading screen is ZXDB's 48K one (Torus); the other is the
128K version's. Steep Way (Uroš Justin, 1987) was downloaded from ZXDB, where it is
marked available; its snapshot starts on its own loading screen.

**Yugoslav programs** are tagged by where they came out (author and publisher
countries from ZXDB, plus the ex-YU Računalniška scena list):
"(YU)" made in Yugoslavia and released there on an official cassette;
"(YU, unofficial)" made in Yugoslavia but never on an official cassette (by
radio, as a magazine type-in, or passed on by the authors or a club: Velika
Akcija, Ukleti Dvorac, XIV, XIV 2, Commodore 64 Adventure, MultiCopy);
"(YU, UK)" Yugoslav authors released in Britain (Nifty Lifty counted as the
ex-YU list does, for its "original program by Janko", though ZXDB credits only
the British converters); "(YU, unreleased)" never released (Planet 10,
recovered; Steep Way, whose title screen says Mastertronic 1987; No 1, which
ZXDB lists as a 1985 Bug-Byte release, but no tape of it is known).

Four ex-Yugoslav text adventures and a utility come as tapes from ZXDB (all
available): Kontrabant (1984, the first Slovenian adventure, broadcast by
Radio Študent; its welcome plays a tune), Kontrabant 2 (1984, in
Serbo-Croatian, illustrated), Bajke (1986, Xenon's Croatian tape; the
Slovenian one also exists) and Štrumpfovi (1985, Xenon). Ekranski Editor
(Vladimir Kostić, Računari, 1986) is a full-screen BASIC editor; no manual
survives, so its help describes what was found by using it. It is marked
`utility: true`, which leaves it out of the game count and the random first
game. All of them are typed at with the full keyboard on touch screens. MultiCopy 2.2 (Aleš Jaklič,
1984–86) is a tape copier, from the ex-YU Računalniška scena archive
(MultiCopy.zip, which holds five versions); its code sits in its own "Big
Brother" screen, and its help comes from the instructions tape in the same
zip. With no tape to copy from, LOAD and HEADER wait until BREAK.

Mindtrap (Mastertronic, 1989, written in Yugoslavia) uses the `[a]` snapshot,
which opens on its loading screen (identical to ZXDB's) and is held there; the
tape was not used because it ends with that screen only a third loaded.

Six games by Yugoslav authors published in Britain come from the library's
snapshots, each with ZXDB's loading screen where the snapshot has none:
Dr. Maddo (Americana; its title says Castle Hustle), Movie (Imagine; the
`[a]` snapshot, as the plain one goes black after its intro), Phantom Club
(Ocean; the `[a]` snapshot starts on its welcome screen, before the title
music, whose menu keys get stretched holds), Play for Your Life (Your Sinclair
covertape; its controls default to a Kempston joystick, so `pokes` sets the
keyboard, control type 1 at FA9E), Sbugetti Junction (Bug-Byte) and Nifty
Lifty (Visions; restarted at its title tune loop 0xADD4, called from AC6D,
which reaches the snapshot's note 60 notes in).

Ten more ex-Yugoslav programs come from the ex-YU Računalniška scena list
(retrospec.elite.org), checked against ZXDB's copies (all available there):
Commodore 64 Adventure, Eurorun (the Croatian snapshot; the tape is the
Slovenian one), Ukleti Dvorac, Velika Akcija (V1.1, not the beta), XIV, XIV 2,
Ali Baba (the Croatian tape), The Drinker, Ključ and Vruće Letovanje (the
Serbo-Croatian Vroče Počitnice; ZXDB's tape, as the list's Croatian tape resets
the Spectrum after loading). Tapes that carry more than one program after a
STOP block (the other language, demos of other Suzy Soft games, XIV 2's
instructions program) were cut to the game's own part, since the build loads
until the tape ends and a STOP block holds the tape.

Entries live in `src/games.mjs` (snapshot, tape or `.scr` screen, help text,
touch keys, minimum key holds); adding a game is one more entry there plus its
file(s). Some games only read the keyboard now and then (between notes of a
tune, between demo steps), so short taps on those keys are stretched to the
hold that was measured for them (`'*'` applies to every key).

**Tapes** (`.tzx`, `.tap`, `src/tape.mjs`): loaded by the build, not the page
(`src/tapeboot.mjs`). The emulator powers on, `LOAD ""` is typed and the tape
plays itself whenever a loader polls the EAR port (Fuse's loader detection), so
custom/turbo loaders work; every edge is played (no ROM traps). It stops at
the end of the tape, between two instructions, and the page gets that machine
state (`saveState`/`loadState`) instead of the tape: it opens on the loading
screen and carries on from there after a key. A game that starts before its
tape has ended (the ROM loader returns before the last bit's closing edge, or a
loader reads fewer bytes than the block holds) gets `stopAt`, an address in its
start-up: the build stops just before it instead (Robin of the Wood, whose
speech would otherwise be 68 bytes in when the tape ends). A loader that asks
questions before the program starts gets `tapeKeys`, key presses at set frames
from power-on, together with a `stopAt` at the program's own start: The Art
Studio's installer (cursor keys, no 80-column printer, confirm, don't save the
configured copy; Datel's re-release, as Rainbird's own tape then asks for a
Lenslok code) and The Artist II's OPUS / KEMPSTON PRINT / AMX MOUSE questions.
Keys still down when the build stops are released, so none is saved held.
A multi-load game's later tape can be given as `tapeLater: { tape, at }`: the page puts it in when the game
first reaches `at` (its loader), as if PLAY were pressed then, and runs the machine fast and silent while the
tape plays (The NeverEnding Story part 1: the main tape gives the loading screen, the credits and Fred Gray's
theme, and part one's 16K block then loads from the second side in about two seconds instead of 105).
`rewind: true` puts the tape back to its start whenever it runs out, for a game that searches the tape: Buggy
Boy's main tape holds Offroad, and the other four courses, found on the rest of the side, can be loaded in any order. TZX blocks 0x10–0x15, 0x19–0x2B and
the info blocks are supported (0x18 CSW and 0x26 call sequences are not).

Keys are the original Spectrum ones; Shift = CAPS SHIFT, Control/Option =
SYMBOL SHIFT. Touch devices get per-game keys, or a full Spectrum keyboard for
BASIC (CAPS/SYM latch until the next key). The first key, click or tap enables
sound. A snapshot whose header says Kempston gets an (idle) Kempston interface,
as in Fuse; games that read the Kempston port although their header says
otherwise (Sir Lancelot, Exploding Fist, Kokotoni Wilf, Friday the 13th, Falcon Patrol II, Tales of the
Arabian Nights, and Asterix if its joystick question is answered Y) are marked
`kempston: true` (Fairlight too, to keep the idle interface its snapshot
had now that it loads from tape). Without an interface the port returns floating-bus values,
which these games read as "fire" (Sir Lancelot jumps forever).
`issue2: true` makes the keyboard port read like an Issue 2 board's (Rasputin tests a half-row for
exactly FF after the ROM's BEEP, which only an Issue 2 board gives). `kempston: false` removes the interface a snapshot's header asks for: E.T.X. checks for
one when a game starts and, if it finds it, reads only the joystick; without it, it reads the keyboard.
Two snapshots were saved with controls the page cannot use, and `pokes` set them back: Match Day's player 1
was on a Kempston joystick (the pokes are what its Swap Controls option writes, so player 1 is on O P A Q N;
player 2's joystick is attached idle), and TT Racer's controls were set to Interface 2 (F1FE = 0x11 selects KEYS).

Talisman is the library's "Talisman (19xx)(-)(Different)" snapshot: the two files labelled Games Workshop
hold Terry Stygall's 1991 Crash covertape puzzle game of the same name, not the board game. Samantha Fox
Strip Poker was saved 17 notes into its title tune and starts at 0xFA64, which sets the tune's two channel
pointers to their first notes. Pinball Wizard is Sagittarian Software's Pinball, which CP Software sold under
that name (ZXDB lists both releases), and Thro' the Wall is the BASIC game from the Horizons tape that came
with the Spectrum.

Some multi-part snapshots were saved as an interrupt was being taken, and need `start` to run properly:
A View to a Kill part 1 and Short Circuit part 1 were saved as IM 1 interrupts (PC 0038) although their menus
run in IM 2, so their music never played; both now start where the game sets the music up (and IM 2). The two
Supertest days were saved at their IM 2 handler (PC FEFE); started there just before the next interrupt, as Fuse
starts a version 1 snapshot, the handler's screen drawing is interrupted with the stack in the screen and the game
resets or goes black. Both start where the menu tune is set up instead, which also plays it from its first note
(A View to a Kill part 3 and Short Circuit part 2 had been saved mid-tune too). The NeverEnding Story's three snapshots were saved after
each part had loaded; part 1 now boots from the 48K tape instead (above), while parts 2 and 3 keep their
snapshots, which hold the objects and progress carried over from the parts before.

Some snapshots record the interrupt state (on/off) or mode (IM 1/IM 2) differently from how the original game
runs: snapshot tools often guessed the mode, and some snapshots were made from cracked copies that ran
differently. These were checked against the original tapes from ZXDB, loaded in the emulator and compared
wherever both run the same code, and fixed with `start` (which can also set `im`):

- Interrupts on where the game had turned them off. Manic Miner turns them off at start (DI at 8400) but its
  snapshot had them on, so the ROM's interrupt routine ran every frame and wrote its keyboard bytes into the
  game's attribute buffer at 5C00: two flashing squares at the top left of every cavern. Galaxians was saved at
  its level prompt after its own DI; LD SP,5C00 with interrupts on. Pyjamarama's title restart had them on
  where the original tape has them off. All three now continue with interrupts off.
- 54 snapshots were saved just as an interrupt was taken (PC 0038), recorded as IM 1. Cyclone, Kong Strikes
  Back, Raid Over Moscow and Voice Chess really run in IM 2, so the ROM's handler ran instead of the game's own;
  they now start in the game's handler, in IM 2. Match Day (its title), Piromania and The NeverEnding Story
  parts 2 and 3 run that code with interrupts off in the original; the interrupt is undone (back to the return
  address it pushed) and they go on with interrupts off. Bear Bovver needed both: interrupts off at its
  prompt, IM 2 for when the game turns them on. The rest matched their tapes or have none to compare against.
- The 18 snapshots recorded as IM 1 with I other than 3F (the ROM's value; a game sets I to point at its IM 2
  vector table) were checked for a table and for the game's own IM 2 / LD I,A code. Moon Cresta, Shockway Rider,
  Short Circuit, Thunderbirds and A View to a Kill switch to IM 2 themselves, Full Throttle runs with
  interrupts off, and the rest have no table. World Cup and Zaxxon were really in IM 2: World Cup only ever
  sets I=80 together with IM 2 (and its tape runs in IM 2 from the first frame), and Zaxxon sets I=D0, builds
  its table and goes IM 2 at start-up, with no IM 1 anywhere (its earlier "match" was a tape file that never
  loaded the game). Their handlers drive the sound, so in IM 1 both played silently; they now start in the
  game's handler, in IM 2.
- Many games skip the 257-byte table and point I into the ROM, taking the vector from ROM bytes: I=39–3B
  reads FF FF (vector FFFF, where the game puts a JR or JP), I=09 reads FE69, I=19 reads 5D22, I=28 reads
  7E5C. Sports Hero sets I=28 and IM 2 at start-up and has no IM 1, but its snapshot recorded IM 1, so its
  interrupt routine at 7E5C, which draws the athletes, never ran and the tracks stayed empty; it now runs in
  IM 2. Every other game with ROM-vector code was played through its flow with its IM switches and
  interrupts traced: those saved in IM 2 run through their vector, those saved in IM 1 (with I still 3F)
  switch to IM 2 themselves, and Piromania's I=28 routine is never called (its 7E5C is data).

## Status: phase 1 — accurate machine

The emulator was written from scratch for this project in JavaScript; it is not
a port of Fuse's C code or an existing JS emulator. Fuse 1.6.0 is the
reference for behaviour: the emulator is checked against Fuse's own Z80 test
suite and in whole-machine lockstep against a Fuse build patched to log every
bus access (see Verification). The only things taken from Fuse are its 48K ROM
file and its Z80 test data.

The page runs the original Z80 code on a cycle-exact 48K Spectrum model:

- **Z80 core** (`src/z80gen.mjs`): a table-driven generator that emits the
  interpreter as JS. Every memory/port access and contention probe happens in
  the same order and on the same T-state as in Fuse 1.6.0, including MEMPTR,
  the Q register (SCF/CCF), undocumented flags and opcodes.
- **Machine** (`src/machine48.mjs`): 48K ULA memory and I/O contention,
  69888 T-state frames, a 32 T-state interrupt, beam-accurate display latching
  (each 8-pixel cell shows memory as of the moment the beam reaches it), the
  border, issue-3 EAR behaviour, the floating bus and the beeper. Beeper edges
  are timestamped to the T-state and integrated into output samples.
- **Shell** (`src/shell.html`): game menu, 256×192 paper plus a 16px border,
  Fit or 1×–4× integer scaling, touch keys. Each frame's samples are scheduled as an
  audio buffer ~90ms ahead; with sound on the audio clock paces emulation
  (50.08 fps), otherwise wall-clock time does. Short taps are held for at least
  4 frames (12 for ENTER, which the credits screen only polls between notes).

## Build

```bash
node tools/build.mjs
```

The ROM is taken from `/Applications/Fuse.app/Contents/Resources/48.rom`
unless `roms/48.rom` exists or `--rom <path>` is given. Output: `ZXSpectrum.html`.

## Verification

```bash
node tests/fusetest.mjs tests/fuse-z80
```
Fuse's Z80 suite: 1356 tests comparing the full bus-event log, registers,
T-states and memory.

```bash
node tests/zextest.mjs path/to/zexall.com
```
ZEXALL / ZEXDOC flag exercisers (CP/M binaries, not included).

```bash
node tests/lockstep.mjs ref.trace 6000 "10:space:5,1500:enter:5,1600:p:100"
```
Whole-machine lockstep against real Fuse. Build Fuse 1.6.0 with the null UI
and `tests/fuse-reftrace.patch`, then run it with `REFFRAMES`, `REFKEYS` (same
key script) and `REFOUT` set, plus `--machine 48 --no-zxprinter --no-interface2`.
That gives one line per frame: T-state, all registers, and hashes of RAM, the
visible screen and every ULA port write. The lockstep script replays the same
inputs and stops at the first frame that differs.

`tests/headless.mjs <frames> <out.png> [frame:row,bit:dur ...]` runs the
machine without a browser and writes a screenshot. Both it and `lockstep.mjs`
take `SNAP=roms/<file>.z80`, `SNAP=none` for a power-on into BASIC, or (lockstep)
`TAPE=roms/<file>.tzx` to power on with a tape inserted (Fuse: `--tape <file>
--no-auto-load --no-traps --no-accelerate-loader`); `BREAK=1` also pauses at
the tape end and resumes, as the build does.

`tests/statecheck.mjs` checks that a saved state carries on exactly like the
machine it was taken from (registers, RAM, picture and sound every frame): at
the end of the Renegade tape, and every 89 frames of it, Manic Miner's title
music and its flashing loading screen.
Verified identical to Fuse: Bruce Lee 6000 frames, Manic Miner 3000 frames
(Fuse run with `--kempston`), BASIC boot plus typing 1200 frames, Renegade
typed `LOAD ""` + full Speedlock tape load + menu + play 16500 frames.
