import { createMission } from "../../../lib/mission-runtime";
import { createMissionJournalStore, listPersistedMissions, loadPersistedMission } from "../../../lib/mission-persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();

  try {
    if (!taskId) {
      return Response.json(
        { missions: await listPersistedMissions() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const mission = await loadPersistedMission(taskId);
    if (mission.events.length === 0) return Response.json({ error: "Mission not found." }, { status: 404 });
    return Response.json(mission, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: "Mission journal could not be replayed.", detail: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { intent?: string };
  const intent = body.intent?.trim();

  if (!intent) return Response.json({ error: "Mission intent is required." }, { status: 400 });

  const { task, journal, orchestrator } = createMission(intent);
  const store = createMissionJournalStore();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const unsubscribePersistence = journal.subscribe((event) => store.append(event));
      const unsubscribeStream = journal.subscribe((event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });

      try {
        await journal.record(task, "phase.changed", intent);
        await orchestrator.execute(task);
      } catch {
        // The orchestrator records mission.failed before rethrowing.
      } finally {
        unsubscribeStream();
        unsubscribePersistence();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Monstro-Task": task.id,
    },
  });
}
