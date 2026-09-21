import type { MissionPatchProgress, MissionTraceProgress, MissionTransportEvent } from "./index.js";

const phases = new Set(["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver", "failed"]);
const eventTypes = new Set(["phase.changed", "iteration.started", "understanding.completed", "inspection.completed", "runtime.completed", "observation.completed", "build.applied", "repair.completed", "trace.updated", "mission.resumed", "mission.completed", "mission.failed"]);
const operations = new Set(["create", "update", "delete"]);
const profiles = new Set(["web", "interactive-web"]);
const interactivities = new Set(["structural", "interactive"]);
const fidelities = new Set(["advisory", "required"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function patch(value: unknown): value is MissionPatchProgress {
  return record(value) && typeof value.path === "string" && operations.has(String(value.operation)) && strings(value.requirementIds);
}

function progress(value: unknown): value is MissionTraceProgress {
  if (!record(value) || !Array.isArray(value.build) || !Array.isArray(value.repairs) || !Array.isArray(value.evaluations)) return false;
  if (!value.build.every(patch) || !value.repairs.every(patch)) return false;
  return value.evaluations.every((item) => record(item)
    && Number.isInteger(item.iteration)
    && typeof item.accepted === "boolean"
    && typeof item.score === "number"
    && strings(item.requirementIds)
    && strings(item.findingCodes)
    && strings(item.repairActionIds));
}

function understanding(value: unknown): boolean {
  return record(value)
    && profiles.has(String(value.profile))
    && value.artifact === "web-preview"
    && interactivities.has(String(value.interactivity))
    && fidelities.has(String(value.experienceFidelity))
    && typeof value.rationale === "string"
    && Number.isInteger(value.acceptanceCount)
    && Number(value.acceptanceCount) >= 0;
}

export function parseMissionTransportEvent(line: string): MissionTransportEvent {
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new Error("Invalid mission transport JSON"); }
  if (!record(value)
    || typeof value.id !== "string"
    || typeof value.taskId !== "string"
    || typeof value.type !== "string" || !eventTypes.has(value.type)
    || typeof value.phase !== "string" || !phases.has(value.phase)
    || typeof value.timestamp !== "string" || Number.isNaN(Date.parse(value.timestamp))) {
    throw new Error("Invalid mission transport event");
  }
  if (value.detail !== undefined && typeof value.detail !== "string") throw new Error("Invalid mission transport detail");
  if (value.data !== undefined) {
    if (!record(value.data)) throw new Error("Invalid mission transport data");
    if (value.type === "understanding.completed" && !understanding(value.data)) throw new Error("Invalid mission understanding");
    if (value.data.previewUrl !== undefined && typeof value.data.previewUrl !== "string") throw new Error("Invalid mission preview URL");
    if (value.data.artifacts !== undefined && !strings(value.data.artifacts)) throw new Error("Invalid mission artifacts");
    if (value.data.completedAt !== undefined && (typeof value.data.completedAt !== "string" || Number.isNaN(Date.parse(value.data.completedAt)))) throw new Error("Invalid mission completion timestamp");
    if (value.data.evidenceCount !== undefined && (!Number.isInteger(value.data.evidenceCount) || Number(value.data.evidenceCount) < 0)) throw new Error("Invalid mission evidence count");
    if (value.data.evidenceSources !== undefined && !strings(value.data.evidenceSources)) throw new Error("Invalid mission evidence sources");
    if (value.data.evidenceKinds !== undefined && !strings(value.data.evidenceKinds)) throw new Error("Invalid mission evidence kinds");
    if (value.data.progress !== undefined && !progress(value.data.progress)) throw new Error("Invalid mission trace progress");
  } else if (value.type === "understanding.completed") {
    throw new Error("Invalid mission understanding");
  }
  return value as unknown as MissionTransportEvent;
}

export class MissionNdjsonParser {
  private buffer = "";

  push(chunk: string): MissionTransportEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim()).map(parseMissionTransportEvent);
  }

  finish(): MissionTransportEvent[] {
    const tail = this.buffer.trim();
    this.buffer = "";
    return tail ? [parseMissionTransportEvent(tail)] : [];
  }
}
