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
  const [previewRevision, setPreviewRevision] = useState(0);

  const latest = events.at(-1);
  const activeIndex = latest ? pipeline.indexOf(latest.phase) : -1;
  const previewUrl = [...events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;
  const previewSrc = previewUrl ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}rev=${previewRevision}` : undefined;

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (!intent.trim() || running) return;
    setEvents([]);
    setRunning(true);
    setPreviewRevision(0);

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
    <div className="missionConsole">
      <form className="prompt" onSubmit={execute}>
        <span>›</span><input aria-label="Prompt" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Diga ao Monstro o que construir..."/><button disabled={running}>{running ? "RUNNING" : "EXECUTE"}</button>
      </form>
      <div className="missionFeed">
        {events.slice(-4).map((event) => <div key={event.id}><b>{event.phase.toUpperCase()}</b> {event.type}{event.detail ? ` · ${event.detail}` : ""}</div>)}
      </div>
      <div className="pipeline livePipeline">{pipeline.map((phase, index) => <div key={phase} className={index < activeIndex ? "done" : index === activeIndex ? "running" : ""}><b>{String(index + 1).padStart(2,"0")}</b><span>{phase.toUpperCase()}</span></div>)}</div>

      <section className="livePreviewStage" aria-label="Live preview">
        <div className="previewToolbar">
          <span><i className={previewUrl ? "online" : ""} /> {previewUrl ? "MISSION PREVIEW" : "WAITING FOR BUILD"}</span>
          <div>
            <button type="button" disabled={!previewUrl} onClick={() => setPreviewRevision((value) => value + 1)}>REFRESH</button>
            {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer">OPEN ↗</a> : null}
          </div>
        </div>
        {previewSrc ? <iframe key={previewSrc} title="MONSTRO generated preview" src={previewSrc} sandbox="allow-scripts allow-forms allow-modals allow-popups" /> : <div className="previewEmpty"><div className="orb"><div className="core">M</div></div><h1>BUILD. RUN.<br/><em>OBSERVE. REPAIR.</em></h1><p>Execute uma missão para renderizar o artefato real aqui.</p></div>}
      </section>
    </div>
  );
}
