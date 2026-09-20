import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MissionEvent } from "@monstro/core";
import { createV0Services } from "./mission-runtime";

export interface ResumableMissionRuntime {
  task: MonstroTask;
  events: readonly MissionEvent[];
  journal: MissionJournal;
  orchestrator: MonstroOrchestrator;
}

export function createResumableMissionRuntime(task: MonstroTask, events: readonly MissionEvent[]): ResumableMissionRuntime {
  const resumedTask = structuredClone(task);
  const persistedEvents = events.map((event) => structuredClone(event));
  const journal = new MissionJournal();
  const orchestrator = new MonstroOrchestrator(createV0Services(resumedTask), journal);

  return {
    task: resumedTask,
    events: persistedEvents,
    journal,
    orchestrator,
  };
}
