import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Evidence, EvaluationFinding, FilePatch, MonstroTask, RuntimeResult } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "@monstro/core";
import { LocalSandboxRuntime, ProjectWorkspace, type PreviewHandle } from "@monstro/runtime";
import { previewRegistry } from "./preview-registry";

const EXPECTED_TITLE = "MONSTRO Preview";
const EXPECTED_HEADING = "MONSTRO LIVE PREVIEW";

function previewServer(intent: string, title = EXPECTED_TITLE, heading = EXPECTED_HEADING) {
  const safeIntent = JSON.stringify(intent.slice(0, 160));
  return `import http from 'node:http';\nconst intent=${safeIntent};\nconst args=process.argv.slice(2);\nconst value=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};\nconst port=Number(value('--port',process.env.PORT||'3000'));\nconst host=value('--host',process.env.HOST||'127.0.0.1');\nconst html=\`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>html,body{margin:0;min-height:100%;background:#070a08;color:#eef3ee;font-family:system-ui}main{min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle,#23321e,#070a08 55%)}section{text-align:center;max-width:760px;padding:48px}.mark{font-size:64px;color:#d7ff45}h1{font-size:clamp(30px,6vw,72px);margin:10px 0}p{color:#96a099}</style></head><body><main><section><div class="mark">M</div><h1>${heading}</h1><p>\${intent}</p></section></main></body></html>\`;\nhttp.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,engine:'MONSTRO'}));return}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html)}).listen(port,host,()=>console.log(JSON.stringify({ready:true,host,port})));\n`;
}

export function createTask(intent: string): MonstroTask {
  const id = randomUUID();
  return { id, intent, phase: "understand", context: { projectId: id, rootDir: join(tmpdir(), "monstro-workspaces"), summary: "MONSTRO V0 mission", decisions: [] }, requestedCapabilities: ["filesystem.read", "filesystem.write", "process.execute"], acceptance: [{ id: "preview-ok", description: "Generated web preview must become reachable", required: true }], iteration: 0, maxIterations: 2 };
}

export function createV0Services(task: MonstroTask): MonstroServices {
  const workspace = new ProjectWorkspace(task.context.rootDir, task.context.projectId);
  const sandbox = new LocalSandboxRuntime(workspace, { allowedCommands: ["node"], maxTimeoutMs: 15_000 });
  let preview: PreviewHandle | undefined;

  return {
    inspector: { async inspect(current) { return [{ source: "intent", kind: "user", summary: current.intent }]; } },
    architect: { async plan(current, evidence) { return { taskId: current.id, rationale: `Plan derived from ${evidence.length} evidence item(s)`, steps: [{ id: "v0-web", title: "Build reachable web preview", description: current.intent, status: "pending" }] }; } },
    builder: {
      async build(current) { return [{ path: "preview.mjs", operation: "create", content: previewServer(current.intent) }]; },
      async apply(current, patches) { await workspace.apply(patches); current.context.decisions.push(`Applied ${patches.length} patch(es) to isolated workspace`); },
    },
    runtime: { async run(): Promise<RuntimeResult> { if (preview) await preview.stop(); const started = Date.now(); preview = await sandbox.startPreview({ command: "node", args: ["preview.mjs"], healthPath: "/health", startupTimeoutMs: 5_000 }); await previewRegistry.register(task.id, preview); return { ok: true, previewUrl: `/api/previews/${task.id}/`, stdout: preview.stdout, stderr: preview.stderr, durationMs: Date.now() - started }; } },
    observer: {
      async observe(_current, runtime) {
        const started = Date.now(); const evidence: Evidence[] = [];
        if (!runtime.ok || !preview) return { ok: false, evidence: [{ source: "runtime", kind: "runtime", summary: runtime.stderr || "Preview unavailable" }], durationMs: Date.now() - started };
        try {
          const response = await fetch(preview.url, { signal: AbortSignal.timeout(1_500) }); const html = await response.text();
          const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
          const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
          evidence.push({ source: "preview:http", kind: "network", summary: `GET / returned ${response.status}`, data: { status: response.status, contentType: response.headers.get("content-type") } });
          evidence.push({ source: "preview:document", kind: "runtime", summary: `Document title: ${title || "missing"}`, data: { title, h1, htmlBytes: Buffer.byteLength(html) } });
          return { ok: response.ok && html.length > 0, evidence, durationMs: Date.now() - started };
        } catch (error) { return { ok: false, evidence: [{ source: "preview:http", kind: "network", summary: error instanceof Error ? error.message : "Preview observation failed" }], durationMs: Date.now() - started }; }
      },
    },
    evaluator: {
      async evaluate(_current, runtime, evidence) {
        const findings: EvaluationFinding[] = [];
        if (!runtime.ok) findings.push({ code: "runtime.failed", message: runtime.stderr || "Runtime failed", severity: "error", evidenceSource: "runtime" });
        const document = evidence.find((item) => item.source === "preview:document");
        const data = document?.data as { title?: string; h1?: string } | undefined;
        if (data?.title !== EXPECTED_TITLE) findings.push({ code: "document.title", message: `Expected title ${EXPECTED_TITLE}`, severity: "error", evidenceSource: "preview:document" });
        if (data?.h1?.includes(EXPECTED_HEADING) !== true) findings.push({ code: "document.heading", message: `Expected heading ${EXPECTED_HEADING}`, severity: "error", evidenceSource: "preview:document" });
        if (!document) findings.push({ code: "observation.failed", message: "Preview document was not observed", severity: "error", evidenceSource: "preview:http" });
        const nextActions = findings.filter((finding) => finding.code === "document.title" || finding.code === "document.heading").map((finding) => ({ id: `repair-${finding.code}`, findingCode: finding.code, description: `Repair ${finding.code}`, targetPath: "preview.mjs" }));
        return { accepted: findings.length === 0, score: findings.length === 0 ? 1 : 0, findings, nextActions };
      },
    },
    repairer: {
      async repair(current, evaluation): Promise<FilePatch[]> {
        const canRepairDocument = evaluation.nextActions.some((action) => action.targetPath === "preview.mjs");
        if (!canRepairDocument) return [];
        current.context.decisions.push(`Repairing preview.mjs from findings: ${evaluation.findings.map((finding) => finding.code).join(", ")}`);
        return [{ path: "preview.mjs", operation: "update", content: previewServer(current.intent) }];
      },
    },
    exporter: { async deliver(current, runtime) { return { taskId: current.id, completedAt: new Date().toISOString(), summary: "MONSTRO generated, observed, evaluated and can repair its web preview", previewUrl: runtime.previewUrl, artifacts: ["preview.mjs"] }; } },
  };
}

export function createMission(intent: string) { const task = createTask(intent); const journal = new MissionJournal(); const orchestrator = new MonstroOrchestrator(createV0Services(task), journal); return { task, journal, orchestrator }; }
