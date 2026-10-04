// Pure state logic for bwmusic, shared by the app and Node tests.
// Model: {track: Track|undefined, state: Playback state, vol: number|undefined}.
// Playback state is "play", "pause", "stop" or "" (unknown).

/** @typedef {{track: string, artist: string, album: string, dur: number}} Track */
/** @typedef {{track: Track|undefined, state: string, vol: number|undefined}} Model */

/** @returns {Model} */
exports.initial = function () {
  return { track: undefined, state: "", vol: undefined };
};

/** @param {unknown} v */
const str = function (v) {
  return typeof v === "string" ? v : "";
};

/**
 * Fold one Gadgetbridge event into the model. Returns the same object when
 * nothing changed, so callers can redraw on change only.
 * @param {Model} m
 * @param {GBEvent} e
 * @returns {Model}
 */
exports.reduce = function (m, e) {
  if (e.t === "musicinfo") {
    const t = { track: str(e.track), artist: str(e.artist), album: str(e.album), dur: typeof e.dur === "number" ? e.dur : 0 };
    if (exports.sameTrack(m.track, t)) return m;
    return { track: t, state: m.state, vol: m.vol };
  }
  if (e.t === "musicstate") {
    const s = e.state === "play" || e.state === "pause" || e.state === "stop" ? e.state : "";
    if (s === m.state) return m;
    return { track: m.track, state: s, vol: m.vol };
  }
  if (e.t === "audio") {
    if (typeof e.v !== "number" || e.v === m.vol) return m;
    return { track: m.track, state: m.state, vol: e.v };
  }
  return m;
};

/**
 * Whether there is a Track worth showing (Gadgetbridge sends empty fields when nothing plays).
 * @param {Model} m
 */
exports.hasTrack = function (m) {
  return !!(m.track && (m.track.track || m.track.artist));
};

/**
 * Whether two Tracks are equal field by field (both undefined counts as equal).
 * @param {Track|undefined} a
 * @param {Track|undefined} b
 */
exports.sameTrack = function (a, b) {
  if (!a || !b) return a === b;
  return a.track === b.track && a.artist === b.artist && a.album === b.album && a.dur === b.dur;
};

/**
 * Whether the boot hook should auto-open the app: playing a known Track while
 * a clock face shows, and not Dismissed.
 * @param {Model} m
 * @param {boolean} dismissed
 * @param {boolean} clock
 */
exports.shouldOpen = function (m, dismissed, clock) {
  return m.state === "play" && exports.hasTrack(m) && clock && !dismissed;
};

/**
 * Dismissed flag after observing Playback state `s`: pause or stop re-arms auto-open.
 * @param {boolean} dismissed
 * @param {string} s
 */
exports.rearm = function (dismissed, s) {
  return s === "pause" || s === "stop" ? false : dismissed;
};

/** @typedef {{dismissed: boolean|undefined, track: Track|undefined}} Saved */

/** Storage file holding a Saved; survives load() so the boot hook can read it. */
exports.FILE = "bwmusic.json";

/**
 * Read the Saved file; a missing file means not Dismissed and no Track.
 * @param {{readJSON: (n: string, noExceptions?: ShortBoolean) => unknown}} S Storage
 * @returns {Saved}
 */
exports.load = function (S) {
  return /** @type {Saved|undefined} */ (S.readJSON(exports.FILE, 1)) || { dismissed: false, track: undefined };
};

/**
 * Persist the Dismissed flag and last Track, writing only on change (flash wear).
 * @param {{readJSON: (n: string, noExceptions?: ShortBoolean) => unknown, writeJSON: (n: string, v: any) => unknown}} S Storage
 * @param {boolean} dismissed
 * @param {Track|undefined} track
 */
exports.save = function (S, dismissed, track) {
  const f = exports.load(S);
  if (!!f.dismissed === dismissed && exports.sameTrack(f.track, track)) return;
  S.writeJSON(exports.FILE, { dismissed: dismissed, track: track });
};

/** @typedef {{x: number, y: number, w: number, x2: number, y2: number}} Rect */

/**
 * Top edge of the ⏮ ⏯ ⏭ row in the app area.
 * @param {Rect} r
 */
exports.buttonsTop = function (r) {
  return r.y2 - 56;
};

/**
 * Music command for a tap at (x, y): the row is split in thirds, with a little
 * slack above it for fingers. "" when the tap misses the row.
 * @param {number} x
 * @param {number} y
 * @param {Rect} r
 */
exports.tapCommand = function (x, y, r) {
  if (y < exports.buttonsTop(r) - 8) return "";
  const b = Math.floor(((x - r.x) * 3) / r.w);
  return b <= 0 ? "previous" : b === 1 ? "playpause" : "next";
};

/**
 * Music command for a horizontal swipe (-1 = left, 1 = right).
 * @param {number} lr
 */
exports.swipeCommand = function (lr) {
  return lr < 0 ? "next" : lr > 0 ? "previous" : "";
};
