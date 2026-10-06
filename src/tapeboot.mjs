// Loading a tape the way a person would: power on, type the load command and
// let the tape play (it starts and stops itself, see detectLoader in tape.mjs)
// until the last edge of its last data block, where the machine stops between
// two instructions: everything is loaded and the game has not started yet, so
// the loading screen is up. (The pause recorded after the last block is left
// out; the game would already be running during it.) The build runs this ahead of time and stores the machine
// state, so the page opens on the loaded game without a loading wait.
//
// A loader can finish before the tape does (the ROM loader returns before the
// last bit's closing edge, or a loader reads fewer bytes than the block has),
// and a game that starts at once is then already running when the tape ends
// (Robin of the Wood is 68 bytes into its speech). For those, stopAt is an
// address in the game's start-up: the machine stops just before it instead.

// keys for the load command, each token a list of key presses: in K mode J is
// LOAD; " is SYMBOL SHIFT+P; CODE is I in E mode (CAPS SHIFT+SYMBOL SHIFT first)
const LOAD_KEYS = { LOAD: [[[6, 3]]], '"': [[[7, 1], [5, 0]]], CODE: [[[0, 0], [7, 1]], [[5, 2]]] };

// key presses as { at: frame, pos: [[half-row, bit], ...] }, each held 5 frames
export function typeScript(text) {
  const keys = [];
  for (const tok of text.match(/[A-Z]+|"/g) || []) keys.push(...LOAD_KEYS[tok]);
  keys.push([[6, 0]]);                                            // ENTER
  // the ROM is ready for input well before frame 150 after power-on
  return keys.map((pos, n) => ({ at: 150 + n * 20, pos }));
}

// Returns the number of frames run; throws if the tape never reaches its end
// (or the game its stopAt address). keys: more presses ({ at, pos }, held 5
// frames), for a loader that asks questions while the tape plays.
export function loadTapeToEnd(zx, tape, command = 'LOAD ""', maxFrames = 100000, stopAt = null, keys = []) {
  zx.reset();
  zx.loadTape(tape, true);
  if (stopAt !== null) zx.setBreakAt(stopAt); else zx.setBreakOnTapeEnd(true);
  const script = [...typeScript(command), ...keys];
  for (let f = 0; f < maxFrames; f++) {
    for (const k of script) {
      if (f === k.at) for (const [r, b] of k.pos) zx.key(r, b, true);
      if (f === k.at + 5) for (const [r, b] of k.pos) zx.key(r, b, false);
    }
    zx.runFrame();
    // a key still down when the machine stops would stay down in the saved state
    const release = () => { for (const k of script) for (const [r, b] of k.pos) zx.key(r, b, false); };
    if (zx.brokeAtTapeEnd()) { zx.setBreakOnTapeEnd(false); release(); return f + 1; }
    if (zx.brokeAtBreak()) { release(); return f + 1; }
  }
  zx.setBreakAt(null);
  throw new Error(stopAt !== null ? `the game did not reach ${stopAt.toString(16)} in ${maxFrames} frames`
    : `tape did not reach its end in ${maxFrames} frames`);
}
