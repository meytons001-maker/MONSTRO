import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask, RuntimeResult } from "@monstro/contracts";
import { RuntimeEvidenceEvaluator } from "../src/index.js";

function task(): MonstroTask {
  return {
    id: "evaluation-1",
    intent: "evaluate runtime evidence",
    phase: "evaluate",
    context: { projectId: "monstro", rootDir: ".", summary: "test", decisions: [] },
    requestedCapabilities: ["process.execute"],
    acceptance: [],
    iteration: 1,
    maxIterations: 2,
  };
}

function runtime(overrides: Partial<RuntimeResult> = {}): RuntimeResult {
  return { ok: true, stdout: "MONSTRO_OK", stderr: "", durationMs: 25, ...overrides };
}

test("accepts a successful runtime within the configured budget", async () => {
  const evaluator = new RuntimeEvidenceEvaluator({ maxDurationMs: 100, rejectStderr: true });
  const evaluation = await evaluator.evaluate(task(), runtime());
  assert.equal(evaluation.accepted, true);
  assert.equal(evaluation.score, 1);
  assert.deepEqual(evaluation.findings, []);
  assert.deepEqual(evaluation.nextActions, []);
});

test("turns runtime failure evidence into repair guidance", async () => {
  const evaluator = new RuntimeEvidenceEvaluator();
  const evaluation = await evaluator.evaluate(task(), runtime({ ok: false, stderr: "SyntaxError: unexpected token" }));
  assert.equal(evaluation.accepted, false);
  assert.equal(evaluation.score, 0);
  assert.match(evaluation.findings.join("\n"), /Runtime execution failed/);
  assert.match(evaluation.findings.join("\n"), /SyntaxError/);
  assert.match(evaluation.nextActions.join("\n"), /repair/i);
});

test("rejects execution that exceeds its duration budget", async () => {
  const evaluator = new RuntimeEvidenceEvaluator({ maxDurationMs: 50 });
  const evaluation = await evaluator.evaluate(task(), runtime({ durationMs: 75 }));
  assert.equal(evaluation.accepted, false);
  assert.equal(evaluation.score, 0.5);
  assert.match(evaluation.findings.join("\n"), /75ms > 50ms/);
  assert.match(evaluation.nextActions.join("\n"), /duration/i);
});

test("can require clean stderr before delivery", async () => {
  const evaluator = new RuntimeEvidenceEvaluator({ rejectStderr: true });
  const evaluation = await evaluator.evaluate(task(), runtime({ stderr: "warning" }));
  assert.equal(evaluation.accepted, false);
  assert.equal(evaluation.score, 0.5);
  assert.match(evaluation.nextActions.join("\n"), /stderr/i);
});
