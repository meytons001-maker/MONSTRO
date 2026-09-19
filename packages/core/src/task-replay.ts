import type { MonstroTask, TaskPhase } from "@monstro/contracts";
import type { MissionEvent } from "./mission.js";

const phases = new Set<TaskPhase>(["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver"]);

function isTask(value: unknown): value is MonstroTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<MonstroTask>;
  return typeof task.id === "string"
    && typeof task.intent === "string"
    && typeof task.phase === "string"
    && phases.has(task.phase as TaskPhase)
    && typeof task.context === "object"
    && task.context !== null
    && Array.isArray(task.requestedCapabilities)
    && Array.isArray(task.acceptance)
    && Number.isInteger(task.iteration)
    && Number.isInteger(task.maxIterations);
}

/** Reconstructs the latest durable task checkpoint emitted by the orchestrator. */
export function replayMissionTask(events: readonly MissionEvent[]): MonstroTask | undefined {
  let checkpoint: MonstroTask | undefined;
  for (const event of events) {
    const candidate = event.data?.task;
    if (candidate === undefined) continue;
    if (!isTask(candidate)) throw new Error(`Invalid task checkpoint in mission event ${event.id}`);
    if (candidate.id !== event.taskId) throw new Error(`Task checkpoint ${event.id} belongs to a different mission`);
    checkpoint = structuredClone(candidate);
  }
  return checkpoint ? structuredClone(checkpoint) : undefined;
}

export interface MissionResumeDecision {
  resumable: boolean;
  task?: MonstroTask;
  restartPhase?: "inspect" | "run";
  reason: string;
}

/**
 * Chooses a conservative restart boundary from durable events.
 * Build/repair are never replayed when their completion is ambiguous: the mission
 * falls back to inspection instead of risking duplicate filesystem side effects.
 */
export function planMissionResume(events: readonly MissionEvent[]): MissionResumeDecision {
  if (events.some((event) => event.type === "mission.completed")) {
    return { resumable: false, reason: "Mission is already completed" };
  }

  const task = replayMissionTask(events);
  if (!task) return { resumable: false, reason: "Mission has no durable task checkpoint" };

  let checkpointIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.data?.task !== undefined) { checkpointIndex = index; break; }
  }
  const afterCheckpoint = events.slice(checkpointIndex + 1);

  if (task.phase === "build") {
    const applied = afterCheckpoint.some((event) => event.type === "build.applied");
    return applied
      ? { resumable: true, task, restartPhase: "run", reason: "Initial build was durably recorded as applied" }
      : { resumable: true, task, restartPhase: "inspect", reason: "Build completion is ambiguous; restart before planning to avoid duplicate writes" };
  }

  if (task.phase === "repair") {
    const repaired = afterCheckpoint.some((event) => event.type === "repair.completed");
    return repaired
      ? { resumable: true, task, restartPhase: "run", reason: "Repair was durably recorded as applied" }
      : { resumable: true, task, restartPhase: "inspect", reason: "Repair completion is ambiguous; restart before planning to avoid duplicate writes" };
  }

  if (["run", "observe", "evaluate", "deliver"].includes(task.phase)) {
    return { resumable: true, task, restartPhase: "run", reason: `Phase ${task.phase} can be safely regenerated from the persisted workspace` };
  }

  return { resumable: true, task, restartPhase: "inspect", reason: `Phase ${task.phase} resumes from inspection` };
}
