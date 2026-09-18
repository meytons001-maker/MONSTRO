import type { Evaluation, FilePatch, MonstroTask } from "@monstro/contracts";
import type { ModelRouter } from "./index.ts";
import { requirementsFromUnderstanding } from "./planner.ts";

const MAX_PATCHES = 8; const MAX_PATH_LENGTH = 240; const MAX_CONTENT_BYTES = 512_000; const MAX_ARTIFACT_BYTES = 128_000;
export interface AiRepairArtifact { path: string; content: string; }
export interface AiRepairResult { provider: string; model: string; patches: FilePatch[]; }
type RawPatch = { path?: unknown; operation?: unknown; content?: unknown };
function parseJson(output: string): unknown { const trimmed = output.trim(); const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]; return JSON.parse(fenced ?? trimmed); }
function safeRelativePath(value: unknown): string {
  if (typeof value !== "string") throw new Error("AI Repairer patch path must be a string"); const path = value.trim().replace(/\\/g, "/");
  if (!path || path.length > MAX_PATH_LENGTH) throw new Error("AI Repairer patch path is invalid"); if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) throw new Error(`AI Repairer patch path must be relative: ${path}`);
  const parts = path.split("/"); if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`AI Repairer patch path is unsafe: ${path}`); if (parts.includes(".git")) throw new Error("AI Repairer cannot modify .git"); return path;
}
function normalizePatch(value: RawPatch, allowedPaths: ReadonlySet<string>): FilePatch {
  const path = safeRelativePath(value.path); if (!allowedPaths.has(path)) throw new Error(`AI Repairer cannot modify unrequested path: ${path}`);
  if (value.operation !== "create" && value.operation !== "update" && value.operation !== "delete") throw new Error(`AI Repairer operation is invalid for ${path}`); if (value.operation === "delete") return { path, operation: "delete" };
  if (typeof value.content !== "string") throw new Error(`AI Repairer content is required for ${path}`); if (Buffer.byteLength(value.content, "utf8") > MAX_CONTENT_BYTES) throw new Error(`AI Repairer content is too large for ${path}`); return { path, operation: value.operation, content: value.content };
}
export async function generateAiRepair(router: ModelRouter, task: MonstroTask, evaluation: Evaluation, artifacts: AiRepairArtifact[]): Promise<AiRepairResult | undefined> {
  if (router.list("code").length === 0 || evaluation.accepted || evaluation.nextActions.length === 0) return undefined;
  const allowedPaths = new Set(evaluation.nextActions.map((action) => action.targetPath).filter((path): path is string => typeof path === "string").map(safeRelativePath)); if (allowedPaths.size === 0) return undefined;
  const selectedArtifacts = artifacts.filter((artifact) => allowedPaths.has(safeRelativePath(artifact.path))).map((artifact) => ({ path: artifact.path, content: Buffer.byteLength(artifact.content, "utf8") <= MAX_ARTIFACT_BYTES ? artifact.content : artifact.content.slice(0, MAX_ARTIFACT_BYTES) }));
  const tracedIds = new Set(evaluation.nextActions.flatMap((action) => action.requirementIds ?? []));
  const requirements = requirementsFromUnderstanding(task.context.understanding).filter((requirement) => tracedIds.has(requirement.id));
  const response = await router.generate({
    capability: "code",
    system: "You are the MONSTRO Repairer. Return only JSON. Repair only explicitly authorized target files inside the isolated workspace. Satisfy the traced build requirements behind each repair action. Never request credentials, bypass authentication/DRM, modify .git, escape the workspace, or propose unauthorized access.",
    prompt: JSON.stringify({ intent: task.intent, understanding: task.context.understanding, requirements, findings: evaluation.findings, actions: evaluation.nextActions, artifacts: selectedArtifacts, allowedPaths: [...allowedPaths], responseSchema: { patches: [{ path: "one of allowedPaths", operation: "create|update|delete", content: "required except delete" }] } }),
    metadata: { taskId: task.id, phase: "repair", requirementIds: [...tracedIds].join(",") },
  });
  const parsed = parseJson(response.output); if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { patches?: unknown }).patches)) throw new Error("AI Repairer response must contain a patches array");
  const raw = (parsed as { patches: RawPatch[] }).patches; if (raw.length === 0 || raw.length > MAX_PATCHES) throw new Error(`AI Repairer must return between 1 and ${MAX_PATCHES} patches`);
  const patches = raw.map((patch) => normalizePatch(patch, allowedPaths)); if (new Set(patches.map((patch) => patch.path)).size !== patches.length) throw new Error("AI Repairer returned duplicate patch paths"); return { provider: response.provider, model: response.model, patches };
}
