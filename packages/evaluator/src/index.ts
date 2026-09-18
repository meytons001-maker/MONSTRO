import type { AcceptanceCheck, AcceptanceCriterion, Evidence, Evaluation, EvaluationFinding, FindingCode, RepairAction, RuntimeResult } from "@monstro/contracts";

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

function numberField(data: Record<string, unknown> | undefined, field: string): number {
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(data: Record<string, unknown> | undefined, field: string): string[] {
  const value = data?.[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function compareExperience(evidence: Evidence[]): { findings: EvaluationFinding[]; nextActions: RepairAction[] } {
  const target = evidence.find((item) => item.source === "browser:experience") ?? evidence.find((item) => item.source === "reference:experience");
  if (!target) return { findings: [], nextActions: [] };
  const produced = evidence.find((item) => item.source === "preview:experience");
  const targetData = record(target.data);
  const producedData = record(produced?.data);
  const findings: EvaluationFinding[] = [];
  const nextActions: RepairAction[] = [];

  const add = (code: FindingCode, message: string) => {
    findings.push({ code, message, severity: "warning", evidenceSource: produced?.source ?? "preview:experience" });
    nextActions.push({ id: `repair-experience-${nextActions.length + 1}`, findingCode: code, description: message, targetPath: "preview.mjs" });
  };

  if (!produced) {
    add("experience.profile.missing", "Produced preview has no experience profile to compare with the inspected reference");
    return { findings, nextActions };
  }

  const targetCanvas = numberField(targetData, "canvasCount");
  const producedCanvas = numberField(producedData, "canvasCount");
  if (targetCanvas > 0 && producedCanvas < targetCanvas) add("experience.canvas.missing", `Reference renders ${targetCanvas} canvas element(s), preview exposes ${producedCanvas}`);

  const targetAssets = Math.max(numberField(targetData, "interactiveRequests"), numberField(targetData, "interactiveAssets"));
  const producedAssets = numberField(producedData, "interactiveAssets");
  if (targetAssets > 0 && producedAssets === 0) add("experience.assets.missing", `Reference exposes ${targetAssets} interactive/3D asset signal(s), preview exposes none`);

  const producedTechnologies = new Set(stringArray(producedData, "technologies"));
  const missingTechnologies = stringArray(targetData, "technologies").filter((technology) => !producedTechnologies.has(technology));
  if (missingTechnologies.length > 0) add("experience.technology.missing", `Preview does not expose reference technology signal(s): ${missingTechnologies.join(", ")}`);

  return { findings, nextActions };
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

  const comparison = compareExperience(evidence);
  findings.push(...comparison.findings);
  nextActions.push(...comparison.nextActions);
  const blocking = findings.some((finding) => finding.severity === "error");
  return { accepted: !blocking, score: checks === 0 ? 1 : passed / checks, findings, nextActions };
}
