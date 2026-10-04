import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { boot, rgb565ToRGBA } = require("../tools/emu/harness.cjs");
const APP = fs.readFileSync(new URL("../apps/bwmusic/app.js", import.meta.url), "utf8");

/** @type {any} */
let emu;

before(async () => {
  emu = await boot();
});
after(() => emu.stop());
beforeEach(() => emu.reset());

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
  test(`draws Hello in theme fg on theme bg (${themeName})`, async () => {
    const theme = emu.setTheme(themeName);
    emu.writeFile("bwmusic.app.js", APP);
    await emu.load("bwmusic.app.js");

    assert.deepEqual(emu.errors(), []);
    assert.equal(emu.eval("global.__FILE__"), "bwmusic.app.js");
    assert.equal(emu.eval("g.theme.dark"), themeName === "dark");

    const rgba = emu.pixels();
    const fg = rgb565ToRGBA(theme.fg);
    const bg = rgb565ToRGBA(theme.bg);
    const r = emu.eval("Bangle.appRect");
    // Centre band where "Hello" is drawn.
    const text = { x: r.x, x2: r.x2, y: r.y + (r.h >> 1) - 15, y2: r.y + (r.h >> 1) + 15 };
    const textArea = (text.x2 - text.x) * (text.y2 - text.y);
    const fgCount = countPixels(rgba, fg, text);
    const bgCount = countPixels(rgba, bg, text);
    assert.ok(fgCount > 50, `expected Hello pixels in fg, got ${fgCount}`);
    assert.equal(fgCount + bgCount, textArea, "only fg and bg in the text band");
    assert.ok(bgCount > fgCount, "background dominates");
    // Nothing but bg in a strip above the text.
    const strip = { x: r.x, x2: r.x2, y: r.y + 2, y2: r.y + 20 };
    assert.equal(countPixels(rgba, bg, strip), (strip.x2 - strip.x) * (strip.y2 - strip.y));

    const file = emu.screenshot(`hello-${themeName}`);
    assert.ok(fs.statSync(file).size > 0);
  });
}

test("BTN1 returns to the clock", async () => {
  emu.writeFile("bwmusic.app.js", APP);
  await emu.load("bwmusic.app.js");
  await emu.pressButton();
  await emu.wait(500);
  assert.deepEqual(emu.errors(), []);
  assert.notEqual(emu.eval("global.__FILE__"), "bwmusic.app.js");
  assert.equal(emu.eval("Bangle.CLOCK"), 1);
});
