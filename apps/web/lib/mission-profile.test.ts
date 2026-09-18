import assert from "node:assert/strict";
import test from "node:test";
import { classifyMission } from "./mission-profile.js";

test("classifies ordinary requests as structural web missions", () => {
  const profile = classifyMission("Create a clean product landing page", false);
  assert.equal(profile.id, "web");
  assert.equal(profile.experienceFidelity, "advisory");
  assert.equal(profile.acceptance[0]?.id, "preview-ok");
});

test("classifies explicit rendered experiences without granting network capabilities", () => {
  const profile = classifyMission("Create an immersive WebGL 3D experience with shaders", false);
  assert.equal(profile.id, "interactive-web");
  assert.equal(profile.experienceFidelity, "advisory");
  assert.match(profile.rationale, /interactive\/rendered/i);
});

test("public references require experience fidelity", () => {
  const profile = classifyMission("Recreate the observable experience from a public reference", true);
  assert.equal(profile.id, "interactive-web");
  assert.equal(profile.experienceFidelity, "required");
});

test("returns independent acceptance contracts", () => {
  const first = classifyMission("Build a site", false);
  const second = classifyMission("Build another site", false);
  first.acceptance[0]!.checks!.push({ kind: "evidence.exists", source: "mutated" });
  assert.equal(second.acceptance[0]!.checks!.some((check) => check.kind === "evidence.exists" && check.source === "mutated"), false);
});
