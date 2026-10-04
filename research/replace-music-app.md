# How the existing music app opens itself, and how to replace it

Resolves [#3](https://github.com/PieterBosNr1/banglejs-custom-app/issues/3) (map: #1).

**Sources** (all primary, checked 2026-10-04):

- BangleApps at commit [`8d19b0b`](https://github.com/espruino/BangleApps/tree/8d19b0b574b6d19bce7b197a004ada3c11316e21) (2026-10-02). Paths below are relative to that tree; `L` = line number.
- Espruino Gadgetbridge docs source: [`EspruinoDocs/info/Gadgetbridge.md`](https://github.com/espruino/EspruinoDocs/blob/master/info/Gadgetbridge.md) (rendered at https://www.espruino.com/Gadgetbridge).
- Gadgetbridge (Android) source, codeberg `master` at `54c63d0`: [`BangleJSDeviceSupport.java`](https://codeberg.org/Freeyourgadget/Gadgetbridge/src/branch/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/banglejs/BangleJSDeviceSupport.java), [`GBDeviceEventMusicControl.java`](https://codeberg.org/Freeyourgadget/Gadgetbridge/src/branch/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/deviceevents/GBDeviceEventMusicControl.java).

## TL;DR

- Two apps can auto-open music controls on a Bangle.js 2 with Gadgetbridge:
  1. **`gbmusic`** ("Gadgetbridge Music Controls", shown as "Music Controls"). It is almost certainly the one the user means. Its `gbmusic.boot.js` wraps the global `GB()` function, **swallows** every `musicinfo`/`musicstate` event, and calls `load("gbmusic.app.js")` once the state is `play`, track info is known, `autoStart` is on, and a clock is showing.
  2. **`messagegui`** (the default Messages UI), but only if *Messages → Auto-Open Music* is on. That setting is off by default. It never fires while `gbmusic` is installed, because `gbmusic` eats the music events first.
- **Where the startup colours come from:** `gbmusic`'s `infoColor()` gives the title, artist and album each a pseudo-random hue taken from a hash of the text (`E.HSBtoRGB(h, 0.7, b)`; on a 3-bit display it picks a fully saturated primary colour). The README advertises this as "Dynamic colors based on Track/Artist/Album name". Opening `gbmusic` by hand the first time also shows an `E.showPrompt` asking whether to auto-load.
- **How to replace it:** uninstall `gbmusic` (and `messagesmusic` if it is installed). **Keep** `android`, `messages` and `messagegui`, because they handle the transport, `Bangle.musicControl` and notifications. Ship our own `<id>.boot.js` that copies `gbmusic`'s pattern: defer with `setTimeout`, wrap `GB`, swallow the music events, `load()` our app when playing on the clock, and route events to the app while it is open. Use only `g.theme.fg` and `g.theme.bg`.
- **Wire format:** the phone sends `\x10GB({"t":"musicinfo","artist","album","track","dur","c","n"})` and `GB({"t":"musicstate","state":"play"|"pause"|"stop"|"","position","shuffle","repeat"})`. The watch replies with a line of JSON, `{"t":"music","n":"play"|"pause"|"playpause"|"next"|"previous"|"volumeup"|"volumedown"}`. The easiest way to send it is `Bangle.musicControl(cmd)`, which the `android` boot code provides.

## 1. Which apps are involved

| App | Role in music | Evidence |
|---|---|---|
| `android` ("Android Integration") | Transport layer. Defines the global `GB()` handler that Gadgetbridge calls, sends replies over BLE UART, and provides `Bangle.musicControl`. It turns `musicinfo`/`musicstate` into a `messages` entry with `id:"music"`. | `android/boot.js` L7-13 (wraps `global.GB`), L38-41 (`Bangle.musicControl`); `android/lib.js` L1-4 (`gbSend`), L39-53 (music + `audio` handlers) |
| `messages` (library) | Stores messages and emits `Bangle.on("message", type, msg)`. `type` is `"music"` when `msg.id==="music"`. Each `state==="play"` marks the music message `new`. | `messages/lib.js` L5-10, L28-30 |
| `messagegui` | Default Messages UI. Its boot listener can load `messagegui.app.js` and show a music screen with play/pause/next buttons. | `messagegui/boot.js` L1; `messagegui/lib.js` L35-36, L80-90; `messagegui/app.js` L216-300 |
| `gbmusic` | Standalone music-controls app with its own boot hook and auto-start. | `gbmusic/metadata.json`, `gbmusic/boot.js`, `gbmusic/app.js` |
| `messagesmusic` | A launcher shortcut only. It pushes a fake `{id:"music",state:"show"}` message to open the `messagegui` music screen. It does not auto-open anything. | `messagesmusic/app.js` (one line), `messagesmusic/README.md` |

## 2. The auto-open mechanisms

### 2a. `gbmusic` (most likely the user's "existing music app")

`gbmusic/boot.js` (whole file, 38 lines):

- **L1, L38:** the whole body runs in `setTimeout(..., 1)`, "so we override e.g. android.boot.js GB". The wrapper is therefore installed *after* every other boot file has wrapped `GB`, which makes it the outermost wrapper. It sees events first.
- **L3:** `const APP = globalThis.__FILE__==="gbmusic.app.js"`. Boot code runs again on every `load()`, so the same hook acts as an "auto-opener" when another app is running and as an "event router" when `gbmusic` itself is running.
- **L4:** `autoStart` is read from `gbmusic.json`. The settings default is `true` (`gbmusic/settings.js` L9-12).
- **L24-37:** `globalThis.GB = (_GB => e => { switch(e.t) { case "musicinfo": ... case "musicstate": ... default: if (_GB) setTimeout(_GB, 0, e); } })(globalThis.GB);`. The comment reads *"we eat music events!"*. Music events are **not** passed on to `android`, so `messages`/`messagegui` never see them. Every other event is forwarded.
- **L12-21 `check()`:** this only launches when `s.state==="play"` **and** a `musicinfo` has been seen **and** `autoStart` is on **and** `Bangle.CLOCK` is set (a clock face is in the foreground). It then writes `{state, info}` to `gbmusic.load.json` and calls `load("gbmusic.app.js")`.
- **Inside the app** (`APP` true), events go to the app's global `info(e)` / `state(e)` functions (L29, L32). Those are top-level function declarations in `gbmusic/app.js` (L240, L270).

`gbmusic/app.js` startup and auto-close:

- **L486-497 `init()`:** reads and erases `gbmusic.load.json`. If the file existed, sets `auto = true` and replays the saved info and state.
- **L499-514:** if `autoStart` has never been set, a manual launch shows `E.showPrompt("Automatically load\nwhen playing music?")`.
- **L283-301 (auto-close, only when auto-opened):** on `stop` it calls `load()` (back to the clock). The source comments that `stop` "never actually happens with my phone". On `play` it sets an inactivity timeout of `dur*2000` ms, falling back to 1 h (`IOUT`, L8). On `pause` it sets a 5-minute timeout (`POUT`, L7) and, on Bangle.js 1 only, fades the colours out.

### 2b. `messagegui` (only if "Auto-Open Music" is on)

- `android/lib.js` L40-49: `musicstate` (only when the state changed) and `musicinfo` both become `require("messages").pushMessage({t:"modify", id:"music", title:"Music", ...})`.
- `messages/lib.js` L28-30: `state==="play"` sets `event.new = true`. L5-10: emits `Bangle.emit("message", "music", msg)`.
- `messagegui/boot.js` L1: `Bangle.on("message", (type,msg)=>require("messagegui").listener(type,msg))`.
- `messagegui/lib.js` L35-36: for music, `loadMessages = Bangle.CLOCK && msg.state && msg.title && appSettings.openMusic`. L60-73 waits 500 ms and then calls `exports.open(msg)`, which runs `Bangle.load("messagegui.app.js")` (L89).
- The setting is `messages.settings.json` → `openMusic`, labelled "Auto-Open Music" in `messages/settings.js` L67-69, defaulting to `false` (L17).
- The colours on this screen come from the theme's highlight pair `g.theme.bg2`/`g.theme.fg2` for the artist/album header, plus a coloured app icon from `messageicons` (`messagegui/app.js` L271-276).

### Which one does the user have?

We can't tell from source alone. The "colours at startup" match `gbmusic` closely: random-hue text on every track change, and on Bangle.js 2 a bright primary colour per field. To confirm on the watch, run `require("Storage").list(/^gbmusic\./)` in the Web IDE, or look for "Music Controls" in the launcher.

## 3. Why colours appear

`gbmusic/app.js`:

- **L43-50 `textCode()`:** sums the character codes of a string, mod 360.
- **L58-82 `infoColor(name)`:** the hue comes from the title, album and artist text. When `g.getBPP()===3` (Bangle.js 2's 3-bit display), it picks `rgb = [code&1, code&2, code&4]`, which is one of the 8 primary/secondary colours at full brightness, and inverts it only if it equals the background (L69-76). Otherwise it uses `E.HSBtoRGB(h/360, 0.7, brightness())` (L79-80).
- **L245-248:** `layout.title.col / album.col / artist.col = infoColor(...)` runs on every `musicinfo`, so the colours change with every track.
- **L213 (Bangle.js 1 only):** red and green volume `+`/`-` indicators.

The README's feature list says it directly: "Dynamic colors based on Track/Artist/Album name" (`gbmusic/README.md`). There is no setting to turn it off. **Implication for us:** draw everything with `g.theme.fg` on `g.theme.bg`. Also avoid `bg2`/`fg2`/`bgH`/`fgH`, which `messagegui` uses for its coloured header.

## 4. Message shapes (phone → watch)

Framing: Gadgetbridge sends `"\u0010GB(" + json + ")\n"` (`BangleJSDeviceSupport.java` `uartTxJSON`, L504; docs `Gadgetbridge.md` L195). `\x10` turns off REPL echo, so the line simply calls the global `GB(obj)`.

**`musicinfo`**: `BangleJSDeviceSupport.java` `onSetMusicInfo`, L1680-1692:

```js
{ t:"musicinfo", artist:string, album:string, track:string,
  dur:number,   // duration in seconds (gbmusic uses dur*2000 ms = 2× song length)
  c:number,     // track count (gbmusic notes it has seen c:-1)
  n:number }    // track number
```

- `artist`, `album` and `track` go through `renderUnicodeAsImage()`, so characters the watch font can't render may arrive as embedded image escapes.
- Any field can be empty or missing. `android/lib.js` L47 defaults `album` to `""`, and `gbmusic` uses `info.track || ""`.

**`musicstate`**: `onSetMusicState`, L1659-1676:

```js
{ t:"musicstate",
  state: "play" | "pause" | "stop" | "",   // index into {"play","pause","stop",""}; negative/out-of-range → ""
  position:number,  // playback position (seconds)
  shuffle:number, repeat:number }
```

- Both are sent only when `mediaManager` reports a change (L1660, L1681). `android/lib.js` L41 also dedupes `musicstate` by `state`.
- **`stop` is unreliable in practice:** `gbmusic/app.js` L285 says it "never actually happens with my phone". Auto-close needs timeouts, as `gbmusic` uses.

**`audio`** (phone volume): `onSetPhoneVolume`, L1700-1708 sends `{t:"audio", v:<float volume>}`. `android/lib.js` L50-53 re-emits it as `Bangle.emit("musicVolume", v)`. The `android` comment calls it a "percentage of max volume for android STREAM_MUSIC". `gbmusic` passes `audio` on to `android` because it only eats `musicinfo`/`musicstate`.

Documented examples (`Gadgetbridge.md` L212-213, L244-245):

```
GB({"t":"musicstate","state":"play","position":0,"shuffle":1,"repeat":1})
GB({"t":"musicinfo","artist":"My Artist","album":"My Album","track":"Track One","dur":241,"c":2,"n":2})
```

These lines can be pasted straight into the emulator or Web IDE console to simulate the phone. `gbmusic/app.js` L464-473 does the same for its emulator mode.

## 5. Sending commands (watch → phone)

- **Protocol:** Gadgetbridge parses any line starting with `{` as JSON (`Gadgetbridge.md` L258-260). For `t:"music"` it does `GBDeviceEventMusicControl.Event.valueOf(n.toUpperCase())` (`BangleJSDeviceSupport.java` L576-580).
- **Valid `n` values** (enum in `GBDeviceEventMusicControl.java` L53-64): `play`, `pause`, `playpause`, `next`, `previous`, `volumeup`, `volumedown`, `forward`, `rewind`. The Espruino docs (L269) list only `play/pause/next/previous/volumeup/volumedown`. `gbmusic` uses `playpause` successfully (L392-394).
- **Preferred call:** `Bangle.musicControl(cmd)`, defined by `android/boot.js` L38-41 and forwarding to `require("android").gbSend({t:"music", n:cmd})`.
- **Raw equivalent** (what `gbmusic` does, `app.js` L372-374; also `android/lib.js` L1-4):

  ```js
  Bluetooth.println("");                                   // flush any partial line
  Bluetooth.println(JSON.stringify({t:"music", n:"playpause"}));
  ```

- **Volume:** the watch can only send relative `volumeup`/`volumedown`; there is no absolute set. The current level arrives via `audio` → `Bangle.on("musicVolume", v)`.
- **Emulator:** `Bluetooth.println` may not exist there. `gbmusic` stubs it to `console.log` (L465-468). A pure "command sender" seam makes this easy to unit-test.

## 6. Concrete replacement plan

**On the watch (one-time, human step):**

1. **Uninstall `gbmusic`** in the App Loader. Its boot hook is the outermost `GB` wrapper and swallows music events, and a second auto-opener would race ours. Uninstalling also removes `gbmusic.json` / `gbmusic.load.json` (listed under `data`).
2. Uninstall `messagesmusic` if installed (optional, it is only a shortcut).
3. **Keep `android`, `messages`, `messagegui`.** `android` provides `GB()` and `Bangle.musicControl`. The Messages apps still handle notifications and calls. Leave *Messages → Auto-Open Music* off (the default). Because our boot hook will swallow music events, it can't fire anyway.
4. After installing or uninstalling, the bootloader rebuilds `.boot0` automatically (`boot/bootupdate.js`).

**Files our app ships**, in BangleApps layout, with id `<id>`:

| Storage file | Purpose |
|---|---|
| `<id>.boot.js` | Auto-open plus event routing (below) |
| `<id>.app.js` | The black-and-white UI |
| `<id>.img` | Icon (`"evaluate":true` from an `icon.js`) |
| `<id>.settings.js` | Optional (e.g. auto-start toggle) |
| data: `<id>.json`, `<id>.load.json` | Settings, plus a hand-off of `{info,state}` from boot to app |

`metadata.json` needs `"type":"app"` and `"supports":["BANGLEJS2"]`. Model it on `gbmusic/metadata.json`. Consider adding `"dependencies":{"android":"app"}` so `Bangle.musicControl` is guaranteed.

**Boot hook outline**, copied from `gbmusic/boot.js`:

```js
setTimeout(() => {                         // run after android.boot.js so we are the outermost GB wrapper
  const APP = globalThis.__FILE__ === "<id>.app.js";
  let info, state;
  globalThis.GB = (prev => e => {
    if (e.t === "musicinfo" || e.t === "musicstate") {   // swallow: keeps messagegui from opening
      if (e.t === "musicinfo") info = e; else state = e;
      if (APP) return globalThis.<idHandler>(e);
      if (state && state.state === "play" && info && Bangle.CLOCK /* && autoStart */) {
        require("Storage").writeJSON("<id>.load.json", {info, state});
        load("<id>.app.js");
      }
      return;
    }
    if (prev) setTimeout(prev, 0, e);       // everything else (incl. "audio") → android
  })(globalThis.GB);
}, 1);
```

Why each part:

- **The `setTimeout`:** the bootloader orders `*.boot.js` by name, with numbered `foo.N.boot.js` first (`boot/bootupdate.js` L102-115). The 1 ms defer makes our order independent of the app id.
- **Swallowing the events:** this keeps music out of `messages`. The trade-off is that `messagegui`'s music screen and its "Music" list entry stop updating. That is the intended outcome.
- **`Bangle.CLOCK`:** limiting auto-open to clock faces avoids hijacking another running app. This is the same rule as `gbmusic` L13 and `messagegui/lib.js` L36.
- **The app** reads and erases `<id>.load.json` on start (like `gbmusic/app.js` L488-489) and remembers that it was auto-opened. It then auto-closes with `load()`:
  - on `stop`;
  - after a pause timeout (`gbmusic` uses 5 min);
  - after an inactivity timeout (`dur*2` or 1 h).

  `stop` is unreliable, and a phone disconnect sends no music event. Disconnect handling (`NRF.on("disconnect")`) is an open edge case already listed on the map.

**Colours:** use `g.theme.fg` / `g.theme.bg` only. Avoid `Layout` `bgCol: g.theme.bg2` and the `messageicons` images.

## Open points / caveats

- We could not confirm whether the user's watch runs `gbmusic`, `messagegui` with Auto-Open Music, or both. Check on the device (see §2).
- How often Gadgetbridge sends `musicstate` and `position` depends on the Android media session. Treat both as best-effort.
- The `audio` (`v`) message's exact scale is float as sent by Gadgetbridge. The `android` comment calls it a percentage; check this on the device before showing a number.
