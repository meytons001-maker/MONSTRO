import type { BuildPlan, FilePatch, MonstroTask } from "@monstro/contracts";
import type { ModelRouter } from "./index.ts";

const MAX_PATCHES = 12;
const MAX_PATH_LENGTH = 240;
const MAX_CONTENT_BYTES = 512_000;

export interface AiBuildResult {
  provider: string;
  model: string;
  patches: FilePatch[];
}

type RawPatch = { path?: unknown; operation?: unknown; content?: unknown };

function parseJson(output: string): unknown {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  return JSON.parse(fenced ?? trimmed);
}

function safeRelativePath(value: unknown): string {
  if (typeof value !== "string") throw new Error("AI Builder patch path must be a string");
  const path = value.trim().replace(/\\/g, "/");
  if (!path || path.length > MAX_PATH_LENGTH) throw new Error("AI Builder patch path is invalid");
  if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) throw new Error(`AI Builder patch path must be relative: ${path}`);
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`AI Builder patch path is unsafe: ${path}`);
  if (parts[0] === ".git" || parts.includes(".git")) throw new Error("AI Builder cannot modify .git");
  return path;
}

function normalizePatch(value: RawPatch): FilePatch {
  const path = safeRelativePath(value.path);
  if (value.operation !== "create" && value.operation !== "update" && value.operation !== "delete") throw new Error(`AI Builder operation is invalid for ${path}`);
  if (value.operation === "delete") return { path, operation: "delete" };
  if (typeof value.content !== "string") throw new Error(`AI Builder content is required for ${path}`);
  if (Buffer.byteLength(value.content, "utf8") > MAX_CONTENT_BYTES) throw new Error(`AI Builder content is too large for ${path}`);
  return { path, operation: value.operation, content: value.content };
}

export async function generateAiBuild(router: ModelRouter, task: MonstroTask, plan: BuildPlan): Promise<AiBuildResult | undefined> {
  if (router.list("code").length === 0) return undefined;
  const response = await router.generate({
    capability: "code",
    system: "You are the MONSTRO Builder. Return only JSON. Produce minimal project file patches for an isolated authorized workspace. Implement the supplied build requirements, prioritizing required requirements. Never request credentials, bypass authentication/DRM, escape the workspace, modify .git, or propose unauthorized access.",
    prompt: JSON.stringify({
      intent: task.intent,
      understanding: task.context.understanding,
      acceptance: task.acceptance,
      plan: {
        rationale: plan.rationale,
        requirements: plan.requirements,
        steps: plan.steps.map(({ title, description }) => ({ title, description })),
      },
      responseSchema: { patches: [{ path: "relative/path", operation: "create|update|delete", content: "required except delete" }] },
    }),
    metadata: { taskId: task.id, phase: "build", requirementIds: plan.requirements.map((requirement) => requirement.id) },
  });
  const parsed = parseJson(response.output);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { patches?: unknown }).patches)) throw new Error("AI Builder response must contain a patches array");
  const raw = (parsed as { patches: RawPatch[] }).patches;
  if (raw.length === 0 || raw.length > MAX_PATCHES) throw new Error(`AI Builder must return between 1 and ${MAX_PATCHES} patches`);
  const patches = raw.map(normalizePatch);
  const unique = new Set(patches.map((patch) => patch.path));
  if (unique.size !== patches.length) throw new Error("AI Builder returned duplicate patch paths");
  return { provider: response.provider, model: response.model, patches };
}
