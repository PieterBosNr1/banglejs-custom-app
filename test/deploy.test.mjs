import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const metadata = JSON.parse(fs.readFileSync(new URL("../apps/bwmusic/metadata.json", import.meta.url), "utf8"));

// Without espruino on PATH the first run downloads it with npx.
test("pnpm flash --dry-run writes every storage file and loads the app", { timeout: 300_000 }, () => {
  const out = execFileSync("node", ["tools/deploy.mjs", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
  const lines = out.trim().split("\n");

  const info = lines.find((l) => l.startsWith('require("Storage").write("bwmusic.info",'));
  assert.ok(info, `no bwmusic.info write in:\n${out}`);
  const b64 = /atob\("([^"]*)"\)/.exec(info)?.[1];
  assert.ok(b64, "info is written as base64");
  const parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  assert.deepEqual(parsed, {
    id: "bwmusic",
    name: metadata.name,
    src: "bwmusic.app.js",
    version: metadata.version,
    files: ["bwmusic.info", ...metadata.storage.map((f) => f.name)].join(","),
  });

  assert.ok(
    lines.some((l) => l.startsWith('require("Storage").write("bwmusic.app.js",') && l.includes("Hello")),
    "writes bwmusic.app.js with the app code",
  );
  assert.equal(lines.at(-1), 'load("bwmusic.app.js")');
});
