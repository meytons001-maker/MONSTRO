export type TaskPhase =
  | "understand"
  | "inspect"
  | "plan"
  | "build"
  | "run"
  | "observe"
  | "evaluate"
  | "repair"
  | "deliver"
  | "failed";

export type Capability =
  | "filesystem.read"
  | "filesystem.write"
  | "process.execute"
  | "browser.navigate"
  | "network.public"
  | "media.transform"
  | "code.analyze"
  | "security.authorized-analysis";

export type AcceptanceCheck =
  | { kind: "runtime.ok" }
  | { kind: "evidence.exists"; source: string }
  | { kind: "evidence.field.equals"; source: string; field: string; expected: string | number | boolean }
  | { kind: "evidence.field.includes"; source: string; field: string; expected: string }
  | { kind: "evidence.field.min"; source: string; field: string; expected: number };

export interface AcceptanceCriterion { id: string; description: string; required: boolean; checks?: AcceptanceCheck[]; repairTargetPath?: string; }
export type ExperienceFidelity = "advisory" | "required";
export type MissionProfileId = "web" | "interactive-web";
export interface MissionUnderstanding {
  profile: MissionProfileId;
  artifact: "web-preview";
  interactivity: "structural" | "interactive";
  experienceFidelity: ExperienceFidelity;
  rationale: string;
  acceptance: AcceptanceCriterion[];
}
export interface ProjectContext { projectId: string; rootDir: string; summary: string; decisions: string[]; experienceFidelity?: ExperienceFidelity; understanding?: MissionUnderstanding; }
export interface MonstroTask { id: string; intent: string; phase: TaskPhase; context: ProjectContext; requestedCapabilities: Capability[]; acceptance: AcceptanceCriterion[]; iteration: number; maxIterations: number; }
export interface Evidence { source: string; kind: "code" | "runtime" | "visual" | "network" | "user"; summary: string; data?: unknown; requirementIds?: string[]; }
export interface BuildRequirement {
  id: string;
  description: string;
  source: "understanding" | "acceptance";
  required: boolean;
}
export interface BuildPlanStep { id: string; title: string; description: string; status: "pending" | "running" | "done" | "failed"; }
export interface BuildPlan { taskId: string; rationale: string; requirements: BuildRequirement[]; steps: BuildPlanStep[]; }
export interface FilePatch { path: string; operation: "create" | "update" | "delete"; content?: string; requirementIds?: string[]; }
export interface RuntimeResult { ok: boolean; previewUrl?: string; stdout: string; stderr: string; durationMs: number; }

export interface ObservationResult { ok: boolean; evidence: Evidence[]; durationMs: number; }

export type FindingCode =
  | "runtime.failed"
  | "observation.failed"
  | "document.title"
  | "document.heading"
  | "document.structure"
  | "acceptance.unsatisfied"
  | "experience.profile.missing"
  | "experience.canvas.missing"
  | "experience.assets.missing"
  | "experience.technology.missing";
export interface EvaluationFinding { code: FindingCode; message: string; severity: "error" | "warning"; evidenceSource?: string; requirementIds?: string[]; }
export interface RepairAction { id: string; findingCode: FindingCode; description: string; targetPath?: string; requirementIds?: string[]; }
export interface EvaluationEvidenceTrace { requirementId: string; evidenceSources: string[]; }
export interface Evaluation { accepted: boolean; score: number; findings: EvaluationFinding[]; nextActions: RepairAction[]; evidenceTrace?: EvaluationEvidenceTrace[]; }
export interface EvaluationIterationTrace { iteration: number; accepted: boolean; score: number; evidenceTrace: EvaluationEvidenceTrace[]; findings: EvaluationFinding[]; repairActionIds: string[]; }
export interface RequirementDeliveryTrace { requirementId: string; buildPaths: string[]; repairPaths: string[]; evidenceSources: string[]; findingCodes: FindingCode[]; status: "satisfied" | "unresolved"; }
export interface DeliveryTrace { requirements: RequirementDeliveryTrace[]; evaluations?: EvaluationIterationTrace[]; }
export interface Delivery { taskId: string; completedAt: string; summary: string; previewUrl?: string; artifacts: string[]; trace?: DeliveryTrace; }
