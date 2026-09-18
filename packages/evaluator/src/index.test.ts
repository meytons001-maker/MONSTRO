import assert from "node:assert/strict";
import test from "node:test";
import type { AcceptanceCriterion, Evidence, RuntimeResult } from "@monstro/contracts";
import { evaluateAcceptance } from "./index.js";

const runtime: RuntimeResult = { ok: true, stdout: "", stderr: "", durationMs: 1 };
const evidence: Evidence[] = [
  { source: "preview:document", kind: "visual", summary: "document", data: { title: "MONSTRO Preview", h1: "MONSTRO LIVE PREVIEW" } },
  { source: "preview:dom", kind: "visual", summary: "dom", data: { main: 1, headings: 2 } },
];

const criteria: AcceptanceCriterion[] = [{
  id: "preview",
  description: "Preview must be reachable and structurally valid",
  required: true,
  repairTargetPath: "preview.mjs",
  checks: [
    { kind: "runtime.ok" },
    { kind: "evidence.exists", source: "preview:document" },
    { kind: "evidence.field.equals", source: "preview:document", field: "title", expected: "MONSTRO Preview" },
    { kind: "evidence.field.includes", source: "preview:document", field: "h1", expected: "MONSTRO LIVE" },
    { kind: "evidence.field.min", source: "preview:dom", field: "main", expected: 1 },
  ],
}];

test("accepts when all executable checks pass", () => {
  const result = evaluateAcceptance(criteria, runtime, evidence);
  assert.equal(result.accepted, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.findings, []);
});

test("creates repairable findings when checks fail", () => {
  const broken = evidence.map((item) => item.source === "preview:document" ? { ...item, data: { title: "Wrong", h1: "Broken" } } : item);
  const result = evaluateAcceptance(criteria, runtime, broken);
  assert.equal(result.accepted, false);
  assert.equal(result.findings.length, 2);
  assert.equal(result.nextActions.length, 2);
  assert.ok(result.nextActions.every((action) => action.targetPath === "preview.mjs"));
});

test("optional failures warn without blocking delivery", () => {
  const optional: AcceptanceCriterion[] = [{ id: "optional", description: "Optional marker", required: false, checks: [{ kind: "evidence.exists", source: "missing" }] }];
  const result = evaluateAcceptance(optional, runtime, evidence);
  assert.equal(result.accepted, true);
  assert.equal(result.score, 0);
  assert.equal(result.findings[0]?.severity, "warning");
});

test("compares rendered reference experience with produced preview", () => {
  const compared: Evidence[] = [
    ...evidence,
    { source: "browser:experience", kind: "code", summary: "reference", data: { canvasCount: 1, interactiveRequests: 2, technologies: ["three.js"] } },
    { source: "preview:experience", kind: "code", summary: "preview", data: { canvasCount: 0, interactiveAssets: 0, technologies: [] } },
  ];
  const result = evaluateAcceptance(criteria, runtime, compared);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.findings.map((finding) => finding.code), ["experience.canvas.missing", "experience.assets.missing", "experience.technology.missing"]);
  assert.ok(result.findings.every((finding) => finding.severity === "warning"));
  assert.equal(result.nextActions.length, 3);
  assert.ok(result.nextActions.every((action) => action.targetPath === "preview.mjs"));
});

test("uses static reference profile when browser profile is unavailable", () => {
  const compared: Evidence[] = [
    ...evidence,
    { source: "reference:experience", kind: "code", summary: "reference", data: { canvasCount: 1, interactiveAssets: 1, technologies: ["webassembly"] } },
    { source: "preview:experience", kind: "code", summary: "preview", data: { canvasCount: 1, interactiveAssets: 1, technologies: ["webassembly"] } },
  ];
  const result = evaluateAcceptance(criteria, runtime, compared);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.findings, []);
});
