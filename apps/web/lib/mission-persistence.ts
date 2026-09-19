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
