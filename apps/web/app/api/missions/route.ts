import { createMission } from "../../../lib/mission-runtime";
import { createResumableMissionRuntime } from "../../../lib/mission-resume-runtime";
import { resolveEffectiveMissionResume } from "../../../lib/mission-resume-decision";
import { createMissionJournalStore, listPersistedMissions, loadPersistedMission } from "../../../lib/mission-persistence";
import { createMissionEventStream } from "../../../lib/mission-stream";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
  try {
    if (!taskId) return Response.json({ missions: await listPersistedMissions() }, { headers: { "Cache-Control": "no-store" } });
    const mission = await loadPersistedMission(taskId);
    if (mission.events.length === 0) return Response.json({ error: "Mission not found." }, { status: 404 });
    return Response.json(mission, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Mission journal could not be replayed.", detail: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { intent?: string; resumeTaskId?: string };
  const resumeTaskId = body.resumeTaskId?.trim();
  const intent = body.intent?.trim();
  const store = createMissionJournalStore();

  if (resumeTaskId) {
    let persisted;
    try { persisted = await loadPersistedMission(resumeTaskId); }
    catch (error) {
      return Response.json({ error: "Mission journal could not be replayed.", detail: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
    }
    if (persisted.events.length === 0) return Response.json({ error: "Mission not found." }, { status: 404 });

    const resume = await resolveEffectiveMissionResume(persisted.resume);
    if (!resume.resumable || !resume.task) {
      return Response.json({ error: "Mission cannot be resumed safely.", reason: resume.reason }, { status: 409 });
    }

    const resumePhase = resume.restartPhase ?? "inspect";
    const { task, events, journal, orchestrator } = createResumableMissionRuntime(resume.task, persisted.events);
    return createMissionEventStream({
      task,
      journal,
      sink: store,
      resumePhase,
      execute: () => orchestrator.resume(events, resume.degraded ? { restartPhase: "inspect", reason: resume.reason } : undefined),
    });
  }

  if (!intent) return Response.json({ error: "Mission intent is required." }, { status: 400 });
  const { task, journal, orchestrator } = createMission(intent);
  return createMissionEventStream({
    task,
    journal,
    sink: store,
    execute: async () => {
      await journal.record(task, "phase.changed", intent);
      return orchestrator.execute(task);
    },
  });
}
