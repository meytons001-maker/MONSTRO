import assert from "node:assert/strict";
import test from "node:test";
import { understandMission } from "./mission-profile.js";

test("understands ordinary requests as structural web missions", () => {
  const understanding = understandMission("Create a clean product landing page", false);
  assert.equal(understanding.profile, "web");
  assert.equal(understanding.artifact, "web-preview");
  assert.equal(understanding.interactivity, "structural");
  assert.equal(understanding.experienceFidelity, "advisory");
  assert.equal(understanding.acceptance[0]?.id, "preview-ok");
});

test("understands explicit rendered experiences without granting network semantics", () => {
  const understanding = understandMission("Create an immersive WebGL 3D experience with shaders", false);
  assert.equal(understanding.profile, "interactive-web");
  assert.equal(understanding.interactivity, "interactive");
  assert.equal(understanding.experienceFidelity, "advisory");
  assert.match(understanding.rationale, /interactive\/rendered/i);
});

test("public references require experience fidelity", () => {
  const understanding = understandMission("Recreate the observable experience from a public reference", true);
  assert.equal(understanding.profile, "interactive-web");
  assert.equal(understanding.experienceFidelity, "required");
});

test("returns independent acceptance contracts", () => {
  const first = understandMission("Build a site", false);
  const second = understandMission("Build another site", false);
  first.acceptance[0]!.checks!.push({ kind: "evidence.exists", source: "mutated" });
  assert.equal(second.acceptance[0]!.checks!.some((check) => check.kind === "evidence.exists" && check.source === "mutated"), false);
});
