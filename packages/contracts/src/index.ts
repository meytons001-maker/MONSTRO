export type TaskPhase =
  | "understand"
  | "inspect"
  | "plan"
  | "build"
  | "run"
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

export interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface ProjectContext {
  projectId: string;
  rootDir: string;
  summary: string;
  decisions: string[];
}

export interface MonstroTask {
  id: string;
  intent: string;
  phase: TaskPhase;
  context: ProjectContext;
  requestedCapabilities: Capability[];
  acceptance: AcceptanceCriterion[];
  iteration: number;
  maxIterations: number;
}

export interface Evidence {
  source: string;
  kind: "code" | "runtime" | "visual" | "network" | "user";
  summary: string;
  data?: unknown;
}

export interface BuildPlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "failed";
}

export interface BuildPlan {
  taskId: string;
  rationale: string;
  steps: BuildPlanStep[];
}

export interface FilePatch {
  path: string;
  operation: "create" | "update" | "delete";
  content?: string;
}

export interface RuntimeResult {
  ok: boolean;
  previewUrl?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface Evaluation {
  accepted: boolean;
  score: number;
  findings: string[];
  nextActions: string[];
}

export interface Delivery {
  taskId: string;
  completedAt: string;
  summary: string;
  previewUrl?: string;
  artifacts: string[];
}
