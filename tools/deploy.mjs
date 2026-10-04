#!/usr/bin/env node
// pnpm flash [--dry-run] [device-name]
// Uploads apps/bwmusic to the watch over BLE with the espruino CLI and load()s it.
// --dry-run prints the generated upload code instead, without Bluetooth.
// See research/deploy-from-macos.md on the research/deploy-from-macos branch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_DIR = path.join(ROOT, "apps/bwmusic");
const ESPRUINO_NPX = "espruino@0.1.67";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const deviceName = args.find((a) => !a.startsWith("--")) || process.env.BANGLE_NAME || "Bangle.js";

const metadata = JSON.parse(fs.readFileSync(path.join(APP_DIR, "metadata.json"), "utf8"));
const id = metadata.id;
const storage = metadata.storage;
const appFile = storage.find((f) => f.name === `${id}.app.js`);
if (!appFile) throw new Error(`metadata.json storage has no ${id}.app.js`);

// Same fields the App Loader writes (EspruinoAppLoaderCore js/appinfo.js).
const info = { id, name: metadata.shortName || metadata.name, src: appFile.name };
if (metadata.type && metadata.type !== "app") info.type = metadata.type;
if (storage.some((f) => f.name === `${id}.img`)) info.icon = `${id}.img`;
info.version = metadata.version;
info.files = [`${id}.info`, ...storage.map((f) => f.name)].join(",");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bwmusic-flash-"));
const infoPath = path.join(tmp, `${id}.info`);
fs.writeFileSync(infoPath, JSON.stringify(info));

const cliArgs = [path.join(APP_DIR, appFile.url), "--storage", `${appFile.name}:-`, "--storage", `${id}.info:${infoPath}`];
for (const f of storage) {
  if (f !== appFile) cliArgs.push("--storage", `${f.name}:${path.join(APP_DIR, f.url)}`);
}
const outPath = path.join(tmp, "out.js");
if (dryRun) cliArgs.unshift("--board", "BANGLEJS2", "--no-ble");
else cliArgs.unshift("-d", deviceName);
if (dryRun) cliArgs.push("-o", outPath);

function onPath(cmd) {
  return (process.env.PATH || "").split(path.delimiter).some((dir) => {
    try {
      fs.accessSync(path.join(dir, cmd), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

const [cmd, cmdArgs] = onPath("espruino") ? ["espruino", cliArgs] : ["npx", ["--yes", ESPRUINO_NPX, ...cliArgs]];
if (!dryRun) console.log(`Flashing to "${deviceName}" (disconnect Gadgetbridge first)…`);
// In dry-run mode the CLI's chatter goes to stderr so stdout is just the upload code.
const result = spawnSync(cmd, cmdArgs, { stdio: ["inherit", dryRun ? process.stderr : "inherit", "inherit"] });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (dryRun) process.stdout.write(fs.readFileSync(outPath, "utf8"));
fs.rmSync(tmp, { recursive: true, force: true });
