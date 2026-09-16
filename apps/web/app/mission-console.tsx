"use client";

import { FormEvent, useState } from "react";

type MissionEvent = {
  id: string;
  taskId: string;
  type: "phase.changed" | "iteration.started" | "mission.completed" | "mission.failed";
  phase: string;
  timestamp: string;
  detail?: string;
  data?: { previewUrl?: string; artifacts?: string[]; completedAt?: string };
};

const pipeline = ["understand", "inspect", "plan", "build", "run", "evaluate", "repair", "deliver"];

export function MissionConsole() {
  const [intent, setIntent] = useState("Crie uma experiência web cinematográfica e valide o resultado.");
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [running, setRunning] = useState(false);

  const latest = events.at(-1);
  const activeIndex = latest ? pipeline.indexOf(latest.phase) : -1;
  const previewUrl = [...events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (!intent.trim() || running) return;
    setEvents([]);
    setRunning(true);

    try {
      const response = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      if (!response.ok || !response.body) throw new Error("Mission transport unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) setEvents((current) => [...current, JSON.parse(line) as MissionEvent]);
        }
        if (done) break;
      }
    } catch (error) {
      setEvents((current) => [...current, { id: "client:error", taskId: "client", type: "mission.failed", phase: "failed", timestamp: new Date().toISOString(), detail: error instanceof Error ? error.message : "Unknown error" }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <form className="prompt" onSubmit={execute}>
        <span>›</span><input aria-label="Prompt" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Diga ao Monstro o que construir..."/><button disabled={running}>{running ? "RUNNING" : "EXECUTE"}</button>
      </form>
      <div className="missionFeed">
        {events.slice(-4).map((event) => <div key={event.id}><b>{event.phase.toUpperCase()}</b> {event.type}{event.detail ? ` · ${event.detail}` : ""}</div>)}
        {previewUrl ? <div><b>PREVIEW</b> <a href={previewUrl} target="_blank" rel="noreferrer">{previewUrl}</a></div> : null}
      </div>
      <div className="pipeline livePipeline">{pipeline.map((phase, index) => <div key={phase} className={index < activeIndex ? "done" : index === activeIndex ? "running" : ""}><b>{String(index + 1).padStart(2,"0")}</b><span>{phase.toUpperCase()}</span></div>)}</div>
    </>
  );
}
