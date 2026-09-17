import type { AcceptanceCheck, AcceptanceCriterion, Evidence, Evaluation, EvaluationFinding, RepairAction, RuntimeResult } from "@monstro/contracts";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function checkAcceptance(check: AcceptanceCheck, runtime: RuntimeResult, evidence: Evidence[]): { ok: boolean; source?: string; detail: string } {
  if (check.kind === "runtime.ok") return { ok: runtime.ok, source: "runtime", detail: "runtime must complete successfully" };
  const item = evidence.find((candidate) => candidate.source === check.source);
  if (check.kind === "evidence.exists") return { ok: Boolean(item), source: check.source, detail: `evidence ${check.source} must exist` };
  const data = record(item?.data);
  const actual = data?.[check.field];
  if (check.kind === "evidence.field.equals") return { ok: actual === check.expected, source: check.source, detail: `${check.source}.${check.field} must equal ${String(check.expected)}` };
  if (check.kind === "evidence.field.includes") return { ok: typeof actual === "string" && actual.includes(check.expected), source: check.source, detail: `${check.source}.${check.field} must include ${check.expected}` };
  return { ok: typeof actual === "number" && actual >= check.expected, source: check.source, detail: `${check.source}.${check.field} must be at least ${check.expected}` };
}

export function evaluateAcceptance(criteria: AcceptanceCriterion[], runtime: RuntimeResult, evidence: Evidence[]): Evaluation {
  const findings: EvaluationFinding[] = [];
  const nextActions: RepairAction[] = [];
  let checks = 0;
  let passed = 0;

  for (const criterion of criteria) {
    for (const check of criterion.checks ?? []) {
      checks += 1;
      const result = checkAcceptance(check, runtime, evidence);
      if (result.ok) { passed += 1; continue; }
      findings.push({ code: "acceptance.unsatisfied", message: `${criterion.description}: ${result.detail}`, severity: criterion.required ? "error" : "warning", evidenceSource: result.source });
      if (criterion.repairTargetPath) nextActions.push({ id: `repair-${criterion.id}-${nextActions.length + 1}`, findingCode: "acceptance.unsatisfied", description: `Satisfy acceptance criterion: ${criterion.description}`, targetPath: criterion.repairTargetPath });
    }
  }

  const blocking = findings.some((finding) => finding.severity === "error");
  return { accepted: !blocking, score: checks === 0 ? 1 : passed / checks, findings, nextActions };
}
