# Deploying an app to Bangle.js 2 from a macOS script

Ticket: #4 · Map: #1 · Researched 2026-10-04 against primary sources (no real device was connected).

## Answer

Use the **`espruino` npm CLI (EspruinoTools) over Bluetooth LE**. Bangle.js 2 has **no USB data**: the cable only charges the watch. Pass each app file with `--storage name:path` and the main app file with `--storage <id>.app.js:-`. The CLI writes every file to Storage and then runs `load("<id>.app.js")`, so the new app starts straight away. BLE on macOS comes from the optional `@abandonware/noble` module. It compiles a native addon during install, and the terminal app needs macOS Bluetooth permission. The watch takes only **one BLE connection at a time**, so Gadgetbridge (or any Web IDE or App Loader tab) must disconnect before you deploy.

```sh
# one-off install (global) — or add `espruino` as a devDependency, see pnpm gotcha below
npm install -g espruino

# find the watch (it advertises as "Bangle.js abcd", the last 4 hex digits of its MAC)
espruino --list

# deploy + run
espruino -d "Bangle.js abcd" \
  src/app.js --storage myapp.app.js:- \
  --storage myapp.info:build/myapp.info \
  --storage myapp.img:build/myapp.img
```

## 1. Transport: BLE only. USB is charge-only

- Bangle.js 2 page: "The supplied charge cable connects to a USB port to charge Bangle.js (despite there being 4 wires, those are for SWD programming and there is no USB data connection)." The same page also says USB firmware updates are not possible and firmware updates go over Bluetooth. Source: https://www.espruino.com/Bangle.js2
- In practice, a Mac script has to use BLE (Nordic UART service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`, which both the CLI and the CLI App Loader look for). The other option is the WebRTC "remote" bridge through a phone (see §5).

## 2. Tool options compared

| Option | Scriptable? | Notes |
|---|---|---|
| **`espruino` CLI** (EspruinoTools) | Yes | Recommended. `--storage` writes arbitrary files, `-d` picks a device by name, `-e` runs an expression. Maintained alongside the firmware ("tend to have support for various features and edge cases that other tools might not"). Source: [EspruinoTools README](https://github.com/espruino/EspruinoTools/blob/master/README.md) |
| `core/tools/apploader.js` (EspruinoAppLoaderCore, inside BangleApps as `core/`) | Yes | `apploader.js install <appid> [addr]`. Must run inside a **BangleApps-shaped checkout**: it reads `apps/*/metadata.json` (or `apps.json`) relative to `core/`. It needs `@abandonware/noble` installed by hand, refuses apps with HTML customisation, and only takes a MAC address, which macOS does not expose (see §4). Without an address it uses the first device whose name starts with `Bangle.js`. Source: [tools/apploader.js](https://github.com/espruino/EspruinoAppLoaderCore/blob/master/tools/apploader.js), [lib/apploader.js](https://github.com/espruino/EspruinoAppLoaderCore/blob/master/lib/apploader.js), [BangleApps bin/README](https://github.com/espruino/BangleApps/blob/master/bin/README.md) |
| BangleApps `bin/` | No | Contains no deploy tool. It has `sanitycheck.js`, `create_apps_json.sh`, `runapptests.js` (an emulator-test prototype) and similar. Its README points to `core/tools` for the "command-line based app loader". Source: [bin/README.md](https://github.com/espruino/BangleApps/blob/master/bin/README.md) |
| Custom/forked App Loader (fork BangleApps and enable GitHub Pages, or serve a local checkout) | No | Runs in the browser over Web Bluetooth (Chrome/Edge). Good for packaging later, but it can't run headless from a script. Source: [BangleApps README → Testing → Online](https://github.com/espruino/BangleApps/blob/master/README.md#online) |
| Web IDE "Storage" upload | No | Manual. This is the GUI version of what the CLI's `--storage` does. Source: [BangleApps README → Offline](https://github.com/espruino/BangleApps/blob/master/README.md#offline) |

## 3. What gets written, and a minimal invocation

### Files on the watch
From the [BangleApps README, "What filenames are used"](https://github.com/espruino/BangleApps/blob/master/README.md#what-filenames-are-used): `appid.app.js` (code), `appid.info` (launcher JSON), `appid.img` (icon), `appid.boot.js`, `appid.wid.js`, `appid.settings.js`, `appid.json` (settings). Filenames can be at most **28 chars**, so keep the app id under about 20.

The App Loader normally generates `appid.info` from `metadata.json`, so a script has to write it itself. The fields the App Loader sets are `name` (shortName), `type` (omitted for `"app"`), `src` = `appid.app.js`, `icon` = `appid.img`, `version` and `files` (a comma-separated list, used for uninstall). Source: [EspruinoAppLoaderCore js/appinfo.js](https://github.com/espruino/EspruinoAppLoaderCore/blob/master/js/appinfo.js) and [BangleApps README → app.info format](https://github.com/espruino/BangleApps/blob/master/README.md#appinfo-format).

```json
{"id":"myapp","name":"Music","src":"myapp.app.js","icon":"myapp.img","version":"0.01","files":"myapp.info,myapp.app.js,myapp.img"}
```

### CLI flags that matter
From the CLI help in the [EspruinoTools README](https://github.com/espruino/EspruinoTools/blob/master/README.md):
- `-d deviceName`: connect to the first device whose name contains `deviceName`.
- `-p aa:bb:cc:dd:ee`: connect by Bluetooth address. On macOS this is a CoreBluetooth UUID (see §4).
- `--list`: list available devices and exit.
- `--storage fn:data.bin`: load `data.bin` from disk and write it to Storage as `fn`.
- `--storage fn:-`: store the program code (the positional JS file) in Storage file `fn`.
- `-e expr`: evaluate an expression. With no file, the device is not reset.
- `-m`: minify. `-t`: set the watch time. `-w`: watch the file and re-upload on change. `--no-ble`: skip noble.
- `--board BANGLEJS2 ... -o out.js`: no connection at all. It writes the exact JS that would be sent.

Behaviour, verified in source ([bin/espruino-cli.js](https://github.com/espruino/EspruinoTools/blob/master/bin/espruino-cli.js), [core/codeWriter.js](https://github.com/espruino/EspruinoTools/blob/master/core/codeWriter.js)):
- A `fn:-` target sets `SAVE_ON_SEND=3` (upload to Storage) and `LOAD_STORAGE_FILE=2`. After the upload the CLI sends `load("fn")`, so **the app starts automatically**.
- Data files (`fn:path`) get `require("Storage").write(...)` calls in front of the code.
- `RESET_BEFORE_SEND` defaults to `true`, so the watch is `reset()` before the upload.

### Dry run (verified locally, no device)
I ran this with `espruino` 0.1.67 on Node 22 on macOS:

```sh
npx espruino --board BANGLEJS2 --no-ble app.js \
  --storage hello.app.js:- --storage hello.info:hello.info -o out.js
```
`out.js` contained exactly:
```js
require("Storage").write("hello.info",atob("eyJpZCI6ImhlbGxv..."),0,69)
require("Storage").write("hello.app.js","g.clear();...",0,58);
load("hello.app.js")
```
This mode never touches Bluetooth. It can run inside Sandcastle's Docker container as a CI check that the deploy payload builds. Only the real send needs the Mac.

### Other useful one-liners
```sh
espruino -d "Bangle.js abcd" -e 'load()'                                # back to clock (also rebuilds .boot0 if needed)
espruino -d "Bangle.js abcd" -e 'require("Storage").list(/^myapp\./)'   # check what's on the watch
espruino -d "Bangle.js abcd" --download myapp.json                       # pull a Storage file
```

### On-watch side effects you can rely on
- **Boot code**: `.boot0` is regenerated whenever the hash of `setting.json` plus all `*.js` Storage files changes, because `bootupdate.js` embeds a CRC check. After you upload a new `myapp.boot.js`, a `load()` or reboot picks it up with no extra step. Source: [apps/boot/bootupdate.js](https://github.com/espruino/BangleApps/blob/master/apps/boot/bootupdate.js)
- **Launcher**: the default launcher caches its app list in `launch.cache.json`, keyed on `Storage.hash(/\.info/)`. Writing a new `.info` invalidates the cache automatically. Source: [modules/launch_utils.js](https://github.com/espruino/BangleApps/blob/master/modules/launch_utils.js)

### Programmatic alternative
`require("espruino")` gives you `init`, `sendFile(port, file, cb)`, `sendCode`, `expr` and `statement`. These are fine for Node scripts, but the module "prints a lot of debug information". Source: [EspruinoTools README → NPM Module](https://github.com/espruino/EspruinoTools/blob/master/README.md#npm-module). A shell wrapper around the CLI is simpler.

## 4. BLE on macOS

- **Noble is optional and compiled at install.** The `espruino` package lists `@abandonware/noble` under `optionalDependencies` ([package.json](https://github.com/espruino/EspruinoTools/blob/master/package.json)). The README says that without it "you just won't get BLE support". On macOS the CLI loads `@abandonware/noble`, then falls back to `noble` ([core/serial_noble.js](https://github.com/espruino/EspruinoTools/blob/master/core/serial_noble.js)). Version 1.9.2-26 has an `install: node-gyp-build` script and its npm tarball ships **no prebuilt binaries**, so it compiles with node-gyp. I confirmed that it built `noble.node` on this Mac. That needs Xcode Command Line Tools: the noble README lists Xcode as an OS X prerequisite ([noble README](https://github.com/abandonware/noble#os-x)). If the build fails, the optional dependency is silently skipped and `--list` shows no BLE devices.
- **Bluetooth privacy permission.** noble README: "On newer versions of OSX, the terminal app is sandboxed to not allow bluetooth connections by default. If you run a script that tries to access it, you will get an `Abort trap: 6` error." The fix is to add the terminal app (Terminal, iTerm, VS Code, …) under *System Settings → Privacy & Security → Bluetooth*. Source: [noble README → Sandboxed terminal](https://github.com/abandonware/noble#sandboxed-terminal). Espruino's troubleshooting page describes the same fix for Chrome and Web Bluetooth ([Troubleshooting BLE](https://www.espruino.com/Troubleshooting+BLE)).
- **No MAC addresses on macOS.** noble README: "On macOS, the address will be set to '' if the device has not been connected previously." EspruinoTools then uses `dev.address || dev.uuid` as the port path, so `--list` on a Mac shows a **CoreBluetooth UUID**, not `aa:bb:…`. That UUID is specific to this Mac. Prefer `-d "Bangle.js abcd"` (by name) in the script. The CLI App Loader's address argument expects a MAC, so on macOS it only works in "first Bangle.js found" mode.
- **No pairing needed.** The CLI connects to the Nordic UART service directly. The pairing step in the docs is for Windows (Quick Start BLE). Requirement: OS X Yosemite or later with BLE hardware ([Troubleshooting BLE](https://www.espruino.com/Troubleshooting+BLE)).

## 5. Gotchas

1. **One connection at a time / Gadgetbridge.** "Espruino BLE devices can only accept one incoming connection at a time. When a device is connected to it, it stops advertising and so cannot be connected to until the first device disconnects… It may even be *an application on the same device*." Source: [Troubleshooting BLE](https://www.espruino.com/Troubleshooting+BLE). The Gadgetbridge docs likewise say to disconnect the computer before connecting Gadgetbridge, and to "disconnect Gadgetbridge, connect with the Web IDE" for debugging ([Gadgetbridge](https://www.espruino.com/Gadgetbridge)). So the deploy checklist must say: **disconnect the watch in Gadgetbridge first, and close any Web IDE or App Loader tab, then reconnect Gadgetbridge afterwards** to test music. Another route is the Gadgetbridge "Web IDE Remote" bridge plus `espruino --remote <peer-id>`. It avoids the disconnect but depends on the phone and a WebRTC session, so it's fragile for scripted use.
2. **The watch must be awake and in range.** If `-d` doesn't find it, run `espruino --list` to see what is advertising.
3. **pnpm 10 skips dependency build scripts by default.** This repo uses `pnpm@10.12.4`, so adding `espruino` as a devDependency won't compile noble unless `@abandonware/noble` is allowed via `pnpm.onlyBuiltDependencies` (or `pnpm approve-builds`). Without it you get no BLE, silently. Source: [pnpm v10.0.0 release notes](https://github.com/pnpm/pnpm/releases/tag/v10.0.0). A global `npm i -g espruino` avoids this.
4. **Native module vs Node version.** noble is a native addon built against the current Node. After switching Node versions, rebuild it (`npm rebuild` or reinstall).
5. **Reset on upload.** `RESET_BEFORE_SEND=true` means the running app and its in-RAM state are wiped. That's expected. Persistent state belongs in `myapp.json`.
6. **Icons.** In BangleApps, `app-icon.js` is a JS *expression* (`"evaluate":true`) that the App Loader evaluates on the watch. With the CLI, either upload a pre-built binary image file or write it with `-e 'require("Storage").write("myapp.img", require("heatshrink").decompress(atob("…")))'`.
7. **Filename limit.** Storage names can be at most 28 chars ([BangleApps README](https://github.com/espruino/BangleApps/blob/master/README.md#what-filenames-are-used)).
8. **Docker can't deploy.** The Sandcastle container has no Bluetooth. Only the `--board BANGLEJS2 -o out.js` dry run belongs there. The real `espruino -d …` runs on the Mac, run by a human.

## Suggested shape for the repo's deploy script

`scripts/deploy.sh <appid>` (runs on the Mac):
1. Build `build/<id>.info` from `apps/<id>/metadata.json`, using the same fields as `appinfo.js`.
2. Run `espruino -d "${BANGLE_NAME:-Bangle.js}" apps/<id>/app.js --storage <id>.app.js:- --storage <id>.info:build/<id>.info [--storage <id>.img:… --storage <id>.boot.js:apps/<id>/boot.js …]`.
3. Print the manual checklist: Gadgetbridge disconnected before the run, app appears in the launcher, then reconnect Gadgetbridge and play music.

Keeping the BangleApps `apps/<id>/metadata.json` layout also keeps `core/tools/apploader.js install <id>` available as a fallback later.
