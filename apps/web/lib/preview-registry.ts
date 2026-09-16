import type { PreviewHandle } from "@monstro/runtime";

type PreviewEntry = {
  taskId: string;
  handle: PreviewHandle;
  createdAt: number;
  expiresAt: number;
};

class PreviewRegistry {
  private readonly entries = new Map<string, PreviewEntry>();
  constructor(private readonly ttlMs = 15 * 60_000) {}

  async register(taskId: string, handle: PreviewHandle) {
    await this.remove(taskId);
    const now = Date.now();
    this.entries.set(taskId, { taskId, handle, createdAt: now, expiresAt: now + this.ttlMs });
  }

  get(taskId: string) {
    const entry = this.entries.get(taskId);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      void this.remove(taskId);
      return undefined;
    }
    return entry;
  }

  async remove(taskId: string) {
    const entry = this.entries.get(taskId);
    if (!entry) return;
    this.entries.delete(taskId);
    await entry.handle.stop();
  }

  async sweep() {
    const now = Date.now();
    await Promise.all([...this.entries.values()].filter((entry) => now >= entry.expiresAt).map((entry) => this.remove(entry.taskId)));
  }
}

const globalForPreviews = globalThis as typeof globalThis & { __monstroPreviewRegistry?: PreviewRegistry };
export const previewRegistry = globalForPreviews.__monstroPreviewRegistry ?? new PreviewRegistry();
if (process.env.NODE_ENV !== "production") globalForPreviews.__monstroPreviewRegistry = previewRegistry;
