# Can the Bangle.js emulator run headless in Docker for smoke tests?

Ticket: #2 · Map: #1 · Researched 2026-10-04

## Answer

**Yes.** The official Bangle.js 2 emulator is Espruino firmware compiled with Emscripten to a single JS+WASM file. It runs in plain Node with **no browser, no display server and no npm dependencies**. I ran it inside the Sandcastle image (`sandcastle:banglejs-custom-app`: Node v22.23.3, Debian 12.15, aarch64) and on the macOS host (Node v22.14.0). In both I loaded an app, sent it `GB({...})` events, injected a tap, a swipe and a button press, caught an `Uncaught Error`, and saved the framebuffer as a 176×176 PNG.

**Recommendation:** write a small harness of our own, about 100 lines of Node, that loads the three emulator files from a pinned EspruinoWebIDE commit (see "Recommended approach" below). It can borrow BangleApps' `test.json` step vocabulary if that helps. Don't adopt `bin/runapptests.js` directly: it is a self-described **PROTOTYPE**, it expects the BangleApps repo layout, and it does not expose touch or button input.

## Primary-source evidence

### The emulator itself (EspruinoWebIDE)

- Files: `emu/emulator_banglejs2.js` (2.9 MB Emscripten build with WebAssembly embedded), `emu/emu_banglejs2.js` (board constants and framebuffer reader), `emu/common.js` (I/O glue). The whole `emu/` dir is 7.8 MB. Repo: https://github.com/espruino/EspruinoWebIDE/tree/master/emu
- Firmware reported by the emulator: `process.env.VERSION === "2v29.74"`, `BOARD === "BANGLEJS2"`. The emulator file was last updated in commit `87984d08044d800915fdda8448dd334690800f98` (2026-05-20, "updated emulators"). WebIDE HEAD when tested: `c5f95f94a37e64d3756e1c886d7ca9b9b28f951c`.
- `common.js` provides everything a test harness needs (all guarded with `"undefined" != typeof window`, so they work in Node):
  - `jsInit()`, `jsIdle()`, `jsStopIdle()`: start the interpreter and pump its event loop.
  - `jsTransmitString(s)`: type into the REPL (same as sending over the serial console).
  - `onConsoleOutput(line)`: an optional global callback that receives each console line. Used to collect `Uncaught …` errors.
  - `jsSendTouchEvent(x, y, pts, gesture)`: touch input. Gesture codes from `emu_banglejs2.html`: 0 = move/up, 1/2 = swipe down/up, 3/4 = swipe left/right, 5 = click.
  - `jsTransmitPinEvent(pin)` + `hwPinValue[pin]`: button. **Active-low**: idle is `1`, pressed is `0` (`emu_banglejs2.html` `handleButton`).
  - `flashMemory` (8 MB `Uint8Array`): emulated Storage. It can be snapshotted and restored for a fast reset between tests.
- `emu_banglejs2.js` `jsGetGfxContents(rgba)` reads the 3-bit framebuffer into RGBA. 176×176.

### EspruinoAppLoaderCore `lib/emulator.js` (the Node wrapper BangleApps uses)

- https://github.com/espruino/EspruinoAppLoaderCore/blob/master/lib/emulator.js (HEAD `5e2d0ac6`, 2026-09-04)
- `init()` `eval`s the three files from `../EspruinoWebIDE/emu/`, waits one `setTimeout(0)` for the WASM runtime, runs `Bangle.factoryReset()`, and snapshots flash.
- It exports `tx`, `idle`, `stopIdle`, `getScreenshot()` (RGBA `Uint32Array`) and `writeScreenshot(file)`. `writeScreenshot` needs **`jimp`**, which isn't declared anywhere, so you'd have to install it yourself.
- It does **not** export `jsSendTouchEvent` or `jsTransmitPinEvent`. The files are `eval`ed inside `init`'s function scope, so those functions are unreachable from outside the wrapper. That limitation is the main reason to write our own loader.

### BangleApps `bin/runapptests.js`

- https://github.com/espruino/BangleApps/blob/master/bin/runapptests.js (BangleApps HEAD `8d19b0b5`, 2026-10-02). The header says "IT IS UNFINISHED"; `bin/README.md` lists it under "Prototypes".
- Needs `../EspruinoWebIDE` cloned next to BangleApps, plus the `core` and `webtools` submodules (`core/js/appinfo.js` requires `../../webtools/heatshrink.js`). It needs no `npm install`.
- Reads `apps/<id>/test.json`. Step types: `setup`, `load`, `cmd`, `jsonfile`, `wrap`, **`gb`** (sends `GB({...})` with Messenger-notify defaults merged with `step.obj`), `emit` (`Bangle.emit(event, ...params)`), `eval`, `assert`/`assertArray`/`assertCall`/`resetCall`, `saveMemoryUsage`/`checkMemoryUsage`, `advanceTimers` (rewrites `global["\xff"].timers`), `upload`, `console`. **`screenshot` prints "UNIMPLEMENTED"**, and a comment notes "tap/touch/drag/button press" as TODO.
- Error detection: it scans console output for `/Uncaught\b/`, `/^ERROR:\s/m`, `ASSERT FAILED` and stack-trace lines. It has a 60 s per-test timeout, and the exit code is non-zero if any test fails.
- Upstream CI runs it headless on GitHub Actions `ubuntu-latest` with Node 18. WebIDE is pinned to `fb9f890377f45851577c658bcfc8b60e973a2d6a`, and the job runs `node bin/runapptests.js --id "$app" --verbose` (`.github/workflows/nodejs.yml`, job `functional-tests`). So this setup has been running headless upstream, not only in my test.
- Example with GB events: `apps/android/test.json`.

### `bin/thumbnailer.js` (screenshots)

- Also a **PROTOTYPE**. It loads each app, calls `emu.writeScreenshot(file, {errorIfBlank:true})` and writes PNGs. This shows the framebuffer-to-PNG path is an intended use. It is hard-coded to `banglejs1`.

### Other candidates (not recommended)

- **`espruino` npm package** (v0.1.67): "Command Line Interface and library for Communications with Espruino" devices. `npm pack` shows no emulator files, so it's not an option.
- **Espruino Linux build**: possible in principle, but I found no documented Bangle.js 2 Linux target with `Bangle`/`g` APIs. The Emscripten build *is* the official Bangle emulator. (I didn't verify this further; it isn't needed.)

## Experiments run

1. `node bin/runapptests.js --id android` (BangleApps + core + webtools + EspruinoWebIDE, all `--depth 1`, no npm install):
   - macOS host, Node 22.14: 5/5 SUCCESS, **11.4 s** wall time (about 2 s per test, mostly the factory reset per subtest).
   - Inside `sandcastle:banglejs-custom-app` (Node 22.23.3, Debian bookworm, arm64): 5/5 SUCCESS.
2. A standalone harness (~60 lines, Node built-ins only, PNG encoded with `zlib`). It loads the emulator files with `vm.runInThisContext` and needs two shims: `global.require` and `global.__dirname`, because the Emscripten glue calls `require('fs')`. It then:
   - uploads a toy music app to Storage and runs `load("hello.app.js")`
   - sends `GB({t:"musicinfo",…})` and `GB({t:"musicstate",state:"play"})`, which updates the app state
   - taps (down, up, gesture 5): `Bangle.on("touch")` fired 1×
   - swipes left (gesture 3): `Bangle.on("swipe")` got `[-1,0]`
   - presses BTN1 (pin 0, wait 100 ms, pin 1, both via `jsTransmitPinEvent`): `setWatch` fired 1×
   - throws in a timeout: the console line `Uncaught Error: boom` was captured
   - writes `shot.png`: a correct 176×176 render of title/artist/state

   Result: identical output on the macOS host and in the Sandcastle container. About **0.5 s** total including emulator boot.

### Gotchas found

- Call `jsInit()` only after a `setTimeout(0)`. Calling it synchronously aborts with "native function `jsInit` called before runtime initialization".
- Input needs *real* wall-clock gaps (I used about 50–100 ms) plus `jsIdle()`. If you send press and release back-to-back with no gap, `setWatch` and touch handlers never fire, probably because of debounce. Timers in the emulator follow real time; `advanceTimers` in `runapptests.js` shows how to skip ahead.
- Set `hwPinValue[BTN1] = 1` before the first press (active-low).
- Console lines contain `\r` and ANSI `\x1B[J`, so strip them before matching.
- `GB()` doesn't exist in bare firmware. It's defined by the `android` app's `android.boot.js`. A smoke test should either define a `GB` stub, or upload the android/messages boot files to exercise the real Gadgetbridge → `Bangle.emit("message"...)`/music path. I didn't dig into the stock music event flow here; that belongs to the music-app tickets.
- `jsIdle` reschedules itself with `setTimeout`, so call `jsStopIdle()` and `process.exit()` when done or Node will keep running.

## Recommended approach

1. Pin EspruinoWebIDE to a commit (as BangleApps CI does) and fetch only `emu/{emulator_banglejs2,emu_banglejs2,common}.js` (about 3 MB). Either vendor them or download them in a `pretest` script from `raw.githubusercontent.com/espruino/EspruinoWebIDE/<sha>/emu/...`. A git clone isn't needed and no extra Docker packages are needed: `node:22-bookworm` is enough.
2. Write a small `test/emulator.js` harness exposing `boot()`, `upload(name, src)`, `load(name)`, `gb(obj)`, `tap(x,y)`, `swipe(dir)`, `pressButton()`, `evalJSON(js)`, `errors()` and `screenshot() → PNG/RGBA`. To reset fast between tests, snapshot `flashMemory` after the factory reset, the same way `lib/emulator.js` does.
3. Drive it from the project's `npm run test` (e.g. `node --test`). A smoke test asserts: no `Uncaught` lines, expected state via `evalJSON`, and optionally a non-blank or golden framebuffer.

**Setup cost:** about 3 MB of vendored files (or 7.8 MB if you keep the whole `emu/` dir), zero npm dependencies, zero apt packages, no Xvfb or headless Chrome. Boot plus one smoke test takes about 0.5 s. Flakiness risk is low: everything runs in one deterministic WASM instance. The only timing sensitivity is the small real-time gaps needed for input debounce and timers.

## Screenshot feasibility

**Feasible today.** `jsGetGfxContents` gives the exact 3-bit framebuffer as RGBA. You can write a PNG with `zlib` alone (no `jimp`) or compare raw bytes directly. For a B/W theme-colour app, a pixel-exact golden-image diff is realistic because the emulator renders fonts and shapes with the same firmware code as the watch. Golden images will change when the pinned firmware changes (fonts, widgets), so they should be regenerated deliberately when we bump the pin. Widgets such as the clock and battery can make the top bar nondeterministic: either don't load widgets in screenshot tests or mask `y < Bangle.appRect.y`.

## Sources

- https://github.com/espruino/BangleApps/blob/master/bin/runapptests.js
- https://github.com/espruino/BangleApps/blob/master/bin/README.md
- https://github.com/espruino/BangleApps/blob/master/bin/thumbnailer.js
- https://github.com/espruino/BangleApps/blob/master/.github/workflows/nodejs.yml
- https://github.com/espruino/BangleApps/blob/master/apps/android/test.json
- https://github.com/espruino/EspruinoAppLoaderCore/blob/master/lib/emulator.js
- https://github.com/espruino/EspruinoWebIDE/tree/master/emu (`common.js`, `emu_banglejs2.js`, `emu_banglejs2.html`, `emulator_banglejs2.js`)
- https://www.npmjs.com/package/espruino (v0.1.67, communications CLI only)
