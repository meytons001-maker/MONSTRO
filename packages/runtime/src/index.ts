import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import type { FilePatch, RuntimeResult } from "@monstro/contracts";

export interface ProcessSpec {
  command: string;
  args?: string[];
  timeoutMs?: number;
}

export class ProjectWorkspace {
  readonly root: string;

  constructor(baseDir: string, projectId: string) {
    this.root = resolve(baseDir, projectId);
  }

  private safe(path: string): string {
    const target = resolve(this.root, path);
    const rel = relative(this.root, target);
    if (rel.startsWith("..") || rel === "..") throw new Error(`Path escapes workspace: ${path}`);
    return target;
  }

  async init(): Promise<void> { await mkdir(this.root, { recursive: true }); }

  async apply(patches: FilePatch[]): Promise<void> {
    await this.init();
    for (const patch of patches) {
      const target = this.safe(patch.path);
      if (patch.operation === "delete") { await rm(target, { force: true, recursive: true }); continue; }
      if (patch.content === undefined) throw new Error(`Missing content for ${patch.operation}: ${patch.path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, patch.content, "utf8");
    }
  }

  async read(path: string): Promise<string> { return readFile(this.safe(path), "utf8"); }
}

const ALLOWED_COMMANDS = new Set(["node", "npm", "pnpm"]);

export class LocalSandboxRuntime {
  constructor(private readonly workspace: ProjectWorkspace) {}

  async run(spec: ProcessSpec): Promise<RuntimeResult> {
    if (!ALLOWED_COMMANDS.has(spec.command)) throw new Error(`Command is not allowed: ${spec.command}`);
    const started = Date.now();
    const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? 10_000, 100), 30_000);

    return new Promise((resolveResult) => {
      const child = spawn(spec.command, spec.args ?? [], {
        cwd: this.workspace.root,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", CI: "1" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", (error) => { stderr += error.message; });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) stderr += `\nProcess timed out after ${timeoutMs}ms`;
        resolveResult({ ok: code === 0 && !timedOut, stdout, stderr, durationMs: Date.now() - started });
      });
    });
  }
}
