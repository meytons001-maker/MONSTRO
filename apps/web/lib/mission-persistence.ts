import { join } from "node:path";
import { FileMissionJournalStore, MissionJournal, replayMissionTraceProgress } from "@monstro/core";

const DEFAULT_DIRECTORY = join(process.cwd(), ".monstro", "missions");

export function createMissionJournalStore() {
  return new FileMissionJournalStore({
    directory: process.env.MONSTRO_MISSION_JOURNAL_DIR?.trim() || DEFAULT_DIRECTORY,
  });
}

export async function loadPersistedMission(taskId: string) {
  const store = createMissionJournalStore();
  const journal = await MissionJournal.replay(taskId, store);
  const events = journal.snapshot();
  return {
    taskId,
    events,
    progress: replayMissionTraceProgress(events),
    lastEvent: events.at(-1) ?? null,
  };
}

export async function listPersistedMissions() {
  const store = createMissionJournalStore();
  const taskIds = await store.listTaskIds();
  const missions = await Promise.all(taskIds.map(async (taskId) => {
    const mission = await loadPersistedMission(taskId);
    const firstEvent = mission.events[0] ?? null;
    return {
      taskId,
      phase: mission.lastEvent?.phase ?? firstEvent?.phase ?? null,
      status: mission.lastEvent?.type ?? null,
      updatedAt: mission.lastEvent?.timestamp ?? firstEvent?.timestamp ?? null,
      eventCount: mission.events.length,
      progress: mission.progress,
    };
  }));

  return missions.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}
