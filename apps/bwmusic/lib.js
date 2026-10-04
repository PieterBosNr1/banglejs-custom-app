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
    const o = m.track;
    if (o && o.track === t.track && o.artist === t.artist && o.album === t.album && o.dur === t.dur) return m;
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
