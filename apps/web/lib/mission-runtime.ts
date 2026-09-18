import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createModelRouterFromEnvironment, generateAiBuild, generateAiPlan, generateAiRepair } from "@monstro/ai";
import { createChromiumSessionFactory } from "@monstro/browser";
import type { BuildPlan, Evidence, FilePatch, MonstroTask, RuntimeResult } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "@monstro/core";
import { evaluateAcceptance } from "@monstro/evaluator";
import { ControlledBrowserInspector, extractPublicHttpUrl, PublicUrlInspector } from "@monstro/inspector";
import { HttpPreviewObserver } from "@monstro/observer";
import { LocalSandboxRuntime, ProjectWorkspace, type PreviewHandle } from "@monstro/runtime";
import { classifyMission } from "./mission-profile";
import { previewRegistry } from "./preview-registry";

const EXPECTED_TITLE = "MONSTRO Preview";
const EXPECTED_HEADING = "MONSTRO LIVE PREVIEW";

function previewServer(intent: string, title = EXPECTED_TITLE, heading = EXPECTED_HEADING) { const safeIntent = JSON.stringify(intent.slice(0, 160)); return `import http from 'node:http';\nconst intent=${safeIntent};\nconst args=process.argv.slice(2);\nconst value=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};\nconst port=Number(value('--port',process.env.PORT||'3000'));\nconst host=value('--host',process.env.HOST||'127.0.0.1');\nconst html=\`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>html,body{margin:0;min-height:100%;background:#070a08;color:#eef3ee;font-family:system-ui}main{min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle,#23321e,#070a08 55%)}section{text-align:center;max-width:760px;padding:48px}.mark{font-size:64px;color:#d7ff45}h1{font-size:clamp(30px,6vw,72px);margin:10px 0}p{color:#96a099}</style></head><body><main><section><div class="mark">M</div><h1>${heading}</h1><p>\${intent}</p></section></main></body></html>\`;\nhttp.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,engine:'MONSTRO'}));return}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html)}).listen(port,host,()=>console.log(JSON.stringify({ready:true,host,port})));\n`; }

export function createTask(intent: string): MonstroTask {
  const id = randomUUID();
  const reference = extractPublicHttpUrl(intent);
  const profile = classifyMission(intent, Boolean(reference));
  return {
    id,
    intent,
    phase: "understand",
    context: {
      projectId: id,
      rootDir: join(tmpdir(), "monstro-workspaces"),
      summary: `MONSTRO V0 ${profile.id} mission`,
      decisions: [`Mission profile ${profile.id}: ${profile.rationale}`],
      experienceFidelity: profile.experienceFidelity,
    },
    requestedCapabilities: ["filesystem.read", "filesystem.write", "process.execute", ...(reference ? ["network.public" as const, "browser.navigate" as const] : [])],
    acceptance: profile.acceptance,
    iteration: 0,
    maxIterations: 2,
  };
}

function createBrowserInspector(): ControlledBrowserInspector | undefined {
  const executablePath = process.env.MONSTRO_CHROMIUM_PATH?.trim();
  if (!executablePath) return undefined;
  return new ControlledBrowserInspector({ createSession: createChromiumSessionFactory({ executablePath, maxRequests: 128, maxConsoleEntries: 64 }), timeoutMs: 8_000, maxRequests: 128, maxConsoleEntries: 64 });
}

async function inspectReference(reference: URL, httpInspector: PublicUrlInspector, browserInspector: ControlledBrowserInspector | undefined, decisions: string[]): Promise<Evidence[]> {
  const evidence: Evidence[] = [];
  try { evidence.push(...await httpInspector.inspect(reference)); decisions.push(`Inspected public reference ${reference.origin} within bounded network policy`); }
  catch (error) { decisions.push(`Public reference inspection unavailable: ${error instanceof Error ? error.message : "unknown error"}`); }
  if (!browserInspector) { decisions.push("Browser inspection skipped because MONSTRO_CHROMIUM_PATH is not configured"); return evidence; }
  try { evidence.push(...await browserInspector.inspect(reference)); decisions.push(`Rendered public reference ${reference.origin} in controlled Chromium session`); }
  catch (error) { decisions.push(`Browser reference inspection unavailable: ${error instanceof Error ? error.message : "unknown error"}`); }
  return evidence;
}

export function createV0Services(task: MonstroTask): MonstroServices {
  const workspace = new ProjectWorkspace(task.context.rootDir, task.context.projectId);
  const sandbox = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"], maxTimeoutMs: 15_000 });
  const httpObserver = new HttpPreviewObserver({ timeoutMs: 1_500, maxHtmlBytes: 512_000 });
  const referenceInspector = new PublicUrlInspector({ timeoutMs: 5_000, maxHtmlBytes: 512_000 });
  const browserInspector = createBrowserInspector();
  const ai = createModelRouterFromEnvironment(); let preview: PreviewHandle | undefined;
  return {
    inspector: { async inspect(current) { const evidence: Evidence[] = [{ source: "intent", kind: "user", summary: current.intent }]; const reference = extractPublicHttpUrl(current.intent); if (!reference) return evidence; return [...evidence, ...await inspectReference(reference, referenceInspector, browserInspector, current.context.decisions)]; } },
    architect: { async plan(current, evidence) { try { const aiPlan = await generateAiPlan(ai, current.intent, evidence.map((item) => `${item.source}: ${item.summary}`)); if (aiPlan) { current.context.decisions.push(`AI Architect planned with ${aiPlan.provider}/${aiPlan.model}`); return { taskId: current.id, rationale: aiPlan.rationale, steps: aiPlan.steps.map((step, index) => ({ id: `ai-${index + 1}`, title: step.title, description: step.description, status: "pending" as const })) }; } } catch (error) { current.context.decisions.push(`AI Architect unavailable; deterministic fallback used: ${error instanceof Error ? error.message : "unknown error"}`); } return { taskId: current.id, rationale: `Deterministic plan derived from ${evidence.length} evidence item(s)`, steps: [{ id: "v0-web", title: "Build reachable web preview", description: current.intent, status: "pending" }] }; } },
    builder: { async build(current, plan: BuildPlan) { try { const aiBuild = await generateAiBuild(ai, current, plan); if (aiBuild) { const previewPatch = aiBuild.patches.find((patch) => patch.path === "preview.mjs" && patch.operation !== "delete"); if (!previewPatch) throw new Error("AI Builder must produce preview.mjs for the V0 runtime contract"); current.context.decisions.push(`AI Builder generated ${aiBuild.patches.length} patch(es) with ${aiBuild.provider}/${aiBuild.model}`); return aiBuild.patches; } } catch (error) { current.context.decisions.push(`AI Builder unavailable; deterministic fallback used: ${error instanceof Error ? error.message : "unknown error"}`); } return [{ path: "preview.mjs", operation: "create", content: previewServer(current.intent) }]; }, async apply(current, patches) { await workspace.apply(patches); current.context.decisions.push(`Applied ${patches.length} patch(es) to isolated workspace`); } },
    runtime: { async run(): Promise<RuntimeResult> { if (preview) await preview.stop(); const started = Date.now(); preview = await sandbox.startPreview({ command: "node", args: ["preview.mjs"], healthPath: "/health", startupTimeoutMs: 5_000 }); await previewRegistry.register(task.id, preview); return { ok: true, previewUrl: `/api/previews/${task.id}/`, stdout: preview.stdout, stderr: preview.stderr, durationMs: Date.now() - started }; } },
    observer: { async observe(_current, runtime) { if (!preview) return { ok: false, evidence: [{ source: "runtime", kind: "runtime", summary: runtime.stderr || "Preview unavailable" }], durationMs: 0 }; return httpObserver.observe(preview.url, runtime); } },
    evaluator: { async evaluate(current, runtime, evidence) { return evaluateAcceptance(current.acceptance, runtime, evidence, { experienceFidelity: current.context.experienceFidelity }); } },
    repairer: { async repair(current, evaluation): Promise<FilePatch[]> { const canRepairDocument = evaluation.nextActions.some((action) => action.targetPath === "preview.mjs"); if (!canRepairDocument) return []; try { const artifact = await workspace.read("preview.mjs"); const aiRepair = await generateAiRepair(ai, current, evaluation, [{ path: "preview.mjs", content: artifact }]); if (aiRepair) { const previewPatch = aiRepair.patches.find((patch) => patch.path === "preview.mjs" && patch.operation !== "delete"); if (!previewPatch) throw new Error("AI Repairer must preserve preview.mjs for the V0 runtime contract"); current.context.decisions.push(`AI Repairer generated ${aiRepair.patches.length} patch(es) with ${aiRepair.provider}/${aiRepair.model}`); return aiRepair.patches; } } catch (error) { current.context.decisions.push(`AI Repairer unavailable; deterministic fallback used: ${error instanceof Error ? error.message : "unknown error"}`); } current.context.decisions.push(`Repairing preview.mjs from findings: ${evaluation.findings.map((finding) => finding.code).join(", ")}`); return [{ path: "preview.mjs", operation: "update", content: previewServer(current.intent) }]; } },
    exporter: { async deliver(current, runtime) { return { taskId: current.id, completedAt: new Date().toISOString(), summary: "MONSTRO generated, observed, evaluated and can repair its web preview", previewUrl: runtime.previewUrl, artifacts: ["preview.mjs"] }; } },
  };
}
export function createMission(intent: string) { const task = createTask(intent); const journal = new MissionJournal(); const orchestrator = new MonstroOrchestrator(createV0Services(task), journal); return { task, journal, orchestrator }; }
