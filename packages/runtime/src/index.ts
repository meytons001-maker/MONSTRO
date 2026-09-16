import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
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

export interface PreviewSpec {
  command: string;
  args?: string[];
  port?: number;
  host?: string;
  startupTimeoutMs?: number;
  healthPath?: string;
}

export interface PreviewHandle {
  url: string;
  stdout: string;
  stderr: string;
  stop(): Promise<void>;
}

export class ProjectWorkspace {
  readonly root: string;

  constructor(baseDir: string, projectId: string) { this.root = resolve(baseDir, projectId); }

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

async function freePort(host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("Unable to allocate preview port")); return; }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

export class LocalSandboxRuntime {
  private readonly allowedCommands: Set<string>;
  private readonly maxTimeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(private readonly workspace: ProjectWorkspace, policy: RuntimePolicy = {}) {
    this.allowedCommands = new Set(policy.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS);
    this.maxTimeoutMs = Math.max(MIN_TIMEOUT_MS, policy.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS);
    this.maxOutputBytes = Math.max(1024, policy.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  }

  private assertCommand(command: string): void {
    if (!this.allowedCommands.has(command)) throw new Error(`Command is not allowed: ${command}`);
  }

  async run(spec: ProcessSpec): Promise<RuntimeResult> {
    this.assertCommand(spec.command);
    const started = Date.now();
    const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? 10_000, MIN_TIMEOUT_MS), this.maxTimeoutMs);
    const outputLimit = Math.min(Math.max(spec.maxOutputBytes ?? this.maxOutputBytes, 1024), this.maxOutputBytes);

    return new Promise((resolveResult) => {
      const child = spawn(spec.command, spec.args ?? [], { cwd: this.workspace.root, env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", CI: "1" }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; let outputBytes = 0; let timedOut = false; let outputExceeded = false; let spawnError: Error | undefined;
      const capture = (target: "stdout" | "stderr", chunk: Buffer | string) => {
        if (outputExceeded) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        const remaining = outputLimit - outputBytes;
        if (remaining <= 0) { outputExceeded = true; child.kill("SIGKILL"); return; }
        const accepted = buffer.subarray(0, remaining); outputBytes += accepted.byteLength;
        if (target === "stdout") stdout += accepted.toString(); else stderr += accepted.toString();
        if (accepted.byteLength < buffer.byteLength || outputBytes >= outputLimit) { outputExceeded = true; child.kill("SIGKILL"); }
      };
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.stdout.on("data", (chunk) => capture("stdout", chunk)); child.stderr.on("data", (chunk) => capture("stderr", chunk)); child.on("error", (error) => { spawnError = error; });
      child.on("close", (code) => { clearTimeout(timer); if (spawnError) stderr += `\n${spawnError.message}`; if (timedOut) stderr += `\nProcess timed out after ${timeoutMs}ms`; if (outputExceeded) stderr += `\nProcess output exceeded ${outputLimit} bytes`; resolveResult({ ok: code === 0 && !timedOut && !outputExceeded && !spawnError, stdout, stderr, durationMs: Date.now() - started }); });
    });
  }

  async startPreview(spec: PreviewSpec): Promise<PreviewHandle> {
    this.assertCommand(spec.command);
    const host = spec.host ?? "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Preview host is not allowed: ${host}`);
    const port = spec.port ?? await freePort(host);
    const startupTimeoutMs = Math.min(Math.max(spec.startupTimeoutMs ?? 10_000, MIN_TIMEOUT_MS), this.maxTimeoutMs);
    const healthPath = spec.healthPath?.startsWith("/") ? spec.healthPath : `/${spec.healthPath ?? ""}`;
    const url = `http://${host}:${port}`;
    const child: ChildProcess = spawn(spec.command, [...(spec.args ?? []), "--port", String(port), "--host", host], { cwd: this.workspace.root, env: { PATH: process.env.PATH ?? "", NODE_ENV: "development", CI: "1", PORT: String(port), HOST: host }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let stopped = false;
    const capture = (target: "stdout" | "stderr", chunk: Buffer | string) => { const text = String(chunk); if (target === "stdout") stdout = (stdout + text).slice(-this.maxOutputBytes); else stderr = (stderr + text).slice(-this.maxOutputBytes); };
    child.stdout?.on("data", (chunk) => capture("stdout", chunk)); child.stderr?.on("data", (chunk) => capture("stderr", chunk));
    const stop = async () => { if (stopped) return; stopped = true; if (child.exitCode === null) child.kill("SIGTERM"); await new Promise<void>((resolveStop) => { if (child.exitCode !== null) return resolveStop(); const kill = setTimeout(() => { child.kill("SIGKILL"); resolveStop(); }, 1_000); child.once("close", () => { clearTimeout(kill); resolveStop(); }); }); };
    const started = Date.now();
    while (Date.now() - started < startupTimeoutMs) {
      if (child.exitCode !== null) { await stop(); throw new Error(`Preview exited before becoming ready (${child.exitCode}): ${stderr}`); }
      try { const response = await fetch(`${url}${healthPath}`, { signal: AbortSignal.timeout(500) }); if (response.status < 500) return { url, get stdout() { return stdout; }, get stderr() { return stderr; }, stop }; } catch { /* retry until startup timeout */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    await stop(); throw new Error(`Preview did not become ready within ${startupTimeoutMs}ms: ${stderr}`);
  }
}
