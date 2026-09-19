import type { MissionEvent } from "./mission.js";

export interface MissionJournalStore {
  append(event: MissionEvent): Promise<void>;
  load(taskId: string): Promise<readonly MissionEvent[]>;
}

function cloneEvent(event: MissionEvent): MissionEvent {
  return {
    ...event,
    data: event.data ? structuredClone(event.data) : undefined,
  };
}

export class InMemoryMissionJournalStore implements MissionJournalStore {
  private readonly events = new Map<string, MissionEvent[]>();

  async append(event: MissionEvent): Promise<void> {
    const taskEvents = this.events.get(event.taskId) ?? [];
    taskEvents.push(cloneEvent(event));
    this.events.set(event.taskId, taskEvents);
  }

  async load(taskId: string): Promise<readonly MissionEvent[]> {
    return (this.events.get(taskId) ?? []).map(cloneEvent);
  }
}
