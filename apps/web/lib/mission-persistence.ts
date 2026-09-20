import { join } from "node:path";
import { FileMissionJournalStore, MissionJournal, planMissionResume, replayMissionTraceProgress } from "@monstro/core";
import { checkMissionWorkspaceForRun } from "./mission-workspace";

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
  const resume = planMissionResume(events);
  return {
    taskId,
    events,
    progress: replayMissionTraceProgress(events),
    resume: {
      resumable: resume.resumable,
      restartPhase: resume.restartPhase ?? null,
      reason: resume.reason,
      task: resume.task ?? null,
    },
    lastEvent: events.at(-1) ?? null,
  };
}

export async function listPersistedMissions() {
  const store = createMissionJournalStore();
  const taskIds = await store.listTaskIds();
  const missions = await Promise.all(taskIds.map(async (taskId) => {
    const mission = await loadPersistedMission(taskId);
    const firstEvent = mission.events[0] ?? null;
    let restartPhase = mission.resume.restartPhase;
    let resumeReason = mission.resume.reason;

    // History is an operator preflight surface, not just journal replay. A confirmed
    // build can only resume directly at run while its physical artifacts still exist.
    if (mission.resume.resumable && restartPhase === "run" && mission.resume.task) {
      const workspace = await checkMissionWorkspaceForRun(mission.resume.task);
      if (!workspace.ready) {
        restartPhase = "inspect";
        resumeReason = `Workspace cannot continue from run; rebuilding conservatively from inspect. ${workspace.reason}`;
      }
    }

    return {
      taskId,
      phase: mission.lastEvent?.phase ?? firstEvent?.phase ?? null,
      status: mission.lastEvent?.type ?? null,
      updatedAt: mission.lastEvent?.timestamp ?? firstEvent?.timestamp ?? null,
      eventCount: mission.events.length,
      progress: mission.progress,
      resumable: mission.resume.resumable,
      restartPhase,
      resumeReason,
    };
  }));

  return missions.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}
