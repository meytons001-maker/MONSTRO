import type { MonstroTask, TaskPhase } from "@monstro/contracts";

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

export class MissionJournal {
  private readonly events: MissionEvent[] = [];
  private readonly listeners = new Set<MissionListener>();

  subscribe(listener: MissionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): readonly MissionEvent[] {
    return [...this.events];
  }

  async record(task: MonstroTask, type: MissionEventType, detail?: string, data?: Record<string, unknown>): Promise<MissionEvent> {
    const event: MissionEvent = {
      id: `${task.id}:${this.events.length + 1}`,
      taskId: task.id,
      phase: task.phase,
      type,
      timestamp: new Date().toISOString(),
      detail,
      data,
    };
    this.events.push(event);
    await Promise.all([...this.listeners].map((listener) => listener(event)));
    return event;
  }
}
