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
