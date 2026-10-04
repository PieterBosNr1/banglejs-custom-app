import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

// Lint the fixture as if it lived in apps/, where the Espruino rules apply.
async function lintAsApp(fixture) {
  const code = fs.readFileSync(new URL(`fixtures/${fixture}`, import.meta.url), "utf8");
  const [result] = await eslint.lintText(code, { filePath: "apps/bwmusic/fixture.js" });
  return result.messages.map((m) => m.ruleId);
}

test("es-x rejects syntax Espruino cannot run", async () => {
  const rules = await lintAsApp("unsupported-syntax.js");
  for (const rule of [
    "es-x/no-destructuring",
    "es-x/no-spread-elements",
    "es-x/no-default-parameters",
    "es-x/no-exponential-operators",
    "es-x/no-optional-chaining",
  ]) {
    assert.ok(rules.includes(rule), `${rule} not reported; got ${rules.join(", ")}`);
  }
});

test("the app passes lint", async () => {
  const results = await eslint.lintFiles(["apps/"]);
  const messages = results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.message}`));
  assert.deepEqual(messages, []);
});
