import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { FilePatch, RuntimeResult } from "@monstro/contracts";

export interface ProcessSpec {
  command: string;
  args?: string[];
  timeoutMs?: number;
}

export interface RuntimePolicy {
  allowedCommands?: readonly string[];
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
}

export class ProjectWorkspace {
  readonly root: string;

  constructor(baseDir: string, projectId: string) {
    if (!projectId.trim()) throw new Error("Project id is required");
    this.root = resolve(baseDir, projectId);
  }

  private path(path: string): string {
    if (!path.trim() || isAbsolute(path)) throw new Error(`Workspace path must be relative: ${path}`);
    const target = resolve(this.root, path);
    const rel = relative(this.root, target);
    if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
      throw new Error(`Path escapes workspace: ${path}`);
    }
    return target;
  }

  async init(): Promise<void> { await mkdir(this.root, { recursive: true }); }
  async cleanup(): Promise<void> { await rm(this.root, { recursive: true, force: true }); }
  async read(path: string): Promise<string> { return readFile(this.path(path), "utf8"); }

  async apply(patches: FilePatch[]): Promise<void> {
    await this.init();
    for (const patch of patches) {
      const target = this.path(patch.path);
      if (patch.operation === "delete") { await rm(target, { recursive: true, force: true }); continue; }
      if (patch.content === undefined) throw new Error(`Missing content for ${patch.operation}: ${patch.path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, patch.content, "utf8");
    }
  }
}

export class LocalSandboxRuntime {
  private readonly allowedCommands: Set<string>;
  private readonly maxTimeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(private readonly workspace: ProjectWorkspace, policy: RuntimePolicy = {}) {
    this.allowedCommands = new Set(policy.allowedCommands ?? ["node"]);
    this.maxTimeoutMs = Math.max(100, policy.maxTimeoutMs ?? 15_000);
    this.maxOutputBytes = Math.max(1024, policy.maxOutputBytes ?? 256 * 1024);
  }

  async run(spec: ProcessSpec): Promise<RuntimeResult> {
    if (!this.allowedCommands.has(spec.command)) throw new Error(`Command is not allowed: ${spec.command}`);
    await this.workspace.init();
    const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? 10_000, 100), this.maxTimeoutMs);
    const started = Date.now();

    return new Promise((complete) => {
      const child = spawn(spec.command, spec.args ?? [], {
        cwd: this.workspace.root,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", CI: "1" },
      });
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let timedOut = false;
      let exceeded = false;
      let spawnError: Error | undefined;
      const capture = (stream: "stdout" | "stderr", chunk: Buffer) => {
        if (exceeded) return;
        const remaining = this.maxOutputBytes - bytes;
        const accepted = chunk.subarray(0, Math.max(0, remaining));
        bytes += accepted.byteLength;
        if (stream === "stdout") stdout += accepted.toString(); else stderr += accepted.toString();
        if (accepted.byteLength < chunk.byteLength || bytes >= this.maxOutputBytes) { exceeded = true; child.kill("SIGKILL"); }
      };
      child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
      child.on("error", (error) => { spawnError = error; });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (spawnError) stderr += `${stderr ? "\n" : ""}${spawnError.message}`;
        if (timedOut) stderr += `${stderr ? "\n" : ""}Process timed out after ${timeoutMs}ms`;
        if (exceeded) stderr += `${stderr ? "\n" : ""}Process output exceeded ${this.maxOutputBytes} bytes`;
        complete({ ok: code === 0 && !timedOut && !exceeded && !spawnError, stdout, stderr, durationMs: Date.now() - started });
      });
    });
  }
}
