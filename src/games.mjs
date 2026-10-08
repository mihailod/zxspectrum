// The entries offered in the page's game menu. Each one has a snapshot (file),
// a tape (tape), or neither (power on into BASIC), the text shown under the
// screen, and the touch-key layout. Keys are Spectrum matrix positions
// [half-row, bit]:
//   0: CAPS Z X C V   1: A S D F G   2: Q W E R T   3: 1 2 3 4 5
//   4: 0 9 8 7 6      5: P O I U Y   6: ENTER L K J H   7: SPACE SYM M N B
//
// Loading screens ("always show the loading screen until a key"):
//   - tape entries are loaded ahead of time by the build (src/tapeboot.mjs):
//     the page starts from the machine state at the end of the tape, with
//     the loading screen up, and carries on from there after a key
//   - screen: a .scr shown first (FLASH animated), then the snapshot boots
//   - holdBoot: the snapshot already shows its loading screen but the game
//     would replace it on its own, so the page pauses at boot; with a screen
//     too, the .scr comes first and the snapshot is held after it
//   - snapshots whose game waits for a key on its loading screen need nothing
//   - a tape entry can also have a .scr, shown first when the tape's own
//     loading screen is gone by the end of the tape
//   - stopAt: for a game that starts before its tape ends, the build saves
//     the state just before this address instead of at the end of the tape
//   - tapeLater: { tape, at, rewind }: a tape the game loads from after it has started (a multi-load
//     game's next part): the page puts it in when the game first reaches address at (its loader), as if
//     PLAY were pressed then, and runs the machine fast while it plays; rewind: back to its start whenever
//     it runs out (a game that searches the tape for what it needs)
//   - tapeKeys: 'frame:KEY[+KEY],…' pressed while the build plays the tape (5
//     frames each, frames counted from power-on), for a loader that asks
//     questions before the rest of the tape loads (Art Studio's installer)
// partOf: on the second and later parts of a game the 48K version loads in parts (each part is its own entry),
// the id of the first part: the game is counted once, and only its first part is in the gallery
// start: { pc, sp, ei } restarts a snapshot at the game's own entry point when
// it was saved part-way through a tune (found by disassembly; see README).
// basicLine: for a game whose title is a BASIC program, run that program from
// this line (the ROM statement loop picks up NEWPPC; the stack is the
// program's own, ERR_SP) instead of carrying on mid-statement.
// pokes: { addr: byte } written into a snapshot before it starts, to put back
// a variable the game had already changed when it was saved (N.O.M.A.D.'s tune).
// kempston: true attaches an idle Kempston interface, false removes the one a
// snapshot's header asks for (default: as the header says).
// issue2: emulate an Issue 2 board, whose keyboard port reads bit 6 set while
// MIC (OUT bit 3) is on, as the ROM's BEEP leaves it; games that test a keyboard
// half-row for exactly FF after a BEEP (Rasputin) never see their keys on Issue 3.
// Start sequences and controls come from each game's instructions (ZXDB) and
// were checked by running the snapshots headlessly.

const K = {
  CS: [0, 0], Z: [0, 1], X: [0, 2], C: [0, 3], V: [0, 4],
  A: [1, 0], S: [1, 1], D: [1, 2], F: [1, 3], G: [1, 4],
  Q: [2, 0], W: [2, 1], E: [2, 2], R: [2, 3], T: [2, 4],
  1: [3, 0], 2: [3, 1], 3: [3, 2], 4: [3, 3], 5: [3, 4],
  0: [4, 0], 9: [4, 1], 8: [4, 2], 7: [4, 3], 6: [4, 4],
  P: [5, 0], O: [5, 1], I: [5, 2], U: [5, 3], Y: [5, 4],
  EN: [6, 0], L: [6, 1], K: [6, 2], J: [6, 3], H: [6, 4],
  SP: [7, 0], SS: [7, 1], M: [7, 2], N: [7, 3], B: [7, 4],
};
const key = (label, sub, name, area, extra = {}) => ({ label, sub, keys: [K[name]], area, ...extra });
const kb = s => `<kbd>${s}</kbd>`;

// Full Spectrum keyboard for typing BASIC on touch screens. CAPS SHIFT and
// SYMBOL SHIFT latch until the next key is released.
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'EN'],
  ['CS', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'SS', 'SP'],
];
const LABEL = { EN: 'ENTER', CS: 'CAPS', SS: 'SYM', SP: 'SPACE' };
const fullKeyboard = {
  columns: 10,
  areas: ROWS.map((r, y) => r.map((_, x) => `k${y}${x}`).join(' ')),
  keys: ROWS.flatMap((r, y) => r.map((n, x) => ({
    label: LABEL[n] || n, keys: [K[n]], area: `k${y}${x}`, small: n.length > 1,
    sticky: n === 'CS' || n === 'SS',
  }))),
};

// Minimum key holds (frames) per game: names -> "row,bit" for the page.
// minimum key holds in frames by key name; '*' applies to every key
const holdsByPos = h => Object.fromEntries(Object.entries(h || {}).map(([n, f]) => [n === '*' ? '*' : K[n].join(','), f]));

const GAME_LIST = [
  {
    id: 'aticatac', name: 'Atic Atac', file: 'roms/ATICATAC.Z80',
    screen: 'roms/ATICATAC.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('E')} down, ${kb('R')} up, ${kb('T')} fire, ` +
      `${kb('Z')} pick up/drop, ${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. Keyboard and the knight are already chosen (4 knight, 5 wizard, 6 serf): press 0 to start.',
    pad: {
      columns: 4, areas: ['. r . t', 'q e w z', 'sp . . zero'],
      keys: [key('R', 'up', 'R', 'r'), key('Q', 'left', 'Q', 'q'), key('E', 'down', 'E', 'e'),
        key('W', 'right', 'W', 'w'), key('T', 'fire', 'T', 't'), key('Z', 'pick up', 'Z', 'z'),
        key('SPACE', 'pause', 'SP', 'sp'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'bcquest', name: "BC's Quest for Tires", file: 'roms/BCQUEST.Z80',
    screen: 'roms/BCQUEST.scr',   // ZXDB loading screen
    keysHelp: `${kb('W')} forward (with ${kb('Enter')} faster), ${kb('Q')} back (with ${kb('Enter')} slower), ` +
      `${kb('K')} jump, ${kb('S')} pause, ${kb('P')} controls.`,
    flowHelp: 'Press any key on the loading screen. Wait for the title to finish, then press ENTER to start.',
    pad: {
      columns: 4, areas: ['q w . k', 'q w . k', 's . . en'],
      keys: [key('Q', 'back', 'Q', 'q'), key('W', 'forward', 'W', 'w'), key('K', 'jump', 'K', 'k'),
        key('S', 'pause', 'S', 's'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'boulderdash', name: 'Boulder Dash', file: 'roms/BDASH1.Z80',
    screen: 'roms/BDASH1.scr',   // ZXDB loading screen
    keysHelp: `${kb('7')} up, ${kb('6')} down, ${kb('5')} left, ${kb('8')} right (also E D O / F K / M X / ` +
      `Symbol C), ${kb('0')} fire (N V B), ${kb('Space')} pause, ${kb('Q')} quit cave.`,
    flowHelp: 'Press any key on the loading screen. Press 6 for keyboard, then fire (0) to continue. On the title hold fire down until the ' +
      'game starts (up to 8 seconds): it only looks at the keys between phrases of the tune.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'sp . q .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down/keys', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero'), key('SPACE', 'pause', 'SP', 'sp'),
        key('Q', 'quit cave', 'Q', 'q')],
    },
  },
  {
    id: 'brucelee', name: 'Bruce Lee', file: 'roms/BruceLee.z80',
    holds: { EN: 12 },   // credits poll the keyboard only between notes (measured)
    keysHelp: `${kb('Q')} ${kb('A')} ${kb('O')} ${kb('P')} up/down/left/right, ` +
      `${kb('Z')}–${kb('M')} punch/kick, ${kb('Enter')} start/pause.`,
    flowHelp: 'Press any key on the loading screen, ENTER to skip the credits, then ENTER again to start.',
    pad: {
      columns: 4, areas: ['q . o p', 'a . o p', 'z sp sp en'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'),
        key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'),
        key('Z', 'punch/kick', 'Z', 'z'), key('SPACE', '', 'SP', 'sp'),
        key('ENTER', 'start/pause', 'EN', 'en')],
    },
  },
  {
    id: 'chuckieegg', name: 'Chuckie Egg', file: 'roms/CHUCKIE.Z80',
    screen: 'roms/CHUCKIE.scr',   // ZXDB loading screen
    // the snapshot was saved mid-way through the title tune: restart at the
    // title routine (where the tape loader jumps after loading, with the stack
    // and interrupts as it left them) so the tune plays from its first note
    start: { pc: 0xa410, sp: 0xff40, ei: 1 },
    keysHelp: `Key set 1: ${kb('2')} up, ${kb('W')} down, ${kb('9')} left, ${kb('0')} right, ` +
      `${kb('Z')} or ${kb('M')} jump. ${kb('R')} on the title redefines set 3.`,
    flowHelp: 'Press any key on the loading screen. Press S to start (once it appears on the title), then 1–4 for the number of players.',
    pad: {
      columns: 4, areas: ['. two . m', 'nine w zero m', 's one . .'],
      keys: [key('2', 'up', '2', 'two'), key('9', 'left', '9', 'nine'), key('W', 'down', 'W', 'w'),
        key('0', 'right', '0', 'zero'), key('M', 'jump', 'M', 'm'), key('S', 'start', 'S', 's'),
        key('1', 'player', '1', 'one')],
    },
  },
  {
    id: 'fist', name: 'The Way of the Exploding Fist', file: 'roms/FIST.Z80',
    screen: 'roms/FIST.scr',   // ZXDB loading screen
    kempston: true,   // reads the Kempston port in play: needs an (idle) interface
    keysHelp: `${kb('Q')} ${kb('W')} ${kb('E')} / ${kb('A')} ${kb('D')} / ${kb('Z')} ${kb('X')} ${kb('C')} ` +
      `are the eight joystick directions (around S), ${kb('1')} is fire: hold it with a direction to kick. ` +
      `Player 2: Y U I / H K / B N M, fire Space. ${kb('G')}+${kb('H')} abort.`,
    flowHelp: 'Press any key on the loading screen. Press E to leave the controls menu, then 1 for one player (2 for two) while the demo runs; ' +
      'press it again if the demo carries on.',
    pad: {
      columns: 4, areas: ['q w e one', 'a . d one', 'z x c one'],
      keys: [key('Q', '', 'Q', 'q'), key('W', 'jump', 'W', 'w'), key('E', '', 'E', 'e'),
        key('A', 'back', 'A', 'a'), key('D', 'forward', 'D', 'd'), key('Z', '', 'Z', 'z'),
        key('X', 'crouch', 'X', 'x'), key('C', '', 'C', 'c'), key('1', 'fire/start', '1', 'one')],
    },
  },
  {
    id: 'hungryhorace', name: 'Hungry Horace', file: 'roms/HORACE.Z80',
    screen: 'roms/HORACE.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('Z')} down, ${kb('I')} left, ${kb('P')} right.`,
    flowHelp: 'Press any key on the loading screen. Press any key to start.',
    pad: {
      columns: 3, areas: ['. q .', 'i . p', '. z .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('P', 'right', 'P', 'p'),
        key('Z', 'down', 'Z', 'z')],
    },
  },
  {
    id: 'hypersports', name: 'Hyper Sports', tape: 'roms/HyperSports.tzx',   // Speedlock 1
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('0')} fire (swim, shoot, jump and lift by ` +
      'alternating left and right; fire to breathe, shoot or jump).',
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard. ' +
      'Enter your name: O and P turn the letter wheel, 0 picks a letter, pick END to finish.',
    pad: {
      columns: 4, areas: ['o p . zero', 'o p . zero', 'one . . .'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('0', 'fire', '0', 'zero'),
        key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'jetpac', name: 'Jetpac', file: 'roms/JETPAC.Z80',
    screen: 'roms/JETPAC.scr',   // ZXDB loading screen
    keysHelp: `Bottom row: ${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} ` +
      `${kb('Symbol')} right; ${kb('Q')}–${kb('P')} thrust, ${kb('A')}–${kb('Enter')} fire, ` +
      `${kb('1')}–${kb('0')} hover.`,
    flowHelp: 'Press any key on the loading screen. Keyboard is already chosen: press 5 to start (1 or 2 for the number of players first).',
    pad: {
      columns: 4, areas: ['q q . a', 'z x . a', 'one . . five'],
      keys: [key('Q', 'thrust', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'),
        key('A', 'fire', 'A', 'a'), key('1', 'hover', '1', 'one'), key('5', 'start', '5', 'five')],
    },
  },
  {
    id: 'knightlore', name: 'Knight Lore', file: 'roms/KNIGHTLO.Z80',
    keysHelp: `Bottom row: ${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} turn left, ${kb('X')} ${kb('V')} ` +
      `${kb('N')} ${kb('Symbol')} turn right; ${kb('A')}–${kb('L')} walk, ${kb('Q')}–${kb('P')} jump, ` +
      `${kb('1')}–${kb('0')} pick up/drop, ${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard and 0 to start.',
    pad: {
      columns: 4, areas: ['q . . one', 'z a x .', 'sp . . zero'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'walk', 'A', 'a'),
        key('X', 'right', 'X', 'x'), key('1', 'pick up', '1', 'one'), key('SPACE', 'pause', 'SP', 'sp'),
        key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'kokotoniwilf', name: 'Kokotoni Wilf', file: 'roms/KOKOTONI.Z80',
    screen: 'roms/KOKOTONI.scr',   // ZXDB loading screen
    kempston: true,   // reads the Kempston port in play: needs an (idle) interface
    holds: { EN: 12 },        // ENTER needs >= 8 frames on the title (measured)
    keysHelp: `${kb('Z')} (M, 5) left, ${kb('X')} (Symbol, 8) right, ${kb('0')} or ${kb('1')} fly, ` +
      `${kb('Space')} music on/off.`,
    flowHelp: 'Press any key on the loading screen. Press ENTER to start.',
    pad: {
      columns: 4, areas: ['z x . zero', 'z x . zero', 'sp . . en'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('0', 'fly', '0', 'zero'),
        key('SPACE', 'music', 'SP', 'sp'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'loderunner', name: 'Lode Runner', file: 'roms/LODE-1.Z80',
    screen: 'roms/LODE-1.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('Z')} down, ${kb('I')} left, ${kb('P')} right, ${kb('N')} dig. ` +
      `${kb('Shift')}+${kb('A')} abort the screen, ${kb('Shift')}+${kb('R')} restart.`,
    flowHelp: 'Press any key on the loading screen. Press ENTER after the intro for the menu, 1 for keyboard, 0 to start, then any key.',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 'en one zero .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'),
        key('P', 'right', 'P', 'p'), key('N', 'dig', 'N', 'n'), key('ENTER', 'menu', 'EN', 'en'),
        key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'manicminer', name: 'Manic Miner', file: 'roms/ManicMiner.z80',
    // Bug-Byte's loading screen (ZXDB, distribution allowed): FLASH swaps
    // MANIC and MINER. The snapshot itself starts after loading.
    screen: 'roms/ManicMiner.scr',
    // The snapshot was saved with interrupts on, but the game runs with them off (DI at 8400): left on, the ROM's
    // keyboard routine writes KSTATE into the game's attribute buffer at 5C00 every frame, showing two flashing
    // squares at the top left of every cavern. Same place, interrupts off.
    start: { pc: 0x9303, ei: 0 },
    // The title screen polls ENTER between notes (12 frames to start reliably,
    // measured). ENTER shares the music on/off row, so the start press also
    // turns the in-game music off, exactly as on a real Spectrum and in Fuse.
    holds: { EN: 12 },
    keysHelp: `${kb('O')} left, ${kb('P')} right (also Q E T U / W R Y I), ${kb('Space')} or any ` +
      `bottom-row key jumps, ${kb('A')} pause, ${kb('H')} music on/off.`,
    flowHelp: 'Press any key on the loading screen. The demo plays first: press ENTER for the title ' +
      'screen, then ENTER again to start. Starting with ENTER switches the in-game music off; press H ' +
      'to turn it back on.',
    pad: {
      columns: 4, areas: ['o p . sp', 'o p . sp', 'a h . en'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('SPACE', 'jump', 'SP', 'sp'),
        key('A', 'pause', 'A', 'a'), key('H', 'music', 'H', 'h'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'maziacs', name: 'Maziacs', file: 'roms/MAZIACS.Z80',
    holdBoot: true,       // the game replaces its loading screen after ~6 s
    holds: { K: 16, B: 16 },   // its menus poll the keys slowly (measured)
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('X')} left, ${kb('C')} right, ${kb('V')} view the way, ` +
      `${kb('I')} instructions.`,
    flowHelp: 'Press any key on the loading screen, K for keys, then B to start. D shows the keys, ' +
      'G sets the level.',
    pad: {
      columns: 4, areas: ['. q . v', 'x a c .', 'k b . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'),
        key('C', 'right', 'C', 'c'), key('V', 'view', 'V', 'v'), key('K', 'keys', 'K', 'k'),
        key('B', 'start', 'B', 'b')],
    },
  },
  {
    id: 'mikie', name: 'Mikie', file: 'roms/MIKIE.Z80',
    screen: 'roms/MIKIE.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('M')} shout ` +
      `(with a direction to hip-zap).`,
    flowHelp: 'Press any key on the loading screen. Press any key, then 1 for keyboard.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'one . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('M', 'shout', 'M', 'm'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'moonalert', name: 'Moon Alert', file: 'roms/MOONALER.Z80',
    // saved mid-tune: restart where the game redraws the loading screen and
    // starts the tune (also where it returns after a game)
    start: { pc: 0xa544, sp: 0xfd00, ei: 1 },
    holdBoot: true,           // hold the loading screen silent until a key, like the others
    holds: { SP: 50 },        // the loading screen needs SPACE for ~1 s (measured)
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} ${kb('Space')} faster, ${kb('X')} ${kb('V')} ` +
      `${kb('N')} ${kb('Caps')} ${kb('Symbol')} slower, ${kb('Q')}–${kb('I')} jump, ${kb('A')}–${kb('K')} fire, ` +
      `${kb('P')}+${kb('L')} pause.`,
    flowHelp: 'Press any key on the loading screen to start the music, then SPACE (ENTER for instructions), ' +
      'N for no Interface 2, then 1 player.',
    pad: {
      columns: 4, areas: ['q . . a', 'x . z a', 'sp n one .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('X', 'slower', 'X', 'x'), key('Z', 'faster', 'Z', 'z'),
        key('A', 'fire', 'A', 'a'), key('SPACE', 'start', 'SP', 'sp'), key('N', 'no', 'N', 'n'),
        key('1', 'player', '1', 'one')],
    },
  },
  {
    id: 'penetrator', name: 'Penetrator', file: 'roms/PENETRAT.Z80',
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('P')} fire (hold for thrust), ${kb('0')} brake, ` +
      `bottom row (${kb('Space')}) bombs.`,
    flowHelp: 'Press any key on the loading screen. The title is drawn for about 25 seconds, then press 1 ' +
      'for one player (T training, E landscape editor).',
    pad: {
      columns: 4, areas: ['q . . p', 'a . zero sp', 'one . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'), key('P', 'fire', 'P', 'p'),
        key('0', 'brake', '0', 'zero'), key('SPACE', 'bomb', 'SP', 'sp'), key('1', 'player', '1', 'one')],
    },
  },
  {
    id: 'pheenix', name: 'Pheenix', file: 'roms/PHEENIX.Z80',
    screen: 'roms/PHEENIX.scr',   // ZXDB loading screen
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('Space')} fire, ${kb('Enter')} barrier.`,
    flowHelp: 'Press any key on the loading screen. Press S to start, B for keyboard, then 1–5 for the level.',
    pad: {
      columns: 4, areas: ['cs z . sp', 'cs z . en', 's b one .'],
      keys: [key('CAPS', 'left', 'CS', 'cs'), key('Z', 'right', 'Z', 'z'), key('SPACE', 'fire', 'SP', 'sp'),
        key('ENTER', 'barrier', 'EN', 'en'), key('S', 'start', 'S', 's'), key('B', 'keyboard', 'B', 'b'),
        key('1', 'level', '1', 'one')],
    },
  },
  {
    id: 'pingpong', name: 'Ping-Pong', file: 'roms/PINGPONG.Z80',
    screen: 'roms/PINGPONG.scr',   // ZXDB loading screen
    start: { pc: 0x6000 },   // saved mid-tune: restart at the game's entry (sets its own stack)
    keysHelp: `${kb('Enter')} serve, ${kb('X')} backhand, ${kb('B')} drive, ${kb('N')} cut, ${kb('H')} smash ` +
      '(the bat follows the ball).',
    flowHelp: 'Press any key on the loading screen. Press 1 for one player, 1 again for keyboard and 0 to start. Pick a level with N and B, ' +
      'then X.',
    pad: {
      columns: 4, areas: ['x b n h', 'en en one zero'],
      keys: [key('X', 'backhand', 'X', 'x'), key('B', 'drive', 'B', 'b'), key('N', 'cut', 'N', 'n'),
        key('H', 'smash', 'H', 'h'), key('ENTER', 'serve', 'EN', 'en'), key('1', '', '1', 'one'),
        key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'renegade', name: 'Renegade', tape: 'roms/Renegade.tzx',   // Speedlock 4
    holds: { 1: 12, 2: 12, 3: 12, 4: 12, 5: 12 },   // the menu misses taps < 8 frames (measured)
    keysHelp: `${kb('K')} left, ${kb('L')} right, ${kb('Q')} up, ${kb('A')} down, ` +
      `${kb('Space')} hit (with a direction for other moves), ${kb('S')} pause.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard ' +
      'controls, or 5 to redefine the keys (left, right, down, up, hit).',
    pad: {
      columns: 4, areas: ['q . k l', 'a . k l', 'one sp sp s'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'),
        key('K', 'left', 'K', 'k'), key('L', 'right', 'L', 'l'),
        key('1', 'keyboard', '1', 'one'), key('SPACE', 'hit', 'SP', 'sp'),
        key('S', 'pause', 'S', 's')],
    },
  },
  {
    id: 'scubadive', name: 'Scuba Dive', file: 'roms/SCUBADIV.Z80',
    keysHelp: `${kb('Z')} and ${kb('X')} turn the diver, ${kb('Space')} swims faster, ${kb('Symbol')} slower.`,
    flowHelp: 'Press 1–4 on the loading screen to pick the skill and start (K redefines the keys).',
    pad: {
      columns: 4, areas: ['z x . sp', 'z x . ss', 'one . . .'],
      keys: [key('Z', 'turn', 'Z', 'z'), key('X', 'turn', 'X', 'x'), key('SPACE', 'faster', 'SP', 'sp'),
        key('SYM', 'slower', 'SS', 'ss'), key('1', 'skill', '1', 'one')],
    },
  },
  {
    id: 'sirlancelot', name: 'Sir Lancelot', file: 'roms/LANCELOT.Z80',
    screen: 'roms/LANCELOT.scr',   // ZXDB loading screen
    start: { pc: 0x5c08 },   // saved mid-tune: restart where the tape loader jumps (sets its own stack)
    kempston: true,   // reads the Kempston port in play: needs an (idle) interface
    keysHelp: `${kb('O')} (Q E T U) left, ${kb('P')} (W R Y I) right, ${kb('Space')} or any bottom-row key jumps.`,
    flowHelp: 'Press any key on the loading screen. Press jump (SPACE) to start.',
    pad: {
      columns: 4, areas: ['o p . sp', 'o p . sp'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('SPACE', 'jump', 'SP', 'sp')],
    },
  },
  {
    id: 'skooldaze', name: 'Skool Daze', file: 'roms/SKOOL.Z80',
    holdBoot: true,           // the game replaces its loading screen after ~4 s
    // saved mid-way through the theme: restart where the loader jumps after
    // relocating the code (SP 0x5CFE, interrupts on), so the theme plays whole
    start: { pc: 0x6900, sp: 0x5cfe, ei: 1 },
    holds: { SP: 80, N: 60, Y: 60 },   // the demo and the Y/N question poll the keys rarely (measured)
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} upstairs, ${kb('A')} downstairs ` +
      `(with ${kb('Caps')} fast), ${kb('S')} sit/stand, ${kb('H')} hit, ${kb('J')} jump, ${kb('F')} fire, ` +
      `${kb('W')} write.`,
    flowHelp: 'Press any key on the loading screen. To stop the demo hold SPACE down for a second or two, ' +
      'then N (or Y to type your own names).',
    pad: {
      columns: 4, areas: ['. q . f', 'o a p j', 's h w n', 'sp sp sp sp'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('F', 'fire', 'F', 'f'), key('J', 'jump', 'J', 'j'),
        key('S', 'sit', 'S', 's'), key('H', 'hit', 'H', 'h'), key('W', 'write', 'W', 'w'),
        key('N', 'no', 'N', 'n'), key('SPACE', 'hold to stop the demo', 'SP', 'sp')],
    },
  },
  {
    id: 'spyhunter', name: 'Spy Hunter', file: 'roms/SPYHUNT.Z80',
    keysHelp: 'Keys are yours to choose in the menu, for example ' +
      `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Space')} fire.`,
    flowHelp: 'Press ENTER on the loading screen, then 0 to start. Press your keys for left, right, up, ' +
      'down and fire (for example O P Q A Space), 1 to accept them, then N for novice (E for expert).',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'en one zero n'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('ENTER', 'menu', 'EN', 'en'),
        key('1', 'yes', '1', 'one'), key('0', 'start', '0', 'zero'), key('N', 'novice', 'N', 'n')],
    },
  },
  {
    id: 'westbank', name: 'West Bank', file: 'roms/WESTBANK.Z80',
    screen: 'roms/WESTBANK.scr',   // ZXDB loading screen
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('1')} ${kb('2')} ${kb('3')} shoot at the left, ` +
      'middle and right door.',
    flowHelp: 'Press any key on the loading screen. Press 0 to start.',
    pad: {
      columns: 4, areas: ['o p . zero', 'one two three .'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('0', 'start', '0', 'zero'),
        key('1', 'left door', '1', 'one'), key('2', 'middle', '2', 'two'), key('3', 'right door', '3', 'three')],
    },
  },
  {
    id: 'pinball3d', name: '3D Pinball (YU, UK)', tape: 'roms/Pinball3D.tzx',
    screen: 'roms/Pinball3D.scr',   // ZXDB loading screen; the tape's last block clears it
    keysHelp: `${kb('Q')} (or ${kb('W')}–${kb('T')}) left flipper, ${kb('P')} (or ${kb('Y')}–${kb('O')}) right flipper, ` +
      `${kb('Enter')} launches the ball.`,
    flowHelp: 'Press any key on the loading screen. Press SPACE to start a game, then ENTER to launch the ball. ' +
      '(This is Mastertronic\'s Pinball Power under its re-release name.)',
    pad: {
      columns: 4, areas: ['q . . p', 'q sp en p'],
      keys: [key('Q', 'left flipper', 'Q', 'q'), key('P', 'right flipper', 'P', 'p'),
        key('SPACE', 'start', 'SP', 'sp'), key('ENTER', 'launch', 'EN', 'en')],
    },
  },
  {
    id: 'alien8', name: 'Alien 8', file: 'roms/ALIEN8.Z80',
    holds: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20 },   // the menu reads the keys between notes
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} turn left, ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} ` +
      `turn right, ${kb('A')}–${kb('Enter')} forward, ${kb('Q')}–${kb('P')} jump, ${kb('1')}–${kb('0')} pick up/drop, ` +
      `${kb('Caps')} or ${kb('Space')} pause.`,
    flowHelp: 'The loading screen waits for a key. Then press 1 for the keyboard and 0 to start.',
    pad: {
      columns: 4, areas: ['z q a x', 'z one zero x'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('Q', 'jump', 'Q', 'q'),
        key('A', 'forward', 'A', 'a'), key('1', 'pick up', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'arcofyesod', name: 'The Arc of Yesod', file: 'roms/ARCYESOD.Z80',
    screen: 'roms/ARCYESOD.scr',   // ZXDB loading screen (48K)
    // saved mid-tune: restart at the game's entry (stack and IM 2 set there)
    start: { pc: 0xb834 },
    holds: { 1: 20, 2: 20, 3: 20, 4: 20 },   // the menu reads the keys between notes
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} right, ` +
      `${kb('Q')}–${kb('P')} jump (or mole up), ${kb('A')}–${kb('L')} smart bomb (or mole down), ` +
      `${kb('1')}–${kb('0')} switch between Charlie and the mole.`,
    flowHelp: 'Press any key on the loading screen. Press 1 for the keyboard (hold it a moment).',
    pad: {
      columns: 4, areas: ['z q a x', 'z one . x'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('Q', 'jump', 'Q', 'q'),
        key('A', 'bomb', 'A', 'a'), key('1', 'mole', '1', 'one')],
    },
  },
  {
    id: 'bladerunner', name: 'Blade Runner', file: 'roms/BLADERUN.Z80',
    // saved mid-way through the theme: restart where the loader calls the
    // music (stack as that call left it, interrupts off)
    start: { pc: 0xc000, sp: 0xfffd, ei: 0 },
    holdBoot: true,           // the theme would start straight away
    keysHelp: `${kb('A')} up, ${kb('Z')} down, ${kb('N')} left, ${kb('M')} right, ` +
      `${kb('Space')} fire / take off / land, ${kb('P')} pause.`,
    flowHelp: 'Press any key on the loading screen to start the music. The theme plays to its end ' +
      '(about a minute, it can\'t be skipped); then press N to keep the standard controls.',
    pad: {
      columns: 4, areas: ['. a . sp', 'n z m sp', '. . . p'],
      keys: [key('A', 'up', 'A', 'a'), key('Z', 'down', 'Z', 'z'), key('N', 'left / no', 'N', 'n'),
        key('M', 'right', 'M', 'm'), key('SPACE', 'fire', 'SP', 'sp'), key('P', 'pause', 'P', 'p')],
    },
  },
  {
    id: 'bluemax', name: 'Blue Max', file: 'roms/BLUEMAX.Z80',
    keysHelp: `${kb('O')} climb, ${kb('K')} dive, ${kb('Z')} left, ${kb('X')} right, ${kb('0')} fire.`,
    flowHelp: 'The loading screen waits for a key. Then press S to start (K redefines the keys, J picks a joystick). ' +
      'Fire (0) starts the engine; climb with O once you pass 100 mph.',
    pad: {
      columns: 4, areas: ['. o . zero', 'z k x zero', 's . . .'],
      keys: [key('O', 'climb', 'O', 'o'), key('K', 'dive', 'K', 'k'), key('Z', 'left', 'Z', 'z'),
        key('X', 'right', 'X', 'x'), key('0', 'fire', '0', 'zero'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'brianbloodaxe', name: 'Brian Bloodaxe', file: 'roms/BLOODAXE.Z80',
    // saved mid-tune: restart at the call that starts the tune (stack as it left it)
    start: { pc: 0x60e4, sp: 0x9087, ei: 1 },
    holdBoot: true,           // the tune would start straight away
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('C')} jump, ${kb('X')} fire/use, ` +
      `${kb('V')} or ${kb('Space')} pick up/drop, ${kb('T')} tune on/off.`,
    flowHelp: 'Press any key on the loading screen to start the music. After the tune, Brian\'s walk and the ' +
      '(fake) crash, press ENTER to start.',
    pad: {
      columns: 4, areas: ['c . . sp', 'cs z x sp', 'en . . .'],
      keys: [key('CAPS', 'left', 'CS', 'cs'), key('Z', 'right', 'Z', 'z'), key('C', 'jump', 'C', 'c'),
        key('X', 'fire', 'X', 'x'), key('SPACE', 'pick up', 'SP', 'sp'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'cookie', name: 'Cookie', file: 'roms/COOKIE.Z80',
    screen: 'roms/COOKIE.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('E')} down, ${kb('R')} up, ${kb('T')} throw flour, ` +
      `${kb('Caps')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (one player), 3 (keyboard) and 0 to start.',
    pad: {
      columns: 4, areas: ['. r . t', 'q e w t', 'one three zero .'],
      keys: [key('R', 'up', 'R', 'r'), key('Q', 'left', 'Q', 'q'), key('E', 'down', 'E', 'e'),
        key('W', 'right', 'W', 'w'), key('T', 'throw', 'T', 't'), key('1', 'one player', '1', 'one'),
        key('3', 'keyboard', '3', 'three'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'cowboykidz', name: 'Cowboy Kidz (YU, UK)', file: 'roms/COWBOYK.Z80',
    screen: 'roms/COWBOYK.scr',   // ZXDB loading screen
    start: { pc: 0x6354 },        // saved mid-tune: restart at the game's entry (sets its own stack)
    keysHelp: `Cursor keys: ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} fire.`,
    flowHelp: 'Press any key on the loading screen. Press 4 (cursor keys) and 0, then 0 again when asked if ' +
      'you are ready (1 lets you choose your own keys).',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'four . . .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero'), key('4', 'cursor', '4', 'four')],
    },
  },
  {
    id: 'cyberun', name: 'Cyberun', file: 'roms/CYBERUN.Z80',
    screen: 'roms/CYBERUN.scr',   // ZXDB loading screen
    // saved after the menu tune: restart at the main loop (as the game's own start
    // at 9A64 does), which draws the menu and plays the tune (F26C)
    start: { pc: 0xf422, sp: 0x5b80 },
    holds: { 1: 16, A: 16, 0: 16 },   // the tune reads the keys between notes, <= 16 frames apart (measured)
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} ` +
      `right, ${kb('A')}–${kb('Enter')} thrust up, ${kb('Q')}–${kb('P')} laser, ${kb('1')}–${kb('0')} plasma ray.`,
    flowHelp: 'Press any key on the loading screen; the menu plays its tune (any key ends it). Press 1 three ' +
      'times so P1 points at KEYBOARD, then A (one player) and 0 to start.',
    pad: {
      columns: 4, areas: ['z a q x', 'z one zero x'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('A', 'thrust / 1 player', 'A', 'a'),
        key('Q', 'laser', 'Q', 'q'), key('1', 'plasma / controls', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'deathstar', name: 'Death Star Interceptor', file: 'roms/DEATHSTR.Z80',
    keysHelp: `${kb('O')} bank left, ${kb('P')} bank right, ${kb('A')}–${kb('G')} climb, ${kb('Q')}–${kb('Y')} dive, ` +
      `bottom row (${kb('Z')}–${kb('V')}, ${kb('B')}–${kb('Space')}) fire.`,
    flowHelp: 'The loading screen waits for a key. Press L to launch (M for the mission briefing), ' +
      'then pull back (hold A) to take off through the star gate.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'l m . .'],
      keys: [key('Q', 'dive', 'Q', 'q'), key('A', 'climb', 'A', 'a'), key('O', 'left', 'O', 'o'),
        key('P', 'right', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('L', 'launch', 'L', 'l'),
        key('M', 'briefing', 'M', 'm')],
    },
  },
  {
    id: 'fairlight', name: 'Fairlight', tape: 'roms/Fairlight.tzx',   // The Edge, release 2 (ZXDB)
    // the tape, not the snapshot: the title tune is played by code from the end of
    // the tape that the game overwrites, so no snapshot taken later can play it
    kempston: true,           // idle interface, as the old snapshot's header had (9 = joystick)
    holds: { '*': 8 },        // the tune reads the keys between notes, <= 6.5 frames apart (measured)
    keysHelp: `${kb('Q')}–${kb('T')} up-left, ${kb('Y')}–${kb('P')} up-right, ${kb('A')}–${kb('G')} down-right, ` +
      `${kb('H')}–${kb('Enter')} down-left, ${kb('Space')} jump, ${kb('B')}–${kb('M')} fight, ${kb('X')}–${kb('V')} pick up, ` +
      `${kb('Caps')}–${kb('Z')} drop, ${kb('1')}–${kb('5')} choose an object, ${kb('6')} ${kb('7')} use it.`,
    flowHelp: 'Press any key on the loading screen to hear the title tune; any key ends it and shows the ' +
      'key list, then any key starts.',
    pad: {
      columns: 4, areas: ['q . . p', 'en . . a', 'sp m x z', 'one six . .'],
      keys: [key('Q', 'up-left', 'Q', 'q'), key('P', 'up-right', 'P', 'p'), key('ENTER', 'down-left', 'EN', 'en'),
        key('A', 'down-right', 'A', 'a'), key('SPACE', 'jump', 'SP', 'sp'), key('M', 'fight', 'M', 'm'),
        key('X', 'pick up', 'X', 'x'), key('Z', 'drop', 'Z', 'z'), key('1', 'object', '1', 'one'),
        key('6', 'use', '6', 'six')],
    },
  },
  {
    id: 'fairlight2a', name: 'Fairlight II (part 1)', file: 'roms/FAIRL2-1.Z80',
    // saved mid-tune: restart where the tune is set up and played (stack as the snapshot had it there)
    start: { pc: 0xa41a, sp: 0x6129, ei: 1 },
    holdBoot: true,           // the tune would start straight away
    holds: { '*': 12 },       // the tune reads the keys between notes (measured)
    keysHelp: `${kb('Q')}–${kb('T')} up-left, ${kb('Y')}–${kb('P')} up-right, ${kb('A')}–${kb('G')} down-right, ` +
      `${kb('H')}–${kb('Enter')} down-left, ${kb('Space')} jump, ${kb('B')}–${kb('M')} fight, ${kb('X')}–${kb('V')} pick up, ` +
      `${kb('Caps')}–${kb('Z')} drop, ${kb('1')}–${kb('5')} choose an object, ${kb('6')} ${kb('7')} use it, ` +
      `${kb('Symbol')}+${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen to start the music, then any key to play. On a 48K the game ' +
      'comes in two parts; part 2 is its own entry here.',
    pad: {
      columns: 4, areas: ['q . . p', 'en . . a', 'sp m x z', 'one six . .'],
      keys: [key('Q', 'up-left', 'Q', 'q'), key('P', 'up-right', 'P', 'p'), key('ENTER', 'down-left', 'EN', 'en'),
        key('A', 'down-right', 'A', 'a'), key('SPACE', 'jump', 'SP', 'sp'), key('M', 'fight', 'M', 'm'),
        key('X', 'pick up', 'X', 'x'), key('Z', 'drop', 'Z', 'z'), key('1', 'object', '1', 'one'),
        key('6', 'use', '6', 'six')],
    },
  },
  {
    id: 'fairlight2b', name: 'Fairlight II (part 2)', file: 'roms/FAIRL2-2.Z80',
    partOf: 'fairlight2a',          // a later part: one game with fairlight2a (not counted, not in the gallery)
    screen: 'roms/FAIRL2.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')}–${kb('T')} up-left, ${kb('Y')}–${kb('P')} up-right, ${kb('A')}–${kb('G')} down-right, ` +
      `${kb('H')}–${kb('Enter')} down-left, ${kb('Space')} jump, ${kb('B')}–${kb('M')} fight, ${kb('X')}–${kb('V')} pick up, ` +
      `${kb('Caps')}–${kb('Z')} drop, ${kb('1')}–${kb('5')} choose an object, ${kb('6')} ${kb('7')} use it, ` +
      `${kb('Symbol')}+${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. This snapshot of the second part starts in play, ' +
      'with an enemy already in the room.',
    pad: {
      columns: 4, areas: ['q . . p', 'en . . a', 'sp m x z', 'one six . .'],
      keys: [key('Q', 'up-left', 'Q', 'q'), key('P', 'up-right', 'P', 'p'), key('ENTER', 'down-left', 'EN', 'en'),
        key('A', 'down-right', 'A', 'a'), key('SPACE', 'jump', 'SP', 'sp'), key('M', 'fight', 'M', 'm'),
        key('X', 'pick up', 'X', 'x'), key('Z', 'drop', 'Z', 'z'), key('1', 'object', '1', 'one'),
        key('6', 'use', '6', 'six')],
    },
  },
  {
    id: 'formula1', name: 'Formula One', tape: 'roms/FormulaOneCRL.tzx',
    loadCommand: 'LOAD "" CODE',   // the tape has no BASIC loader; its first block starts itself
    keysHelp: `Lists: ${kb('6')} up, ${kb('7')} down, ${kb('Enter')} pick. Pit stops: ${kb('Q')} up, ${kb('Z')} down, ` +
      `${kb('I')} left, ${kb('P')} right, ${kb('N')} do it. During a race: ${kb('P')} call in for a pit stop, ` +
      `${kb('C')} cancel it, ${kb('F')} full race, ${kb('H')} highlights only, ${kb('G')} gamble, ${kb('S')} save.`,
    flowHelp: 'A Grand Prix management game for 1 to 6 players. Press any key on the loading screen, any key again ' +
      '(L would load a saved game) and any key once more (J is for a Kempston joystick). Then 1–6 for the number ' +
      'of players (0 for a demo), 1–5 for how good the computer managers are, and follow the prompts.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'gbabasketball', name: 'GBA Championship Basketball', file: 'roms/GBABASK.Z80',
    screen: 'roms/GBABASK.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} forward, ${kb('A')} back, ${kb('X')} left, ${kb('C')} right, ${kb('Z')} shoot/jump; ` +
      `${kb('Space')} and ${kb('Enter')} work the menus.`,
    flowHelp: 'Press any key on the loading screen. In each menu SPACE moves to the next choice and ENTER picks it: ' +
      'SPACE three times for KEYBOARD, then ENTER for Game, One Player and a skill level.',
    pad: {
      columns: 4, areas: ['. q . z', 'x a c z', 'sp . . en'],
      keys: [key('Q', 'forward', 'Q', 'q'), key('A', 'back', 'A', 'a'), key('X', 'left', 'X', 'x'),
        key('C', 'right', 'C', 'c'), key('Z', 'shoot', 'Z', 'z'), key('SPACE', 'next', 'SP', 'sp'),
        key('ENTER', 'pick', 'EN', 'en')],
    },
  },
  {
    id: 'gunfright', name: 'Gunfright', file: 'roms/GUNFRGHT.Z80',
    screen: 'roms/GUNFRGHT.scr',   // ZXDB loading screen
    // saved mid-tune: restart where the menu's flags are cleared and the menu called (stack as it left it)
    start: { pc: 0xa374, sp: 0x5e00 },
    holds: { 1: 30, 2: 30, 3: 30 },   // the menu reads the keys between notes
    keysHelp: `${kb('X')} ${kb('V')} ${kb('N')} turn left, ${kb('C')} ${kb('B')} ${kb('M')} turn right, ` +
      `${kb('A')}–${kb('F')} walk, ${kb('1')}–${kb('0')} draw and fire, ${kb('Z')} change the view, ` +
      `${kb('Caps')} or ${kb('Space')} pause. In the money-bag round ${kb('Q')} row up, ${kb('A')} row down.`,
    flowHelp: 'Press any key on the loading screen. Press 3 to start (1 and 2 change players and controls; ' +
      'hold them a moment). Shoot the money bags, then find the outlaw in town.',
    pad: {
      columns: 4, areas: ['x q a c', 'x zero z c', 'three . . .'],
      keys: [key('X', 'left', 'X', 'x'), key('C', 'right', 'C', 'c'), key('A', 'walk / down', 'A', 'a'),
        key('Q', 'up', 'Q', 'q'), key('0', 'fire', '0', 'zero'), key('Z', 'view', 'Z', 'z'),
        key('3', 'start', '3', 'three')],
    },
  },
  {
    id: 'heartland', name: 'Heartland', file: 'roms/HEARTLND.Z80',
    screen: 'roms/HEARTLND.scr',   // ZXDB loading screen
    // saved just after the tune started: restart at the menu routine (its return address is already on the stack)
    start: { pc: 0xbca8, sp: 0xfdfe, ei: 1 },
    holds: { 1: 20, 2: 20, 3: 20 },   // the menu reads the keys between notes
    keysHelp: `bottom row (${kb('Z')}–${kb('Space')}) walk and turn, ${kb('A')}–${kb('Enter')} through a door out of the ` +
      `screen, ${kb('Q')}–${kb('P')} through a door into the screen / jump, ${kb('1')}–${kb('0')} fire (and use a bed).`,
    flowHelp: 'Press any key on the loading screen. Press 1 for the keyboard (hold it a moment).',
    pad: {
      columns: 4, areas: ['q . . one', 'z z a one'],
      keys: [key('Q', 'in / jump', 'Q', 'q'), key('Z', 'walk / turn', 'Z', 'z'), key('A', 'out', 'A', 'a'),
        key('1', 'fire', '1', 'one')],
    },
  },
  {
    id: 'highway', name: 'Highway Encounter', file: 'roms/HIGHWAY.Z80',
    keysHelp: `${kb('1')} accelerate, ${kb('Q')} decelerate, ${kb('O')} left, ${kb('P')} right, ${kb('Space')} fire, ` +
      `${kb('H')} hold, ${kb('A')}+${kb('G')} abort.`,
    flowHelp: 'The loading screen waits for a key. Then press 1 (keyboard) and 7 to start.',
    pad: {
      columns: 4, areas: ['one q . sp', 'o p . sp', 'seven h . .'],
      keys: [key('1', 'faster', '1', 'one'), key('Q', 'slower', 'Q', 'q'), key('O', 'left', 'O', 'o'),
        key('P', 'right', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('7', 'start', '7', 'seven'),
        key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'id', name: 'iD', tape: 'roms/iD.tzx',   // Nu Wave (ZXDB)
    // the tape, not the snapshot: that one is a Microdrive conversion saved part-way
    // through drawing the title, so its title and shatter screens were garbled
    keysHelp: 'Type to talk to iD; ENTER ends a line.',
    flowHelp: 'Press any key on the loading screen, then a key on each of the next three screens (the title, ' +
      'the title shattering, iD introducing itself). When WANT TO LOAD SAVED DATA? has finished printing, type ' +
      'NO and ENTER.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'lunarjetman', name: 'Lunar Jetman', file: 'roms/LUNARJET.Z80',
    screen: 'roms/LUNARJET.scr',   // ZXDB loading screen
    keysHelp: `${kb('X')} ${kb('N')} left, ${kb('C')} ${kb('M')} right, ${kb('Q')}–${kb('P')} thrust, ` +
      `${kb('A')}–${kb('Enter')} fire, ${kb('Z')} pick up/drop, ${kb('Caps')} get in/out of the rover, ${kb('0')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (one player), 3 (keyboard) and 6 to start.',
    pad: {
      columns: 4, areas: ['q . . a', 'x c z cs', 'one three six .'],
      keys: [key('Q', 'thrust', 'Q', 'q'), key('A', 'fire', 'A', 'a'), key('X', 'left', 'X', 'x'),
        key('C', 'right', 'C', 'c'), key('Z', 'pick up', 'Z', 'z'), key('CAPS', 'rover', 'CS', 'cs'),
        key('1', 'one player', '1', 'one'), key('3', 'keyboard', '3', 'three'), key('6', 'start', '6', 'six')],
    },
  },
  {
    id: 'matchpoint', name: 'Match Point', file: 'roms/MATCHPT.Z80',
    screen: 'roms/MATCHPT.scr',   // ZXDB loading screen
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('B')} (or keys right of it) swing, ` +
      `${kb('H')} pause.`,
    flowHelp: 'Press any key on the loading screen. In the menu SPACE moves to the next column, 0 picks and ENTER ' +
      'plays. For one player on the keyboard: SPACE, 0, SPACE, SPACE, 0, 0, ENTER, then ENTER twice to keep the ' +
      'names. A demo starts after a few seconds; P brings back the menu.',
    pad: {
      columns: 4, areas: ['. q . b', 'i z p b', 'sp zero en .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'),
        key('P', 'right / menu', 'P', 'p'), key('B', 'swing', 'B', 'b'), key('SPACE', 'next', 'SP', 'sp'),
        key('0', 'pick', '0', 'zero'), key('ENTER', 'play', 'EN', 'en')],
    },
  },
  {
    id: 'maxheadroom', name: 'Max Headroom', file: 'roms/HEADROOM.Z80',
    screen: 'roms/HEADROOM.scr',   // ZXDB loading screen
    keysHelp: `Cursor keys: ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} fire.`,
    flowHelp: 'Press any key on the loading screen. After the credits press any key, then 5 (cursor keys) and ' +
      '0 to start (6 lets you choose your own keys).',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left / cursor', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero')],
    },
  },
  {
    id: 'nightshade', name: 'Nightshade', file: 'roms/NIGHTSHD.Z80',
    screen: 'roms/NIGHTSHD.scr',   // ZXDB loading screen
    start: { pc: 0xbe04 },        // saved mid-tune: restart at the game's entry (sets its own stack, clears the tune flag)
    holds: { 0: 12, 1: 12, 2: 12, 3: 12, 4: 12, 5: 12 },   // the menu reads the keys between notes
    keysHelp: `${kb('X')} ${kb('V')} ${kb('N')} turn left, ${kb('C')} ${kb('B')} ${kb('M')} turn right, ` +
      `${kb('A')}–${kb('G')} forward, ${kb('Q')}–${kb('T')} fire, ${kb('Caps')} or ${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (keyboard) and 0 to start.',
    pad: {
      columns: 4, areas: ['x q a c', 'x one zero c'],
      keys: [key('X', 'left', 'X', 'x'), key('C', 'right', 'C', 'c'), key('Q', 'fire', 'Q', 'q'),
        key('A', 'forward', 'A', 'a'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'panamajoe', name: 'Panama Joe', file: 'roms/PANAMA.Z80',
    screen: 'roms/PANAMA.scr',   // ZXDB loading screen
    keysHelp: `Cursor keys: ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} jump; ` +
      `${kb('P')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 2 (cursor keys), then J, K or L to start on level 1, 2 or 3.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'two j . p'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'jump', '0', 'zero'), key('2', 'cursor', '2', 'two'),
        key('J', 'level 1', 'J', 'j'), key('P', 'pause', 'P', 'p')],
    },
  },
  {
    id: 'pentagram', name: 'Pentagram', file: 'roms/PENTAGRM.Z80',
    screen: 'roms/PENTAGRM.scr',   // ZXDB loading screen
    // saved mid-tune: restart where the menu's flags are cleared and the menu called (stack as it left it)
    start: { pc: 0xaf87, sp: 0x5e00 },
    holds: { 1: 30, 2: 30, 3: 30, 4: 30, 0: 12 },   // the menu reads the keys between notes
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} right, ` +
      `${kb('A')}–${kb('L')} forward, ${kb('Q')} ${kb('E')} ${kb('T')} ${kb('U')} ${kb('O')} jump, ` +
      `${kb('W')} ${kb('R')} ${kb('Y')} ${kb('I')} ${kb('P')} fire, ${kb('1')}–${kb('0')} pick up/drop, ${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (keyboard), then 0 to start.',
    pad: {
      columns: 4, areas: ['z q w x', 'z a one x', '. . zero .'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('Q', 'jump', 'Q', 'q'),
        key('W', 'fire', 'W', 'w'), key('A', 'forward', 'A', 'a'), key('1', 'pick up', '1', 'one'),
        key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'planet10', name: 'Planet 10 (YU, unreleased)', tape: 'roms/Planet10.tap',
    screen: 'roms/Planet10.scr',   // ZXDB loading screen; the tape's last block is the story picture
    keysHelp: `${kb('O')} turn left, ${kb('P')} turn right, ${kb('Q')} speed up, ${kb('A')} turn back, ` +
      `${kb('H')} hold, ${kb('T')} abort.`,
    flowHelp: 'Press any key on the loading screen. Hold any key to speed through the story, then press 0 to ' +
      'start (1 shows the keys). Mastertronic never released this game; it was recovered later.',
    pad: {
      columns: 4, areas: ['. q . zero', 'o a p zero'],
      keys: [key('Q', 'speed up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'turn back', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'pssst', name: 'Pssst', file: 'roms/PSSST.Z80',
    screen: 'roms/PSSST.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('E')} up, ${kb('R')} down, ${kb('T')} spray, ${kb('Caps')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (one player), 3 (keyboard) and 5 to start.',
    pad: {
      columns: 4, areas: ['. e . t', 'q r w t', 'one three five .'],
      keys: [key('E', 'up', 'E', 'e'), key('Q', 'left', 'Q', 'q'), key('R', 'down', 'R', 'r'),
        key('W', 'right', 'W', 'w'), key('T', 'spray', 'T', 't'), key('1', 'one player', '1', 'one'),
        key('3', 'keyboard', '3', 'three'), key('5', 'start', '5', 'five')],
    },
  },
  {
    id: 'pyramid', name: 'The Pyramid', file: 'roms/PYRAMID.Z80',
    screen: 'roms/PYRAMID.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, bottom row fire.`,
    flowHelp: 'Press any key on the loading screen. Press 5 for the keyboard, then P to play.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'five . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right / play', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('5', 'keyboard', '5', 'five')],
    },
  },
  {
    id: 'robin', name: 'Robin of the Wood', tape: 'roms/RobinOfTheWood.tzx',   // TOSEC, Odin's tape
    // the tape, not the snapshot: the snapshot's speech data at E502 had been
    // overwritten by the game's buffers (garbled speech), and the only .scr was
    // the 128K one. (TOSEC's "(48K-128K).tap" is a bad dump: F206-FFEF, the end
    // of the speech and what follows, is a copy of the ROM, and 68BE is wrong;
    // this tape agrees with the 19 other TOSEC copies.) The game (entry BF70, as C435 = USR 50229 in the snapshot's
    // build) starts its speech before the tape ends, so the build stops right
    // after the speech's first OUT (8CC6), which also sets the border black
    stopAt: 0x8cc8,
    holds: { 0: 40, 1: 40, 2: 40, 3: 40, 4: 40 },   // the menu reads the keys between notes
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('N')} left, ${kb('M')} right, ${kb('Space')} fire ` +
      `(with a direction to strike), ${kb('Enter')} pause.`,
    flowHelp: 'Press any key on the loading screen to hear the title spoken, then the menu appears. Press 0 ' +
      '(hold it a moment) to start with these keys; 1 lets you choose your own.',
    pad: {
      columns: 4, areas: ['. q . sp', 'n a m sp', 'zero . . en'],
      keys: [key('Q', 'up', 'Q', 'q'), key('N', 'left', 'N', 'n'), key('A', 'down', 'A', 'a'),
        key('M', 'right', 'M', 'm'), key('SPACE', 'fire', 'SP', 'sp'), key('0', 'start', '0', 'zero'),
        key('ENTER', 'pause', 'EN', 'en')],
    },
  },
  {
    id: 'rocky', name: 'Rocky', file: 'roms/ROCKY.Z80',
    keysHelp: `${kb('1')}–${kb('5')} left attack, ${kb('6')}–${kb('0')} right attack, ${kb('Q')}–${kb('T')} left ` +
      `defence, ${kb('Y')}–${kb('P')} right defence, ${kb('Space')} stop, ${kb('Caps')} restart.`,
    flowHelp: 'The loading screen waits for a key. Press 1 (keyboard) and 0 to start, then type three initials ' +
      'and ENTER.',
    pad: {
      columns: 4, areas: ['one . . zero', 'q . . p', 'en sp . .'],
      keys: [key('1', 'left attack', '1', 'one'), key('0', 'right attack', '0', 'zero'),
        key('Q', 'left guard', 'Q', 'q'), key('P', 'right guard', 'P', 'p'), key('ENTER', 'enter', 'EN', 'en'),
        key('SPACE', 'stop', 'SP', 'sp')],
    },
  },
  {
    id: 'sabrewulf', name: 'Sabre Wulf', file: 'roms/SABREWLF.Z80',
    screen: 'roms/SABREWLF.scr',   // ZXDB loading screen
    // saved mid-tune: restart at the title routine (its return address is already on the stack)
    start: { pc: 0xb3d5, sp: 0x5ffe },
    holds: { 1: 12, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 0: 30 },   // the menu reads the keys between notes
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('E')} down, ${kb('R')} up, ${kb('T')} fight, ` +
      `${kb('Caps')} or ${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (one player), 3 (keyboard) and 0 to start.',
    pad: {
      columns: 4, areas: ['. r . t', 'q e w t', 'one three zero .'],
      keys: [key('R', 'up', 'R', 'r'), key('Q', 'left', 'Q', 'q'), key('E', 'down', 'E', 'e'),
        key('W', 'right', 'W', 'w'), key('T', 'fight', 'T', 't'), key('1', 'one player', '1', 'one'),
        key('3', 'keyboard', '3', 'three'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'saboteur', name: 'Saboteur', file: 'roms/SABOTEUR.Z80',
    screen: 'roms/SABOTEUR.scr',   // ZXDB loading screen
    keysHelp: `${kb('A')} jump/climb up, ${kb('Z')} duck/climb down, ${kb('N')} left, ${kb('M')} right, ` +
      `${kb('Space')} throw / use / punch.`,
    flowHelp: 'Press any key on the loading screen and again on the reward notice. Press K (keyboard), ' +
      'S to start and 1–9 for the skill level.',
    pad: {
      columns: 4, areas: ['. a . sp', 'n z m sp', 'k s one .'],
      keys: [key('A', 'up', 'A', 'a'), key('N', 'left', 'N', 'n'), key('Z', 'down', 'Z', 'z'),
        key('M', 'right', 'M', 'm'), key('SPACE', 'throw', 'SP', 'sp'), key('K', 'keyboard', 'K', 'k'),
        key('S', 'start', 'S', 's'), key('1', 'skill', '1', 'one')],
    },
  },
  {
    id: 'shockway', name: 'Shockway Rider', file: 'roms/SHOCKWAY.Z80',
    keysHelp: 'Keys are yours to choose, for example ' +
      `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Space')} fire.`,
    flowHelp: 'The loading screen waits for a key. Press K and press your keys for left, right, up, down and fire ' +
      '(for example O P Q A SPACE), then fire to start and 1–8 for the level.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'k one . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('K', 'keyboard', 'K', 'k'),
        key('1', 'level', '1', 'one')],
    },
  },
  {
    id: 'splittingimages', name: 'Splitting Images', tape: 'roms/SplittingImages.tzx',
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, bottom row fire, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (keyboard) and 5 to start.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'one five h .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'),
        key('P', 'right', 'P', 'p'), key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'),
        key('5', 'start', '5', 'five'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'spyvsspy', name: 'Spy vs Spy', file: 'roms/SPYVSSPY.Z80',
    screen: 'roms/SPYVSSPY.scr',   // ZXDB loading screen
    keysHelp: `White spy: ${kb('K')} up, ${kb('M')} down, ${kb('Z')} left, ${kb('X')} right, ${kb('L')} fire/act; ` +
      `${kb('T')} pause, ${kb('U')} sound.`,
    flowHelp: 'Press any key on the loading screen. Press Y to start (6 and 7 move the cursor and 8 changes a ' +
      'setting on the options screen).',
    pad: {
      columns: 4, areas: ['. k . l', 'z m x l', 'y t . .'],
      keys: [key('K', 'up', 'K', 'k'), key('Z', 'left', 'Z', 'z'), key('M', 'down', 'M', 'm'),
        key('X', 'right', 'X', 'x'), key('L', 'fire', 'L', 'l'), key('Y', 'start', 'Y', 'y'),
        key('T', 'pause', 'T', 't')],
    },
  },
  {
    id: 'stoptheexpress', name: 'Stop the Express', file: 'roms/STOPEXP.Z80',
    screen: 'roms/STOPEXP.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} jump left, ${kb('A')} walk left, ${kb('Z')} dive left, ${kb('E')} jump right, ` +
      `${kb('D')} walk right, ${kb('C')} dive right, ${kb('Space')} set the bird free.`,
    flowHelp: 'Press any key on the loading screen. Press K for the keyboard.',
    pad: {
      columns: 4, areas: ['q . . e', 'a . . d', 'z sp k c'],
      keys: [key('Q', 'jump left', 'Q', 'q'), key('A', 'left', 'A', 'a'), key('Z', 'dive left', 'Z', 'z'),
        key('E', 'jump right', 'E', 'e'), key('D', 'right', 'D', 'd'), key('C', 'dive right', 'C', 'c'),
        key('SPACE', 'bird', 'SP', 'sp'), key('K', 'keyboard', 'K', 'k')],
    },
  },
  {
    id: 'tapper', name: 'Tapper', file: 'roms/TAPPER.Z80',
    // saved mid-tune: restart at the program's entry (USR 32768) with the
    // BASIC stack pointer that the program itself saved at 0x803E
    start: { pc: 0x8000, sp: 0x5da6, ei: 1 },
    holdBoot: true,           // the tune would start straight away
    holds: { '*': 12 },       // the title reads the keys between notes (measured)
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} serve, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen to start the music, then any key for the menu (or wait for ' +
      'the demo). Press S, type your name and ENTER, then any key.',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 's en . h'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'),
        key('P', 'right', 'P', 'p'), key('N', 'serve', 'N', 'n'), key('S', 'start', 'S', 's'),
        key('ENTER', 'enter', 'EN', 'en'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'tetris', name: 'Tetris', file: 'roms/TETRIS.Z80',
    screen: 'roms/TETRIS.scr',   // ZXDB loading screen (Mirrorsoft)
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('O')} rotate, ${kb('Space')} drop, ${kb('S')} show the next piece.`,
    flowHelp: 'Press any key on the loading screen. Press SPACE, then a level from 0 to 9 and ENTER.',
    pad: {
      columns: 4, areas: ['. o . sp', 'i . p sp', 'five en s .'],
      keys: [key('O', 'rotate', 'O', 'o'), key('I', 'left', 'I', 'i'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'drop', 'SP', 'sp'), key('5', 'level', '5', 'five'), key('ENTER', 'enter', 'EN', 'en'),
        key('S', 'next', 'S', 's')],
    },
  },
  {
    id: 'thunderbirds', name: 'Thunderbirds', file: 'roms/THUNDERB.Z80',
    screen: 'roms/THUNDERB.scr',   // ZXDB loading screen
    // the theme is played from the interrupt routine and was saved mid-way:
    // restart where the title is set up (stack, tune pointers, interrupts)
    start: { pc: 0xe15e },
    holds: { 6: 20, 7: 20, A: 20 },   // the equipment screen reads the keys slowly (measured)
    keysHelp: `${kb('7')} up, ${kb('6')} down, ${kb('5')} left, ${kb('8')} right, ${kb('A')} switch craft, ` +
      `${kb('M')} music, ${kb('P')} pause.`,
    flowHelp: 'Press any key on the loading screen, then any key on Tracy Island and A to start. Choose the ' +
      'cargo with 6/7 and A, then TAKE OFF.',
    pad: {
      columns: 4, areas: ['. seven . a', 'five six eight a', 'p m . .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('A', 'select / craft', 'A', 'a'), key('P', 'pause', 'P', 'p'),
        key('M', 'music', 'M', 'm')],
    },
  },
  {
    id: 'tranzam', name: 'Tranz Am', file: 'roms/TRANSAM.Z80',
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} turn anticlockwise, ${kb('X')} ${kb('V')} ${kb('N')} ` +
      `${kb('Symbol')} clockwise, ${kb('Q')}–${kb('P')} accelerate, ${kb('A')}–${kb('Enter')} brake, ${kb('Caps')} pause.`,
    flowHelp: 'The loading screen waits for a key. Then press 1 (keyboard) and 3 to start.',
    pad: {
      columns: 4, areas: ['z q a x', 'z one three x'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('Q', 'accelerate', 'Q', 'q'),
        key('A', 'brake', 'A', 'a'), key('1', 'keyboard', '1', 'one'), key('3', 'start', '3', 'three')],
    },
  },
  {
    id: 'underwurlde', name: 'Underwurlde', file: 'roms/UNDERWLD.Z80',
    screen: 'roms/UNDERWLD.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('R')} up/jump, ${kb('E')} down, ${kb('T')} fire, ` +
      `${kb('Z')} drop from a rope, ${kb('Space')} pick up/drop a weapon, ${kb('Enter')} pause.`,
    flowHelp: 'Press any key on the loading screen. Press 1 (keyboard) and 0 to start.',
    pad: {
      columns: 4, areas: ['. r . t', 'q e w t', 'one zero z sp'],
      keys: [key('R', 'up', 'R', 'r'), key('Q', 'left', 'Q', 'q'), key('E', 'down', 'E', 'e'),
        key('W', 'right', 'W', 'w'), key('T', 'fire', 'T', 't'), key('1', 'keyboard', '1', 'one'),
        key('0', 'start', '0', 'zero'), key('Z', 'drop', 'Z', 'z'), key('SPACE', 'weapon', 'SP', 'sp')],
    },
  },
  {
    id: 'wsbasketball', name: 'World Series Basketball', file: 'roms/WSBASKET.Z80',
    screen: 'roms/WSBASKET.scr',   // ZXDB loading screen
    // saved mid-tune: restart at the program's entry with the BASIC stack
    // pointer the program saved at 0x6C83 (the loader jumps there via 0x5B00)
    start: { pc: 0x6c00, sp: 0x63e6, ei: 1 },
    holds: { '*': 12 },       // the title reads the keys between notes
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} throw, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen (the music starts), then any key for the menu. Press S, ' +
      'type a team name and ENTER.',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 's en . h'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'),
        key('P', 'right', 'P', 'p'), key('N', 'throw', 'N', 'n'), key('S', 'start', 'S', 's'),
        key('ENTER', 'enter', 'EN', 'en'), key('H', 'hold', 'H', 'h')],
    },
  },
  // ---- batch 3 ----
  {
    id: 'wheelie', name: 'Wheelie', file: 'roms/WHEELIE.Z80',
    screen: 'roms/WHEELIE.scr',   // ZXDB loading screen
    keysHelp: `Bottom row: ${kb('Caps')}–${kb('V')} left, ${kb('B')}–${kb('Space')} right (speeds you up that way, ` +
      `or brakes); ${kb('Q')}–${kb('P')} up and ${kb('A')}–${kb('Enter')} down at a junction; ${kb('1')}–${kb('0')} freeze.`,
    flowHelp: 'Press any key on the loading screen. On the menu press a bottom-row key to play, then ENTER at the ' +
      'code prompt for level 1 (Q–P shows the instructions, 1–0 a demonstration).',
    pad: {
      columns: 4, areas: ['. q . en', 'z . . m', '. a . one'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'), key('Z', 'left', 'Z', 'z'), key('M', 'right', 'M', 'm'),
        key('1', 'freeze', '1', 'one'), key('ENTER', 'level 1', 'EN', 'en')],
    },
  },
  {
    id: 'montymole', name: 'Wanted: Monty Mole', file: 'roms/MONTYMOL.Z80',
    // saved 5.4 s into the title tune: restart where the tune starts (after the loader)
    start: { pc: 0xd29d },
    holdBoot: true,           // the tune would start straight away
    holds: { 1: 52 },         // the tune reads the keys only between notes, up to 50 frames apart (measured)
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('B')}–${kb('Space')} jump.`,
    flowHelp: 'Press any key on the loading screen to hear the tune. Press 1 (hold it a moment) to end it, then on ' +
      'the options 1 for keyboard and 0 to play.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'one zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'jump', 'SP', 'sp'), key('1', 'tune / keys', '1', 'one'), key('0', 'play', '0', 'zero')],
    },
  },
  {
    id: 'wizardslair', name: "Wizard's Lair", file: 'roms/WIZLAIR.Z80',
    holdBoot: true,           // the snapshot's loading screen gives way to the menu (and its music) by itself
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('M')} fire.`,
    flowHelp: 'Press any key on the loading screen: the menu plays its tune. Press 4 for the keys O P Q A M, then 0 to play.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'four zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('4', 'keys', '4', 'four'), key('0', 'play', '0', 'zero')],
    },
  },
  {
    id: 'starquake', name: 'Starquake', file: 'roms/STARQUAK.Z80',
    screen: 'roms/STARQUAK.scr',   // ZXDB loading screen
    // saved 4.75 s into the menu tune: restart where the menu is drawn and tune 3 played
    start: { pc: 0x5ec8, sp: 0x5e15, ei: 1 },
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up / pick up, ${kb('A')} down / lay a platform, ` +
      `${kb('M')} fire, ${kb('Space')} pause; ${kb('A')}${kb('S')}${kb('D')}${kb('F')}${kb('G')} together abort.`,
    flowHelp: 'Press any key on the loading screen: the menu plays its tune. Press 4 for the keys O P A Q M, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'four zero . sp'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('4', 'keys', '4', 'four'), key('0', 'start', '0', 'zero'), key('SPACE', 'pause', 'SP', 'sp')],
    },
  },
  {
    id: 'trashman', name: 'Trashman', file: 'roms/TRASHMAN.Z80',
    screen: 'roms/TRASHMAN.scr',   // ZXDB loading screen
    keysHelp: `Cursor keys: ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down (hold ${kb('6')} to leave a ` +
      `house), ${kb('0')} fire.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard. At "Enter applicants name" 7 and 6 change the ' +
      'letter and 0 takes it; keep pressing 0 until the game starts.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'one . . .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'bladealley', name: 'Blade Alley', file: 'roms/BLADEALL.Z80',
    holdBoot: true,           // the loading screen gives way to the key page by itself
    keysHelp: `${kb('1')}–${kb('0')} climb, ${kb('A')}–${kb('Enter')} dive, ${kb('Q')}–${kb('T')} left, ` +
      `${kb('Y')}–${kb('P')} right, bottom row fire.`,
    flowHelp: 'Press any key on the loading screen. On the key page press a bottom-row key (fire) to play; J is for a joystick.',
    pad: {
      columns: 4, areas: ['. one . sp', 'q . p sp', '. a . .'],
      keys: [key('1', 'climb', '1', 'one'), key('Q', 'left', 'Q', 'q'), key('P', 'right', 'P', 'p'),
        key('A', 'dive', 'A', 'a'), key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'footballmanager', name: 'Football Manager', file: 'roms/FOOTMAN.Z80',
    // the tape is a single BASIC program with no loading screen: show the game's own GOAL! moment from a match
    screen: 'roms/FOOTMAN.scr',
    keysHelp: 'Type your answers on your keyboard and press ENTER.',
    flowHelp: "Kevin Toms' original. Press any key on the loading screen, then type your name and ENTER, the number of the team you want to manage and ENTER, " +
      'then a level, and follow the questions from there.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'blindalley', name: 'Blind Alley', file: 'roms/BLINDALL.Z80',
    keysHelp: `${kb('Caps')} or ${kb('Z')} left, ${kb('X')} ${kb('C')} ${kb('V')} right, ${kb('B')}–${kb('Space')} down, ` +
      `${kb('H')}–${kb('Enter')} up.`,
    flowHelp: 'Press any key on the title. When the text has finished printing press 2 for the keyboard, then any key ' +
      'past the instructions and the key list.',
    pad: {
      columns: 4, areas: ['. h . two', 'z . x .', '. sp . .'],
      keys: [key('H', 'up', 'H', 'h'), key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'),
        key('SPACE', 'down', 'SP', 'sp'), key('2', 'keyboard', '2', 'two')],
    },
  },
  {
    id: 'booty', name: 'Booty', file: 'roms/BOOTY.Z80',
    screen: 'roms/BOOTY.scr',   // ZXDB loading screen (Firebird)
    // saved 0.9 s into the title tune (played by the interrupt routine): restart at the
    // start-up code that points the tune at its start (FA00) and draws the title
    start: { pc: 0xcd22, sp: 0x68db, ei: 0 },
    keysHelp: `${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('A')} enter a room.`,
    flowHelp: 'Press any key on the loading screen (the title tune starts) and any key for the menu; keyboard is ' +
      'chosen, so press 0 to start (5 lets you define keys).',
    pad: {
      columns: 4, areas: ['. seven . a', 'five six eight a', 'zero . . .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('A', 'enter room', 'A', 'a'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'piromania', name: 'Piromania', file: 'roms/PIROMAN.Z80',
    screen: 'roms/PIROMAN.scr',   // ZXDB loading screen (ZXDB: Infernal Combustion)
    keysHelp: `${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} right, ` +
      `${kb('Q')}–${kb('P')} up, ${kb('A')}–${kb('Enter')} down, ${kb('1')}–${kb('0')} use an object, ` +
      `${kb('Space')} drop it, ${kb('Caps')} open or close a door (with ${kb('Space')}: pause).`,
    flowHelp: 'Press any key on the loading screen; keyboard is chosen, so press 4 to begin.',
    pad: {
      columns: 4, areas: ['. q . one', 'z a x sp', 'cs four . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'down', 'A', 'a'), key('X', 'right', 'X', 'x'),
        key('1', 'use', '1', 'one'), key('SPACE', 'drop', 'SP', 'sp'), key('CAPS', 'door', 'CS', 'cs'),
        key('4', 'begin', '4', 'four')],
    },
  },
  {
    id: 'birdsbees', name: 'The Birds and the Bees', file: 'roms/BIRDSBEE.Z80',
    // saved 0.4 s into the title tune: restart where the tune starts
    start: { pc: 0x92fd, sp: 0x7fa4, ei: 1 },
    holdBoot: true,           // the tune would start straight away
    holds: { '*': 6 },        // the tune reads the keys between notes, up to 4 frames apart (measured)
    kempston: true,           // the game reads the Kempston port: without an interface its noise flies the bee (seen)
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('B')}–${kb('Space')} drop nectar, ` +
      `${kb('H')} hold, ${kb('S')} carry on after a hold.`,
    flowHelp: 'Press any key on the loading screen to hear the tune; any key ends it. Press a key again when PRESS ANY ' +
      'KEY TO PLAY scrolls by.',
    pad: {
      columns: 4, areas: ['. q . sp', 'i z p sp', 'h s . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'drop', 'SP', 'sp'), key('H', 'hold', 'H', 'h'), key('S', 'carry on', 'S', 's')],
    },
  },
  {
    id: 'kungfu', name: 'Kung-Fu (YU, UK)', file: 'roms/KUNGFU.Z80',
    keysHelp: `${kb('Symbol')} left, ${kb('Space')} right, ${kb('1')} chop, ${kb('2')} punch, ${kb('3')} low kick, ` +
      `${kb('4')} high kick. Two players: player 1 ${kb('Caps')} ${kb('Z')} and ${kb('1')}–${kb('4')}, player 2 ` +
      `${kb('Symbol')} ${kb('Space')} and ${kb('7')}–${kb('0')}.`,
    flowHelp: 'Press any key on the loading screen; 1 for keyboard, 4 to fight the computer (5 for two players), 0 to start.',
    pad: {
      columns: 4, areas: ['ss . . sp', 'one two three four', 'zero . . .'],
      keys: [key('SYM', 'left', 'SS', 'ss', { small: true }), key('SPACE', 'right', 'SP', 'sp'), key('1', 'chop', '1', 'one'),
        key('2', 'punch', '2', 'two'), key('3', 'low kick', '3', 'three'), key('4', 'high kick', '4', 'four'),
        key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'no1', name: 'No 1 (YU, unreleased)', tape: 'roms/No1.tap',   // ZXDB (Bug-Byte, 1985)
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('M')} fire, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen: the menu plays its music. Press 1 for keyboard, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'one zero h .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'jetsetwilly', name: 'Jet Set Willy', file: 'roms/JSW.Z80',   // saved after the colour code was entered
    screen: 'roms/JSW.scr',   // ZXDB loading screen
    // saved on the title: restart at the title routine so Moonlight Sonata plays from its first note
    start: { pc: 0x87ca, sp: 0x5c00 },
    // the snapshot's game found a Kempston interface (85CE = 1) and reads its fire button
    // between notes; without one the port's noise counts as fire and the game starts by itself
    kempston: true,
    holds: { EN: 24 },        // the title tune reads ENTER between notes, up to 20 frames apart (measured)
    keysHelp: `${kb('Q')} ${kb('E')} ${kb('T')} ${kb('U')} ${kb('O')} left, ${kb('W')} ${kb('R')} ${kb('Y')} ${kb('I')} ` +
      `${kb('P')} right, bottom row jump.`,
    flowHelp: 'Press any key on the loading screen: Moonlight Sonata plays on the title. Press ENTER to start.',
    pad: {
      columns: 3, areas: ['q sp p', 'en . .'],
      keys: [key('Q', 'left', 'Q', 'q'), key('SPACE', 'jump', 'SP', 'sp'), key('P', 'right', 'P', 'p'),
        key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'beachhead', name: 'Beach-Head', file: 'roms/BEACHHD.Z80',
    screen: 'roms/BEACHHD.scr',   // ZXDB loading screen
    // saved in the attract demo: restart at the program's start (title, Hall of Fame, demo)
    start: { pc: 0x8000 },
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} fire, ${kb('H')} halt.`,
    flowHelp: 'Press any key on the loading screen and any key on the title for the menu. Press S, type your name, ' +
      'ENTER, and any key to start.',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 's en h .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('N', 'fire', 'N', 'n'), key('S', 'start', 'S', 's'), key('ENTER', 'enter', 'EN', 'en'), key('H', 'halt', 'H', 'h')],
    },
  },
  {
    id: 'raidovermoscow', name: 'Raid Over Moscow', file: 'roms/RAIDMOSC.Z80',
    screen: 'roms/RAIDMOSC.scr',   // ZXDB loading screen
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} fire, ${kb('H')} halt; ` +
      `${kb('Caps')} with ${kb('Space')} aborts.`,
    flowHelp: 'Press any key on the loading screen and any key on the title for the menu; keyboard is chosen, so ' +
      'press S, type your name and ENTER, and any key (D defines keys, I shows the instructions).',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 's h . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('N', 'fire', 'N', 'n'), key('S', 'start', 'S', 's'), key('H', 'halt', 'H', 'h')],
    },
  },
  {
    id: 'galaxians', name: 'Galaxians', file: 'roms/GALAXIAN.Z80',   // Artic, 1982
    screen: 'roms/GALAXIAN.scr',   // ZXDB loading screen
    // saved at the level prompt after the game's DI; LD SP,5C00 (62E1) but with interrupts on, so the ROM's
    // interrupt routine ran on: same place, interrupts off (the game never turns them on)
    start: { pc: 0x6314, ei: 0 },
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('Space')} fire, ${kb('S')} stop (any key carries on), ` +
      `${kb('A')} abandon the game.`,
    flowHelp: 'Press any key on the loading screen, a level from 1 to 9, then 1 or 2 players.',
    pad: {
      columns: 4, areas: ['cs z . sp', 'one . . sp'],
      keys: [key('CAPS', 'left', 'CS', 'cs'), key('Z', 'right', 'Z', 'z'), key('SPACE', 'fire', 'SP', 'sp'),
        key('1', 'level / player', '1', 'one')],
    },
  },
  {
    id: 'bearbovver', name: 'Bear Bovver', file: 'roms/BEARBOV.Z80',
    screen: 'roms/BEARBOV.scr',   // ZXDB loading screen
    keysHelp: `${kb('O')} ${kb('L')} ${kb('6')} left, ${kb('P')} ${kb('Enter')} ${kb('7')} right, ${kb('Q')}–${kb('T')} ` +
      `${kb('9')} up, ${kb('A')}–${kb('G')} ${kb('8')} down, bottom row or ${kb('0')} drop a time bomb.`,
    flowHelp: 'Press any key on the loading screen, 1 for keyboard and ENTER. Then 1 (Baby Bear practice) or 2 (Big ' +
      'Bear), and any other key, such as S, to start.',
    pad: {
      columns: 4, areas: ['. q . z', 'o a p z', 'one two s .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('Z', 'bomb', 'Z', 'z'), key('1', 'keys / baby', '1', 'one'), key('2', 'big bear', '2', 'two'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'worldcup', name: 'World Cup', file: 'roms/WORLDCUP.Z80',   // Artic, 1983 (ZXDB: World Cup Football)
    screen: 'roms/WORLDCUP.scr',   // ZXDB loading screen
    keysHelp: `Player 1: ${kb('I')} up, ${kb('Q')} down, ${kb('A')} left, ${kb('S')} right, bottom row fire. ` +
      `Player 2: ${kb('0')} up, ${kb('O')} down, ${kb('J')} left, ${kb('K')} right. ${kb('Y')} sound, ${kb('R')} pause.`,
    flowHelp: 'Press any key on the loading screen, 1 for keyboard and 4 for the World Cup (5 to practise). Then ENTER ' +
      'to take each choice (cursor keys 5–8 change it: players, your team) and ENTER again to kick off.',
    pad: {
      columns: 4, areas: ['. i . z', 'a q s z', 'one four en .'],
      keys: [key('I', 'up', 'I', 'i'), key('A', 'left', 'A', 'a'), key('Q', 'down', 'Q', 'q'), key('S', 'right', 'S', 's'),
        key('Z', 'fire', 'Z', 'z'), key('1', 'keyboard', '1', 'one'), key('4', 'world cup', '4', 'four'),
        key('ENTER', 'enter', 'EN', 'en')],
    },
  },
  {
    id: 'tll', name: 'TLL – Tornado Low Level', file: 'roms/TLL.Z80',
    keysHelp: `${kb('1')} climb, ${kb('Q')} dive, ${kb('G')} bank left, ${kb('H')} bank right, ${kb('X')} take off / ` +
      `wing mode, ${kb('M')} map.`,
    flowHelp: 'Press any key on the title, then 1 for keyboard and 3 to start (4 shows the instructions).',
    pad: {
      columns: 4, areas: ['one . . x', 'q g h m', 'three . . .'],
      keys: [key('1', 'climb', '1', 'one'), key('Q', 'dive', 'Q', 'q'), key('G', 'left', 'G', 'g'), key('H', 'right', 'H', 'h'),
        key('X', 'take off', 'X', 'x'), key('M', 'map', 'M', 'm'), key('3', 'start', '3', 'three')],
    },
  },
  {
    id: 'cyclone', name: 'Cyclone', file: 'roms/CYCLONE.Z80',
    screen: 'roms/CYCLONE.scr',   // ZXDB loading screen
    keysHelp: `${kb('1')} up, ${kb('Q')} down, ${kb('O')} left, ${kb('P')} right, ${kb('X')} forward, ${kb('M')} map, ` +
      `${kb('N')} change the view; ${kb('A')} with ${kb('G')} aborts.`,
    flowHelp: 'Press any key on the loading screen, 2 for keyboard, then 6 to start (1 gives information).',
    pad: {
      columns: 4, areas: ['one . . x', 'q o p m', 'n two six .'],
      keys: [key('1', 'up', '1', 'one'), key('Q', 'down', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'),
        key('X', 'forward', 'X', 'x'), key('M', 'map', 'M', 'm'), key('N', 'view', 'N', 'n'), key('2', 'keyboard', '2', 'two'),
        key('6', 'start', '6', 'six')],
    },
  },
  {
    id: 'alienhighway', name: 'Alien Highway', file: 'roms/ALIENHWY.Z80',
    screen: 'roms/ALIENHWY.scr',   // ZXDB loading screen
    holds: { 1: 6, 5: 6 },    // the options read the keys up to 4.5 frames apart (measured)
    keysHelp: `${kb('Q')} accelerate, ${kb('A')} decelerate, ${kb('K')} left, ${kb('L')} right, ${kb('Space')} or ` +
      `${kb('Z')}–${kb('M')} fire, ${kb('P')} pause, ${kb('Enter')} carry on; ${kb('G')} with ${kb('U')} gives up.`,
    flowHelp: 'Press any key on the loading screen, 1 for keyboard, then 5 to start.',
    pad: {
      columns: 4, areas: ['. q . sp', 'k a l sp', 'one five p en'],
      keys: [key('Q', 'faster', 'Q', 'q'), key('K', 'left', 'K', 'k'), key('A', 'slower', 'A', 'a'), key('L', 'right', 'L', 'l'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'), key('5', 'start', '5', 'five'),
        key('P', 'pause', 'P', 'p'), key('ENTER', 'carry on', 'EN', 'en')],
    },
  },
  {
    id: 'popeye', name: 'Popeye', file: 'roms/POPEYE.Z80',
    screen: 'roms/POPEYE.scr',   // ZXDB loading screen (DK'Tronics original)
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('Q')} up (or back a layer), ${kb('A')} down (or forward), ` +
      `${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen, then K for keys and S to start (R redefines them).',
    pad: {
      columns: 4, areas: ['. q . .', 'z a x .', 'k s h .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'down', 'A', 'a'), key('X', 'right', 'X', 'x'),
        key('K', 'keys', 'K', 'k'), key('S', 'start', 'S', 's'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'deathchase', name: '3D Deathchase', file: 'roms/DEATHCHS.Z80',
    screen: 'roms/DEATHCHS.scr',   // ZXDB loading screen (Micromega)
    keysHelp: `${kb('1')} steer left, ${kb('0')} steer right, ${kb('9')} accelerate, ${kb('8')} slow down, ` +
      `bottom row fire.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard.',
    pad: {
      columns: 4, areas: ['one nine eight zero', 'sp sp sp sp'],
      keys: [key('1', 'left', '1', 'one'), key('9', 'faster', '9', 'nine'), key('8', 'slower', '8', 'eight'),
        key('0', 'right', '0', 'zero'), key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'fullthrottle', name: 'Full Throttle', file: 'roms/FULLTHR.Z80',
    screen: 'roms/FULLTHR.scr',   // ZXDB loading screen
    keysHelp: `${kb('1')} lean left, ${kb('0')} lean right, ${kb('9')} accelerate, bottom row brake; ${kb('R')} back ` +
      'to the menu.',
    flowHelp: 'Press any key on the loading screen, then 4 to race (3 to practise; 1 changes the track, with SPACE to ' +
      'choose and ENTER to go back, and 2 the number of laps).',
    pad: {
      columns: 4, areas: ['one nine . zero', 'sp sp sp sp', 'three four r .'],
      keys: [key('1', 'left', '1', 'one'), key('9', 'accelerate', '9', 'nine'), key('0', 'right', '0', 'zero'),
        key('SPACE', 'brake', 'SP', 'sp'), key('3', 'practice', '3', 'three'), key('4', 'race', '4', 'four'),
        key('R', 'menu', 'R', 'r')],
    },
  },
  {
    id: 'hacker', name: 'Hacker', file: 'roms/HACKER.Z80',
    // no loading screen: the tape shows none
    keysHelp: 'Type on your keyboard and press ENTER.',
    flowHelp: 'Activision gave no instructions on purpose: at LOGON PLEASE type something and press ENTER, and work ' +
      'out the rest by trial and error, as a real hacker would.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'ghostbusters', name: 'Ghostbusters', file: 'roms/GHOSTBST.Z80',
    screen: 'roms/GHOSTBST.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Z')} fire; ${kb('H')} pause, ` +
      `${kb('Enter')} carry on. ${kb('Symbol')} with ${kb('Enter')} returns to the controller menu.`,
    flowHelp: 'Press any key on the loading screen, 1 for keyboard and ENTER: the Ghostbusters theme plays, with the ' +
      'words. ENTER again, then type your name and ENTER, and answer whether you have an account.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'barmyburgers', name: 'Barmy Burgers', file: 'roms/BARMYBUR.Z80',
    keysHelp: `${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} pepper.`,
    flowHelp: 'Press any key on the loading screen; the title and then the game follow.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'pepper', '0', 'zero')],
    },
  },
  {
    id: 'mrwimpy', name: 'Mr. Wimpy', file: 'roms/MRWIMPY.Z80',
    keysHelp: `${kb('N')} left, ${kb('M')} right, ${kb('S')} up, ${kb('X')} down, ${kb('A')} pepper.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard (5 shows a demonstration).',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'one . . .'],
      keys: [key('S', 'up', 'S', 's'), key('N', 'left', 'N', 'n'), key('X', 'down', 'X', 'x'), key('M', 'right', 'M', 'm'),
        key('A', 'pepper', 'A', 'a'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'eskimoeddie', name: 'Eskimo Eddie', file: 'roms/ESKIMO.Z80',
    screen: 'roms/ESKIMO.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('N')} left, ${kb('M')} right, ${kb('Symbol')} push.`,
    flowHelp: 'Press any key on the loading screen, then 1 for keyboard (5 shows a demonstration).',
    pad: {
      columns: 4, areas: ['. q . ss', 'n a m ss', 'one . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('N', 'left', 'N', 'n'), key('A', 'down', 'A', 'a'), key('M', 'right', 'M', 'm'),
        key('SYM', 'push', 'SS', 'ss', { small: true }), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'cavelon', name: 'Cavelon', file: 'roms/CAVELON.Z80',
    screen: 'roms/CAVELON.scr',   // ZXDB loading screen
    holds: { 1: 40 },         // a short tap on the colour-cycling menu is missed (measured)
    keysHelp: `${kb('N')} left, ${kb('M')} right, ${kb('S')} up, ${kb('X')} down, ${kb('A')} fire an arrow, ` +
      `${kb('Symbol')} Excalibur (immunity).`,
    flowHelp: 'Press any key on the loading screen, 1 for keyboard, then any key past the scoring page.',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'one ss . .'],
      keys: [key('S', 'up', 'S', 's'), key('N', 'left', 'N', 'n'), key('X', 'down', 'X', 'x'), key('M', 'right', 'M', 'm'),
        key('A', 'arrow', 'A', 'a'), key('1', 'keyboard', '1', 'one'), key('SYM', 'Excalibur', 'SS', 'ss', { small: true })],
    },
  },
  {
    id: 'rambo', name: 'Rambo', file: 'roms/RAMBO.Z80',
    screen: 'roms/RAMBO.scr',   // ZXDB loading screen
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} fire, ${kb('A')} change ` +
      `weapon, ${kb('H')} hold; ${kb('Caps')} with ${kb('Space')} aborts.`,
    flowHelp: 'Press any key on the loading screen and any key on the title for the menu. Press S, type your name ' +
      'and ENTER, and any key (C for the controls, P players, L skill).',
    pad: {
      columns: 4, areas: ['. q . n', 'i z p a', 's h . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('N', 'fire', 'N', 'n'), key('A', 'weapon', 'A', 'a'), key('S', 'start', 'S', 's'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'nomad', name: 'N.O.M.A.D.', file: 'roms/NOMAD.Z80',
    // saved after its tune had played 56 notes (position EF8B, state EF8E = 81h, playing):
    // state 1 makes the interrupt routine reset the position and play from the first note,
    // as it does itself when the tune ends
    pokes: { 0xef8e: 1 },
    keysHelp: `${kb('R')} or ${kb('U')} forward, ${kb('D')} or ${kb('J')} back, ${kb('Z')} or ${kb('M')} turn left, ` +
      `${kb('X')} or ${kb('Symbol')} turn right, ${kb('5')} or ${kb('7')} fire.`,
    flowHelp: 'Press a key on the loading screen to hear the tune (Space, Symbol, M, N or B skip it). ' +
      'Space ends the tune; then 1 for keyboard and ENTER to start.',
    pad: {
      columns: 4, areas: ['. r . five', 'z d x five', 'one en . .'],
      keys: [key('R', 'forward', 'R', 'r'), key('Z', 'turn left', 'Z', 'z'), key('D', 'back', 'D', 'd'),
        key('X', 'turn right', 'X', 'x'), key('5', 'fire', '5', 'five'), key('1', 'keyboard', '1', 'one'),
        key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'sportshero', name: 'Sports Hero', file: 'roms/SPORTHER.Z80',
    screen: 'roms/SPORTHER.scr',   // ZXDB loading screen
    keysHelp: `You choose the keys: two run keys (press them alternately, fast), two jump keys and a break key, for ` +
      `example ${kb('Caps')} ${kb('Space')} to run and ${kb('Symbol')} ${kb('Z')} to jump.`,
    flowHelp: 'Press any key on the loading screen. Press D and then five keys in turn: break, run, run, jump, jump ' +
      '(e.g. H, CAPS, SPACE, SYMBOL, Z). Then A for the Street Runner events.',
    pad: {
      columns: 4, areas: ['cs sp ss z', 'd a h .'],
      keys: [key('CAPS', 'run', 'CS', 'cs'), key('SPACE', 'run', 'SP', 'sp'), key('SYM', 'jump', 'SS', 'ss', { small: true }),
        key('Z', 'jump', 'Z', 'z'), key('D', 'define', 'D', 'd'), key('A', 'street', 'A', 'a'), key('H', 'break', 'H', 'h')],
    },
  },
  {
    id: 'wham', name: 'Wham! The Music Box', file: 'roms/WHAM.Z80', utility: true,   // a music editor
    screen: 'roms/WHAM.scr',   // ZXDB loading screen
    // saved 0.6 s into the demo tune: restart where both channels are pointed at its start
    start: { pc: 0xa7f8, sp: 0x7514 },
    holds: { '*': 8 },        // the tune reads the keys between notes, up to 7.4 frames apart (measured)
    keysHelp: 'The menu takes 1–7. In the music editor the keyboard plays and enters notes; 7 on the menu shows the ' +
      'help page.',
    flowHelp: 'Press any key on the loading screen: the demo tune plays, and any key returns to the menu. 3 plays the ' +
      'tune in memory (M chooses one of the six), 6 opens the editor and 6 comes back.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'antattack', name: 'Ant Attack', file: 'roms/ANTATTCK.Z80',
    // no loading screen. The title is the BASIC program, saved mid-animation:
    // run it from line 10 so the title is drawn (with its beeps) from the start
    basicLine: 10,
    holdBoot: true,           // the title's beeps would start straight away
    keysHelp: `${kb('V')} forward, ${kb('M')} turn anticlockwise, ${kb('Symbol')} turn clockwise, ${kb('C')} jump ` +
      `(with ${kb('V')} to climb), ${kb('S')} ${kb('D')} ${kb('F')} ${kb('G')} throw a grenade (short to long), ` +
      `${kb('0')} ${kb('P')} ${kb('Enter')} ${kb('Space')} view angle, ${kb('1')} back to the city gate.`,
    flowHelp: 'Press any key: the title draws itself. Then G (girl) or B (boy), and any key after the story.',
    pad: {
      columns: 4, areas: ['ss v m c', 's g zero b'],
      keys: [key('SYM', 'turn ↻', 'SS', 'ss', { small: true }), key('V', 'forward', 'V', 'v'), key('M', 'turn ↺', 'M', 'm'),
        key('C', 'jump', 'C', 'c'), key('S', 'throw near', 'S', 's'), key('G', 'throw far / girl', 'G', 'g'),
        key('0', 'view', '0', 'zero'), key('B', 'boy', 'B', 'b')],
    },
  },
  {
    id: 'aquaplane', name: 'Aquaplane', file: 'roms/AQUAPLAN.Z80',
    screen: 'roms/AQUAPLAN.scr',   // ZXDB loading screen
    // the game splits the border mid-frame (sky above the horizon, sea below); the
    // machine draws the border with the beam, so it shows as on a real Spectrum
    keysHelp: `${kb('7')} up, ${kb('6')} down, ${kb('0')} thrust, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen, then S to start.',
    pad: {
      columns: 4, areas: ['. seven . zero', '. six . zero', 's h . .'],
      keys: [key('7', 'up', '7', 'seven'), key('6', 'down', '6', 'six'), key('0', 'thrust', '0', 'zero'),
        key('S', 'start', 'S', 's'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'fred', name: 'Fred', file: 'roms/FRED.Z80',
    screen: 'roms/FRED.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('W')} down, ${kb('E')} left, ${kb('R')} right, ${kb('T')} fire (the order the ` +
      'redefine page asks for).',
    flowHelp: 'Press any key on the loading screen, 2 for keyboard, then 4 to play (3 redefines the keys).',
    pad: {
      columns: 4, areas: ['. q . t', 'e w r t', 'two four . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('E', 'left', 'E', 'e'), key('W', 'down', 'W', 'w'), key('R', 'right', 'R', 'r'),
        key('T', 'fire', 'T', 't'), key('2', 'keyboard', '2', 'two'), key('4', 'play', '4', 'four')],
    },
  },
  {
    id: 'pyjamarama', name: 'Pyjamarama', file: 'roms/PYJAMA.Z80',
    // saved 12 s into the title tune: restart at the title routine, which shows the
    // loading screen and plays the tune from its start, with interrupts off as on the original tape (v1)
    start: { pc: 0xb2d1, sp: 0x0000, ei: 0 },
    holdBoot: true,           // the tune would start straight away
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('M')} jump / fire.`,
    flowHelp: 'Press any key on the loading screen to hear the tune, any key for the menu, then ENTER to start ' +
      '(1 and 2 are joysticks, 3 defines keys).',
    pad: {
      columns: 4, areas: ['o p m en'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('M', 'jump', 'M', 'm'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'molarmaul', name: 'Molar Maul', file: 'roms/MOLARMAL.Z80',
    screen: 'roms/MOLARMAL.scr',   // ZXDB loading screen
    keysHelp: `Bottom row: ${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} left, ${kb('Z')} ${kb('C')} ` +
      `${kb('B')} ${kb('M')} ${kb('Space')} right; ${kb('A')}–${kb('Enter')} down, ${kb('Q')}–${kb('P')} up, ` +
      `${kb('1')}–${kb('0')} scrub.`,
    flowHelp: 'Press any key on the loading screen and on the title, then K for keyboard.',
    pad: {
      columns: 4, areas: ['. q . one', 'x a z one', 'k . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'),
        key('1', 'scrub', '1', 'one'), key('K', 'keyboard', 'K', 'k')],
    },
  },
  {
    id: 'jumpingjack', name: 'Jumping Jack', file: 'roms/JUMPJACK.Z80',
    keysHelp: `${kb('Caps')} jump, ${kb('Symbol')} left, ${kb('Space')} right, ${kb('Z')} hold.`,
    flowHelp: 'Press any key on the title to start.',
    pad: {
      columns: 4, areas: ['cs ss sp z'],
      keys: [key('CAPS', 'jump', 'CS', 'cs'), key('SYM', 'left', 'SS', 'ss', { small: true }), key('SPACE', 'right', 'SP', 'sp'),
        key('Z', 'hold', 'Z', 'z')],
    },
  },
  {
    id: 'alchemist', name: 'Alchemist', file: 'roms/ALCHEMST.Z80',
    keysHelp: `Bottom row: ${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} left, ${kb('Z')} ${kb('C')} ` +
      `${kb('B')} ${kb('M')} ${kb('Space')} right; ${kb('A')} ${kb('D')} ${kb('G')} ${kb('J')} ${kb('L')} cast a spell, ` +
      `${kb('S')} ${kb('F')} ${kb('H')} ${kb('K')} ${kb('Enter')} turn into the eagle and back, ${kb('Q')} ${kb('E')} ` +
      `${kb('T')} ${kb('U')} ${kb('O')} flap, ${kb('W')} ${kb('R')} ${kb('Y')} ${kb('I')} ${kb('P')} pick up / drop an ` +
      `object, top row pick up / drop a spell, ${kb('1')} quits.`,
    flowHelp: 'Press any key on the loading screen and on the title, then 1 for keyboard.',
    pad: {
      columns: 4, areas: ['q w s a', 'x . . z', 'one . . .'],
      keys: [key('Q', 'flap', 'Q', 'q'), key('W', 'object', 'W', 'w'), key('S', 'eagle', 'S', 's'), key('A', 'spell', 'A', 'a'),
        key('X', 'left', 'X', 'x'), key('Z', 'right', 'Z', 'z'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'stonkers', name: 'Stonkers', file: 'roms/STONKERS.Z80',
    screen: 'roms/STONKERS.scr',   // ZXDB loading screen
    keysHelp: `Bottom row: ${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} left, ${kb('Z')} ${kb('C')} ` +
      `${kb('B')} ${kb('M')} ${kb('Space')} right; ${kb('A')}–${kb('L')} down, ${kb('Q')}–${kb('P')} up, ` +
      `${kb('1')}–${kb('0')} fire (zoom in, give orders).`,
    flowHelp: 'Press any key on the loading screen and on the title. The options then cycle: press a key while ' +
      'KEYBOARD is shown, then while the game you want (easy or difficult) is shown.',
    pad: {
      columns: 4, areas: ['. q . one', 'x a z one'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'),
        key('1', 'fire', '1', 'one')],
    },
  },
  {
    id: 'commando', name: 'Commando', file: 'roms/COMMANDO.Z80',
    // the [a4] snapshot: saved just before the title is drawn, so its drum roll plays from the start
    // (the other 48K snapshots were saved after it, on the silent title; same game and keys)
    screen: 'roms/COMMANDO.scr',   // ZXDB loading screen
    keysHelp: `${kb('2')} up, ${kb('W')} down, ${kb('9')} left, ${kb('0')} right, ${kb('Z')} fire, ${kb('M')} grenade ` +
      `(the game's own keys; ${kb('K')} on the title redefines them).`,
    flowHelp: 'Press any key on the loading screen: the title is drawn to a drum roll. Then S to start ' +
      '(J chooses a joystick, K redefines the keys).',
    pad: {
      columns: 4, areas: ['. two . z', 'nine w zero m', 's . . .'],
      keys: [key('2', 'up', '2', 'two'), key('9', 'left', '9', 'nine'), key('W', 'down', 'W', 'w'), key('0', 'right', '0', 'zero'),
        key('Z', 'fire', 'Z', 'z'), key('M', 'grenade', 'M', 'm'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'elite', name: 'Elite', file: 'roms/ELITE.Z80',
    // the [a3] snapshot, without Lenslok (the plain one stops on a still title; [a2] waits at "Load New Commander")
    screen: 'roms/ELITE.scr',      // ZXDB 48K loading screen (the other one is the 128K version's)
    keysHelp: `Flight: ${kb('N')} ${kb('M')} roll, ${kb('S')} dive, ${kb('X')} climb, ${kb('Space')} faster, ` +
      `${kb('Symbol')} slower, ${kb('1')}–${kb('4')} front/back/left/right view. Combat: ${kb('A')} fire, ` +
      `${kb('T')} target missile, ${kb('F')} fire missile, ${kb('U')} unarm, ${kb('E')} ECM, ${kb('W')} energy bomb, ` +
      `${kb('Q')} escape capsule, ${kb('C')} docking computer on/off. Navigation: ${kb('H')} hyperspace, ` +
      `${kb('G')} then ${kb('H')} galactic jump, ${kb('J')} Torus jump drive, ${kb('I')} galactic chart, ` +
      `${kb('O')} local chart, ${kb('D')} distance, ${kb('B')} cursor home (N M S X move it). Docked: ` +
      `${kb('1')} launch, ${kb('2')} buy, ${kb('3')} sell, ${kb('4')} equip, ${kb('R')} find planet. ` +
      `${kb('P')} system data, ${kb('K')} prices, ${kb('L')} status, ${kb('Enter')} inventory; ` +
      `${kb('Caps')} freezes the game, ${kb('Space')} carries on.`,
    flowHelp: 'Press any key on the loading screen, SPACE on the title, then N at "Load New Commander" (Y would ' +
      'load one from tape). You start docked at Lave with 100 credits: 1 launches.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'steepway', name: 'Steep Way (YU, unreleased)', file: 'roms/STEEPWAY.Z80',
    // from ZXDB (Uros Justin, 1987); the snapshot shows the loading screen (same as ZXDB's .scr), then the title
    holdBoot: true,           // it would replace its loading screen with the title on its own
    keysHelp: `${kb('Q')} drive up the road, ${kb('O')} left, ${kb('P')} right.`,
    flowHelp: 'Press any key on the loading screen, then S on the title to start.',
    pad: {
      columns: 3, areas: ['. q .', 'o s p'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'mindtrap', name: 'Mindtrap (YU, UK)', file: 'roms/MINDTRAP.Z80',
    // the [a] snapshot (Mastertronic, 1989, by Yugoslav authors): it opens on the loading screen
    // (the same as ZXDB's .scr), then shows the title by itself; the tape ends with the screen
    // only a third loaded
    holdBoot: true,
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right move the frame; ${kb('M')} with ` +
      `${kb('O')} turns its four cubes anticlockwise, with ${kb('P')} clockwise; ${kb('M')} with ${kb('Q')}/${kb('A')} ` +
      `changes floor and ${kb('Space')} swaps cubes with the floor above (from level 33).`,
    flowHelp: 'Sort the cubes into columns under their colours before the time or the moves run out. Press any key ' +
      'on the loading screen, SPACE on the title and a key again, then 1 for a new game, type your name and ' +
      'ENTER. Each level gives a password; 2 (old game) resumes with your name and it.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'sp one en .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'turn', 'M', 'm'), key('SPACE', 'swap', 'SP', 'sp'), key('1', 'new game', '1', 'one'),
        key('ENTER', 'enter', 'EN', 'en')],
    },
  },
  // ex-Yugoslav text adventures and arcade games from the ex-YU Računalniška scena list (all available in ZXDB);
  // tapes with more than one program (the other language, other games' demos) were cut to the game's part
  {
    id: 'c64adventure', name: 'Commodore 64 Adventure (YU, unofficial)', file: 'roms/C64ADV.Z80',   // M.E.L. Chip Club, in Serbian
    keysHelp: 'Type commands and press ENTER (capitals are on): SEVER, JUG, ISTOK, ZAPAD; ? shows what you carry, ' +
      'POMOZI helps. Q, W, X, Y stand for ž, š, č, ć. Don\'t press BREAK (Caps+Space): it stops the program.',
    flowHelp: 'Get into a Belgrade school and out again with its Commodore 64. "Pritisnite BREAK" means the key ' +
      'marked BREAK, which is SPACE; then D for the instructions (SPACE turns the pages) or N to play.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'eurorun', name: 'Eurorun (YU)', file: 'roms/EURORUN.Z80',   // Xenon, 1985, by the Kontrabant team
    // the Croatian version (the tape is the Slovenian one)
    screen: 'roms/EURORUN.scr',   // ZXDB loading screen
    keysHelp: 'Type commands in Croatian and press ENTER: the directions the game lists (S, J, I, Z, …), verb ' +
      'plus object, POMOĆ.',
    flowHelp: 'Run across Europe, starting at Kalemegdan in Belgrade. Press any key on the loading screen and ' +
      'ENTER at "Prese Niki te poziva dalje!". Each place is drawn first; a key then prints its description.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'ukletidvorac', name: 'Ukleti Dvorac (YU, unofficial)', tape: 'roms/UkletiDvorac.tzx',   // Dejan Ristanović, 1984 (BASIC)
    screen: 'roms/UkletiDvorac.scr',   // fan-made loading screen (from ChatGPT-Im.tap): the tape has only its BASIC header
    keysHelp: 'Type sentences in Serbo-Croatian (a verb and an object) and press ENTER at "Šta da radim"; the ' +
      'directions are listed with each place.',
    flowHelp: 'A haunted-castle adventure written in BASIC. Press any key on the loading screen.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'velikaakcija', name: 'Velika Akcija (YU, unofficial)', tape: 'roms/VelikaAkcija.tzx',   // Radio Ventilator 202, 1984, V1.1
    keysHelp: 'Type commands in Serbian and press ENTER: SEVER, JUG, ISTOK, ZAPAD, verb plus object.',
    flowHelp: 'Get a group of illegals out of the occupied city. Press any key on the loading screen and after ' +
      'the instructions, then again at "Pritisnite tipku!".',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'xiv', name: 'XIV (YU, unofficial)', tape: 'roms/XIV.tap',   // Pandovisia, 1984: the XIV Belgrade grammar school
    keysHelp: 'Type commands in capitals (SEVER, JUG, ISTOK, ZAPAD, verb plus object) and press ENTER at "PA?".',
    flowHelp: 'Press any key on the title. Wait for "UPUTSTVA (D/N)?" (about 7 seconds) and press D for the ' +
      'instructions or N to play.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'xiv2', name: 'XIV 2 (YU, unofficial)', tape: 'roms/XIV2.tzx',   // Pandovisia, 1985 (the tape's instructions program left out)
    keysHelp: 'Type commands in Serbian and press ENTER: the directions listed (ZAPADNO, SEVERNO, …), verb plus object.',
    flowHelp: 'The second part of XIV. Press any key on the loading screen; it starts in front of the school.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'alibaba', name: 'Ali Baba (YU)', tape: 'roms/AliBaba.tzx',   // Suzy Soft, 1985, the Croatian tape
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('M')} wall; ` +
      `${kb('Caps')}+${kb('S')} music, ${kb('Caps')}+${kb('H')} stop, ${kb('Caps')}+${kb('Symbol')}+${kb('A')} quit, ` +
      `${kb('Caps')}+${kb('Symbol')}+${kb('R')} reset.`,
    flowHelp: 'Save the treasure from the forty thieves. Press any key on the loading screen and ENTER on the key page.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'en . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'wall', 'M', 'm'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'drinker', name: 'The Drinker (YU)', tape: 'roms/TheDrinker.tzx',   // Suzy Soft, 1986, by Saša Pušica
    holds: { '*': 8 },        // the game reads the keys every 6-7 frames (seen)
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('R')} and ${kb('F')} up and down; ${kb('H')} pause, ` +
      `${kb('Enter')} carry on, ${kb('A')} start again.`,
    flowHelp: 'Superhik from Alan Ford collects bottles to get his powers back. Press any key on the loading screen, ' +
      '2 for keyboard, 0 to start, 1 or 2 players, then L (easier) or T (harder).',
    pad: {
      columns: 4, areas: ['. r . two', 'o f p zero', 'one l t h'],
      keys: [key('R', 'up', 'R', 'r'), key('O', 'left', 'O', 'o'), key('F', 'down', 'F', 'f'), key('P', 'right', 'P', 'p'),
        key('2', 'keyboard', '2', 'two'), key('0', 'start', '0', 'zero'), key('1', '1 player', '1', 'one'),
        key('L', 'easier', 'L', 'l'), key('T', 'harder', 'T', 't'), key('H', 'pause', 'H', 'h')],
    },
  },
  {
    id: 'kljuc', name: 'Ključ (YU)', tape: 'roms/Kljuc.tzx',   // Suzy Soft, 1988, by Saša Požgaj
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('V')} jump, ${kb('S')} pause.`,
    flowHelp: 'Eighty rooms down to the cellar for the key, and back to the castle door. Press any key on the ' +
      'loading screen, type your name and ENTER, SPACE when the story says PRITISNITE SPACE, then 2 for keyboard ' +
      'and 4 to start.',
    pad: {
      columns: 4, areas: ['o p v s', 'two four sp en'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('V', 'jump', 'V', 'v'), key('S', 'pause', 'S', 's'),
        key('2', 'keyboard', '2', 'two'), key('4', 'start', '4', 'four'), key('SPACE', 'on', 'SP', 'sp'),
        key('ENTER', 'name', 'EN', 'en')],
    },
  },
  {
    id: 'vruceletovanje', name: 'Vruće Letovanje (YU)', tape: 'roms/VruceLetovanje.tap',   // Suzy Soft, 1985 (Slovenian: Vroče Počitnice)
    // ZXDB's tape: the Croatian tape from the ex-YU list resets the Spectrum after loading
    keysHelp: 'Type what Srećko should do and press ENTER (UZMI KLJUČ; join orders with I): GLEDAJ looks around, ' +
      'ŠTA NOSIŠ, BROJ NOVAC, PAUZA. After a picture, any key goes on.',
    flowHelp: 'Get the family off on holiday. Press any key on the loading screen and after the credits.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  // Games by Yugoslav authors published in Britain (from the ex-YU Računalniška scena list)
  {
    id: 'drmaddo', name: 'Dr. Maddo (YU, UK)', file: 'roms/DRMADDO.Z80',   // Americana, 1986; its own title says Castle Hustle
    screen: 'roms/DRMADDO.scr',   // ZXDB loading screen
    keysHelp: 'Your own keys: 3 on the menu asks for up, down, left, right, fire and rotate (for example ' +
      `${kb('Q')} ${kb('A')} ${kb('O')} ${kb('P')} ${kb('M')} ${kb('N')}); fire held down also rotates. ` +
      `${kb('1')}–${kb('5')} music off/on, ${kb('6')}–${kb('0')} hold.`,
    flowHelp: 'Rescue Marilyn from Dr. Maddo\'s castle. Press any key on the loading screen, 3 for keyboard and ' +
      'press your six keys, then 0 to start. After the last life, ENTER starts again.',
    pad: {
      columns: 4, areas: ['three q zero m', 'o a p n', '. . . en'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'), key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('N', 'rotate', 'N', 'n'), key('3', 'keyboard', '3', 'three'),
        key('0', 'start', '0', 'zero'), key('ENTER', 'again', 'EN', 'en')],
    },
  },
  {
    id: 'movie', name: 'Movie (YU, UK)', file: 'roms/MOVIE.Z80',   // Imagine, 1986, by Duke and Mario
    // the [a] snapshot (the plain one goes black after its intro); it starts in the intro
    screen: 'roms/MOVIE.scr',     // ZXDB loading screen
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('Q')}–${kb('P')} up, ${kb('A')}–${kb('Enter')} down, ` +
      `${kb('0')} fire. Fire also opens the icons at the bottom (inventory, drop, pick up, shoot, walk, talk, ` +
      'punch, throw, halt, abort): move to one and fire again. Talk lets you type into a speech bubble.',
    flowHelp: 'New York in the thirties: find the tape in Bugs Malloy\'s headquarters, with Tanya\'s help (her twin ' +
      'Vanya works for Bugs). Press any key on the loading screen, then a key during the detective\'s intro (for a ' +
      'few seconds of each round it takes none: press again). 0 there sets IQ and the control style (C changes, ' +
      'ENTER picks). Each room is drawn as you enter it.',
    pad: {
      columns: 4, areas: ['. q . zero', 'cs a z zero', 'c en . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('CAPS', 'left', 'CS', 'cs'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'),
        key('0', 'fire', '0', 'zero'), key('C', 'change', 'C', 'c'), key('ENTER', 'pick', 'EN', 'en')],
    },
  },
  {
    id: 'phantomclub', name: 'Phantom Club (YU, UK)', file: 'roms/PHANTOMC.Z80',   // Ocean, 1988, by Duke
    // the [a] snapshot: saved on its "Welcome to the Phantom Club" screen, just before the title music
    // (the other two snapshots' music turns up 0.9 and 3.6 s into it)
    screen: 'roms/PHANTOMC.scr',   // ZXDB loading screen
    holds: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 },   // the music reads the menu keys now and then (4 frames: 8 in 10 taken)
    keysHelp: `Bottom row turns, alternately left (${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')}) and right ` +
      `(${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')}); ${kb('Q')}–${kb('P')} walk forward, ${kb('A')}–${kb('Enter')} ` +
      `jump, ${kb('1')}–${kb('0')} fire. ${kb('Caps')}+${kb('H')} pause, ${kb('Space')} carry on, ` +
      `${kb('Caps')}+${kb('A')} abandon the game. (4, cursor type, moves with the cursor keys instead.)`,
    flowHelp: 'Plutus, the last good member of the Phantom Club, against the Overlord. Press any key on the ' +
      'loading screen, then 1 on the menu for keyboard.',
    pad: {
      columns: 4, areas: ['. q . one', 'x a z one', '. . . .'],
      keys: [key('Q', 'forward', 'Q', 'q'), key('X', 'turn left', 'X', 'x'), key('A', 'jump', 'A', 'a'),
        key('Z', 'turn right', 'Z', 'z'), key('1', 'fire / keys', '1', 'one')],
    },
  },
  {
    id: 'playforyourlife', name: 'Play for Your Life (YU, UK)', file: 'roms/PLAYLIFE.Z80',   // Your Sinclair covertape, 1987, by Duke
    // the [a2] snapshot, saved just before its intro. Its controls default to a Kempston joystick; the
    // keyboard is control type 1 (FA9E, and 760A for the name on the C screen), set here so the keys work
    // without the slow C screen
    screen: 'roms/PLAYLIFE.scr',   // ZXDB loading screen
    pokes: { 0xfa9e: 1, 0x760a: 1 },
    keysHelp: `${kb('Q')}–${kb('P')} up the court, ${kb('A')}–${kb('Enter')} down; bottom row alternately left ` +
      `(${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')}) and right (${kb('Z')} ${kb('C')} ${kb('B')} ` +
      `${kb('M')} ${kb('Space')}); ${kb('1')}–${kb('0')} swing.`,
    flowHelp: 'Future tennis against the computer. Press any key on the loading screen; when it says C FOR ' +
      'CONTROLS / ANY KEY TO START, press a key for level I.',
    pad: {
      columns: 4, areas: ['. q . one', 'x a z one', '. . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'),
        key('1', 'swing', '1', 'one')],
    },
  },
  {
    id: 'sbugetti', name: 'Sbugetti Junction (YU, UK)', file: 'roms/SBUGETTI.Z80',   // Bug-Byte, 1986, by Čalac, Zec & Muraja
    // the [a] snapshot: its loading screen, which waits for a key (the same as ZXDB's .scr)
    keysHelp: `Louigi the traffic cop: ${kb('1')} turn left, ${kb('2')} turn right, ${kb('0')} arms up/down.`,
    flowHelp: 'Wave the traffic through each junction against the clock without crashes or long waits. Press any ' +
      'key on the loading screen; on the menu 1–3 picks light, heavy or rush-hour traffic, 5/6 UK or European ' +
      'driving, 0 starts.',
    pad: {
      columns: 3, areas: ['one two zero', 'three five six'],
      keys: [key('1', 'left / light', '1', 'one'), key('2', 'right / heavy', '2', 'two'), key('0', 'arms / start', '0', 'zero'),
        key('3', 'rush hour', '3', 'three'), key('5', 'UK', '5', 'five'), key('6', 'Europe', '6', 'six')],
    },
  },
  {
    id: 'niftylifty', name: 'Nifty Lifty (YU, UK)', file: 'roms/NIFTY.Z80',   // Visions, 1984, original by Janko, Spectrum by K.J. Bezant
    // saved 60 notes into the title tune: restart at the tune loop (called from AC6D) so it plays from its first note
    start: { pc: 0xadd4, sp: 0xff3e, ei: 1 },
    screen: 'roms/NIFTY.scr',      // ZXDB loading screen
    keysHelp: `${kb('6')} left, ${kb('7')} right, ${kb('Space')} hold (C on the title redefines the keys).`,
    flowHelp: 'Collect the goods on every floor without being crushed by the lifts. Press any key on the loading ' +
      'screen to hear the tune, then a speed 0–9 to start (0 is fastest).',
    pad: {
      columns: 3, areas: ['six sp seven', 'five . .'],
      keys: [key('6', 'left', '6', 'six'), key('7', 'right', '7', 'seven'), key('SPACE', 'hold', 'SP', 'sp'),
        key('5', 'speed 5', '5', 'five')],
    },
  },
  // ex-Yugoslav text adventures (ZXDB, all available) and a utility. Commands are typed in the game's
  // language; the full keyboard is on touch screens.
  {
    id: 'kontrabant', name: 'Kontrabant (YU)', tape: 'roms/Kontrabant.tap',   // ZXDB (Radio Študent / ZOTKS, 1984)
    keysHelp: 'Type commands in Slovenian and press ENTER (two words, the first four letters of each count): ' +
      'directions SEVER, JUG, VZHOD, ZAHOD (listed as S, J, V, Z, JZ, …) and VEN; exchanges as two objects, ' +
      'e.g. SEKIRA MEČ.',
    flowHelp: 'The first Slovenian adventure, broadcast by Radio Študent: bring home a television, a cassette ' +
      'recorder and a computer (smuggle the computer last). Press any key on the loading screen: the welcome ' +
      'plays a tune for about 30 seconds, then "Požgečkaj za nadaljevanje" wants a key for the story and the > prompt.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'kontrabant2', name: 'Kontrabant 2 (YU)', tape: 'roms/Kontrabant2.tzx',   // ZXDB (Radio Študent, 1984)
    keysHelp: 'Type commands in Serbo-Croatian and press ENTER: the directions the game lists (S, J, I, Z, SZ, …, ' +
      'UNUTRA, VAN), and verb plus object.',
    flowHelp: 'Press any key on the loading screen, then any key at "Skoči na gumicu!" for the first location ' +
      '(you stand at home holding Duga). Places are drawn as you go. The text is printed slowly, ' +
      'with a click per letter: type once the cursor is back, as keys pressed while it prints are lost.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'bajke', name: 'Bajke (YU)', tape: 'roms/Bajke.tzx',   // ZXDB, the Croatian tape (Xenon / Suzy Soft, 1986)
    keysHelp: 'Type commands in Croatian and press ENTER; directions are given as S, J, I, Z, SZ, JZ, …',
    flowHelp: 'Press any key on the loading screen. Mihec the dwarf greets you; ENTER sets off. Each place is ' +
      'drawn first, then described in the box below it.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'strumpfovi', name: 'Štrumpfovi (YU)', tape: 'roms/Strumpfovi.tzx',   // ZXDB (Xenon, 1985)
    keysHelp: 'Type commands and press ENTER (c, d, s, z for č, đ, š, ž): SEVER, JUG, ISTOK, ZAPAD, GORE, DOLE ' +
      '(S J I Z G D), UNUTRA, NAPOLJE; POKUPI, SPUSTI, DAJ … ; two objects to swap them (KAMEN CVET); OPIS ' +
      `(O) looks again, KRAJ ends with your score. ${kb('Caps')}+${kb('0')} deletes.`,
    flowHelp: 'Press any key on the loading screen, then M for small or V for capital letters. You are Gurko ' +
      'Smurf, off to Gargamel\'s castle for the counter-spell.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'ekranskieditor', name: 'Ekranski Editor (YU)', tape: 'roms/EkranskiEditor.tap', utility: true,
    // ZXDB (Vladimir Kostić, Računari, 1986): a full-screen BASIC editor; no manual survives, the help is
    // what was found by trying it
    keysHelp: `Type BASIC letter by letter anywhere on the screen; ${kb('Caps')}+${kb('5')}–${kb('8')} move the ` +
      `cursor. ${kb('Enter')} enters the line under the cursor (press it again for a new line); a line number ` +
      'alone deletes that line. LIST and RUN as usual.',
    flowHelp: 'Press any key on the loading screen. The program starts with the loader as line 1 (it would load ' +
      'from tape again): type 1 and ENTER to delete it before RUN. After BREAK, RANDOMIZE USR 45568 returns to ' +
      'the editor with your program.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'multicopy', name: 'MultiCopy 2.2 (YU, unofficial)', tape: 'roms/MultiCopy22.tzx', utility: true,
    // Aleš Jaklič's tape copier (ex-YU Računalniška scena, MultiCopy.zip); its code is in its own
    // "Big Brother" screen. The commands are from the instructions tape that came with it
    // (MultiCopy22Upustvo.tzx)
    keysHelp: `${kb('L')} load blocks from tape, ${kb('S')} save them, ${kb('D')} load a block without a header, ` +
      `${kb('H')} read headers only, ${kb('V')} choose the block to start from, ${kb('M')} one very long block, ` +
      `${kb('R')} forget all loaded blocks, ${kb('E')} remove MultiCopy from memory; after ${kb('V')}: ` +
      `${kb('A')} remove a BASIC program's autostart, ${kb('K')} remove one block, ${kb('N')} rename a block. ` +
      `${kb('I')} ignores a loading error. ${kb('Caps')}+${kb('Space')} (BREAK) stops loading or saving.`,
    flowHelp: 'A copier for cassettes, shown working: there is no tape to copy from here, so LOAD and HEADER ' +
      'wait until BREAK. Free RAM shows how much is left for blocks.',
    pad: {
      columns: 4, areas: ['l s d h', 'v m r e', 'a k n i', 'brk brk . .'],
      keys: [key('L', 'load', 'L', 'l'), key('S', 'save', 'S', 's'), key('D', 'data', 'D', 'd'), key('H', 'header', 'H', 'h'),
        key('V', 'view', 'V', 'v'), key('M', 'maxbyt', 'M', 'm'), key('R', 'reset', 'R', 'r'), key('E', 'exit', 'E', 'e'),
        key('A', 'abort', 'A', 'a'), key('K', 'kill', 'K', 'k'), key('N', 'name', 'N', 'n'), key('I', 'ignore', 'I', 'i'),
        { label: 'BREAK', sub: 'stop', keys: [K.CS, K.SP], area: 'brk' }],
    },
  },
  {
    id: 'airwolf', name: "Airwolf", file: 'roms/AIRWOLF.Z80',
    screen: 'roms/AIRWOLF.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')}–${kb('T')} up, ${kb('A')}–${kb('G')} down, ${kb('Z')} left, ${kb('X')} right, ${kb('C')} fire.`,
    flowHelp: "Fly Airwolf through the caverns and rescue the five scientists. Press any key on the loading screen, then SPACE on the title.",
    pad: {
      columns: 4, areas: ['. q . c', 'z a x c', 'sp . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'down', 'A', 'a'), key('X', 'right', 'X', 'x'), key('C', 'fire', 'C', 'c'), key('SPACE', 'start', 'SP', 'sp')],
    },
  },
  {
    id: 'arcadia', name: "Arcadia", file: 'roms/ARCADIA.Z80',
    screen: 'roms/ARCADIA.scr',   // ZXDB loading screen
    keysHelp: `Bottom row, alternate keys: ${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} left, ${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} ${kb('Space')} right; ${kb('Q')}–${kb('P')} fire, ${kb('A')}–${kb('Enter')} thrust.`,
    flowHelp: "Press any key on the loading screen and again on the title.",
    pad: {
      columns: 4, areas: ['. q . .', 'x a z .'],
      keys: [key('Q', 'fire', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'thrust', 'A', 'a'), key('Z', 'right', 'Z', 'z')],
    },
  },
  {
    id: 'arkanoid', name: "Arkanoid", file: 'roms/ARKANOID.Z80',
    // the [a4] snapshot: its loading screen, waiting for a key before the joystick question and the music
    keysHelp: `${kb('Caps')}–${kb('V')} left, ${kb('B')}–${kb('Space')} right, ${kb('A')}–${kb('L')} fire.`,
    flowHelp: "Press any key on the loading screen, N for the keyboard (Y for a Kempston joystick), then SPACE.",
    pad: {
      columns: 4, areas: ['v a b .', 'n y sp .'],
      keys: [key('V', 'left', 'V', 'v'), key('A', 'fire', 'A', 'a'), key('B', 'right', 'B', 'b'), key('N', 'keyboard', 'N', 'n'), key('Y', 'joystick', 'Y', 'y'), key('SPACE', 'start', 'SP', 'sp')],
    },
  },
  {
    id: 'automania', name: "Automania", file: 'roms/AUTOMANI.Z80',
    // the [a3] snapshot: its loading screen, waiting for a key
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('M')} jump. On the menu ${kb('1')}/${kb('2')} music on/off, ${kb('6')} defines keys.`,
    flowHelp: "Wally Week's car factory. Press any key on the loading screen; after the credits, ENTER on the menu starts.",
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'en . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'), key('M', 'jump', 'M', 'm'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'avalon', name: "Avalon", file: 'roms/AVALON.Z80',
    screen: 'roms/AVALON.scr',   // fan-made loading screen (Mark R. Jones, 2013)
    keysHelp: `After 4 (keyboard): ${kb('A')}–${kb('G')} up, ${kb('Z')}–${kb('V')} down, ${kb('B')} ${kb('N')} left, ${kb('M')} ${kb('Symbol')} right, ${kb('H')}–${kb('L')} fire; ${kb('P')} freeze, ${kb('O')} unfreeze.`,
    flowHelp: "Press any key on the loading screen, then 4 for the keyboard (1–3 are joysticks), ENTER, then ENTER again for a new game.",
    pad: {
      columns: 4, areas: ['. a . h', 'b z m h', 'four en . .'],
      keys: [key('A', 'up', 'A', 'a'), key('B', 'left', 'B', 'b'), key('Z', 'down', 'Z', 'z'), key('M', 'right', 'M', 'm'), key('H', 'fire', 'H', 'h'), key('4', 'keyboard', '4', 'four'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'backtothefuture', name: "Back to the Future", file: 'roms/BACKTOTH.Z80',
    screen: 'roms/BACKTOTH.scr',   // ZXDB loading screen
    // the [a2] snapshot (cracked, without a cracker's message). It was saved 5.4 s into the menu tune (channel
    // positions FC6A/FD84): put back the tune's start, as the game's own init copies it from FF9B, and its note counter
    pokes: { 0xfedb: 0x44, 0xfedc: 0xfc, 0xfedd: 0x45, 0xfede: 0xfc, 0xfedf: 0x5e, 0xfee0: 0xfd, 0xfee1: 0x5f, 0xfee2: 0xfd, 0xfed7: 1 },
    keysHelp: `Cursor keys ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, with ${kb('Space')}. On the menu ${kb('1')} start, ${kb('2')} level, ${kb('3')} end the game, ${kb('4')} pause.`,
    flowHelp: "Get your parents together in 1955. Press any key on the loading screen, then 1 to start.",
    pad: {
      columns: 4, areas: ['. seven . one', 'five six eight sp'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'), key('8', 'right', '8', 'eight'), key('SPACE', 'act', 'SP', 'sp'), key('1', 'start', '1', 'one')],
    },
  },
  {
    id: 'batman', name: "Batman", file: 'roms/BATMAN.Z80',
    screen: 'roms/BATMAN.scr',   // ZXDB loading screen
    keysHelp: `${kb('O')}/${kb('6')} left, ${kb('P')}/${kb('7')} right, ${kb('Q')}/${kb('9')} up, ${kb('A')}/${kb('8')} down; ${kb('Space')} ${kb('0')} ${kb('M')} ${kb('N')} ${kb('B')} ${kb('H')} ${kb('Symbol')} jump; ${kb('Caps')} ${kb('Z')}–${kb('V')} pick up; ${kb('1')} pause. Jumping needs the Batboots and carrying the Batbag: find them first.`,
    flowHelp: "Jon Ritman's Batman. Press any key on the loading screen. On JOYSTICK SELECTION press a key twice to move to KEYS/KEY JOYSTICK, then ENTER (one chance only). The menu opens on PLAY THE GAME: ENTER again.",
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p z', 'en . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'), key('SPACE', 'jump', 'SP', 'sp'), key('Z', 'pick up', 'Z', 'z'), key('ENTER', 'select', 'EN', 'en')],
    },
  },
  {
    id: 'beachhead2', name: "Beach-Head II", file: 'roms/BEACHHEA.Z80',
    // the [a] snapshot: its loading screen, waiting for a key
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('N')} fire; ${kb('H')} hold, ${kb('T')} and ${kb('R')} abort.`,
    flowHelp: "Press any key on the loading screen; after the credits a demo plays. S on the main menu starts (P players, L skill level, C controls), then type a name and ENTER.",
    pad: {
      columns: 4, areas: ['. q . n', 'i z p n', 's . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'), key('N', 'fire', 'N', 'n'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'bennyhill', name: "Benny Hill's Madcap Chase", file: 'roms/BENNYHIL.Z80',
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('Q')} up (back), ${kb('A')} down (forward); ${kb('H')} gives up.`,
    flowHelp: "Press any key on the loading screen, 1 for the keyboard and 4 to start.",
    pad: {
      columns: 4, areas: ['. q . .', 'z a x .', 'one four . .'],
      keys: [key('Q', 'back', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'forward', 'A', 'a'), key('X', 'right', 'X', 'x'), key('1', 'keys', '1', 'one'), key('4', 'start', '4', 'four')],
    },
  },
  {
    id: 'bcbill', name: "B.C. Bill", file: 'roms/BCBILL.Z80',
    // saved during its title tune: restart at the game's entry B9B1 (sets its own stack, draws the title, starts the tune)
    start: { pc: 0xb9b1 },
    holdBoot: true,           // the tune would start straight away
    // the menu tune reads the keys every 10-11 frames: a menu key is taken 9 times in 10 when held 8-12 frames,
    // less often when held longer (measured)
    holds: { '*': 12 },
    keysHelp: `Bottom row, alternate keys: ${kb('Caps')} ${kb('X')} ${kb('V')} ${kb('N')} ${kb('Symbol')} left, ${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} ${kb('Space')} right; ${kb('Q')}–${kb('P')} up, ${kb('A')}–${kb('Enter')} down.`,
    flowHelp: "Club wives and food and raise a tribe. Press any key on the loading screen and again when the tune plays, 3 on PICK YOUR WEAPON for the keyboard, then Y when KEYBOARD appears.",
    pad: {
      columns: 4, areas: ['. q . three', 'x a z y'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'), key('3', 'keyboard', '3', 'three'), key('Y', 'yes', 'Y', 'y')],
    },
  },
  {
    id: 'bugaboo', name: "Bugaboo (The Flea)", file: 'roms/BUGABOO.Z80',
    screen: 'roms/BUGABOO.scr',   // fan-made loading screen (from Bugaboo_(T.tap); the UK tape's is only text over stars)
    // the [a] snapshot, at the start of its intro
    keysHelp: `${kb('1')} jump left, ${kb('0')} jump right (hold longer to jump further); ${kb('5')}–${kb('8')} scroll the view; ${kb('A')} abandon.`,
    flowHelp: "Press any key on the loading screen. The intro takes about a minute (keys shorten it) and ends on the controls page: G starts.",
    pad: {
      columns: 4, areas: ['one g a zero'],
      keys: [key('1', 'jump left', '1', 'one'), key('G', 'game', 'G', 'g'), key('A', 'abandon', 'A', 'a'), key('0', 'jump right', '0', 'zero')],
    },
  },
  {
    id: 'c5clive', name: "C5 Clive", file: 'roms/C5CLIVE.Z80',
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('Space')} pedal / jump.`,
    flowHelp: "Pedal Clive's C5 home. Press any key on the loading screen, then 1–4 for the driver level (5: instructions).",
    pad: {
      columns: 3, areas: ['q . sp', 'a one sp'],
      keys: [key('Q', 'up', 'Q', 'q'), key('A', 'down', 'A', 'a'), key('SPACE', 'pedal', 'SP', 'sp'), key('1', 'learner', '1', 'one')],
    },
  },
  {
    id: 'chinesejuggler', name: "The Chinese Juggler", file: 'roms/CHINESEJ.Z80',
    screen: 'roms/CHINESEJ.scr',   // ZXDB loading screen (the snapshot opens on the Ocean title page)
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('B')}–${kb('Space')} act on a plate; ${kb('D')}/${kb('E')} music off/on, ${kb('Caps')} quit.`,
    flowHelp: "Keep the plates spinning. Press any key on the loading screen and again on the Ocean title page, then K for the keyboard.",
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'k . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'), key('SPACE', 'plate', 'SP', 'sp'), key('K', 'keyboard', 'K', 'k')],
    },
  },
  {
    id: 'chuckieegg2', name: "Chuckie Egg 2", file: 'roms/CHUCKIEE.Z80',
    screen: 'roms/CHUCKIEE.scr',   // ZXDB loading screen
    // the [a] snapshot, at its first screen
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Symbol')} jump; ${kb('0')} quits. R on the high-score screen lets you choose all the keys (up and down too).`,
    flowHelp: "Help Harry build the giant chocolate egg. Press any key on the loading screen, SPACE through the instructions, then P to play.",
    pad: {
      columns: 4, areas: ['. . . ss', 'o . p ss', 'sp r p2 .'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('SYM', 'jump', 'SS', 'ss'), key('SPACE', 'next', 'SP', 'sp'), key('R', 'keys', 'R', 'r'), key('P', 'play', 'P', 'p2')],
    },
  },
  {
    id: 'combatlynx', name: "Combat Lynx", file: 'roms/COMBATLY.Z80',
    keysHelp: `${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('3')} slower, ${kb('4')} faster; ${kb('2')}/${kb('9')} choose a weapon, ${kb('0')} fire, ${kb('Enter')} weapon sights; ${kb('M')} map; ${kb('S')} sound, ${kb('H')} halt.`,
    flowHelp: "A helicopter gunship. Press any key on the loading screen (it takes a few seconds), on the copyright page and on the reward page, then a skill level 1–4.",
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'criticalmass', name: "Critical Mass", file: 'roms/CRITICAL.Z80',
    keysHelp: `${kb('Z')} rotate left, ${kb('X')} rotate right, ${kb('Q')} accelerate, ${kb('A')} fire.`,
    flowHelp: "Press any key on the loading screen, the reward page and the high scores; on OPTIONS 1 for the keyboard, then 0 to start (4: skill level).",
    pad: {
      columns: 4, areas: ['. q . a', 'z . x a', 'one zero . .'],
      keys: [key('Q', 'thrust', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('A', 'fire', 'A', 'a'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'darkstar', name: "Dark Star", file: 'roms/DARKSTAR.Z80',
    screen: 'roms/DARKSTAR.scr',   // ZXDB loading screen
    // the plain snapshot, on its menu (the [a] one, on the loading screen, resets the Spectrum when you play)
    keysHelp: 'You define the keys: 3 on the menu asks for each control. 4 changes the game, 2 shows the instructions.',
    flowHelp: "Press any key on the loading screen, 3 to set your keys, then 1 to play.",
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'dynamitedan', name: "Dynamite Dan", file: 'roms/DYNAMITE.Z80',
    keysHelp: 'Choose your keys: D on the menu asks for each. K selects the keyboard, P pauses, I shows the story.',
    flowHelp: "Find the eight sticks of dynamite and blow the safe. Press any key on the loading screen, D to define your keys, then ENTER to play.",
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'lordsofmidnight', name: 'The Lords of Midnight', file: 'roms/LORDSOFM.Z80',
    // the [a] snapshot, at the start of the game (Luxor at the Tower of the Moon)
    screen: 'roms/LORDSOFM.scr',   // ZXDB loading screen
    keysHelp: `${kb('1')}–${kb('8')} look north, northeast … northwest; ${kb('Q')} move the way you look, ${kb('E')} look, ` +
      `${kb('R')} think, ${kb('T')} choose, ${kb('U')} night (ends the day); ${kb('C')} Luxor, ${kb('V')} Morkin, ` +
      `${kb('B')} Corleth, ${kb('N')} Rorthron, ${kb('M')} select another lord; ${kb('G')} yes, ${kb('J')} no; ${kb('A')} new game.`,
    flowHelp: "Mike Singleton's epic of Midnight: lead Luxor and his allies against Doomdark. Press any key on the loading screen " +
      "and you are Luxor at the Tower of the Moon. Avoid S (save): there is no tape, and it leaves the game waiting (choose the " +
      "game again to restart). D (load) asks first: J goes back. Z (print) is the printer.",
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'ericfloaters', name: 'Eric and the Floaters', file: 'roms/ERICFLOA.Z80',
    // the plain snapshot, on the title page with the controls (ZXDB's loading screen is only a "Now loading" message)
    keysHelp: `${kb('W')}/${kb('I')} up, ${kb('X')}/${kb('M')} down, ${kb('A')}/${kb('J')} left, ${kb('D')}/${kb('L')} right, ${kb('Space')} bomb.`,
    flowHelp: "Hudson Soft's Bomberman before Bomberman. SPACE on the title, then K for the keyboard.",
    pad: {
      columns: 4, areas: ['. w . sp', 'a x d sp', 'k . . .'],
      keys: [key('W', 'up', 'W', 'w'), key('A', 'left', 'A', 'a'), key('X', 'down', 'X', 'x'), key('D', 'right', 'D', 'd'),
        key('SPACE', 'bomb', 'SP', 'sp'), key('K', 'keyboard', 'K', 'k')],
    },
  },
  {
    id: 'etx', name: 'E.T.X.', file: 'roms/ETX.Z80',
    // saved while the title's speech was playing (sample list 3 from 805C, at its 7th sample): restart at the
    // call that speaks it (5EAB, return address 6406 on the stack), so the whole phrase plays after the key
    start: { pc: 0x5eab, sp: 0x5d50, ei: 1 },
    holdBoot: true,           // the speech would start straight away
    // the snapshot's header asks for a Kempston interface; the game (5D5E) then reads only the joystick.
    // Without one it reads the keyboard (6E07: Q A O P, bottom rows fire)
    kempston: false,
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right; ${kb('Caps')}+${kb('Space')} then ${kb('1')} ends the game.`,
    flowHelp: 'Help Ernie gather fruit. Press any key on the title: it speaks, then waits. Press any key, 1–4 to choose ' +
      'the game (1: just Ernie), then 1 for the player.',
    pad: {
      columns: 4, areas: ['. q . one', 'o a p two', 'sp . . three'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('1', 'one', '1', 'one'), key('2', 'two', '2', 'two'), key('3', 'three', '3', 'three'), key('SPACE', 'key', 'SP', 'sp')],
    },
  },
  {
    id: 'exolon', name: 'Exolon', file: 'roms/EXOLON.Z80',
    screen: 'roms/EXOLON.scr',   // ZXDB loading screen
    // the [a] snapshot, on the menu
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} jump, ${kb('A')} duck, ${kb('M')} fire.`,
    flowHelp: "Raffaele Cecco's Exolon. Press any key on the loading screen, then 1 to start (2 defines the keys).",
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'one . . .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'duck', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('1', 'start', '1', 'one')],
    },
  },
  {
    id: 'falconpatrol2', name: 'Falcon Patrol II', file: 'roms/FALCONPA.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    // the game reads the Kempston port (9EA9) and takes values under 1B as the joystick: without an interface
    // the floating bus fires missiles on its own and skips the briefing (measured). The briefing checks fire
    // only now and then: M held half a second always skips it, a tap often does not
    kempston: true,
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('M')} fire.`,
    flowHelp: 'Press any key on the loading screen. The briefing from GHQ types itself out for a couple of minutes: ' +
      'hold M for a second to skip it and take off.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm')],
    },
  },
  {
    id: 'feud', name: 'Feud', file: 'roms/FEUD.Z80',
    screen: 'roms/FEUD.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Space')} cast the chosen spell.`,
    flowHelp: 'Learic against Leanoric: gather herbs, brew spells. Press any key on the loading screen, 1 for the keyboard, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 'one zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'spell', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'fightingwarrior', name: 'Fighting Warrior', file: 'roms/FIGHTING.Z80',
    // on its menu (ZXDB's loading screen is the same menu with NOW LOADING)
    holdBoot: true,           // the menu gives way to the demo by itself
    keysHelp: `${kb('Q')} jump, ${kb('A')} duck, ${kb('P')} forward, ${kb('O')} back off. Holding any bottom-row key (fire): ` +
      `${kb('Q')} upper, ${kb('P')} middle, ${kb('A')} low strike. ${kb('H')}–${kb('Enter')} pause.`,
    flowHelp: 'Rescue Princess Thaya. Press any key on the menu, then 1 for the keyboard and 0 to start.',
    touchHelp: 'FIRE stays pressed until the next key: FIRE then a direction strikes.',
    pad: {
      columns: 4, areas: ['. q . z', 'o a p z', 'one zero . .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('O', 'back', 'O', 'o'), key('A', 'duck', 'A', 'a'), key('P', 'forward', 'P', 'p'),
        key('Z', 'fire', 'Z', 'z', { sticky: true }), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'finderskeepers', name: 'Finders Keepers', file: 'roms/FINDERSK.Z80',
    screen: 'roms/FINDERSK.scr',   // ZXDB loading screen
    keysHelp: `${kb('A')} up, ${kb('Z')} down, ${kb('N')} left, ${kb('M')} right; ${kb('G')} get, ${kb('D')} drop / list, ` +
      `${kb('T')} trade, ${kb('E')} examine.`,
    flowHelp: "Magic Knight's first adventure. Press any key on the loading screen, 1 for the keyboard, then 8 to play.",
    pad: {
      columns: 4, areas: ['. a g d', 'n z m e', 'one eight t .'],
      keys: [key('A', 'up', 'A', 'a'), key('N', 'left', 'N', 'n'), key('Z', 'down', 'Z', 'z'), key('M', 'right', 'M', 'm'),
        key('G', 'get', 'G', 'g'), key('D', 'drop', 'D', 'd'), key('E', 'examine', 'E', 'e'), key('T', 'trade', 'T', 't'),
        key('1', 'keyboard', '1', 'one'), key('8', 'play', '8', 'eight')],
    },
  },
  {
    id: 'friday13th', name: 'Friday the 13th', file: 'roms/FRIDAY13.Z80',
    // the plain snapshot, on its loading screen, waiting for a key; the keys are from the reissue's
    // instructions and were checked in play (the player's position at 729D/729E)
    // the game also reads the Kempston port (6F2C, when 5CB0 is set, as it is): without an interface the port's
    // floating-bus value reads as the joystick pushed, and the player walks off on his own (measured)
    kempston: true,
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('M')} pick up / drop / use.`,
    flowHelp: 'Press any key on the loading screen, and SPACE through the cast, the copyright and the story.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'sp . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'use', 'M', 'm'), key('SPACE', 'next', 'SP', 'sp')],
    },
  },
  {
    id: 'gotcha', name: 'Gotcha', file: 'roms/GOTCHA.Z80',
    screen: 'roms/GOTCHA.scr',   // ZXDB loading screen
    // compiled BASIC: the keys are the ones its INKEY$ tests look for (no instructions survive)
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('K')} up, ${kb('M')} down, ${kb('H')} hold (${kb('S')} carries on).`,
    flowHelp: 'Rob the house without getting caught in the torchlight. Press any key on the loading screen, then 1 for the keyboard.',
    pad: {
      columns: 4, areas: ['. k . h', 'z m x s', 'one . . .'],
      keys: [key('K', 'up', 'K', 'k'), key('Z', 'left', 'Z', 'z'), key('M', 'down', 'M', 'm'), key('X', 'right', 'X', 'x'),
        key('H', 'hold', 'H', 'h'), key('S', 'go on', 'S', 's'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'greenberet', name: 'Green Beret', file: 'roms/GREENBER.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: 'You choose the keys: up, down, left, right, stab and shoot (for example Q A O P M N).',
    flowHelp: 'Press any key on the loading screen and wait for SELECT: 1 for the keyboard, press your six keys, Y, ' +
      'then stab to start.',
    pad: {
      columns: 4, areas: ['. q y m', 'o a p n', 'one . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'stab', 'M', 'm'), key('N', 'shoot', 'N', 'n'), key('Y', 'yes', 'Y', 'y'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'gremlins', name: 'Gremlins – The Adventure', file: 'roms/GREMLINS.Z80',
    // the [a] snapshot, on its loading screen, waiting for a key
    keysHelp: 'Type commands such as LOOK, GET FLASHLIGHT, GO DOWN, INVENTORY, then ENTER.',
    flowHelp: "Brian Howarth's text adventure. Press any key on the loading screen, N (no saved game), then ENTER at HIT ENTER.",
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'gunrunner', name: 'Gunrunner', file: 'roms/GUNRUNNE.Z80',
    // the [a] snapshot, on its loading screen, waiting for a key; the default keys are read from the game's code
    keysHelp: `${kb('N')} left, ${kb('M')} right, ${kb('S')} jump (fly up with the jet pack), ${kb('X')} kneel, ` +
      `${kb('A')} fire, ${kb('Symbol')} poison; ${kb('P')} pause.`,
    flowHelp: 'Press any key on the loading screen, then 1 for the keyboard (4 defines the keys).',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'one ss p .'],
      keys: [key('S', 'jump', 'S', 's'), key('N', 'left', 'N', 'n'), key('X', 'kneel', 'X', 'x'), key('M', 'right', 'M', 'm'),
        key('A', 'fire', 'A', 'a'), key('1', 'keyboard', '1', 'one'), key('SYM', 'poison', 'SS', 'ss'), key('P', 'pause', 'P', 'p')],
    },
  },
  {
    id: 'harrierattack', name: 'Harrier Attack', file: 'roms/HARRIERA.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('7')} climb, ${kb('6')} dive, ${kb('8')} faster, ${kb('5')} slower, ${kb('0')} rocket, ${kb('Space')} bomb.`,
    flowHelp: 'Press any key on the loading screen, then the skill level 1–5. Climb off the carrier with 7.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight sp', 'one . . .'],
      keys: [key('7', 'climb', '7', 'seven'), key('5', 'slower', '5', 'five'), key('6', 'dive', '6', 'six'), key('8', 'faster', '8', 'eight'),
        key('0', 'rocket', '0', 'zero'), key('SPACE', 'bomb', 'SP', 'sp'), key('1', 'level 1', '1', 'one')],
    },
  },
  {
    id: 'headoverheels', name: 'Head over Heels', file: 'roms/HEADOVER.Z80',
    screen: 'roms/HEADOVER.scr',   // ZXDB loading screen
    // the [a] snapshot, on the menu
    keysHelp: `${kb('O')}/${kb('6')} left, ${kb('P')}/${kb('7')} right, ${kb('Q')}/${kb('9')} up, ${kb('A')}/${kb('8')} down; ` +
      `${kb('Space')} ${kb('Symbol')} ${kb('M')} ${kb('N')} ${kb('B')} jump; ${kb('Enter')} ${kb('L')} ${kb('K')} ${kb('J')} carry; ` +
      `${kb('Caps')} ${kb('Z')}–${kb('V')} fire; ${kb('S')}–${kb('G')} swap Head and Heels; ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen. On the menu ENTER plays the game (any other key moves the cursor); ' +
      'the map of the Blacktooth empire shows for about 20 s.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p en', 's z . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'jump', 'SP', 'sp'), key('ENTER', 'carry', 'EN', 'en'), key('S', 'swap', 'S', 's'), key('Z', 'fire', 'Z', 'z')],
    },
  },
  {
    id: 'heavyonthemagick', name: 'Heavy on the Magick', file: 'roms/HEAVYONT.Z80',
    // saved six notes into the title tune (pointers FC73/FC77 at FD67/FE89): restart at FC58, which sets them to
    // the tune's start (FD61/FE83) and plays it until a key (it returns to B66C, on the stack at 5E21)
    start: { pc: 0xfc58, sp: 0x5e21 },
    screen: 'roms/HEAVYONT.scr',   // fan-made loading screen (Andy Green, 2017)
    holdBoot: true,           // the tune would start straight away
    keysHelp: 'Type commands: the first letter brings up the whole word, as in BASIC (N north, E east, L left, R right, ' +
      'G get, D drop, X examine, O open, B blast, S say, H halt…), then ENTER.',
    flowHelp: "Gargoyle's Axil the Able in Collodon's Pile. Press any key on the loading screen, then on the advice page: the tune plays. Any key gives " +
      'the menu, where 1 (Magick!) plays.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'horacespiders', name: 'Horace & the Spiders', file: 'roms/HORACESP.Z80',
    screen: 'roms/HORACESP.scr',   // ZXDB loading screen
    // the title's buzz is the same short sound on every pass of its loop: there is no tune to restart
    keysHelp: `${kb('Q')} up / jump, ${kb('Z')} down, ${kb('I')} left, ${kb('P')} right; ${kb('V')}–${kb('M')} stamp (third stage).`,
    flowHelp: 'Press any key on the loading screen. Press any key to start.',
    pad: {
      columns: 4, areas: ['. q . m', 'i z p m'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('M', 'stamp', 'M', 'm')],
    },
  },
  {
    id: 'horaceskiing', name: 'Horace Goes Skiing', file: 'roms/HORACESK.Z80',
    screen: 'roms/HORACESK.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('Z')} down, ${kb('I')} left, ${kb('P')} right.`,
    flowHelp: 'Cross the road, hire skis, slalom down. Press any key on the loading screen. Press any key to start.',
    pad: {
      columns: 3, areas: ['. q .', 'i . p', '. z .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('P', 'right', 'P', 'p'), key('Z', 'down', 'Z', 'z')],
    },
  },
  {
    id: 'hunchback', name: 'Hunchback', file: 'roms/HUNCHBAC.Z80',
    screen: 'roms/HUNCHBAC.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('Symbol')} jump.`,
    flowHelp: 'Ring the bells and rescue Esmeralda. Press any key on the loading screen and on the title, then 1 for the keyboard.',
    pad: {
      columns: 3, areas: ['q w ss', 'one . ss'],
      keys: [key('Q', 'left', 'Q', 'q'), key('W', 'right', 'W', 'w'), key('SYM', 'jump', 'SS', 'ss'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'impossiblemission', name: 'Impossible Mission', file: 'roms/IMPOSSIB.Z80',
    screen: 'roms/IMPOSSIB.scr',   // ZXDB loading screen
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('P')} up, ${kb('L')} down, ${kb('B')}–${kb('Space')} fire (somersault, search).`,
    flowHelp: 'Stop Elvin Atombender. Press any key on the loading screen, 1 for the keyboard, then 0 to start.',
    pad: {
      columns: 4, areas: ['. p . sp', 'cs l z sp', 'one zero . .'],
      keys: [key('P', 'up', 'P', 'p'), key('CAPS', 'left', 'CS', 'cs'), key('L', 'down', 'L', 'l'), key('Z', 'right', 'Z', 'z'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'jackbeanstalk', name: 'Jack and the Beanstalk', file: 'roms/JACKBEAN.Z80',
    screen: 'roms/JACKBEAN.scr',   // ZXDB loading screen
    keysHelp: `${kb('W')} left, ${kb('E')} right, ${kb('O')} up, ${kb('K')} down, ${kb('Q')} jump, ${kb('P')} fire.`,
    flowHelp: 'Press any key on the loading screen, then 1 for the keyboard (the story scrolls until you do).',
    pad: {
      columns: 4, areas: ['q o . p', 'w k e p', 'one . . .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('O', 'up', 'O', 'o'), key('W', 'left', 'W', 'w'), key('K', 'down', 'K', 'k'),
        key('E', 'right', 'E', 'e'), key('P', 'fire', 'P', 'p'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'jasper', name: 'Jasper!', file: 'roms/JASPER.Z80',
    screen: 'roms/JASPER.scr',   // ZXDB loading screen
    // the plain snapshot, in the game's own demo of its 22 screens (the BEEPs are its sound effects)
    keysHelp: `${kb('A')} left, ${kb('S')} right, ${kb('Y')}–${kb('P')} up / jump / let go of a rope, ${kb('H')}–${kb('Enter')} ` +
      `down / duck, ${kb('B')}–${kb('Space')} pick up / hold a rope; ${kb('1')}–${kb('5')} use an object, ${kb('Q')}–${kb('T')} with ` +
      `${kb('1')}–${kb('5')} drop it; ${kb('6')}–${kb('0')} music on/off.`,
    flowHelp: "Micromega's Jasper the rat. Press any key on the loading screen: the demo runs. Any key starts the game.",
    pad: {
      columns: 4, areas: ['. p . sp', 'a h s sp', 'one two three .'],
      keys: [key('P', 'up', 'P', 'p'), key('A', 'left', 'A', 'a'), key('H', 'down', 'H', 'h'), key('S', 'right', 'S', 's'),
        key('SPACE', 'pick up', 'SP', 'sp'), key('1', 'use 1', '1', 'one'), key('2', 'use 2', '2', 'two'), key('3', 'use 3', '3', 'three')],
    },
  },
  {
    id: 'joeblade', name: 'Joe Blade', file: 'roms/JOEBLADE.Z80',
    screen: 'roms/JOEBLADE.scr',   // ZXDB loading screen
    // saved 59 notes into the 48K title tune (position 8207, 2 per note); the tape loads it as 0 (checked by
    // loading the original 48K tape to its end): put it back so the tune plays from its first note
    pokes: { 0x8207: 0 },
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')}–${kb('T')} jump / go through a door, ${kb('A')}–${kb('G')} go through a door, ` +
      `${kb('B')}–${kb('Space')} fire.`,
    flowHelp: 'Press any key on the loading screen, then S to start (C: control options, H: high scores).',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp', 's . . .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'door', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'fire', 'SP', 'sp'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'kong', name: 'Kong', file: 'roms/KONG.Z80',
    screen: 'roms/KONG.scr',   // ZXDB loading screen
    // the plain snapshot, on Ocean's menu (the [a] one is a German version)
    keysHelp: `${kb('N')} left, ${kb('M')} right, ${kb('S')} up, ${kb('X')} down, ${kb('A')} jump.`,
    flowHelp: 'Press any key on the loading screen, then 1 for the keyboard (5: training mode).',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'one . . .'],
      keys: [key('S', 'up', 'S', 's'), key('N', 'left', 'N', 'n'), key('X', 'down', 'X', 'x'), key('M', 'right', 'M', 'm'),
        key('A', 'jump', 'A', 'a'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'kongstrikesback', name: 'Kong Strikes Back', file: 'roms/KONGSTRI.Z80',
    screen: 'roms/KONGSTRI.scr',   // ZXDB loading screen
    keysHelp: 'You choose the keys: R on the title asks for up, down, left, right, throw bomb, hold and sound ' +
      '(for example Q A O P M H S).',
    flowHelp: 'Press any key on the loading screen, R to choose your seven keys, then S to start.',
    pad: {
      columns: 4, areas: ['. q r m', 'o a p m', 's h . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'bomb', 'M', 'm'), key('R', 'keys', 'R', 'r'), key('S', 'start', 'S', 's'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'lazyjones', name: 'Lazy Jones', file: 'roms/LAZYJONE.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('M')} fire (enter a room); ${kb('H')} halt.`,
    flowHelp: 'The hotel caretaker who would rather play games. Press any key on the loading screen and on the title, ' +
      '1 for the keyboard, then the number of lives 1–9.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'one three . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('1', 'keyboard', '1', 'one'), key('3', 'lives', '3', 'three')],
    },
  },
  {
    id: 'macadambumper', name: 'Macadam Bumper', file: 'roms/MACADAMB.Z80',
    // the plain snapshot, on its loading screen, waiting for a key (its BASIC then starts the game)
    holds: { C: 30, N: 30 },   // the table reads the coin and player keys slowly (measured)
    keysHelp: `${kb('Caps')} left flipper, ${kb('Space')} right flipper, ${kb('Z')} jolt left, ${kb('Symbol')} jolt right. ` +
      `Both flippers together pull the plunger; let go to launch.`,
    flowHelp: 'Press any key on the loading screen. The menu takes about 15 s to answer: P plays. On the table C puts ' +
      'in a coin, N adds a player, then both flipper keys launch the ball. M, C, L and S design, save and load tables.',
    pad: {
      columns: 4, areas: ['cs z ss sp', 'p c n .'],
      keys: [key('CAPS', 'left', 'CS', 'cs'), key('Z', 'jolt L', 'Z', 'z'), key('SYM', 'jolt R', 'SS', 'ss'), key('SPACE', 'right', 'SP', 'sp'),
        key('P', 'play', 'P', 'p'), key('C', 'coin', 'C', 'c'), key('N', 'player', 'N', 'n')],
    },
  },
  {
    id: 'montyinnocent', name: 'Monty Is Innocent', file: 'roms/MONTYISI.Z80',
    // the [a] snapshot, on its loading screen, waiting for a key
    holds: { 1: 30 },         // the menu tune reads the keys between notes (measured)
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('O')} up, ${kb('K')} down, ${kb('P')} pick up.`,
    flowHelp: 'Sam Stoat breaks Monty out of Scudmore Prison. Press any key on the loading screen, then 1 for the keyboard.',
    pad: {
      columns: 4, areas: ['. o . p', 'q k w p', 'one . . .'],
      keys: [key('O', 'up', 'O', 'o'), key('Q', 'left', 'Q', 'q'), key('K', 'down', 'K', 'k'), key('W', 'right', 'W', 'w'),
        key('P', 'pick up', 'P', 'p'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'montyontherun', name: 'Monty on the Run', file: 'roms/MONTYONT.Z80',
    screen: 'roms/MONTYONT.scr',   // ZXDB loading screen
    // the game detects a Kempston interface (AE27) and keeps the answer at AE3D; the snapshot was saved with
    // it set, so without an interface the port's floating bus reads as the stick held (fire picks menu options
    // by itself). 0 = keyboard mode; the game checks again when it returns to the menu and finds none (measured).
    // The menu reads the keys between notes of its tune, 6 to 86 frames apart (measured): no fixed hold fits
    pokes: { 0xae3d: 0 },
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('Y')}–${kb('P')} up, ${kb('H')}–${kb('Enter')} down, ${kb('B')}–${kb('Space')} jump.`,
    flowHelp: 'Press any key on the loading screen. The menu reads its keys only between the notes of its tune: hold ' +
      'ENTER (or H, Y–P) until the marker moves, and SPACE until it picks. 1 chooses the freedom kit (Q and W move ' +
      'along, SPACE takes an object, five of them), 3 plays.',
    pad: {
      columns: 4, areas: ['. p . sp', 'q h w sp'],
      keys: [key('P', 'up', 'P', 'p'), key('Q', 'left', 'Q', 'q'), key('H', 'down', 'H', 'h'), key('W', 'right', 'W', 'w'),
        key('SPACE', 'jump', 'SP', 'sp')],
    },
  },
  {
    id: 'mooncresta', name: 'Moon Cresta', file: 'roms/MOONCRES.Z80',
    // the [a] snapshot, on its loading screen (the plain one waits on STOP TAPE)
    holdBoot: true,           // it moves on to its menu and attract mode by itself
    keysHelp: `${kb('Caps')} left, ${kb('Z')} right, ${kb('Space')} fire.`,
    flowHelp: 'Press any key on the loading screen, and any key again while the picture or the TRIP TO THE SPACE WAR ' +
      'message shows for the menu: 6 starts (5 defines the keys).',
    pad: {
      columns: 3, areas: ['cs z sp', 'six . sp'],
      keys: [key('CAPS', 'left', 'CS', 'cs'), key('Z', 'right', 'Z', 'z'), key('SPACE', 'fire', 'SP', 'sp'), key('6', 'start', '6', 'six')],
    },
  },
  {
    id: 'mugsy', name: 'Mugsy', file: 'roms/MUGSY.Z80',
    screen: 'roms/MUGSY.scr',   // ZXDB loading screen
    // saved during the first phrase of the intro tune (IX walks the phrase list at 8040): restart at 8025, which
    // sets IX to the list's start; the caller's IX and the routine's exit are left on the stack as saved (D21E)
    start: { pc: 0x8025, sp: 0xd21e },
    keysHelp: 'Answer Louey with numbers and ENTER. In a shoot-out: ' +
      `${kb('I')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('Z')} down, ${kb('B')} ${kb('N')} ${kb('M')} fire.`,
    flowHelp: 'Run the Chicago mob for 20 years. Press any key on the loading screen; SPACE turns the pages of the comic.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'netherearth', name: 'Nether Earth', file: 'roms/NETHEREA.Z80',
    // saved in the menu tune's interrupt routine: restart where the tune is set up (C4A7, returning to C1A1)
    start: { pc: 0xc4a7, sp: 0xfffc },
    screen: 'roms/NETHEREA.scr',   // fan-made loading screen (from NetherEarth.tap)
    holdBoot: true,           // the tune would start straight away
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Symbol')} fire / select; ` +
      `${kb('1')} pause, ${kb('9')} abort.`,
    flowHelp: 'Build robots and take the warbases. Press any key on the loading screen, then on the menu: the tune plays. 1 for the keyboard, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q . ss', 'o a p ss', 'one zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SYM', 'fire', 'SS', 'ss'), key('1', 'keyboard', '1', 'one'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'nodesofyesod', name: 'Nodes of Yesod', file: 'roms/NODESOFY.Z80',
    // saved on its loading screen in the pause before the sampled sound (E200), which then plays from the start
    holdBoot: true,           // the sound and the menu would follow straight away
    keysHelp: `Alternate bottom-row keys left and right (${kb('Z')} ${kb('C')} ${kb('B')} … one way, ${kb('X')} ${kb('V')} ${kb('N')} … the ` +
      `other); ${kb('Q')}–${kb('P')} jump (the mole: up), ${kb('A')}–${kb('L')} gravity stick (the mole: down); ` +
      `${kb('1')}–${kb('0')} change between man and mole; ${kb('Enter')} pause.`,
    flowHelp: 'Charlie on the moon, looking for the eight alchiems. Press any key on the loading screen, then 1 for the keyboard.',
    pad: {
      columns: 4, areas: ['. q . two', 'z a x .', 'one . . .'],
      keys: [key('Q', 'jump', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'stick', 'A', 'a'), key('X', 'right', 'X', 'x'),
        key('2', 'mole', '2', 'two'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'peterpan', name: 'Peter Pan', file: 'roms/PETERPAN.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: 'Type commands such as N, S, E, W, UP, TAKE …, EXAMINE …, then ENTER (0 deletes a wrong letter).',
    flowHelp: 'An illustrated adventure. Press any key on the loading screen; the story begins by itself.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'planetoids', name: 'Planetoids', file: 'roms/PLANETOI.Z80',
    screen: 'roms/PLANETOI.scr',   // ZXDB loading screen
    // the title's hum is the same on every pass of its loop: nothing to restart
    holds: { C: 30 },         // the title reads the C half-row only every 25 frames (measured)
    keysHelp: `${kb('Z')} rotate left, ${kb('X')} rotate right, ${kb('Enter')} thrust, ${kb('Space')} fire, ${kb('H')} hyperspace.`,
    flowHelp: "Psion's Asteroids. Press any key on the loading screen, then C to commence.",
    pad: {
      columns: 4, areas: ['z x en sp', 'c h . .'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('ENTER', 'thrust', 'EN', 'en'), key('SPACE', 'fire', 'SP', 'sp'),
        key('C', 'commence', 'C', 'c'), key('H', 'hyper', 'H', 'h')],
    },
  },
  {
    id: 'pudpud', name: 'Pud Pud in Weird World', file: 'roms/PUDPUD.Z80',
    screen: 'roms/PUDPUD.scr',   // ZXDB loading screen
    // saved in the title tune's fourth phrase: restart at its loop (6BD4: first list from 6BBA), with the
    // caller's return address (77E5) on the stack as saved, at 618E
    start: { pc: 0x6bd4, sp: 0x618e },
    keysHelp: `${kb('O')} left, ${kb('W')} right, ${kb('Space')} flap (keyboard mode 2: ${kb('O')} ${kb('P')} ${kb('Caps')}); ${kb('S')} pause.`,
    flowHelp: 'Press any key on the loading screen, ENTER on the title, 1 for the keyboard, then 1 for the keys.',
    pad: {
      columns: 4, areas: ['o w sp sp', 'en one . .'],
      keys: [key('O', 'left', 'O', 'o'), key('W', 'right', 'W', 'w'), key('SPACE', 'flap', 'SP', 'sp'), key('ENTER', 'start', 'EN', 'en'),
        key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'rasputin', name: 'Rasputin', file: 'roms/RASPUTIN.Z80',
    screen: 'roms/RASPUTIN.scr',   // ZXDB loading screen
    // saved on the menu tune's first note: restart at its loop (A747) for the whole note
    start: { pc: 0xa747, sp: 0x5ef6 },
    // between notes the menu reads 1-5 and goes on to test 0 only if the read is exactly FF; after the ROM's
    // BEEP that needs an Issue 2 board (EAR bit set by MIC): on Issue 3 the game never starts (measured)
    issue2: true,
    holds: { 0: 30 },         // the keys are read only between notes, up to 23 frames apart (measured)
    keysHelp: `${kb('Q')} turn left, ${kb('W')} turn right, ${kb('O')} walk, ${kb('P')} jump, ${kb('M')} shield, ` +
      `${kb('M')}+${kb('P')} sword; ${kb('Space')} pause, ${kb('1')} quit.`,
    flowHelp: 'Destroy the Jewel of the Seven Planets. Press any key on the loading screen; the keyboard is chosen: 0 plays.',
    pad: {
      columns: 4, areas: ['q w o p', 'm zero . .'],
      keys: [key('Q', 'turn L', 'Q', 'q'), key('W', 'turn R', 'W', 'w'), key('O', 'walk', 'O', 'o'), key('P', 'jump', 'P', 'p'),
        key('M', 'shield', 'M', 'm'), key('0', 'play', '0', 'zero')],
    },
  },
  {
    id: 'sirfred', name: 'Sir Fred', file: 'roms/SIRFRED.Z80',
    screen: 'roms/SIRFRED.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Z')} select an object, ${kb('M')} use it.`,
    flowHelp: 'Rescue the princess. Press any key on the loading screen, 4 for the keyboard, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q z m', 'o a p .', 'four zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('Z', 'select', 'Z', 'z'), key('M', 'use', 'M', 'm'), key('4', 'keyboard', '4', 'four'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'skistar', name: 'Ski Star 2000', file: 'roms/SKISTAR2.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('A')} up / faster, ${kb('Z')} down / slower, ${kb('M')} fire.`,
    flowHelp: 'Press any key on the loading screen and ENTER on the title. On the menu 1 then ENTER plays ' +
      '(2: choose a course, 3: design one).',
    pad: {
      columns: 4, areas: ['. a . m', 'o z p en', 'one . . .'],
      keys: [key('A', 'up', 'A', 'a'), key('O', 'left', 'O', 'o'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('ENTER', 'enter', 'EN', 'en'), key('1', 'play', '1', 'one')],
    },
  },
  {
    id: 'spaceraiders', name: 'Space Raiders', file: 'roms/SPACERAI.Z80',
    screen: 'roms/SPACERAI.scr',   // ZXDB loading screen
    // the plain snapshot, in its attract mode
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('Space')} fire.`,
    flowHelp: "Psion's Space Invaders. Press any key on the loading screen, then SPACE to play.",
    pad: {
      columns: 3, areas: ['z x sp'],
      keys: [key('Z', 'left', 'Z', 'z'), key('X', 'right', 'X', 'x'), key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'starstrike', name: '3D Starstrike', file: 'roms/3DSTARST.Z80',
    // the [a] snapshot, on its loading screen; the keys are the groups its keyboard routine (D227) reads
    holdBoot: true,           // it moves on to its options by itself
    keysHelp: `${kb('Q')}–${kb('T')} sight up, ${kb('A')}–${kb('G')} down, ${kb('Y')} ${kb('U')} ${kb('I')} ${kb('H')} ${kb('J')} ${kb('K')} left, ` +
      `${kb('O')} ${kb('P')} ${kb('L')} ${kb('Enter')} right, bottom rows fire; ${kb('1')} pause, ${kb('2')} resume.`,
    flowHelp: 'Press any key on the loading screen, 1 for the keyboard, then the difficulty 0–3.',
    pad: {
      columns: 4, areas: ['. q . sp', 'y a p sp', 'one zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('Y', 'left', 'Y', 'y'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'), key('0', 'easy', '0', 'zero')],
    },
  },
  {
    id: 'starstrike2', name: 'Starstrike II', file: 'roms/STARSTRI.Z80',
    screen: 'roms/STARSTRI.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('B')} ${kb('N')} ${kb('M')} ${kb('Space')} fire.`,
    flowHelp: 'Press any key on the loading screen, B for the keyboard, then ENTER to start. On the support module, ' +
      'up and down choose a star system, fire goes.',
    pad: {
      columns: 4, areas: ['. q b sp', 'o a p sp', 'en . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'fire', 'SP', 'sp'), key('B', 'keyboard', 'B', 'b'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'starion', name: 'Starion', file: 'roms/STARION.Z80',
    screen: 'roms/STARION.scr',   // ZXDB loading screen
    // the keys are the ones its control-selection page (3 on the menu) shows
    keysHelp: `${kb('W')} dive, ${kb('C')} climb, ${kb('I')} bank left, ${kb('P')} bank right, ${kb('N')} fire, ${kb('E')} faster, ` +
      `${kb('Q')} slower; ${kb('T')} target, ${kb('R')} status, ${kb('S')} sound, ${kb('H')} hold.`,
    flowHelp: 'Put history right, one time zone at a time. Press any key on the loading screen and on the spinning ship, ' +
      '0 to commence the mission, then 1–9 for a time grid and 1–9 for a time zone.',
    pad: {
      columns: 4, areas: ['. w . n', 'i c p n', 'zero e q one'],
      keys: [key('W', 'dive', 'W', 'w'), key('I', 'left', 'I', 'i'), key('C', 'climb', 'C', 'c'), key('P', 'right', 'P', 'p'),
        key('N', 'fire', 'N', 'n'), key('0', 'commence', '0', 'zero'), key('E', 'faster', 'E', 'e'), key('Q', 'slower', 'Q', 'q'),
        key('1', 'one', '1', 'one')],
    },
  },
  {
    id: 'sweevo', name: "Sweevo's World", file: 'roms/SWEEVO.Z80',
    screen: 'roms/SWEEVO.scr',   // ZXDB loading screen
    // saved 34 notes into the menu tune (Gargoyle's player, as Heavy on the Magick's: pointers FBAB/FBAF): restart
    // at FB90, which sets them to the start and plays until a key, returning to 9CC9 (on the stack at 5E1D)
    start: { pc: 0xfb90, sp: 0x5e1d },
    keysHelp: `Diagonals: ${kb('Q')}–${kb('T')} up-left, ${kb('Y')}–${kb('P')} up-right, ${kb('A')}–${kb('G')} down-left, ` +
      `${kb('H')}–${kb('Enter')} down-right; bottom row pick up / drop / BOO.`,
    flowHelp: 'Press any key on the loading screen: the tune plays. Any key, 1 for the keyboard, then A–D to choose ' +
      'the world and start.',
    pad: {
      columns: 4, areas: ['q . p sp', 'a . h sp', 'one a2 . .'],
      keys: [key('Q', 'up-left', 'Q', 'q'), key('P', 'up-right', 'P', 'p'), key('A', 'down-left', 'A', 'a'), key('H', 'down-right', 'H', 'h'),
        key('SPACE', 'pick up', 'SP', 'sp'), key('1', 'keyboard', '1', 'one'), key('A', 'world A', 'A', 'a2')],
    },
  },
  {
    id: 'tauceti', name: 'Tau Ceti', file: 'roms/TAUCETI.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    holds: { CS: 100, SP: 100 },   // the demo takes BREAK only when held a couple of seconds (measured in the page)
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('S')} more thrust, ${kb('X')} less, ${kb('H')} higher, ${kb('G')} lower, ` +
      `${kb('N')} laser, ${kb('M')} missile, ${kb('F')} flare, ${kb('A')} anti-missile, ${kb('I')} infra-red, ${kb('R')} status, ` +
      `${kb('J')} jump, ${kb('L')} land; BREAK pauses.`,
    flowHelp: "Pete Cooke's skimmer mission. Press any key on the loading screen: a demo runs. Hold BREAK (CAPS+SPACE) " +
      'for a couple of seconds to start.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'technicianted', name: 'Technician Ted', file: 'roms/TECHNICI.Z80',
    // saved part-way through the title tune (note pointer A451 at 7360): restart at AAE0, which sets up the
    // title and calls C1C0, starting the tune from 72BB (A475); the caller's return address is on the stack at 5BFF
    start: { pc: 0xaae0, sp: 0x5bff },
    holdBoot: true,           // the tune would start straight away (ZXDB's loading screen is the loading game's text)
    keysHelp: `${kb('Q')} ${kb('O')} ${kb('5')} ${kb('6')} left, ${kb('W')} ${kb('P')} ${kb('7')} ${kb('8')} right, ` +
      'bottom row, 9 or 0 jump.',
    flowHelp: 'Press any key on the title: the tune plays. ENTER starts (H: instructions).',
    pad: {
      columns: 3, areas: ['o p sp', 'en . sp'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('SPACE', 'jump', 'SP', 'sp'), key('ENTER', 'start', 'EN', 'en')],
    },
  },
  {
    id: 'terrordaktil', name: 'Terror-Daktil 4D', file: 'roms/TERRORDA.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('Q')} raise the cannon, ${kb('A')}/${kb('Z')} lower it, ${kb('I')}/${kb('O')} aim left, ${kb('P')} aim right, ` +
      `${kb('X')}–${kb('Space')} fire; ${kb('G')}+${kb('H')} halt.`,
    flowHelp: 'Press any key on the loading screen and again on the title to start.',
    pad: {
      columns: 4, areas: ['. q . sp', 'o a p sp'],
      keys: [key('Q', 'raise', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'lower', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'thanatos', name: 'Thanatos', file: 'roms/THANATOS.Z80',
    // the [a2] snapshot, on its loading screen; the game (and its music) starts after the key
    keysHelp: `${kb('A')} higher, ${kb('Z')} lower, ${kb('M')} faster right, ${kb('N')} faster left, ${kb('Space')} flame / drop.`,
    flowHelp: 'Durell\'s dragon. Press any key on the loading screen. The credits read the keys only between notes: ' +
      'hold a key until the menu shows, then 4 plays (1: skill, 2: keys).',
    pad: {
      columns: 4, areas: ['. a . sp', 'n z m sp', 'four . . .'],
      keys: [key('A', 'up', 'A', 'a'), key('N', 'left', 'N', 'n'), key('Z', 'down', 'Z', 'z'), key('M', 'right', 'M', 'm'),
        key('SPACE', 'flame', 'SP', 'sp'), key('4', 'play', '4', 'four')],
    },
  },
  {
    id: 'goonies', name: 'The Goonies', file: 'roms/GOONIES.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('Q')} up, ${kb('A')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Caps')} change Goonie; ${kb('Space')} pause.`,
    flowHelp: 'Two Goonies at once. Press any key on the loading screen, then 1 (keyboard), 4 (one player), 6 (start).',
    pad: {
      columns: 4, areas: ['. q . cs', 'o a p cs', 'one four six .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('CAPS', 'change', 'CS', 'cs'), key('1', 'keyboard', '1', 'one'), key('4', 'one player', '4', 'four'), key('6', 'start', '6', 'six')],
    },
  },
  {
    id: 'greatescape', name: 'The Great Escape', file: 'roms/GREATESC.Z80',
    // the [a3] snapshot, on its loading screen: its menu tune starts from the beginning by itself (the others were
    // saved part-way through it)
    holdBoot: true,           // it moves on to the menu and its tune by itself
    keysHelp: 'You choose the keys: left, right, up, down and fire (for example O P Q A M). Fire with up picks up, ' +
      'with down drops, with left or right uses an object.',
    flowHelp: 'Press any key on the loading screen. On the menu 1 (keyboard), 0 to select, press your five keys, then Y.',
    pad: {
      columns: 4, areas: ['. q y m', 'o a p m', 'one zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('Y', 'yes', 'Y', 'y'), key('1', 'keyboard', '1', 'one'), key('0', 'select', '0', 'zero')],
    },
  },
  {
    id: 'snowman', name: 'The Snowman', file: 'roms/SNOWMAN.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    keysHelp: `Alternate bottom-row keys left (${kb('Caps')} ${kb('X')} ${kb('V')} …) and right (${kb('Z')} ${kb('C')} ${kb('B')} …); ` +
      `${kb('Q')}–${kb('P')} up, ${kb('A')}–${kb('L')} down; ${kb('1')} pause.`,
    flowHelp: 'Press any key on the loading screen, then S to start (I: instructions, O: options).',
    pad: {
      columns: 3, areas: ['. q .', 'x a z', 's . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('X', 'left', 'X', 'x'), key('A', 'down', 'A', 'a'), key('Z', 'right', 'Z', 'z'),
        key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'trapdoor', name: 'The Trap Door', file: 'roms/TRAPDOOR.Z80',
    // the [a] snapshot, on its loading screen, saved 90 notes into the tune (Gargoyle-style player, pointers
    // FC87/FC8B): restart at FC6C, which sets them to the start and plays until a key (returns to AAC2, at 6395)
    start: { pc: 0xfc6c, sp: 0x6395 },
    holdBoot: true,           // the tune would start straight away
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('C')} pick up / drop, ${kb('T')} tip, ${kb('H')} hold.`,
    flowHelp: 'Berk, Boni and Drutt. Press any key on the loading screen: the tune plays. Any key for the menu, ' +
      'C to continue, then L (learner) or S (super Berk).',
    pad: {
      columns: 4, areas: ['. q c t', 'z a x .', 'l s . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('C', 'drop', 'C', 'c'), key('T', 'tip', 'T', 't'), key('Z', 'left', 'Z', 'z'),
        key('A', 'down', 'A', 'a'), key('X', 'right', 'X', 'x'), key('L', 'learner', 'L', 'l'), key('S', 'super', 'S', 's')],
    },
  },
  {
    id: 'threeweeks', name: 'Three Weeks in Paradise', file: 'roms/THREEWEE.Z80',
    screen: 'roms/THREEWEE.scr',   // ZXDB loading screen
    // saved six rounds into the title's 18 (its jingle repeats each round), before the tune: restart at F7AF,
    // which counts the 18 rounds from the start (returns to F6B9, at FFFE; the tune follows at F813)
    start: { pc: 0xf7af, sp: 0xfffe },
    keysHelp: `${kb('Q')} ${kb('E')} ${kb('T')} ${kb('U')} ${kb('O')} left, ${kb('W')} ${kb('R')} ${kb('Y')} ${kb('I')} ${kb('P')} right, ` +
      `bottom row jump, ${kb('A')}–${kb('Enter')} go in / swim / use; ${kb('1')} ${kb('2')} pick up / put down, ${kb('4')} pause.`,
    flowHelp: 'Wally rescues Wilma and Herbert. Press any key on the loading screen; the title and its tune play. ' +
      'Any key for the menu: 3 (keyboard), then 4 to start.',
    pad: {
      columns: 4, areas: ['q w a sp', 'one two three four'],
      keys: [key('Q', 'left', 'Q', 'q'), key('W', 'right', 'W', 'w'), key('A', 'use', 'A', 'a'), key('SPACE', 'jump', 'SP', 'sp'),
        key('1', 'object 1', '1', 'one'), key('2', 'object 2', '2', 'two'), key('3', 'keyboard', '3', 'three'), key('4', 'start', '4', 'four')],
    },
  },
  {
    id: 'topgun', name: 'Top Gun', file: 'roms/TOPGUN.Z80',
    // the [a] snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('S')} climb, ${kb('W')} dive, ${kb('E')} bank left, ${kb('R')} bank right, ${kb('T')} fire; ` +
      `${kb('A')} more thrust, ${kb('Z')} less.`,
    flowHelp: 'Press any key on the loading screen, ENTER (one player), ENTER (keyboard), then SPACE to fly (D defines the keys).',
    pad: {
      columns: 4, areas: ['. s . t', 'e w r t', 'a z en sp'],
      keys: [key('S', 'climb', 'S', 's'), key('E', 'left', 'E', 'e'), key('W', 'dive', 'W', 'w'), key('R', 'right', 'R', 'r'),
        key('T', 'fire', 'T', 't'), key('A', 'thrust+', 'A', 'a'), key('Z', 'thrust-', 'Z', 'z'), key('ENTER', 'select', 'EN', 'en'),
        key('SPACE', 'start', 'SP', 'sp')],
    },
  },
  {
    id: 'uridium', name: 'Uridium', file: 'roms/URIDIUM.Z80',
    // the [a2] snapshot was saved on its loading screen with the title tune playing over it; the game itself starts
    // at 7899 (jp 789E: set-up at 93C6, then 78A4, where it also returns after a game): the credits page, then the
    // tune from its first note (pointer 9375 from 7772). A key there starts a game; 1-4 set the options (8AD0)
    start: { pc: 0x7899, sp: 0x5b80 },
    holdBoot: true,           // the tune would start straight away
    keysHelp: `${kb('Z')} left, ${kb('X')} right, ${kb('L')} up, ${kb('Symbol')} down, ${kb('Enter')} fire (hold it with up or ` +
      `down to roll); ${kb('P')} pause, ${kb('Q')} quit.`,
    // the credits page reads the keys between notes, up to 62 frames apart (measured)
    flowHelp: "Andrew Braybrook's Uridium. Press any key on the loading screen for the credits page and its tune. " +
      'There 1 or 2 sets one or two players, any other key starts the game (it reads the keys between notes: hold ' +
      'the key until the game starts).',
    pad: {
      columns: 4, areas: ['. l . en', 'z ss x en'],
      keys: [key('L', 'up', 'L', 'l'), key('Z', 'left', 'Z', 'z'), key('SYM', 'down', 'SS', 'ss'), key('X', 'right', 'X', 'x'),
        key('ENTER', 'fire', 'EN', 'en')],
    },
  },
  {
    id: 'worsethings', name: 'Worse Things Happen at Sea', file: 'roms/WORSETHI.Z80',
    // the [a2] snapshot, on its loading screen, waiting for a key
    keysHelp: `With key set 5: ${kb('Q')} left, ${kb('W')} right, ${kb('L')} down, ${kb('P')} up, ${kb('M')} doors / take, ` +
      `${kb('X')} pump / power (with a move: super-step); ${kb('S')} start, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen, N (no instructions), a key set 1–6 (5: Q W L P M X), then S to start.',
    pad: {
      columns: 4, areas: ['. p . m', 'q l w x', 'n five s .'],
      keys: [key('P', 'up', 'P', 'p'), key('Q', 'left', 'Q', 'q'), key('L', 'down', 'L', 'l'), key('W', 'right', 'W', 'w'),
        key('M', 'take', 'M', 'm'), key('X', 'pump', 'X', 'x'), key('N', 'no', 'N', 'n'), key('5', 'keys 5', '5', 'five'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'wriggler', name: 'Wriggler', file: 'roms/WRIGGLER.Z80',
    // the plain snapshot, on its loading screen, waiting for a key
    holds: { 0: 30, 1: 30, 2: 30, 3: 30, 4: 30 },   // the menu reads the keys slowly (measured)
    keysHelp: `With key set 2: ${kb('O')} left, ${kb('A')} down, ${kb('Q')} up, ${kb('P')} right, ${kb('M')} fire.`,
    flowHelp: 'Press any key on the loading screen, 2 for the keys O A Q P M, then 0 to start.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'two zero . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('2', 'keys', '2', 'two'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'xevious', name: 'Xevious', file: 'roms/XEVIOUS.Z80',
    screen: 'roms/XEVIOUS.scr',   // ZXDB loading screen
    keysHelp: 'You choose the keys: up, down, left, right, fire and bomb (for example Q A O P M N); P pauses.',
    flowHelp: 'Press any key on the loading screen, 0 for the keyboard, press your six keys, then 4 for one player.',
    pad: {
      columns: 4, areas: ['. q n m', 'o a p .', 'zero four . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('N', 'bomb', 'N', 'n'), key('M', 'fire', 'M', 'm'), key('O', 'left', 'O', 'o'),
        key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'), key('0', 'keyboard', '0', 'zero'), key('4', 'one player', '4', 'four')],
    },
  },
  {
    id: 'zaxxon', name: 'Zaxxon', file: 'roms/ZAXXON.Z80',
    screen: 'roms/ZAXXON.scr',   // ZXDB loading screen
    keysHelp: `${kb('I')} left, ${kb('P')} right, ${kb('Q')} dive, ${kb('Z')} climb, ${kb('N')} fire, ${kb('H')} hold.`,
    flowHelp: 'Press any key on the loading screen, S to start, type your name and ENTER, then any key.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'zipperflipper', name: 'Zipper Flipper', file: 'roms/ZIPPERFL.Z80',
    // on its own "loading completed" page (ZXDB's screen is the earlier Pro Pinball one)
    keysHelp: `Left flipper: ${kb('Q')}–${kb('T')}, ${kb('A')}–${kb('G')}, ${kb('Caps')}–${kb('V')}; right flipper: ` +
      `${kb('Y')}–${kb('P')}, ${kb('H')}–${kb('L')}, ${kb('B')}–${kb('Symbol')}; ${kb('Enter')} launch / nudge.`,
    flowHelp: 'Press K for the keyboard. On the menu ENTER plays (6–0 / 1–5 move the cursor).',
    pad: {
      columns: 3, areas: ['z en m', 'k . .'],
      keys: [key('Z', 'left', 'Z', 'z'), key('ENTER', 'launch', 'EN', 'en'), key('M', 'right', 'M', 'm'), key('K', 'keyboard', 'K', 'k')],
    },
  },
  {
    id: 'zorro', name: 'Zorro', file: 'roms/ZORRO.Z80',
    // the [a] snapshot, on its loading screen, waiting for a key
    keysHelp: `${kb('2')} up, ${kb('W')} down, ${kb('O')} left, ${kb('P')} right, ${kb('Z')} act / fight.`,
    flowHelp: 'Rescue the maiden from Colonel Garcia. Press any key on the loading screen, then 1 for the keyboard.',
    pad: {
      columns: 4, areas: ['. two . z', 'o w p z', 'one . . .'],
      keys: [key('2', 'up', '2', 'two'), key('O', 'left', 'O', 'o'), key('W', 'down', 'W', 'w'), key('P', 'right', 'P', 'p'),
        key('Z', 'fight', 'Z', 'z'), key('1', 'keyboard', '1', 'one')],
    },
  },
  {
    id: 'adastra', name: 'Ad Astra', file: 'roms/ADASTRA.Z80',
    // saved on its own loading screen, which waits for a key and plays the title tune every 10 s (ROM BEEP calls in
    // straight-line code at 7F60, called from 8F67; between tunes 8F6A waits for LAST_K). Start at 8F67 (stack as
    // saved) so the tune plays from its first note once the loading screen is let go
    start: { pc: 0x8f67 },
    holdBoot: true,
    keysHelp: `Alternate bottom-row keys: ${kb('Z')} ${kb('C')} ${kb('B')} ${kb('M')} left, ${kb('X')} ${kb('V')} ${kb('N')} ` +
      `${kb('Symbol')} right; ${kb('Q')}–${kb('P')} up, ${kb('A')}–${kb('L')} down; ${kb('Caps')}, ${kb('Space')}, ${kb('1')} or ` +
      `${kb('0')} fire.`,
    // keys pressed while the tune plays are lost (BEEP runs with interrupts off)
    flowHelp: 'Press any key on the loading screen for the title tune. When it ends, any key gives the options: 1 or 2 ' +
      'players, 3 keyboard (4–7 joysticks), 8 “To the stars” to start.',
    pad: {
      columns: 4, areas: ['. q . sp', 'z a x sp', 'eight . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('Z', 'left', 'Z', 'z'), key('A', 'down', 'A', 'a'), key('X', 'right', 'X', 'x'),
        key('SPACE', 'fire', 'SP', 'sp'), key('8', 'start', '8', 'eight')],
    },
  },
  {
    id: 'barrymcguigan', name: 'Barry McGuigan Boxing', file: 'roms/BARRYMCG.Z80',
    screen: 'roms/BARRYMCG.scr',   // ZXDB loading screen
    // saved on the credits page before the theme: it starts from its first note 2.4 s in (811E sets the sequence
    // pointer 8206 from the tune table), so nothing to restart
    keysHelp: `Protek (cursor keys): ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} fire. ` +
      'Outside (fire not held): up cover-up, left jab, right cross, down body; inside (fire held): up uppercut, left ' +
      `hook, right cross, down body. ${kb('Caps')} pause.`,
    flowHelp: 'Press any key on the loading screen; the credits and the theme follow. On Control Options press 6 then ' +
      'ENTER (Protek). 0 for a one-player game; 6 and 0 for New Boxer; type a name and ENTER; then 0 through the ' +
      'boxer, rank and opponent pages (Accept). In Training Camp 0 adds a week to the marked area and 6/7 move; ' +
      'Continue starts the fight.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'en . . .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero'), key('ENTER', 'select', 'EN', 'en')],
    },
  },
  {
    id: 'chequeredflag', name: 'Chequered Flag', file: 'roms/CHEQUERE.Z80',
    // on its own loading screen, waiting for a key
    keysHelp: `${kb('0')} accelerate, ${kb('I')} brake, ${kb('M')} gear up, ${kb('N')} gear down; steer ${kb('A')} fast left, ` +
      `${kb('S')} slow left, ${kb('D')} slow right, ${kb('F')} fast right; ${kb('H')} pause, ${kb('H')}+${kb('T')} abort.`,
    flowHelp: 'Press any key on the loading screen. SPACE picks the circuit and ENTER selects it; type the number of laps ' +
      'and ENTER; SPACE picks the car and ENTER selects it. Go on the green light.',
    pad: {
      columns: 5, areas: ['a s d f zero', 'n m i h en', 'sp one . . .'],
      keys: [key('A', 'fast L', 'A', 'a'), key('S', 'left', 'S', 's'), key('D', 'right', 'D', 'd'), key('F', 'fast R', 'F', 'f'),
        key('0', 'accel', '0', 'zero'), key('N', 'gear dn', 'N', 'n'), key('M', 'gear up', 'M', 'm'), key('I', 'brake', 'I', 'i'),
        key('H', 'pause', 'H', 'h'), key('ENTER', 'select', 'EN', 'en'), key('SPACE', 'next', 'SP', 'sp'),
        key('1', 'laps', '1', 'one')],
    },
  },
  {
    id: 'deathstarbattle', name: 'Star Wars: Death Star Battle', file: 'roms/DEATHSTA.Z80',
    screen: 'roms/DEATHSTA.scr',   // ZXDB loading screen
    keysHelp: `Protek (cursor keys): ${kb('5')} left, ${kb('8')} right, ${kb('7')} up, ${kb('6')} down, ${kb('0')} fire; ` +
      `${kb('P')} pause, ${kb('B')} the difficult game.`,
    flowHelp: 'Return of the Jedi: fly the Millennium Falcon at the Death Star. Press any key on the loading screen, then 2 ' +
      '(Protek: the cursor keys), then 0 to launch.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'two b p .'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'fire', '0', 'zero'), key('2', 'Protek', '2', 'two'),
        key('B', 'hard', 'B', 'b'), key('P', 'pause', 'P', 'p')],
    },
  },
  {
    id: 'driller', name: 'Driller', file: 'roms/DRILLER.Z80',
    screen: 'roms/DRILLER.scr',   // ZXDB loading screen
    // keys found by trying each one in the game (ZXDB has no instructions for it)
    keysHelp: `${kb('O')} forward, ${kb('K')} back, ${kb('Q')} turn left, ${kb('W')} turn right, ${kb('P')} look up, ` +
      `${kb('L')} look down, ${kb('U')} U-turn, ${kb('N')}/${kb('M')} tilt, ${kb('R')} rise, ${kb('F')} fall, ${kb('0')} fire, ` +
      `${kb('D')} drill (place the rig), ${kb('C')} collect the rig, ${kb('A')}/${kb('Z')} turn angle, ${kb('X')} step size, ` +
      `${kb('I')} status (then 1 aborts). The cursor keys 5–8 also move.`,
    flowHelp: 'Freescape: tap the gas under the 18 sectors of Mitral. Press any key on the loading screen; the keyboard ' +
      'is selected, so ENTER begins the mission.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'embassyassault', name: 'Embassy Assault', file: 'roms/EMBASSYA.Z80',
    screen: 'roms/EMBASSYA.scr',   // ZXDB loading screen (the Sinclair/ICL one)
    keysHelp: `${kb('7')} forward, ${kb('5')} turn left (and move), ${kb('8')} turn right (and move), ${kb('6')} turn round, ` +
      `${kb('M')} map (when facing one).`,
    flowHelp: 'Find the code room and get out again. Press any key on the loading screen. Type N and ENTER (no ' +
      'joystick), then a difficulty 1–9 and ENTER; the embassy takes about 20 seconds to build.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'fighterpilot', name: 'Fighter Pilot', file: 'roms/FIGHTERP.Z80',
    // on its own title (the loading-screen picture), waiting for SPACE
    keysHelp: `${kb('5')}/${kb('8')} roll left/right, ${kb('6')} pull back, ${kb('7')} push forward, ${kb('Caps')}/${kb('Z')} ` +
      `rudder, ${kb('Q')}/${kb('A')} thrust up/down, ${kb('W')}/${kb('S')} flaps up/down, ${kb('U')} undercarriage, ` +
      `${kb('B')} brakes, ${kb('C')} combat mode, ${kb('0')} guns, ${kb('N')} next beacon, ${kb('M')} map, ${kb('Symbol')} ILS / ` +
      `flight computer, ${kb('H')} hold, ${kb('J')} release.`,
    flowHelp: 'Press SPACE on the title for the options: 1 landing practice, 2 flying training, 3 combat practice, 4 ' +
      'air-to-air combat (5 blind landing, 6 crosswinds, 7 pilot rating, 8 controls). ENTER takes off.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'flightsim', name: 'Flight Simulation', file: 'roms/FLIGHTSI.Z80',
    // on its own loading screen, waiting for a key
    keysHelp: `${kb('7')} dive, ${kb('6')} climb, ${kb('5')}/${kb('8')} bank left/right, ${kb('Z')}/${kb('X')} rudder, ` +
      `${kb('P')}/${kb('O')} throttle up/down, ${kb('F')}/${kb('D')} flaps out/in, ${kb('G')} gear, ${kb('B')} next beacon, ` +
      `${kb('M')} map.`,
    flowHelp: "Psion's Flight Simulation. Press any key on the loading screen, then 1 in flight, 2 final approach or 3 " +
      'take-off, then Y or N for wind.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'footballeryear', name: 'Footballer of the Year', file: 'roms/FOOTBALL.Z80',
    screen: 'roms/FOOTBALL.scr',   // ZXDB loading screen
    keysHelp: `${kb('Q')} left, ${kb('W')} right, ${kb('P')} up, ${kb('L')} down, ${kb('Space')} fire.`,
    flowHelp: 'Press any key on the loading screen, then 1 (keyboard), Y, and N (don’t edit the teams). On the title a key ' +
      'stops the tune; then N (no saved game), type your first name and surname, each with ENTER, a starting division ' +
      '1–5 and ENTER, and Y. Pick a club and the national squad with P/L and SPACE; the icon menu follows.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'frankbruno', name: "Frank Bruno's Boxing", file: 'roms/FRANKBRU.Z80',
    screen: 'roms/FRANKBRU.scr',   // ZXDB loading screen
    keysHelp: `${kb('1')} guard up, ${kb('A')} guard down, ${kb('Q')} duck, ${kb('U')} dodge left, ${kb('P')} dodge right, ` +
      `${kb('I')} left punch, ${kb('O')} right punch, bottom row right hook / uppercut (when K.O. flashes); ` +
      `${kb('Caps')}+${kb('Space')} abort.`,
    flowHelp: 'Press any key on the loading screen, 3 for the keyboard, R to start, then type a three-letter name and ' +
      'ENTER. (ENTER on the options page shows the next attract page.)',
    pad: {
      columns: 4, areas: ['one q i o', 'u a p b', 'three r en .'],
      keys: [key('1', 'guard up', '1', 'one'), key('Q', 'duck', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('O', 'right', 'O', 'o'),
        key('U', 'dodge L', 'U', 'u'), key('A', 'guard dn', 'A', 'a'), key('P', 'dodge R', 'P', 'p'), key('B', 'hook', 'B', 'b'),
        key('3', 'keyboard', '3', 'three'), key('R', 'start', 'R', 'r'), key('ENTER', 'enter', 'EN', 'en')],
    },
  },
  {
    id: 'heathrow', name: 'Heathrow Air Traffic Control', file: 'roms/HEATHROW.Z80',
    screen: 'roms/HEATHROW.scr',   // ZXDB loading screen
    keysHelp: 'Instructions are typed: the aircraft’s letter, the first letter of the instruction (the word is ' +
      `filled in) and its value. A shift key with ${kb('H')} shows the help pages, ${kb('Enter')} goes back.`,
    flowHelp: 'Press any key on the loading screen. Pick an exercise 1–8 (5 is the demonstration, which also starts ' +
      'by itself after 40 seconds), then W or E for the landing direction.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'leaderboard', name: 'Leaderboard', file: 'roms/LEADERBO.Z80',
    screen: 'roms/LEADERBO.scr',   // ZXDB loading screen
    // the [a2] snapshot (the [a] one hangs before the golfer is drawn; the plain one carries a cracker's
    // key list over its loading screen)
    keysHelp: `Cursor keys: ${kb('5')}/${kb('8')} aim left/right, ${kb('6')}/${kb('7')} change club, ${kb('0')} swing: ` +
      'press it three times (start the swing, set the power, set the snap).',
    flowHelp: 'Press any key on the loading screen, SPACE on the credits, then 3 (cursor keys) and ENTER, the number of ' +
      'players 1–4, a name and ENTER, P, A or N (Professional, Amateur, Novice), 1–4 for 18–72 holes and a course ' +
      '1–4. 0 leaves the score card.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero', 'three en n one'],
      keys: [key('7', 'club', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'club', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'swing', '0', 'zero'), key('3', 'cursor', '3', 'three'),
        key('ENTER', 'enter', 'EN', 'en'), key('N', 'novice', 'N', 'n'), key('1', 'one', '1', 'one')],
    },
  },
  {
    id: 'matchday', name: 'Match Day', file: 'roms/MATCHDAY.Z80',
    // on its own loading screen, waiting for a key. The snapshot had player 1 on a Kempston joystick (and player 2
    // on O P A Q N): that is the start-of-game menu's "Swap Controls" put in (control records 670D/6713 and their
    // port/mask tables 671B/6727), so player 1 plays on the keys; player 2's joystick is attached idle
    pokes: {
      0x670d: 0x4f, 0x670e: 0x50, 0x670f: 0x41, 0x6710: 0x51, 0x6711: 0x4e, 0x6712: 0x81, 0x6713: 0x51, 0x6714: 0x57,
      0x6715: 0x4c, 0x6716: 0x50, 0x6717: 0x43, 0x6718: 0x02, 0x671b: 0xdf, 0x671c: 0xfd, 0x671d: 0xdf, 0x671e: 0xfe,
      0x671f: 0xfd, 0x6720: 0xfe, 0x6721: 0xfb, 0x6723: 0x7f, 0x6727: 0xfb, 0x6728: 0xfe, 0x6729: 0xfb, 0x672a: 0xfd,
      0x672b: 0xbf, 0x672c: 0xfd, 0x672d: 0xdf, 0x672f: 0xfe,
    },
    kempston: true,
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('N')} kick (and dive, throw-in); ` +
      `${kb('Caps')}+${kb('Space')} pause.`,
    flowHelp: 'Press any key on the loading screen. After the title, ENTER on the main menu plays a one-player match ' +
      '(Symbol Shift moves down, SPACE up), and ENTER again kicks off.',
    pad: {
      columns: 4, areas: ['. q . n', 'o a p n', 'en ss sp .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('N', 'kick', 'N', 'n'), key('ENTER', 'select', 'EN', 'en'), key('SYM', 'down', 'SS', 'ss', { small: true }),
        key('SPACE', 'up', 'SP', 'sp')],
    },
  },
  {
    id: 'matchday2', name: 'Match Day II', file: 'roms/MATCHDA2.Z80',
    screen: 'roms/MATCHDA2.scr',   // ZXDB loading screen
    // the plain snapshot, still on the joystick menu (the [a2] one has already played a match)
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Q')} up, ${kb('A')} down, bottom row (${kb('Caps')}–${kb('Space')}) ` +
      'kick / jump (hold for a stronger kick).',
    flowHelp: 'Press any key on the loading screen, then ENTER three times (keys, one-player match, first half). Any ' +
      'other key moves the menu cursor.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'en sp . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'kick', 'M', 'm'), key('ENTER', 'select', 'EN', 'en'), key('SPACE', 'cursor', 'SP', 'sp')],
    },
  },
  {
    id: 'poleposition', name: 'Pole Position', file: 'roms/POLEPOSI.Z80',
    screen: 'roms/POLEPOSI.scr',   // ZXDB loading screen
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('A')} change gear (low / high), ${kb('Q')} brake.`,
    flowHelp: 'Press any key on the loading screen, K for the keyboard, then S to start: a qualifying lap, then the race.',
    pad: {
      columns: 4, areas: ['o a q p', 'k s . .'],
      keys: [key('O', 'left', 'O', 'o'), key('A', 'gear', 'A', 'a'), key('Q', 'brake', 'Q', 'q'), key('P', 'right', 'P', 'p'),
        key('K', 'keyboard', 'K', 'k'), key('S', 'start', 'S', 's')],
    },
  },
  {
    id: 'scalextric', name: 'Scalextric', file: 'roms/SCALEXTR.Z80',
    screen: 'roms/SCALEXTR.scr',   // ZXDB loading screen
    // it reads the Kempston port too, but the menus and the race run the same with and without one
    keysHelp: 'The keys you define: accelerate, brake, left, right.',
    flowHelp: 'Press any key on the loading screen. Type your name and ENTER, ENTER again for a computer opponent, N ' +
      '(no joystick), then press your keys for accelerate, brake, left, right and start (e.g. Q A O P S) and Y. N (no ' +
      'design), N (no load); when the circuit is drawn Y accepts it (N shows the next of 17); N (don’t save), the ' +
      'number of laps and ENTER, opponent skill 1–3 and ENTER.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'squash', name: "Jonah Barrington's Squash", file: 'roms/SQUASH.Z80',
    // on its own loading screen, waiting for a key
    keysHelp: 'The keys you define for left, right, up (forward), down (back) and fire; hold fire longer to change the ' +
      'shot.',
    flowHelp: "Jonah Barrington calls the score. Press any key on the loading screen. ENTER picks the level (1/2 or 6/7 " +
      'move the dot: red easy … yellow hard), then 1, 3 or 5 games. Player 1: N (not the computer), then press your ' +
      'keys for left, right, up, down and fire (e.g. O P Q A M); player 2: Y (the computer). The name is set with ' +
      'your up/down and fire keys (fire 8 times for none). Press fire for the computer’s serve.',
    pad: {
      columns: 4, areas: ['. q . m', 'o a p m', 'en n y one'],
      keys: [key('Q', 'up', 'Q', 'q'), key('O', 'left', 'O', 'o'), key('A', 'down', 'A', 'a'), key('P', 'right', 'P', 'p'),
        key('M', 'fire', 'M', 'm'), key('ENTER', 'select', 'EN', 'en'), key('N', 'no', 'N', 'n'),
        key('Y', 'yes', 'Y', 'y'), key('1', 'games', '1', 'one')],
    },
  },
  {
    id: 'ttracer', name: 'TT Racer', file: 'roms/TTRACER.Z80',
    screen: 'roms/TTRACER.scr',   // ZXDB loading screen
    // saved 6 notes into the title tune (91DD plays IX's notes); 5D70 sets IX to the tune (922E) and calls it, so
    // starting there (stack as at that call) plays it from its first note. The snapshot also had the controls
    // set to Interface 2 (F1FE = 22, the keys then do nothing): 11 is KEYS
    start: { pc: 0x5d70, sp: 0xffee },
    pokes: { 0xf1fe: 0x11 },
    keysHelp: `${kb('P')} ${kb('7')} ${kb('0')} throttle, ${kb('L')} ${kb('6')} ${kb('O')} brake, ${kb('A')} ${kb('5')} ${kb('Z')} ` +
      `lean left, ${kb('S')} ${kb('8')} ${kb('X')} lean right, ${kb('Space')} change gear (hold: clutch); ${kb('H')} hold, ` +
      `${kb('Symbol')}+${kb('B')} back to the title.`,
    // the tune reads the keys between notes, up to 61 frames apart (measured)
    flowHelp: 'Press any key on the loading screen for the title and its tune; hold a key until the selection page ' +
      'appears (the tune reads keys between notes). 1–9 change the options, letters type your name; ENTER starts.',
    pad: {
      columns: 4, areas: ['. p . sp', 'a l s sp', 'en h . .'],
      keys: [key('P', 'throttle', 'P', 'p'), key('A', 'left', 'A', 'a'), key('L', 'brake', 'L', 'l'), key('S', 'right', 'S', 's'),
        key('SPACE', 'gear', 'SP', 'sp'), key('ENTER', 'start', 'EN', 'en'), key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'turboesprit', name: 'Turbo Esprit', file: 'roms/TURBOESP.Z80',
    screen: 'roms/TURBOESP.scr',   // ZXDB loading screen
    keysHelp: `${kb('J')} left lane, ${kb('L')} right lane (with ${kb('K')}: turn), ${kb('K')} fire, ${kb('S')} faster, ` +
      `${kb('A')} slower / reverse, ${kb('M')} map, ${kb('T')} quit.`,
    flowHelp: 'Stop the drug smugglers. Press any key on the loading screen, any key past the two notices, a city 1–4, ' +
      'then 8 to play (1 skill, 2 keys, 7 practice).',
    pad: {
      columns: 4, areas: ['. s . k', 'j a l k', 'm eight t one'],
      keys: [key('S', 'faster', 'S', 's'), key('J', 'left', 'J', 'j'), key('A', 'slower', 'A', 'a'), key('L', 'right', 'L', 'l'),
        key('K', 'fire', 'K', 'k'), key('M', 'map', 'M', 'm'), key('8', 'play', '8', 'eight'), key('T', 'quit', 'T', 't'),
        key('1', 'city', '1', 'one')],
    },
  },
  {
    id: 'wsbaseball', name: 'World Series Baseball', file: 'roms/WSBASEBA.Z80',
    screen: 'roms/WSBASEBA.scr',   // ZXDB loading screen
    // saved 28 notes into the title tune (8E03 plays 77 notes from E4C0 with ROM BEEP); starting at 8E03 with the
    // stack as at that point (return 8052 at FFFD) plays it from its first note
    start: { pc: 0x8e03, sp: 0xfffd },
    keysHelp: `${kb('W')} left, ${kb('E')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Z')} fire; ${kb('H')} hold, ` +
      `${kb('T')} then ${kb('H')} abort. Pitching and batting: left/right speed, up/down height, fire throws or swings.`,
    // the tune reads the keys between notes, up to 43 frames apart (measured)
    flowHelp: 'Press any key on the loading screen; the title tune plays. Hold a key until the menu appears (the tune ' +
      'reads keys between notes). S starts: type your name and ENTER, then W/E and Z pick your colours. (P players, ' +
      'L innings, D difficulty, C controls, I instructions.)',
    pad: {
      columns: 4, areas: ['. q . z', 'w a e z', 's en h .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('W', 'left', 'W', 'w'), key('A', 'down', 'A', 'a'), key('E', 'right', 'E', 'e'),
        key('Z', 'fire', 'Z', 'z'), key('S', 'start', 'S', 's'), key('ENTER', 'enter', 'EN', 'en'),
        key('H', 'hold', 'H', 'h')],
    },
  },
  {
    id: 'hobbit', name: 'The Hobbit', file: 'roms/HOBBIT.Z80',
    // v1.2, on its own title (the loading-screen picture), waiting for a key
    keysHelp: 'Type commands in English and press ENTER, e.g. GO EAST, TAKE THE ROPE, SAY TO THORIN "CARRY ME". ' +
      'N, S, E, W, U, D and NE … SW move; LOOK, INVENTORY, WAIT.',
    flowHelp: 'Melbourne House’s adventure of Bilbo’s journey. Press any key on the title; the tunnel-like hall is ' +
      'drawn and the game waits for your first command. Time passes while you think: the others act on their own.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'sherlock', name: 'Sherlock', file: 'roms/SHERLOCK.Z80',
    screen: 'roms/SHERLOCK.scr',   // ZXDB loading screen (byte for byte the one in the snapshot)
    // the [a] snapshot, on its loading screen in BASIC before RANDOMIZE USR 23535 (the plain one was saved after the
    // opening text had printed). The game starts at 5BEF (jp A040): A040 clears to the dividing line and waits for a key
    // (N = no pictures, A011). Started there with that wait (call C415 at A04E) replaced by ld a,0Dh, so one key on
    // the loading screen gives the blank screen and the text printing, as after ENTER (same text and replies). The
    // game's restart at A0EE also jumps to A040, so a restarted game keeps pictures on without asking
    start: { pc: 0x5bef },
    pokes: { 0xa04e: 0x3e, 0xa04f: 0x0d, 0xa050: 0x00 },
    keysHelp: 'Type commands in English and press ENTER, e.g. TAKE THE LAMP, ASK WATSON ABOUT …, GO TO …; ' +
      `${kb('5')}–${kb('8')} as the first key move west, south, north, east. A block at the end of the dividing line ` +
      'means more text is to come: press a key to go on (that key is not typed). A key also goes on after each picture.',
    flowHelp: 'Holmes in Baker Street, 8:00 on Monday morning. Press any key on the loading screen; the opening text ' +
      'prints, then a key for the rest and the > prompt.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'adventurea', name: 'Adventure A: Planet of Death', file: 'roms/ADVENTA.Z80',
    screen: 'roms/ADVENTA.scr',   // fan-made loading screen (from A.tap), after the cassette cover
    keysHelp: 'Type short verb-noun commands, e.g. GET FLINT, and press ENTER; N, S, E, W, U, D move.',
    flowHelp: 'Artic’s first adventure: escape from an alien planet. Press any key on the loading screen and on the welcome page, then N at ' +
      'WANT TO RESTORE A GAME?',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'adventureb', name: 'Adventure B: Inca Curse', file: 'roms/ADVENTB.Z80',
    screen: 'roms/ADVENTB.scr',   // fan-made loading screen (from b.tap), after the cassette cover
    keysHelp: 'Type short verb-noun commands, e.g. GET FLINT, and press ENTER; N, S, E, W, U, D move.',
    flowHelp: 'Bring the treasure out of an Inca temple in the jungle. Press any key on the loading screen and on the welcome page, then N at ' +
      'WANT TO RESTORE A GAME?',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'adventurec', name: 'Adventure C: Ship of Doom', file: 'roms/ADVENTC.Z80',
    screen: 'roms/ADVENTC.scr',   // fan-made loading screen (from c.tap), after the cassette cover
    // the [a2] snapshot: same game, saved with the white border the others have (the plain one has a black border)
    keysHelp: 'Type short verb-noun commands, e.g. GET FLINT, and press ENTER; N, S, E, W, U, D move.',
    flowHelp: 'Find the control button and free your ship from the alien cruiser. Press any key on the loading screen and on the welcome page, ' +
      'then N at WANT TO RESTORE A GAME?',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'adventured', name: 'Adventure D: Espionage Island', file: 'roms/ADVENTD.Z80',
    screen: 'roms/ADVENTD.scr',   // fan-made loading screen (from d.tap), after the cassette cover
    keysHelp: 'Type short verb-noun commands, e.g. GET FLINT, and press ENTER; N, S, E, W, U, D move.',
    flowHelp: 'Bail out of your plane, find the island’s secret and get back to the carrier. Press any key on the ' +
      'loading screen and on the welcome page, then N at WANT TO RESTORE A GAME?',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'oraclescave', name: "The Oracle's Cave", file: 'roms/ORACLE.Z80',
    // the [a] snapshot: on its own loading screen (BASIC PAUSE); the plain one was saved at the quest page
    keysHelp: 'Answer each question with one letter and ENTER; the choices are shown at the bottom: M move (then U, D, ' +
      'L, R, or S for a secret passage), R rest, U use an article, and so on.',
    flowHelp: 'Press any key on the loading screen. CAVE DESIGN IN PROGRESS takes about 40 seconds; then pick a quest ' +
      '1–4 and ENTER. Five days to collect 40 treasure, finish the quest and beat the Oracle.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'arabiannights', name: 'Tales of the Arabian Nights', file: 'roms/ARABIANN.Z80',
    screen: 'roms/ARABIANN.scr',   // ZXDB loading screen (the Interceptor one)
    // reads port 1F on the title and in play (D676); bits read without an interface steer Sinbad, so attach an idle one
    kempston: true,
    keysHelp: `${kb('N')} (or ${kb('Caps')} ${kb('C')} ${kb('5')}) left, ${kb('M')} (or ${kb('Z')} ${kb('V')} ${kb('8')}) right, ` +
      `${kb('Q')}–${kb('P')} up and ${kb('A')}–${kb('Enter')} down ladders, ${kb('X')} (or ${kb('B')} ${kb('Symbol')}) jump.`,
    // the title reads the keys about every 22 frames
    flowHelp: 'Press any key on the loading screen. On the title hold jump (X) to play; SPACE shows the demo. Collect ' +
      'the letters of ARABIAN in order on each screen.',
    pad: {
      columns: 4, areas: ['. q . x', 'n a m x', 'sp . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('N', 'left', 'N', 'n'), key('A', 'down', 'A', 'a'), key('M', 'right', 'M', 'm'),
        key('X', 'jump', 'X', 'x'), key('SPACE', 'demo', 'SP', 'sp')],
    },
  },
  {
    id: 'talisman', name: 'Talisman', file: 'roms/TALISMAN.Z80',
    screen: 'roms/TALISMAN.scr',   // ZXDB loading screen
    // your folder's "Talisman (1985)(Games Workshop)" files are Terry Stygall's 1991 Crash covertape puzzle game;
    // the Games Workshop board game is the "Talisman (19xx)(-)(Different)" snapshot
    keysHelp: `${kb('5')}/${kb('8')} move round the board, ${kb('Enter')} stop here (meet what is in the space), ` +
      `${kb('P')} your character, ${kb('Space')} options (1–4 other players, C continue, R restart). In a fight any key ` +
      'rolls; 1 craft, 2 strength when attacking another player.',
    flowHelp: 'Games Workshop’s board game. Press any key on the loading screen. Y for new players, how many 1–4; for ' +
      'each pick a character with 6/7 and 0, type a name and ENTER, Y or N for computer-controlled; then L, M or S ' +
      'for the pace.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'tirnanog', name: 'Tir Na Nog', file: 'roms/TIRNANOG.Z80',
    screen: 'roms/TIRNANOG.scr',   // ZXDB loading screen
    keysHelp: `Alternate bottom-row keys walk: ${kb('Z')} left, ${kb('X')} right. Second row: ` +
      `${kb('A')}/${kb('S')} turn the view 90°. Third row: ${kb('Q')} pick up, ${kb('W')} drop. Top row picks the carried ` +
      `object; the corner keys (${kb('1')} ${kb('0')} ${kb('Caps')} ${kb('Space')}) thrust with it. ${kb('Symbol')}+${kb('4')} ` +
      `auto-run, ${kb('Symbol')}+${kb('5')} freeze, ${kb('Symbol')}+${kb('6')} options.`,
    flowHelp: 'Cuchulainn in the land of the dead, seeking the four pieces of the Seal of Calum. Press any key on the ' +
      'loading screen, then 1 on the options page.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'asterix', name: 'Asterix and the Magic Cauldron', file: 'roms/ASTERIX.Z80',
    screen: 'roms/ASTERIX.scr',   // ZXDB loading screen
    // the [a2] snapshot, on KEMPSTON JOYSTICK? Y/N (the others sit in the same loop with the loading picture still
    // up). Any key but ENTER flips the answer; N (8A97=1) is keyboard, Y reads port 1F, so attach an idle Kempston
    kempston: true,
    keysHelp: `${kb('Q')} up, ${kb('Z')} down, ${kb('I')} left, ${kb('P')} right, ${kb('Space')} fire.`,
    flowHelp: 'Find the seven pieces of the cauldron with Obelix in tow. Press any key on the loading screen. At ' +
      'KEMPSTON JOYSTICK? press ENTER straight away (N is already chosen; any other key flips it). SPACE on the ' +
      'title starts.',
    pad: {
      columns: 4, areas: ['. q . sp', 'i z p sp', 'en . . .'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('Z', 'down', 'Z', 'z'), key('P', 'right', 'P', 'p'),
        key('SPACE', 'fire', 'SP', 'sp'), key('ENTER', 'enter', 'EN', 'en')],
    },
  },
  {
    id: 'backgammon', name: 'Backgammon', file: 'roms/BACKGAMM.Z80',
    // on its own loading screen (BASIC PAUSE)
    keysHelp: 'At YOUR MOVE WITH THE n type the letter of the point to move a man from (A–X), Y to come off the bar, ' +
      `Z to play the other die first; ${kb('0')} takes a move back.`,
    flowHelp: 'Psion’s Backgammon. Press any key on the loading screen, a skill level 1–4, N (keep the level) and N ' +
      '(the Spectrum rolls the dice).',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'chess', name: 'Chess', file: 'roms/CHESS.Z80',
    // on its own loading screen (BASIC PAUSE)
    keysHelp: 'Type moves as four characters, e.g. E2E4. The bottom line lists the other commands.',
    flowHelp: 'Psion’s Chess. Press any key on the loading screen, then P (play), W or B, and a level 0–9.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'cyruschess', name: 'Cyrus IS Chess', file: 'roms/CYRUS.Z80',
    // the [a3] snapshot: on its own loading screen (BASIC PAUSE); the others were saved at the board
    keysHelp: `Move the flashing cursor with ${kb('5')} ${kb('6')} ${kb('7')} ${kb('8')}; ${kb('Enter')} on the piece, then ` +
      `${kb('Enter')} on the square it goes to. Commands are the capital letters listed (${kb('M')} makes Cyrus move, ` +
      `${kb('L')} level, ${kb('N')} new game …).`,
    flowHelp: 'Intelligent Software’s 1981 European champion. Press ENTER on the loading screen (a letter is taken as a ' +
      'command; SPACE gives HUMAN v HUMAN). You play white.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'psichess', name: 'Psi Chess', file: 'roms/PSICHESS.Z80',
    screen: 'roms/PSICHESS.scr',   // ZXDB loading screen
    keysHelp: `Commands are two keys together: ${kb('M')}+${kb('1')} starts a game, ${kb('S')}+${kb('1')}–${kb('4')} ` +
      `display (score sheet, 2D, Staunton 3D, Lewis 3D), ${kb('O')}+${kb('1')}–${kb('4')} rotate the board, ` +
      `${kb('J')}+${kb('1')}/${kb('2')} cursor mode (then ${kb('1')}–${kb('5')} or ${kb('6')}–${kb('0')}), ${kb('K')} keyboard ` +
      'mode. Type moves as E2E4.',
    flowHelp: 'The Edge’s 3D chess. Press any key on the loading screen, then M and 1 together; you play white at ' +
      'level A1.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'reversi', name: 'Reversi', file: 'roms/REVERSI.Z80',
    screen: 'roms/REVERSI.scr',   // fan-made loading screen (from Screenshot.tap), after the Sinclair cassette cover
    keysHelp: 'Type the square, e.g. F5, and ENTER; then ENTER again (PRESS ENTER FOR MY MOVE) for the Spectrum’s move.',
    flowHelp: 'MoI / Games of Skill Reversi (Othello). Press any key on the loading screen, then on the menu press 2 (you start against the Spectrum) or 3 ' +
      '(Spectrum starts); 1 is two players.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'scrabble', name: 'Scrabble', file: 'roms/SCRABBLE.Z80',
    screen: 'roms/SCRABBLE.scr',   // ZXDB loading screen (the Psion one)
    keysHelp: `Move the cursor with ${kb('5')}–${kb('8')}, then ${kb('A')} across or ${kb('D')} down and type the word. ` +
      `${kb('Symbol')} for the options: C change, J juggle, Q quit, R rearrange, S symbols, V view racks.`,
    flowHelp: 'Psion’s Computer Scrabble. Press any key on the loading screen; C (colour TV), N (no saved game), the ' +
      'number of players 1–4; for each N and a name and ENTER, or Y, a skill 1–4 and a name for the Spectrum; then ' +
      'Y or N to watch it think.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'voicechess', name: 'Voice Chess', file: 'roms/VOICECHE.Z80',
    keysHelp: 'Type moves as E2 E4 and ENTER. M asks for a suggested move, O lists the moves, S stops the game.',
    flowHelp: 'Artic’s talking chess. Type P and ENTER (play), W or B and ENTER, and a level 0–6 and ENTER (0 answers ' +
      'in about 2 seconds, 2 in about 40).',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'flippit', name: 'Flippit', file: 'roms/FLIPPIT.Z80',
    keysHelp: 'A–I selects a piece; then another letter swaps them, M/K turn it right/left, P turns it half way, ' +
      'R S T U flip it. L new run, W rerun.',
    flowHelp: 'Make every row, column and long diagonal add up to nine. After the title the pieces shuffle; press any ' +
      'key to start, then D (dots) or F (figures).',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'samfox', name: 'Samantha Fox Strip Poker', file: 'roms/SAMFOX.Z80',
    screen: 'roms/SAMFOX.scr',   // ZXDB loading screen
    // saved 17 notes into the two-channel title tune (FA64 sets the channel pointers FA7F/FA83 to FB6D/FD9F, then
    // plays until a key); starting at FA64 with the stack as there (return 5F17 at EE62) plays it from its first note
    start: { pc: 0xfa64, sp: 0xee62 },
    keysHelp: `${kb('Space')} steps through the choices the referee allows (pass, check, bet, call, raise), ` +
      `${kb('Enter')} picks one.`,
    flowHelp: 'Seven-card stud. Press any key on the loading screen; the picture and title tune follow until a key.',
    pad: {
      columns: 2, areas: ['sp en'],
      keys: [key('SPACE', 'next', 'SP', 'sp'), key('ENTER', 'choose', 'EN', 'en')],
    },
  },
  {
    id: 'viewtokill1', name: 'A View to a Kill (part 1)', file: 'roms/VIEWKIL1.Z80',
    screen: 'roms/VIEWKILL.scr',   // ZXDB loading screen
    // saved as an IM 1 interrupt (PC 0038) although the game runs in IM 2 (I=B8, vector 6565 -> 6FE4): its menu
    // music never played. Start where it sets the tune up (680F calls 7007: tune pointer 7B39=7B40, start flag
    // 7B3B=FF, IM 2 table), stack as there (return 7039 at 654B), so the theme plays from its first note
    start: { pc: 0x680f, sp: 0x654b },
    keysHelp: `Key option 1: ${kb('Caps')} left, ${kb('Z')} right, ${kb('P')} up, ${kb('L')} down, ${kb('B')}–${kb('Space')} fire. ` +
      `Key option 2: ${kb('M')} left, ${kb('Symbol')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Caps')}–${kb('V')} fire. ` +
      'Pause and abort are on the in-game menu.',
    flowHelp: 'The Paris car chase after May Day. Press any key on the loading screen; on the menu press 1 (key ' +
      'option 1) and 5 to start. Reach the drop point when she does; follow the yellow arrows. The game is in three ' +
      'parts: parts 2 and 3 are their own entries.',
    pad: {
      columns: 4, areas: ['. p . sp', 'cs l z sp', 'one five . .'],
      keys: [key('P', 'up', 'P', 'p'), key('CAPS', 'left', 'CS', 'cs'), key('L', 'down', 'L', 'l'), key('Z', 'right', 'Z', 'z'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keys 1', '1', 'one'), key('5', 'start', '5', 'five')],
    },
  },
  {
    id: 'viewtokill2', name: 'A View to a Kill (part 2)', file: 'roms/VIEWKIL2.Z80',
    partOf: 'viewtokill1',          // a later part: one game with viewtokill1 (not counted, not in the gallery)
    screen: 'roms/VIEWKILL.scr',   // ZXDB loading screen
    keysHelp: `Key option 1: ${kb('Caps')} left, ${kb('Z')} right, ${kb('P')} up, ${kb('L')} down, ${kb('B')}–${kb('Space')} fire. ` +
      `Key option 2: ${kb('M')} left, ${kb('Symbol')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Caps')}–${kb('V')} fire. ` +
      'Pause and abort are on the in-game menu.',
    flowHelp: 'City Hall, San Francisco: get Stacey out of the lift and escape the fire. Press any key on the loading ' +
      'screen; on the menu press 1 (key option 1) and 5 to start. Fire passes control to the object menu at the top; ' +
      'left/right pick an object, fire again for the action menu below.',
    pad: {
      columns: 4, areas: ['. p . sp', 'cs l z sp', 'one five . .'],
      keys: [key('P', 'up', 'P', 'p'), key('CAPS', 'left', 'CS', 'cs'), key('L', 'down', 'L', 'l'), key('Z', 'right', 'Z', 'z'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keys 1', '1', 'one'), key('5', 'start', '5', 'five')],
    },
  },
  {
    id: 'viewtokill3', name: 'A View to a Kill (part 3)', file: 'roms/VIEWKIL3.Z80',
    partOf: 'viewtokill1',          // a later part: one game with viewtokill1 (not counted, not in the gallery)
    screen: 'roms/VIEWKILL.scr',   // ZXDB loading screen
    // saved 3 notes into the menu theme (position 8FD8 = 7B44); start where it sets the tune up (7380 calls 707A:
    // 8FDC = 7B32, start flag 8FDE = FF, IM 2 table), stack as there (return 770E at 654B)
    start: { pc: 0x7380, sp: 0x654b },
    keysHelp: `Key option 1: ${kb('Caps')} left, ${kb('Z')} right, ${kb('P')} up, ${kb('L')} down, ${kb('B')}–${kb('Space')} fire. ` +
      `Key option 2: ${kb('M')} left, ${kb('Symbol')} right, ${kb('Q')} up, ${kb('A')} down, ${kb('Caps')}–${kb('V')} fire. ` +
      'Pause and abort are on the in-game menu.',
    flowHelp: 'The silver mine under Silicon Valley: find the codes to defuse Zorin’s bomb. Press any key on the ' +
      'loading screen; on the menu press 1 (key option 1) and 5 to start.',
    pad: {
      columns: 4, areas: ['. p . sp', 'cs l z sp', 'one five . .'],
      keys: [key('P', 'up', 'P', 'p'), key('CAPS', 'left', 'CS', 'cs'), key('L', 'down', 'L', 'l'), key('Z', 'right', 'Z', 'z'),
        key('SPACE', 'fire', 'SP', 'sp'), key('1', 'keys 1', '1', 'one'), key('5', 'start', '5', 'five')],
    },
  },
  {
    id: 'wayoftiger1', name: 'The Way of the Tiger (part 1)', file: 'roms/TIGER1.Z80',
    screen: 'roms/TIGER.scr',   // ZXDB loading screen
    keysHelp: `Facing right: ${kb('D')} forward, ${kb('A')} back, ${kb('W')} up, ${kb('X')} down, ${kb('Q')} ${kb('E')} ${kb('Z')} ` +
      `${kb('C')} the diagonal moves; with fire (${kb('Space')}, or ${kb('Symbol')} ${kb('M')} ${kb('N')} ${kb('B')}) held they ` +
      'become the attacks (mirrored when facing left). The diagrams are in the instructions.',
    flowHelp: 'Unarmed combat in the desert lands of Orb. Press any key on the loading screen, a key at PRESS ANY KEY ' +
      'and again at “Prepare yourself, student”. Pole fighting and sword fighting are parts 2 and 3.',
    pad: {
      columns: 4, areas: ['q w e sp', 'a . d sp', 'z x c sp'],
      keys: [key('Q', '', 'Q', 'q'), key('W', 'up', 'W', 'w'), key('E', '', 'E', 'e'), key('A', 'back', 'A', 'a'),
        key('D', 'fwd', 'D', 'd'), key('Z', '', 'Z', 'z'), key('X', 'down', 'X', 'x'), key('C', '', 'C', 'c'),
        key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'wayoftiger2', name: 'The Way of the Tiger (part 2)', file: 'roms/TIGER2.Z80',
    partOf: 'wayoftiger1',          // a later part: one game with wayoftiger1 (not counted, not in the gallery)
    screen: 'roms/TIGER.scr',   // ZXDB loading screen
    keysHelp: `Facing right: ${kb('D')} forward, ${kb('A')} back, ${kb('W')} up, ${kb('X')} down, ${kb('Q')} ${kb('E')} ${kb('Z')} ` +
      `${kb('C')} the diagonal moves; with fire (${kb('Space')}, or ${kb('Symbol')} ${kb('M')} ${kb('N')} ${kb('B')}) held they ` +
      'become the attacks (mirrored when facing left). The diagrams are in the instructions.',
    flowHelp: 'Pole fighting on a slippery log over the lake. Press any key on the loading screen, a key at PRESS ANY ' +
      'KEY and again at “Prepare yourself, student”.',
    pad: {
      columns: 4, areas: ['q w e sp', 'a . d sp', 'z x c sp'],
      keys: [key('Q', '', 'Q', 'q'), key('W', 'up', 'W', 'w'), key('E', '', 'E', 'e'), key('A', 'back', 'A', 'a'),
        key('D', 'fwd', 'D', 'd'), key('Z', '', 'Z', 'z'), key('X', 'down', 'X', 'x'), key('C', '', 'C', 'c'),
        key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'wayoftiger3', name: 'The Way of the Tiger (part 3)', file: 'roms/TIGER3.Z80',
    partOf: 'wayoftiger1',          // a later part: one game with wayoftiger1 (not counted, not in the gallery)
    screen: 'roms/TIGER.scr',   // ZXDB loading screen
    keysHelp: `Facing right: ${kb('D')} forward, ${kb('A')} back, ${kb('W')} up, ${kb('X')} down, ${kb('Q')} ${kb('E')} ${kb('Z')} ` +
      `${kb('C')} the diagonal moves; with fire (${kb('Space')}, or ${kb('Symbol')} ${kb('M')} ${kb('N')} ${kb('B')}) held they ` +
      'become the attacks (mirrored when facing left). The diagrams are in the instructions.',
    flowHelp: 'Sword fighting in the Grand Temple. Press any key on the loading screen, a key at PRESS ANY KEY and ' +
      'again at “Prepare yourself, student”.',
    pad: {
      columns: 4, areas: ['q w e sp', 'a . d sp', 'z x c sp'],
      keys: [key('Q', '', 'Q', 'q'), key('W', 'up', 'W', 'w'), key('E', '', 'E', 'e'), key('A', 'back', 'A', 'a'),
        key('D', 'fwd', 'D', 'd'), key('Z', '', 'Z', 'z'), key('X', 'down', 'X', 'x'), key('C', '', 'C', 'c'),
        key('SPACE', 'fire', 'SP', 'sp')],
    },
  },
  {
    id: 'neverending1', name: 'The NeverEnding Story (part 1)', tape: 'roms/NESTORY.tzx',   // ZXDB 48K tape 1 side A
    // the snapshot was saved after part one had loaded, past the credits and Fred Gray's theme. The tape's main
    // program plays them; after the new-game question it loads part one (flag 1, 16K at 9000) with its copy of
    // the ROM loader at 8478 from tape 1 side B, which the page puts in then (the part 2 and 3 entries keep their
    // snapshots: those carry the objects and progress from the parts before, which a new game would reset)
    tapeLater: { tape: 'roms/NESTORY1D.tzx', at: 0x8478 },
    holds: { '*': 8 },        // the theme reads the keys every 7 frames (measured)
    keysHelp: 'Type commands in English and press ENTER (every command needs a verb: GO NORTH, TAKE THE AURYN, ' +
      'EXAMINE …; N, S, E, W, U, D move). SPACE goes on at each "paged" prompt.',
    flowHelp: 'Atreyu sets out from the Great Forest. Press any key on the loading screen for the credits and the ' +
      'theme; SPACE ends it. N (no saved game), then SPACE loads part one from the second tape side (it runs fast ' +
      'while loading), and SPACE goes through the pages of the introduction. Parts 2 and 3 are their own entries.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'neverending2', name: 'The NeverEnding Story (part 2)', file: 'roms/NESTORY2.Z80',
    partOf: 'neverending1',          // a later part: one game with neverending1 (not counted, not in the gallery)
    screen: 'roms/NESTORY.scr',   // ZXDB loading screen
    keysHelp: 'Type commands in English and press ENTER (every command needs a verb: GO NORTH, TAKE THE AURYN, ' +
      'EXAMINE …; N, S, E, W, U, D move). SPACE goes on at each "paged" prompt.',
    flowHelp: 'After the flight on Falkor, Spook City. Press any key on the loading screen, then SPACE through the ' +
      'pages of the introduction.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'neverending3', name: 'The NeverEnding Story (part 3)', file: 'roms/NESTORY3.Z80',
    partOf: 'neverending1',          // a later part: one game with neverending1 (not counted, not in the gallery)
    screen: 'roms/NESTORY.scr',   // ZXDB loading screen
    keysHelp: 'Type commands in English and press ENTER (every command needs a verb: GO NORTH, TAKE THE AURYN, ' +
      'EXAMINE …; N, S, E, W, U, D move). SPACE goes on at each "paged" prompt.',
    flowHelp: 'The asteroid and the Ivory Tower: return Auryn to the Empress. Press any key on the loading screen, ' +
      'then SPACE through the pages of the introduction.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
  {
    id: 'shortcircuit1', name: 'Short Circuit (part 1)', file: 'roms/SHORTCI1.Z80',
    screen: 'roms/SHORTCIR.scr',   // ZXDB loading screen
    // saved as an IM 1 interrupt (PC 0038) though its menu music runs in IM 2, so it was silent; start at the
    // program's start after relocation, 8015 (sets SP, calls the menu F1FD, whose music engine F2F3 sets IM 2)
    start: { pc: 0x8015 },
    keysHelp: `${kb('S')} up, ${kb('X')} down, ${kb('N')} left, ${kb('M')} right, ${kb('A')} select (pick up, use, ` +
      'search the computers).',
    flowHelp: 'Number 5 has to escape from Nova Robotics. Press any key on the loading screen; the menu plays its ' +
      'tune with the keyboard chosen: 0 starts. Part 2 is its own entry.',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'zero . . .'],
      keys: [key('S', 'up', 'S', 's'), key('N', 'left', 'N', 'n'), key('X', 'down', 'X', 'x'), key('M', 'right', 'M', 'm'),
        key('A', 'select', 'A', 'a'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'shortcircuit2', name: 'Short Circuit (part 2)', file: 'roms/SHORTCI2.Z80',
    partOf: 'shortcircuit1',          // a later part: one game with shortcircuit1 (not counted, not in the gallery)
    screen: 'roms/SHORTCIR.scr',   // ZXDB loading screen
    // saved mid-way through the menu music (its pattern pointers were on the stack); start at the program's start,
    // 8000, which calls the menu and the music engine (E2F3 -> E324 with the tune at E674)
    start: { pc: 0x8000 },
    keysHelp: `${kb('M')} forward, ${kb('N')} backward, ${kb('S')} jump, ${kb('X')} duck, ${kb('A')} laser.`,
    flowHelp: 'Number 5 on the run outside. Press any key on the loading screen; the menu plays its tune with the ' +
      'keyboard chosen: 0 starts.',
    pad: {
      columns: 4, areas: ['. s . a', 'n x m a', 'zero . . .'],
      keys: [key('S', 'jump', 'S', 's'), key('N', 'back', 'N', 'n'), key('X', 'duck', 'X', 'x'), key('M', 'fwd', 'M', 'm'),
        key('A', 'laser', 'A', 'a'), key('0', 'start', '0', 'zero')],
    },
  },
  {
    id: 'decathlon1', name: "Daley Thompson's Decathlon (day 1)", file: 'roms/DECATH1.Z80',
    screen: 'roms/DECATH.scr',   // ZXDB loading screen
    keysHelp: `${kb('N')} and ${kb('M')} in turn run (left foot, right foot), ${kb('Symbol')} jumps or throws. Aim for a ` +
      'take-off near 45° in the long jump and the throws.',
    flowHelp: 'Day 1: 100 metres, long jump, shot put, high jump, 400 metres. Press any key on the loading screen, then ' +
      '1 (keyboard) and N (keep the keys). Enter your name on the letter ring (N/M move, Symbol picks). Day 2 is ' +
      'its own entry.',
    pad: {
      columns: 3, areas: ['n m ss', 'one y .'],
      keys: [key('N', 'left', 'N', 'n'), key('M', 'right', 'M', 'm'), key('SYM', 'jump', 'SS', 'ss'),
        key('1', 'keys', '1', 'one'), key('Y', 'yes', 'Y', 'y')],
    },
  },
  {
    id: 'decathlon2', name: "Daley Thompson's Decathlon (day 2)", file: 'roms/DECATH2.Z80',
    partOf: 'decathlon1',          // a later part: one game with decathlon1 (not counted, not in the gallery)
    screen: 'roms/DECATH.scr',   // ZXDB loading screen
    keysHelp: `${kb('N')} and ${kb('M')} in turn run (left foot, right foot), ${kb('Symbol')} jumps or throws. Aim for a ` +
      'take-off near 45° in the long jump and the throws.',
    flowHelp: 'Day 2: 110 metres hurdles, discus, pole vault, javelin, 1500 metres. Press any key on the loading ' +
      'screen, then 1 (keyboard) and N (keep the keys). Enter your name on the letter ring (N/M move, Symbol picks).',
    pad: {
      columns: 3, areas: ['n m ss', 'one y .'],
      keys: [key('N', 'left', 'N', 'n'), key('M', 'right', 'M', 'm'), key('SYM', 'jump', 'SS', 'ss'),
        key('1', 'keys', '1', 'one'), key('Y', 'yes', 'Y', 'y')],
    },
  },
  {
    id: 'supertest1', name: "Daley Thompson's Supertest (day 1)", file: 'roms/SUPERTE1.Z80',
    screen: 'roms/SUPERTES.scr',   // 48K loading screen: the first 6912 bytes of either Speedlock tape (ZXDB)
    // saved the moment an IM 2 interrupt was taken (PC FEFE); started there 224 T-states before the next one (as
    // Fuse starts a v1 snapshot), the handler's screen-drawing call is interrupted with SP in the screen and the
    // game resets. Start instead where the menu sets the tune up (BE14: IX = FE01, 43 notes; the snapshot was at
    // note 39), stack as there (return B8F0 at 7B96)
    start: { pc: 0xbe14, sp: 0x7b96 },
    holds: { '*': 14 },       // the tune reads 1-5 between notes, up to 12 frames long
    keysHelp: `${kb('O')} and ${kb('P')} in turn run (and move the sight or pointer), ${kb('Q')} fire. On the letter ring ` +
      'O/P move the pointer, Q picks a letter; the lower-case e at the end enters the name.',
    flowHelp: 'Day 1: pistol shooting, cycling, springboard diving, giant slalom. Press any key on the loading ' +
      'screen; hold 1 (keyboard) through the tune, enter your initials, then each event starts. Day 2 is its own entry.',
    pad: {
      columns: 3, areas: ['o p q', 'one . .'],
      keys: [key('O', 'run', 'O', 'o'), key('P', 'run', 'P', 'p'), key('Q', 'fire', 'Q', 'q'), key('1', 'keys', '1', 'one')],
    },
  },
  {
    id: 'supertest2', name: "Daley Thompson's Supertest (day 2)", file: 'roms/SUPERTE2.Z80',
    partOf: 'supertest1',          // a later part: one game with supertest1 (not counted, not in the gallery)
    screen: 'roms/SUPERTES.scr',   // 48K loading screen: the first 6912 bytes of either Speedlock tape (ZXDB)
    // saved like day 1, at the IM 2 handler (FEFE), and went black. Start where the menu sets the tune up (93C4:
    // IX = BAAE, 234 notes; the snapshot was at note 96), stack as there (return 8E71 at C24A)
    start: { pc: 0x93c4, sp: 0xc24a },
    holds: { '*': 6 },        // the tune reads 1-5 between notes, up to 3 frames long
    keysHelp: `${kb('O')} and ${kb('P')} in turn run (and move the sight or pointer), ${kb('Q')} fire. On the letter ring ` +
      'O/P move the pointer, Q picks a letter; the lower-case e at the end enters the name.',
    flowHelp: 'Day 2: rowing, penalties, ski jump, tug of war. Press any key on the loading screen, then 1 ' +
      '(keyboard); enter your initials, then each event starts.',
    pad: {
      columns: 3, areas: ['o p q', 'one . .'],
      keys: [key('O', 'run', 'O', 'o'), key('P', 'run', 'P', 'p'), key('Q', 'fire', 'Q', 'q'), key('1', 'keys', '1', 'one')],
    },
  },
  {
    id: 'buggyboy', name: 'Buggy Boy', tape: 'roms/BUGGYBOY.tzx',   // ZXDB, Elite side A up to its first STOP
    screen: 'roms/BUGGYBOY.scr',   // ZXDB loading screen (the tape's own; the game is running when the tape ends)
    // the 48K version holds one course and loads the others from tape, searching for the one chosen with the
    // ROM loader (entered at 0562): the rest of the side, the five courses (Offroad, North, East, West, South),
    // goes in then, and is rewound when it runs out, so any course can be loaded at any time
    tapeLater: { tape: 'roms/BUGGYBOYC.tzx', at: 0x0562, rewind: true },
    keysHelp: `${kb('P')} accelerate, ${kb('L')} brake, ${kb('X')} left, ${kb('C')} right, ${kb('Space')} change gear.`,
    flowHelp: 'Press any key on the loading screen, any key on the title, then SPACE (Play). On the course page P ' +
      'and L choose a course and SPACE takes it: Offroad is loaded; another one is found on the tape (it runs ' +
      'fast while loading), then choose it again and SPACE to race. Drive through the gates and collect the ' +
      'flags in order.',
    pad: {
      columns: 4, areas: ['. p . sp', 'x l c sp'],
      keys: [key('P', 'gas', 'P', 'p'), key('X', 'left', 'X', 'x'), key('L', 'brake', 'L', 'l'), key('C', 'right', 'C', 'c'),
        key('SPACE', 'gear', 'SP', 'sp')],
    },
  },
  {
    id: 'pinballwizard', name: 'Pinball Wizard', file: 'roms/PINBALL.Z80',
    // Sagittarian Software's Pinball (1983), which CP Software sold as Pinball Wizard (ZXDB 0003718 lists both
    // releases); the library's snapshot, on the game's own title
    keysHelp: `${kb('Q')}–${kb('T')} left flippers, ${kb('Y')}–${kb('P')} right flippers, ${kb('6')}–${kb('0')} launch ` +
      `(hold longer for a harder launch), ${kb('M')} pause, ${kb('C')} continue.`,
    flowHelp: 'ENTER on the title starts a game. Light all the letters of SAGITTARIAN at the top for a bigger bonus.',
    pad: {
      columns: 4, areas: ['q . . p', 'zero zero zero zero', 'en m c .'],
      keys: [key('Q', 'left', 'Q', 'q'), key('P', 'right', 'P', 'p'), key('0', 'launch', '0', 'zero'),
        key('ENTER', 'start', 'EN', 'en'), key('M', 'pause', 'M', 'm'), key('C', 'go on', 'C', 'c')],
    },
  },
  {
    id: 'throthewall', name: "Thro' the Wall", file: 'roms/THROWALL.Z80',
    // from Horizons, the tape that came with the Spectrum: a BASIC program, saved on its own title
    keysHelp: `${kb('O')} left, ${kb('P')} right, ${kb('Caps')} with them for extra speed.`,
    flowHelp: 'Psion’s bat-and-ball game from the Horizons tape, written in BASIC to show what it can do. Press any key ' +
      'on the title, then any key to start.',
    pad: {
      columns: 3, areas: ['o p cs'],
      keys: [key('O', 'left', 'O', 'o'), key('P', 'right', 'P', 'p'), key('CAPS', 'zip', 'CS', 'cs')],
    },
  },
  {
    id: 'artstudio', name: 'The Art Studio', tape: 'roms/ArtStudio.tzx', utility: true,
    screen: 'roms/ArtStudio.scr',   // ZXDB loading screen (the same as the tape's)
    // OCP's drawing program, Datel's re-release (ZXDB): Rainbird's own tape asks for a Lenslok code before it
    // starts. Its installer asks questions while the tape plays; the build answers them (cursor keys, no 80-column
    // printer, yes that's right, don't save the configured copy) and keeps the state at the program's start, 6590
    tapeKeys: '9000:4,9030:EN,9400:N,9430:EN,10000:Y,10030:EN,22000:N,22030:EN',
    stopAt: 0x6590,
    keysHelp: `${kb('5')} ${kb('6')} ${kb('7')} ${kb('8')} move the pointer (it speeds up as you hold them), ${kb('0')} ` +
      'selects a menu item or draws.',
    flowHelp: 'Press any key on the loading screen. Point at a menu name in the two bars at the top and press 0 to ' +
      'open it.',
    pad: {
      columns: 4, areas: ['. seven . zero', 'five six eight zero'],
      keys: [key('7', 'up', '7', 'seven'), key('5', 'left', '5', 'five'), key('6', 'down', '6', 'six'),
        key('8', 'right', '8', 'eight'), key('0', 'select', '0', 'zero')],
    },
  },
  {
    id: 'artist2', name: 'The Artist II', tape: 'roms/ArtistII.tzx', utility: true,
    screen: 'roms/ArtistII.scr',   // ZXDB loading screen (the same as the tape's)
    // Softechnics' drawing program, the 48K/128K tape (TOSEC; ZXDB has only the 128K one). Its loader ends by asking
    // OPUS, KEMPSTON PRINT and AMX MOUSE; the build answers N to each and keeps the state at the program's start, E1C1
    tapeKeys: '14400:N,14430:EN,14600:N,14630:EN,14800:N,14830:EN',
    stopAt: 0xe1c1,
    keysHelp: `${kb('Q')} up, ${kb('S')} down, ${kb('I')} left, ${kb('O')} right (the pointer speeds up as you hold ` +
      `them), ${kb('M')} select or draw, ${kb('N')} erase.`,
    flowHelp: 'Press any key on the loading screen: the picture stays as the canvas. Point at a menu name in the top ' +
      'bar to open it (STORAGE, TYPEFACE, MODES, SCREEN, EXTRAS, WINDOW) or at an icon at the bottom, and press M.',
    pad: {
      columns: 4, areas: ['. q . m', 'i s o n'],
      keys: [key('Q', 'up', 'Q', 'q'), key('I', 'left', 'I', 'i'), key('S', 'down', 'S', 's'), key('O', 'right', 'O', 'o'),
        key('M', 'select', 'M', 'm'), key('N', 'erase', 'N', 'n')],
    },
  },
  {
    id: 'basic', name: 'ZX Spectrum 48K BASIC', file: null,
    keysHelp: 'Type on your keyboard. In K mode a letter enters a whole keyword ' +
      `(${kb('P')} = PRINT). ${kb('Backspace')} deletes.`,
    flowHelp: 'A 48K Spectrum switched on with no game loaded. Try PRINT 2+2 then ENTER.',
    touchHelp: 'CAPS and SYM stay pressed until the next key.',
    pad: fullKeyboard,
  },
];

// menu order: games by name, ignoring a leading "The"; then the utilities and ZX Spectrum 48K BASIC
// (the page puts a Utilities heading over them)
const sortName = g => (g.id === 'basic' ? '2' : g.utility ? '1' : '0') + g.name.replace(/^The /, '').toLowerCase();
const tapeKeysByPos = t => t ? t.split(',').map(x => { const [at, k] = x.split(':'); return { at: +at, pos: k.split('+').map(n => K[n]) }; }) : [];
export const GAMES = GAME_LIST.map(g => ({ ...g, holds: holdsByPos(g.holds), tapeKeys: tapeKeysByPos(g.tapeKeys) }))
  .sort((a, b) => sortName(a).localeCompare(sortName(b)));
