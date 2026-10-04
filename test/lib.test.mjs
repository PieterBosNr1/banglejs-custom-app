import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../apps/bwmusic/lib.js");

const INFO = { t: "musicinfo", artist: "Daft Punk", album: "Alive 2007", track: "One More Time", dur: 241, c: 2, n: 2 };

test("initial model knows nothing", () => {
  assert.deepEqual(lib.initial(), { track: undefined, state: "", vol: undefined });
  assert.equal(lib.hasTrack(lib.initial()), false);
});

test("musicinfo with album sets the Track", () => {
  const m = lib.reduce(lib.initial(), INFO);
  assert.deepEqual(m.track, { track: "One More Time", artist: "Daft Punk", album: "Alive 2007", dur: 241 });
  assert.equal(lib.hasTrack(m), true);
});

test("musicinfo without album or dur defaults them", () => {
  const m = lib.reduce(lib.initial(), { t: "musicinfo", artist: "Massive Attack", track: "Teardrop" });
  assert.deepEqual(m.track, { track: "Teardrop", artist: "Massive Attack", album: "", dur: 0 });
});

test("musicinfo with empty fields is no Track", () => {
  const m = lib.reduce(lib.initial(), { t: "musicinfo", artist: "", album: "", track: "", dur: 0 });
  assert.equal(lib.hasTrack(m), false);
});

test("an identical musicinfo returns the same model", () => {
  const m = lib.reduce(lib.initial(), INFO);
  assert.equal(lib.reduce(m, { ...INFO }), m);
});

for (const [state, expected] of [
  ["play", "play"],
  ["pause", "pause"],
  ["stop", "stop"],
  ["", ""],
  ["bogus", ""],
  [undefined, ""],
]) {
  test(`musicstate ${JSON.stringify(state)} -> ${JSON.stringify(expected)}`, () => {
    const start = { track: undefined, state: "pause", vol: undefined };
    const m = lib.reduce(start, { t: "musicstate", state, position: 0, shuffle: 1, repeat: 1 });
    assert.equal(m.state, expected);
  });
}

test("musicstate keeps the Track and returns the same model when unchanged", () => {
  const m = lib.reduce(lib.reduce(lib.initial(), INFO), { t: "musicstate", state: "play" });
  assert.equal(m.track.track, "One More Time");
  assert.equal(lib.reduce(m, { t: "musicstate", state: "play" }), m);
});

test("audio sets the volume", () => {
  const m = lib.reduce(lib.initial(), { t: "audio", v: 42.5 });
  assert.equal(m.vol, 42.5);
  assert.equal(lib.reduce(m, { t: "audio", v: 42.5 }), m);
  assert.equal(lib.reduce(m, { t: "audio" }), m);
});

test("unknown events are ignored", () => {
  const m = lib.reduce(lib.initial(), INFO);
  for (const e of [{ t: "notify", id: 1, body: "hi" }, { t: "call", cmd: "incoming" }, { t: "weather" }]) {
    assert.equal(lib.reduce(m, e), m);
  }
});

// Bangle.js 2 appRect with widgets: 176 wide, y 24..175.
const R = { x: 0, y: 24, w: 176, h: 152, x2: 175, y2: 175 };

test("buttons row sits at the bottom of the app area", () => {
  assert.equal(lib.buttonsTop(R), 175 - 56);
});

for (const [x, y, cmd] of [
  [30, 150, "previous"],
  [88, 150, "playpause"],
  [150, 150, "next"],
  [0, 175, "previous"],
  [175, 175, "next"],
  [88, 60, ""],
  [88, 24, ""],
]) {
  test(`tap at ${x},${y} -> ${JSON.stringify(cmd)}`, () => {
    assert.equal(lib.tapCommand(x, y, R), cmd);
  });
}

for (const [lr, cmd] of [
  [-1, "next"],
  [1, "previous"],
  [0, ""],
]) {
  test(`swipe lr=${lr} -> ${JSON.stringify(cmd)}`, () => {
    assert.equal(lib.swipeCommand(lr), cmd);
  });
}

const PLAYING = lib.reduce(lib.reduce(lib.initial(), INFO), { t: "musicstate", state: "play" });

test("auto-opens when playing a known Track on the clock", () => {
  assert.equal(lib.shouldOpen(PLAYING, false, true), true);
});

test("does not auto-open off the clock, when Dismissed, paused or without a Track", () => {
  assert.equal(lib.shouldOpen(PLAYING, false, false), false);
  assert.equal(lib.shouldOpen(PLAYING, true, true), false);
  assert.equal(lib.shouldOpen(lib.reduce(PLAYING, { t: "musicstate", state: "pause" }), false, true), false);
  assert.equal(lib.shouldOpen(lib.reduce(lib.initial(), { t: "musicstate", state: "play" }), false, true), false);
  const empty = lib.reduce(PLAYING, { t: "musicinfo", artist: "", album: "", track: "", dur: 0 });
  assert.equal(lib.shouldOpen(empty, false, true), false);
});

test("pause or stop re-arms a Dismissed app; play and unknown do not", () => {
  assert.equal(lib.rearm(true, "pause"), false);
  assert.equal(lib.rearm(true, "stop"), false);
  assert.equal(lib.rearm(true, "play"), true);
  assert.equal(lib.rearm(true, ""), true);
  assert.equal(lib.rearm(false, "play"), false);
});

test("sameTrack compares every field", () => {
  const t = PLAYING.track;
  assert.equal(lib.sameTrack(t, { ...t }), true);
  assert.equal(lib.sameTrack(t, { ...t, dur: 1 }), false);
  assert.equal(lib.sameTrack(t, undefined), false);
  assert.equal(lib.sameTrack(undefined, undefined), true);
});

function fakeStorage(files) {
  const writes = [];
  return {
    writes,
    readJSON: (n) => (n in files ? structuredClone(files[n]) : undefined),
    writeJSON: (n, v) => {
      files[n] = v;
      writes.push(n);
    },
  };
}

test("save writes the Dismissed flag and Track only when they change", () => {
  const S = fakeStorage({});
  lib.save(S, true, PLAYING.track);
  assert.deepEqual(S.readJSON("bwmusic.json"), { dismissed: true, track: PLAYING.track });
  lib.save(S, true, { ...PLAYING.track });
  assert.equal(S.writes.length, 1, "unchanged: no write");
  lib.save(S, false, PLAYING.track);
  lib.save(S, false, { ...PLAYING.track, track: "Aerodynamic" });
  assert.equal(S.writes.length, 3);
});

test("save treats a missing file as not Dismissed and no Track", () => {
  const S = fakeStorage({});
  lib.save(S, false, undefined);
  assert.equal(S.writes.length, 0);
});
