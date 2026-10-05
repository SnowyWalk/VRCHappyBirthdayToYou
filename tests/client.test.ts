import test from "node:test";
import assert from "node:assert/strict";
const { formatRelativeTime } = await import(new URL("../src/lib/client.ts", import.meta.url).href) as typeof import("../src/lib/client");

test("recent save times use Korean relative units at minute, hour and day boundaries", () => {
  const saved = "2026-10-05T09:00:00.000Z";
  const start = Date.parse(saved);
  assert.equal(formatRelativeTime(saved, start + 59999), "방금 전");
  assert.equal(formatRelativeTime(saved, start + 60000), "1분 전");
  assert.equal(formatRelativeTime(saved, start + 3599999), "59분 전");
  assert.equal(formatRelativeTime(saved, start + 3600000), "1시간 전");
  assert.equal(formatRelativeTime(saved, start + 86400000), "1일 전");
  assert.equal(formatRelativeTime(saved, start - 1000), "방금 전");
});
