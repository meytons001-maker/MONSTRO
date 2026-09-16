import { createMission } from "../../../lib/mission-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { intent?: string };
  const intent = body.intent?.trim();

  if (!intent) return Response.json({ error: "Mission intent is required." }, { status: 400 });

  const { task, journal, orchestrator } = createMission(intent);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const unsubscribe = journal.subscribe((event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });

      try {
        await journal.record(task, "phase.changed", intent);
        await orchestrator.execute(task);
      } catch {
        // The orchestrator records mission.failed before rethrowing.
      } finally {
        unsubscribe();
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
