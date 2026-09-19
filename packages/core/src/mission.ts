import type { MonstroTask, TaskPhase } from "@monstro/contracts";
import type { MissionJournalStore } from "./mission-store.js";

export type MissionEventType =
  | "phase.changed"
  | "iteration.started"
  | "observation.completed"
  | "build.applied"
  | "trace.updated"
  | "repair.completed"
  | "mission.completed"
  | "mission.failed";

export interface MissionEvent {
  id: string;
  taskId: string;
  phase: TaskPhase;
  type: MissionEventType;
  timestamp: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export type MissionListener = (event: MissionEvent) => void | Promise<void>;

function cloneEvent(event: MissionEvent): MissionEvent {
  return { ...event, data: event.data ? structuredClone(event.data) : undefined };
}

export class MissionJournal {
  private readonly events: MissionEvent[] = [];
  private readonly listeners = new Set<MissionListener>();

  constructor(private readonly store?: MissionJournalStore) {}

  static async replay(taskId: string, store: MissionJournalStore): Promise<MissionJournal> {
    const journal = new MissionJournal(store);
    const persisted = await store.load(taskId);
    journal.events.push(...persisted.map(cloneEvent));
    return journal;
  }

  subscribe(listener: MissionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): readonly MissionEvent[] {
    return this.events.map(cloneEvent);
  }

  async record(task: MonstroTask, type: MissionEventType, detail?: string, data?: Record<string, unknown>): Promise<MissionEvent> {
    const event: MissionEvent = {
      id: `${task.id}:${this.events.length + 1}`,
      taskId: task.id,
      phase: task.phase,
      type,
      timestamp: new Date().toISOString(),
      detail,
      data: data ? structuredClone(data) : undefined,
    };
    await this.store?.append(event);
    this.events.push(cloneEvent(event));
    await Promise.all([...this.listeners].map((listener) => listener(cloneEvent(event))));
    return cloneEvent(event);
  }
}
