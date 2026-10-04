// Headless Bangle.js 2 emulator harness for node:test.
//
// The emscripten glue expects CJS globals (`require`, `__dirname`) and keeps its
// state in globals, so there is one emulator per Node process. node --test runs
// each test file in its own process; use `reset()` between tests in a file.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const EMU_DIR = __dirname;
const OUT_DIR = path.join(__dirname, "..", "..", "test", "out");
const EVAL_MARK = "@@EVAL@@";
const ERROR_PATTERNS = [/Uncaught\b/, /^ERROR:\s/, /ASSERT FAILED/];

const THEMES = {
  light: { fg: 0x0000, bg: 0xffff, fg2: 0x0000, bg2: 0xbfff, fgH: 0x0000, bgH: 0x07ff, fgW: 0x0000, bgW: 0xffff, dark: false },
  dark: { fg: 0xffff, bg: 0x0000, fg2: 0xffff, bg2: 0x0007, fgH: 0xffff, bgH: 0x001f, fgW: 0xffff, bgW: 0x0000, dark: true },
};

// Swipe gesture codes from EspruinoWebIDE emu_banglejs2.html.
const GESTURES = { down: 1, up: 2, left: 3, right: 4 };
const GESTURE_CLICK = 5;
const INPUT_GAP_MS = 80;

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string} line */
function cleanLine(line) {
  return line.replace(/\r/g, "").replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/^>+/, "");
}

/** @param {Uint8Array} rgba */
function encodePNG(width, height, rgba) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width * 4; x++) {
      // The framebuffer reader leaves alpha intact, but force it opaque anyway.
      raw[y * (width * 4 + 1) + 1 + x] = (x & 3) === 3 ? 255 : rgba[y * width * 4 + x];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let booted;

/**
 * Boot the emulator (once per process), factory reset it and return a handle.
 * Storage is snapshotted after the factory reset so `reset()` is fast.
 */
function boot() {
  if (booted) return booted;
  booted = new Promise((resolve) => {
    /** @type {string[]} */
    const lines = [];
    let partial = "";
    const g = /** @type {any} */ (globalThis);
    g.require = require;
    g.__dirname = EMU_DIR;
    g.onConsoleOutput = function () {};
    for (const f of ["emulator_banglejs2.js", "emu_banglejs2.js", "common.js"]) {
      vm.runInThisContext(fs.readFileSync(path.join(EMU_DIR, f), "utf8"), { filename: f });
    }
    g.jsUpdateGfx = function () {};
    // Collect console output ourselves: common.js splits long lines.
    g.jsRXCallback = function (ch) {
      partial += String.fromCharCode(ch);
      let i;
      while ((i = partial.indexOf("\n")) >= 0) {
        lines.push(cleanLine(partial.slice(0, i)));
        partial = partial.slice(i + 1);
      }
    };

    /** @param {string} cmd */
    const tx = (cmd) => g.jsTransmitString("\x10" + cmd + "\n");

    const emu = {
      width: g.GFX_WIDTH,
      height: g.GFX_HEIGHT,
      wait,

      /** All console lines since the last reset. */
      console() {
        return lines.filter((l) => !l.startsWith(EVAL_MARK));
      },

      /** Console lines that indicate an error (Uncaught …, ERROR:, ASSERT FAILED). */
      errors() {
        return emu.console().filter((l) => ERROR_PATTERNS.some((re) => re.test(l)));
      },

      /** Run a statement on the watch. */
      tx,

      /**
       * Evaluate an expression on the watch and return it parsed from JSON.
       * @param {string} expr
       */
      eval(expr) {
        const start = lines.length;
        tx('print("' + EVAL_MARK + '"+JSON.stringify(' + expr + "))");
        for (let i = start; i < lines.length; i++) {
          if (lines[i].startsWith(EVAL_MARK)) {
            const json = lines[i].slice(EVAL_MARK.length);
            return json === "undefined" ? undefined : JSON.parse(json);
          }
        }
        throw new Error("eval failed: " + expr + "\n" + lines.slice(start).join("\n"));
      },

      /**
       * Write a file to Storage, in chunks so long sources fit the REPL.
       * @param {string} name
       * @param {string} content
       */
      writeFile(name, content) {
        const CHUNK = 1024;
        const n = JSON.stringify(name);
        if (content.length <= CHUNK) {
          tx('require("Storage").write(' + n + "," + JSON.stringify(content) + ")");
          return;
        }
        for (let off = 0; off < content.length; off += CHUNK) {
          const part = JSON.stringify(content.slice(off, off + CHUNK));
          tx(
            'require("Storage").write(' + n + "," + part + "," + off + (off === 0 ? "," + content.length : "") + ")",
          );
        }
      },

      /**
       * `load()` a Storage file (or the clock when omitted) and let it run.
       * @param {string} [name]
       * @param {number} [settleMs]
       */
      async load(name, settleMs) {
        tx(name ? "load(" + JSON.stringify(name) + ")" : "load()");
        await wait(settleMs === undefined ? 500 : settleMs);
      },

      /**
       * Rebuild `.boot0` so `*.boot.js` files written since the last reset run
       * on every following `load()`, as the App Loader does after an install.
       */
      async rebuildBoot() {
        await emu.load("bootupdate.js", 1500);
      },

      /**
       * Call `GB(obj)` as Gadgetbridge would. A no-op `GB` is defined when no
       * app provides one (bare firmware has none).
       * @param {object} obj
       */
      async gb(obj) {
        tx("if(global.GB===undefined)global.GB=function(){};GB(" + JSON.stringify(obj) + ")");
        await wait(INPUT_GAP_MS);
      },

      /**
       * Set the theme in settings (survives `load()`) and on the running app.
       * @param {"light"|"dark"|object} theme
       */
      setTheme(theme) {
        const t = typeof theme === "string" ? THEMES[theme] : theme;
        const json = JSON.stringify(t);
        tx(
          'var s=require("Storage").readJSON("setting.json",1)||{};s.theme=' +
            json +
            ';require("Storage").writeJSON("setting.json",s);g.setTheme(' +
            json +
            ")",
        );
        return t;
      },

      /**
       * Tap the touchscreen at (x, y).
       * @param {number} x
       * @param {number} y
       */
      async tap(x, y) {
        g.jsSendTouchEvent(x, y, 1, 0);
        await wait(INPUT_GAP_MS);
        g.jsSendTouchEvent(x, y, 0, GESTURE_CLICK);
        await wait(INPUT_GAP_MS);
      },

      /**
       * Swipe in a direction.
       * @param {"left"|"right"|"up"|"down"} dir
       */
      async swipe(dir) {
        const gesture = GESTURES[dir];
        if (!gesture) throw new Error("bad swipe direction " + dir);
        const c = emu.width / 2;
        g.jsSendTouchEvent(c, c, 1, 0);
        await wait(INPUT_GAP_MS);
        g.jsSendTouchEvent(c, c, 0, gesture);
        await wait(INPUT_GAP_MS);
      },

      /**
       * Press BTN1 (active-low) and hold it for `ms` milliseconds.
       * @param {number} [ms] 100 for a short press; use >= 1000 for a long press.
       */
      async pressButton(ms) {
        const pin = g.BTN1;
        g.hwPinValue[pin] = 0;
        g.jsTransmitPinEvent(pin);
        await wait(ms === undefined ? 100 : ms);
        g.hwPinValue[pin] = 1;
        g.jsTransmitPinEvent(pin);
        await wait(INPUT_GAP_MS);
      },

      /** Long press of BTN1. */
      longPress() {
        return emu.pressButton(1200);
      },

      /** Current framebuffer as RGBA bytes. */
      pixels() {
        const rgba = new Uint8Array(emu.width * emu.height * 4);
        g.jsGetGfxContents(rgba);
        return rgba;
      },

      /**
       * Save the screen as a PNG in test/out/ and return its path.
       * @param {string} name file name without extension
       */
      screenshot(name) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        const file = path.join(OUT_DIR, name + ".png");
        fs.writeFileSync(file, encodePNG(emu.width, emu.height, emu.pixels()));
        return file;
      },

      /** Restore Storage to the factory snapshot and reset the interpreter. */
      async reset() {
        g.flashMemory.set(factory);
        // The firmware caches Storage file addresses; compact() drops that cache
        // so files from the previous test aren't read from restored (erased) flash.
        tx('require("Storage").compact();reset()');
        await wait(100);
        lines.length = 0;
      },

      /** Stop the emulator's idle loop so Node can exit. */
      stop() {
        g.jsStopIdle();
      },
    };

    let factory;
    setTimeout(async function () {
      // jsInit must run after the WASM runtime has initialised.
      g.jsInit();
      g.jsIdle();
      g.hwPinValue[g.BTN1] = 1;
      tx("Bangle.factoryReset()");
      await wait(200);
      tx('require("Storage").writeJSON("welcome.json",{welcomed:true})');
      factory = new Uint8Array(g.flashMemory);
      await emu.reset();
      resolve(emu);
    }, 0);
  });
  return booted;
}

/**
 * Convert an RGB565 theme colour to the RGBA the 3-bit framebuffer shows.
 * @param {number} c
 */
function rgb565ToRGBA(c) {
  return [c & 0x8000 ? 255 : 0, c & 0x0400 ? 255 : 0, c & 0x0010 ? 255 : 0, 255];
}

module.exports = { boot, THEMES, rgb565ToRGBA, encodePNG };
