// Boot hook: routes Gadgetbridge music events to the open app, or auto-opens
// it when playback starts on the clock. Runs on every load().
// Deferred like gbmusic so we wrap GB after android.boot.js: outermost wrapper.
setTimeout(function () {
  const prev = global.GB;
  /** Latest Track/Playback state seen on this load, and the Dismissed flag. */
  let s = /** @type {{m: import("./lib").Model, d: boolean}|undefined} */ (undefined);

  /** @param {GBEvent} e */
  const onMusic = function (e) {
    const lib = require("bwmusic");
    const S = require("Storage");
    if (!s) {
      const f = lib.load(S);
      s = { m: { track: f.track, state: "", vol: undefined }, d: !!f.dismissed };
    }
    s.m = lib.reduce(s.m, e);
    const d = lib.rearm(s.d, s.m.state);
    if (d !== s.d) {
      s.d = d;
      lib.save(S, d, s.m.track);
    }
    if (lib.shouldOpen(s.m, s.d, !!Bangle.CLOCK)) {
      S.writeJSON("bwmusic.load.json", { state: s.m.state, track: s.m.track });
      Bangle.setLCDPower(1);
      load("bwmusic.app.js");
    }
  };

  global.GB = function (/** @type {GBEvent} */ e) {
    const app = global.bwmusic;
    if (e.t === "musicinfo" || e.t === "musicstate") {
      // Swallowed: keeps messages/messagegui from showing music.
      if (app) app.onEvent(e);
      else onMusic(e);
      return;
    }
    if (app && e.t === "audio") app.onEvent(e);
    if (prev) setTimeout(prev, 0, e);
  };
}, 1);
