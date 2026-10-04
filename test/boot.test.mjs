import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { boot } = require("../tools/emu/harness.cjs");
const read = (f) => fs.readFileSync(new URL(`../apps/bwmusic/${f}`, import.meta.url), "utf8");
const METADATA = JSON.parse(read("metadata.json"));

const INFO = { t: "musicinfo", artist: "Daft Punk", album: "Alive 2007", track: "One More Time", dur: 320, c: 2, n: 2 };
const INFO2 = { ...INFO, track: "Aerodynamic", dur: 212 };
const PLAY = { t: "musicstate", state: "play", position: 0, shuffle: 1, repeat: 1 };
const PAUSE = { ...PLAY, state: "pause" };
// Long enough for the app (or clock) that load() started to be running.
const SETTLE_MS = 800;

/** @type {any} */
let emu;

before(async () => {
  emu = await boot();
});
after(() => emu.stop());
beforeEach(() => emu.reset());

// Install like the App Loader (storage files + rebuilt .boot0), then show the
// clock. Unlocks first: lock state survives emu.reset() and eats BTN1 presses.
async function install() {
  emu.tx("Bangle.setLocked(false)");
  for (const f of METADATA.storage) emu.writeFile(f.name, read(f.url));
  await emu.rebuildBoot();
  await emu.load();
}

const file = () => emu.eval("global.__FILE__");

test("metadata installs boot.js", () => {
  assert.ok(METADATA.storage.some((f) => f.name === "bwmusic.boot.js" && f.url === "boot.js"));
});

test("play with the clock shown auto-opens the app with the Track", async () => {
  await install();
  emu.tx("Bangle.setLCDPower(0)");
  await emu.gb(INFO);
  assert.notEqual(file(), "bwmusic.app.js", "Track alone does not open");
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);

  assert.deepEqual(emu.errors(), []);
  assert.equal(file(), "bwmusic.app.js");
  assert.equal(emu.eval("bwmusic.auto"), true);
  assert.deepEqual(emu.eval("bwmusic.m.track"), {
    track: "One More Time",
    artist: "Daft Punk",
    album: "Alive 2007",
    dur: 320,
  });
  assert.equal(emu.eval("bwmusic.m.state"), "play");
  assert.deepEqual(emu.eval("bwmusic.title"), ["One More Time"]);
  assert.equal(emu.eval(`require("Storage").read("bwmusic.load.json")===undefined`), true, "hand-off file erased");
  assert.equal(emu.eval("Bangle.isLCDOn()"), true, "screen woken");
  emu.screenshot("boot-auto-opened");
});

test("events reach the auto-opened app", async () => {
  await install();
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  await emu.gb(INFO2);
  await emu.gb(PAUSE);

  assert.deepEqual(emu.errors(), []);
  assert.equal(emu.eval("bwmusic.m.track.track"), "Aerodynamic");
  assert.equal(emu.eval("bwmusic.m.state"), "pause");
});

test("opened by hand is not auto-opened", async () => {
  await install();
  await emu.load("bwmusic.app.js");
  assert.deepEqual(emu.errors(), []);
  assert.equal(emu.eval("bwmusic.auto"), false);
});

test("play while another app runs does not open", async () => {
  await install();
  emu.writeFile("other.app.js", "Bangle.loadWidgets();g.clear();");
  await emu.load("other.app.js");
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);

  assert.deepEqual(emu.errors(), []);
  assert.equal(file(), "other.app.js");
});

test("Dismissed stays on the clock until pause then play", async () => {
  await install();
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  assert.equal(file(), "bwmusic.app.js");

  await emu.longPress();
  await emu.wait(SETTLE_MS);
  assert.equal(file(), "antonclk.app.js");

  await emu.gb(INFO2);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  assert.equal(file(), "antonclk.app.js", "a track change does not re-open");

  await emu.gb(PAUSE);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  assert.deepEqual(emu.errors(), []);
  assert.equal(file(), "bwmusic.app.js");
  assert.equal(emu.eval("bwmusic.m.track.track"), "Aerodynamic");
});

test("pause then play re-opens after Dismissed without a new Track", async () => {
  await install();
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  await emu.longPress();
  await emu.wait(SETTLE_MS);

  await emu.gb(PAUSE);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  assert.deepEqual(emu.errors(), []);
  assert.equal(file(), "bwmusic.app.js");
});

test("leaving while paused does not Dismiss", async () => {
  await install();
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  await emu.gb(PAUSE);
  await emu.longPress();
  await emu.wait(SETTLE_MS);

  await emu.gb(PLAY);
  await emu.wait(SETTLE_MS);
  assert.deepEqual(emu.errors(), []);
  assert.equal(file(), "bwmusic.app.js");
});

test("on the clock music events are swallowed, others passed on", async () => {
  emu.writeFile("fakegb.boot.js", "global.GB=function(e){global.passed=(global.passed||[]).concat([e.t]);};");
  await install();
  await emu.gb({ t: "notify", id: 1, body: "hi" });
  await emu.gb({ t: "audio", v: 50 });
  await emu.gb(INFO);
  await emu.wait(50);

  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("global.passed"), ["notify", "audio"]);
});
