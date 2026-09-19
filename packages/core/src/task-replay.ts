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
