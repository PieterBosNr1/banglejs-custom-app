import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { boot, rgb565ToRGBA } = require("../tools/emu/harness.cjs");
const read = (f) => fs.readFileSync(new URL(`../apps/bwmusic/${f}`, import.meta.url), "utf8");
const METADATA = JSON.parse(read("metadata.json"));

const INFO = { t: "musicinfo", artist: "Daft Punk", album: "Alive 2007", track: "One More Time", dur: 320, c: 2, n: 2 };
const PLAY = { t: "musicstate", state: "play", position: 0, shuffle: 1, repeat: 1 };

/** @type {any} */
let emu;

before(async () => {
  emu = await boot();
});
after(() => emu.stop());
beforeEach(() => emu.reset());

async function startApp() {
  for (const f of METADATA.storage) emu.writeFile(f.name, read(f.url));
  await emu.load("bwmusic.app.js");
}

function countPixels(rgba, colour, region) {
  let n = 0;
  for (let y = region.y; y < region.y2; y++) {
    for (let x = region.x; x < region.x2; x++) {
      const i = (y * emu.width + x) * 4;
      if (rgba[i] === colour[0] && rgba[i + 1] === colour[1] && rgba[i + 2] === colour[2]) n++;
    }
  }
  return n;
}

for (const themeName of ["light", "dark"]) {
  test(`shows No music in theme colours only (${themeName})`, async () => {
    const theme = emu.setTheme(themeName);
    await startApp();

    assert.deepEqual(emu.errors(), []);
    assert.equal(emu.eval("global.__FILE__"), "bwmusic.app.js");
    assert.deepEqual(emu.eval("bwmusic.title"), []);

    const rgba = emu.pixels();
    const fg = rgb565ToRGBA(theme.fg);
    const bg = rgb565ToRGBA(theme.bg);
    const r = emu.eval("Bangle.appRect");
    const area = { x: r.x, y: r.y, x2: r.x2 + 1, y2: r.y2 + 1 };
    const fgCount = countPixels(rgba, fg, area);
    const bgCount = countPixels(rgba, bg, area);
    assert.ok(fgCount > 50, `expected drawn pixels in fg, got ${fgCount}`);
    assert.equal(fgCount + bgCount, r.w * r.h, "only fg and bg in the app area");

    emu.screenshot(`app-empty-${themeName}`);
  });
}

test("musicinfo + musicstate update the model and the screen", async () => {
  await startApp();
  const before = emu.pixels();
  await emu.gb(INFO);
  await emu.gb(PLAY);

  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("bwmusic.m"), {
    track: { track: "One More Time", artist: "Daft Punk", album: "Alive 2007", dur: 320 },
    state: "play",
  });
  assert.deepEqual(emu.eval("bwmusic.title"), ["One More Time"]);
  const after = emu.pixels();
  assert.notDeepEqual(after, before);
  const r = emu.eval("Bangle.appRect");
  const area = { x: r.x, y: r.y, x2: r.x2 + 1, y2: r.y2 + 1 };
  const fg = rgb565ToRGBA(emu.eval("g.theme.fg"));
  const bg = rgb565ToRGBA(emu.eval("g.theme.bg"));
  assert.equal(countPixels(after, fg, area) + countPixels(after, bg, area), r.w * r.h, "no colours");
  emu.screenshot("app-playing");
});

test("other GB events are passed on to the previous handler", async () => {
  // Stands in for android.boot.js, which defines GB on every load().
  emu.writeFile("fakegb.boot.js", "global.GB=function(e){global.passed=(global.passed||[]).concat([e.t]);};");
  await emu.rebuildBoot();
  await startApp();
  await emu.gb({ t: "notify", id: 1, body: "hi" });
  await emu.gb({ t: "audio", v: 50 });
  await emu.gb(INFO);
  await emu.gb(PLAY);
  await emu.wait(50);

  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("global.passed"), ["notify", "audio"]);
  assert.equal(emu.eval("bwmusic.m.vol"), 50);
});

test("a long title is clamped to 2 lines with ...", async () => {
  await startApp();
  await emu.gb({ ...INFO, track: "Harder, Better, Faster, Stronger (Alive 2007 Live Version Extended)", album: "" });

  assert.deepEqual(emu.errors(), []);
  const title = emu.eval("bwmusic.title");
  assert.equal(title.length, 2);
  assert.ok(title[1].endsWith("..."), `last line ${JSON.stringify(title[1])}`);
  emu.screenshot("app-long-title");
});

test("redraws only when the model changes", async () => {
  await startApp();
  await emu.gb(INFO);
  const draws = emu.eval("bwmusic.draws");
  await emu.gb(INFO);
  await emu.gb({ t: "notify", id: 1 });
  assert.equal(emu.eval("bwmusic.draws"), draws);
});

// Records Bangle.musicControl commands and load() calls instead of acting on them.
async function startStubbed() {
  await startApp();
  emu.tx("global.sent=[];Bangle.musicControl=function(c){sent.push(c);};global.load=function(f){sent.push('load:'+f);}");
}

for (const [x, cmd] of [
  [30, "previous"],
  [88, "playpause"],
  [150, "next"],
]) {
  test(`tapping the ${cmd} button sends ${cmd}`, async () => {
    await startStubbed();
    await emu.tap(x, 150);
    assert.deepEqual(emu.errors(), []);
    assert.deepEqual(emu.eval("sent"), [cmd]);
  });
}

test("tapping the text area sends nothing", async () => {
  await startStubbed();
  await emu.tap(88, 60);
  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("sent"), []);
});

test("swipe left sends next, swipe right sends previous", async () => {
  await startStubbed();
  await emu.swipe("left");
  await emu.swipe("right");
  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("sent"), ["next", "previous"]);
});

test("short BTN1 sends playpause", async () => {
  await startStubbed();
  await emu.pressButton();
  await emu.wait(1200);
  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("sent"), ["playpause"]);
});

test("long BTN1 exits without sending playpause", async () => {
  await startStubbed();
  await emu.longPress();
  assert.deepEqual(emu.errors(), []);
  assert.deepEqual(emu.eval("sent"), ["load:undefined"]);
});

test("long BTN1 returns to the clock", async () => {
  await startApp();
  await emu.longPress();
  await emu.wait(500);
  assert.deepEqual(emu.errors(), []);
  assert.notEqual(emu.eval("global.__FILE__"), "bwmusic.app.js");
  assert.equal(emu.eval("Bangle.CLOCK"), 1);
});

test("the middle button shows pause while playing", async () => {
  await startApp();
  await emu.gb(INFO);
  const r = emu.eval("Bangle.appRect");
  const mid = { x: 66, y: r.y2 - 50, x2: 110, y2: r.y2 - 8 };
  const bg = rgb565ToRGBA(emu.eval("g.theme.bg"));
  const paused = countPixels(emu.pixels(), bg, mid);
  await emu.gb(PLAY);
  const playing = countPixels(emu.pixels(), bg, mid);
  assert.deepEqual(emu.errors(), []);
  assert.notEqual(playing, paused, "icon changes with Playback state");
  emu.screenshot("app-controls-playing");
});
