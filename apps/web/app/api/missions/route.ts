import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const phases = ["understand", "inspect", "plan", "build", "run", "evaluate", "deliver"] as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { intent?: string };
  const intent = body.intent?.trim();

  if (!intent) {
    return Response.json({ error: "Mission intent is required." }, { status: 400 });
  }

  const taskId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        for (let index = 0; index < phases.length; index += 1) {
          const phase = phases[index];
          emit({ id: `${taskId}:${index + 1}`, taskId, type: "phase.changed", phase, timestamp: new Date().toISOString(), detail: intent });
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        emit({ id: `${taskId}:done`, taskId, type: "mission.completed", phase: "deliver", timestamp: new Date().toISOString(), detail: "V0 transport pipeline completed." });
      } catch (error) {
        emit({ id: `${taskId}:failed`, taskId, type: "mission.failed", phase: "failed", timestamp: new Date().toISOString(), detail: error instanceof Error ? error.message : "Unknown mission error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Monstro-Task": taskId,
    },
  });
}
