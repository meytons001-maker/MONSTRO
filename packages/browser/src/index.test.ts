import assert from "node:assert/strict";
import test from "node:test";
import { createChromiumSessionFactory } from "./index.ts";

test("requires an explicit Chromium executable", () => {
  assert.throws(() => createChromiumSessionFactory({ executablePath: "   " }), /Chromium executable path/);
});

test("creates a lazy session factory without launching during configuration", () => {
  const factory = createChromiumSessionFactory({ executablePath: "/opt/chromium", maxRequests: 12, maxConsoleEntries: 8 });
  assert.equal(typeof factory, "function");
});
