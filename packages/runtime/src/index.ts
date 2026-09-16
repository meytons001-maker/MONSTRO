import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import type { FilePatch, RuntimeResult } from "@monstro/contracts";

export interface ProcessSpec {
  command: string;
  args?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RuntimePolicy {
  allowedCommands?: readonly string[];
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
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
  async cleanup(): Promise<void> { await rm(this.root, { recursive: true, force: true }); }

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

const DEFAULT_ALLOWED_COMMANDS = ["node", "npm", "pnpm"] as const;
const MIN_TIMEOUT_MS = 100;
const DEFAULT_MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

export class LocalSandboxRuntime {
  private readonly allowedCommands: Set<string>;
  private readonly maxTimeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(private readonly workspace: ProjectWorkspace, policy: RuntimePolicy = {}) {
    this.allowedCommands = new Set(policy.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS);
    this.maxTimeoutMs = Math.max(MIN_TIMEOUT_MS, policy.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS);
    this.maxOutputBytes = Math.max(1024, policy.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  }

  async run(spec: ProcessSpec): Promise<RuntimeResult> {
    if (!this.allowedCommands.has(spec.command)) throw new Error(`Command is not allowed: ${spec.command}`);
    const started = Date.now();
    const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? 10_000, MIN_TIMEOUT_MS), this.maxTimeoutMs);
    const outputLimit = Math.min(Math.max(spec.maxOutputBytes ?? this.maxOutputBytes, 1024), this.maxOutputBytes);

    return new Promise((resolveResult) => {
      const child = spawn(spec.command, spec.args ?? [], {
        cwd: this.workspace.root,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", CI: "1" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let timedOut = false;
      let outputExceeded = false;
      let spawnError: Error | undefined;

      const capture = (target: "stdout" | "stderr", chunk: Buffer | string) => {
        if (outputExceeded) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        const remaining = outputLimit - outputBytes;
        if (remaining <= 0) {
          outputExceeded = true;
          child.kill("SIGKILL");
          return;
        }
        const accepted = buffer.subarray(0, remaining);
        outputBytes += accepted.byteLength;
        if (target === "stdout") stdout += accepted.toString(); else stderr += accepted.toString();
        if (accepted.byteLength < buffer.byteLength || outputBytes >= outputLimit) {
          outputExceeded = true;
          child.kill("SIGKILL");
        }
      };

      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.stdout.on("data", (chunk) => capture("stdout", chunk));
      child.stderr.on("data", (chunk) => capture("stderr", chunk));
      child.on("error", (error) => { spawnError = error; });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (spawnError) stderr += `\n${spawnError.message}`;
        if (timedOut) stderr += `\nProcess timed out after ${timeoutMs}ms`;
        if (outputExceeded) stderr += `\nProcess output exceeded ${outputLimit} bytes`;
        resolveResult({
          ok: code === 0 && !timedOut && !outputExceeded && !spawnError,
          stdout,
          stderr,
          durationMs: Date.now() - started,
        });
      });
    });
  }
}
