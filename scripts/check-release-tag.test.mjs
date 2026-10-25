import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReleaseTag } from "./check-release-tag.mjs";

test("accepts matching version and prerelease tags", () => {
  checkReleaseTag("v0.3.0", "0.3.0");
  checkReleaseTag("v0.4.0-beta.1", "0.4.0-beta.1");
});
test("rejects mismatches and missing tags before publication", () => {
  for (const tag of [undefined, "0.3.0", "v0.2.0", "v0.3.0-beta.1"]) {
    assert.throws(() => checkReleaseTag(tag, "0.3.0"), /must match/);
  }
});
