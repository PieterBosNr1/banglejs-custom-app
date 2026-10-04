# B&W Music

A black-and-white Gadgetbridge music remote for the Bangle.js 2 watch. The app lives in `apps/bwmusic/` in BangleApps format; see `CONTEXT.md` for the glossary.

## Development

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # tests run the app in the vendored emulator
```

## Flashing

The Bangle.js 2 USB cable only charges, so the app goes to the watch over Bluetooth from a Mac.

One-time setup:

1. Install the Xcode Command Line Tools: `xcode-select --install` (needed to build the Bluetooth module).
2. Install the Espruino CLI: `npm i -g espruino`. Without it, `pnpm flash` falls back to `npx espruino@0.1.67`.
3. Give your terminal app Bluetooth access under *System Settings → Privacy & Security → Bluetooth*. If `pnpm flash` fails with `Abort trap: 6`, the permission is missing.

Every flash:

1. On the phone, **disconnect Gadgetbridge** from the watch. The watch accepts one Bluetooth connection at a time; also close any Web IDE or App Loader tab.
2. `pnpm flash` — uploads every file in `apps/bwmusic/metadata.json` plus a generated `bwmusic.info`, then starts the app.
   - It connects to the first watch whose name contains `Bangle.js`. To pick one, pass its name: `pnpm flash "Bangle.js abcd"` or set `BANGLE_NAME`. `espruino --list` shows what is advertising.
3. Reconnect Gadgetbridge.

`pnpm flash --dry-run` prints the generated upload code without using Bluetooth.
