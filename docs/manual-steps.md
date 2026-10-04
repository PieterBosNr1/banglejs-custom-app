# Manual steps

Sandcastle runs AFK in Docker and cannot reach the watch, so two steps need a human with the Bangle.js 2 in hand. Both are also listed in the **Device check** section of their issue.

## Before either step: one-time Mac setup

The Bangle.js 2 USB cable only charges; everything goes over Bluetooth.

1. Install the Xcode Command Line Tools: `xcode-select --install` (needed to build the Bluetooth module).
2. Install the Espruino CLI globally: `npm i -g espruino`.
3. Give your terminal app Bluetooth access: *System Settings → Privacy & Security → Bluetooth*.
   - The permission belongs to the **app that hosts the terminal** you run `pnpm flash` in, not to the shell or `node`. Find it with `echo $TERM_PROGRAM`:
     - `Apple_Terminal` → **Terminal**
     - `iTerm.app` → **iTerm**
     - `vscode` → the editor's built-in terminal: grant **Cursor** or **Visual Studio Code** (Cursor reports `vscode` too).
   - macOS usually asks on the first Bluetooth use; click **Allow**. If you denied it earlier, or `pnpm flash` fails with `Abort trap: 6`, switch the app on in that settings pane (add it with **+** if it isn't listed) and restart the app.

## 1. First flash to the watch

Issue: [Deploy: pnpm flash + first device check](https://github.com/PieterBosNr1/banglejs-custom-app/issues/12)

1. On the phone, **disconnect Gadgetbridge** from the watch (the watch accepts one Bluetooth connection at a time).
2. In the repo: `pnpm flash`.
3. Check: "Hello" appears in your theme colours, and BTN1 returns to the clock.
4. Reconnect Gadgetbridge.
5. On the issue, remove the `device-check` label. If something failed, open a `bug` issue instead.

## 2. Uninstall Music Controls (`gbmusic`)

Issue: [Auto-open + replace gbmusic](https://github.com/PieterBosNr1/banglejs-custom-app/issues/16)

Do this once that issue is closed with the `device-check` label; until then `gbmusic` is still the app that opens on music.

1. Disconnect Gadgetbridge, open the App Loader at https://banglejs.com/apps in Chrome and connect to the watch.
2. Under **My Apps**, uninstall **Music Controls** (`gbmusic`). Keep **Android Integration**, **Messages** and the **Messages UI**.
3. Disconnect the App Loader, then run `pnpm flash`.
4. Check: on the clock, start music on the phone → B&W Music opens, the screen wakes, no vibration, no colours. Long-press BTN1 to leave; skipping a track keeps you on the clock; pause then play opens it again.
5. Reconnect Gadgetbridge and remove the `device-check` label (or open a `bug` issue).

To confirm `gbmusic` is gone, run `require("Storage").list(/^gbmusic\./)` in the [Espruino Web IDE](https://www.espruino.com/ide); it should print `[]`.
