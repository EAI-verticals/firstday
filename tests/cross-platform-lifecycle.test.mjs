import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("prepare uses Husky's cross-platform entry point", () => {
  assert.equal(packageJson.scripts.prepare, "husky");
  assert.doesNotMatch(packageJson.scripts.prepare, /\b(if|then|fi)\b|\$HUSKY/);
});
