"use client";

import { MissionNdjsonParser, type MissionTransportEvent } from "@monstro/contracts";
import { FormEvent, useEffect, useState } from "react";
import { formatMissionHistoryLabel, parseMissionHistoryPayload, type MissionHistoryItem } from "../lib/mission-history";

const pipeline = ["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver"];

type PersistedMission = {
  taskId: string;
  events: MissionTransportEvent[];
};

export function MissionConsole() {
  const [intent, setIntent] = useState("Crie uma experiência web cinematográfica e valide o resultado.");
  const [events, setEvents] = useState<MissionTransportEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [taskId, setTaskId] = useState("");
  const [restoreId, setRestoreId] = useState("");
  const [history, setHistory] = useState<MissionHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");

  const latest = events.at(-1);
  const activeIndex = latest ? pipeline.indexOf(latest.phase) : -1;
  const previewUrl = [...events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;
  const progress = [...events].reverse().find((event) => event.type === "trace.updated" && event.data?.progress)?.data?.progress;
  const previewSrc = previewUrl ? `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}rev=${previewRevision}` : undefined;

  async function refreshHistory() {
    try {
      const response = await fetch("/api/missions", { cache: "no-store" });
      if (!response.ok) throw new Error("Mission history unavailable");
      const missions = parseMissionHistoryPayload(await response.json());
      setHistory(missions);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Mission history unavailable");
    }
  }

  useEffect(() => { void refreshHistory(); }, []);

  function clientFailure(detail: string) {
    setEvents((current) => [...current, { id: `client:error:${Date.now()}`, taskId: taskId || "client", type: "mission.failed", phase: "failed", timestamp: new Date().toISOString(), detail }]);
  }

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (!intent.trim() || running) return;
    setEvents([]); setRunning(true); setPreviewRevision(0); setTaskId("");
    try {
      const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }) });
      if (!response.ok || !response.body) throw new Error("Mission transport unavailable");
      const responseTaskId = response.headers.get("X-Monstro-Task")?.trim();
      if (responseTaskId) { setTaskId(responseTaskId); setRestoreId(responseTaskId); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); const parser = new MissionNdjsonParser();
      while (true) {
        const { value, done } = await reader.read();
        const parsed = parser.push(decoder.decode(value ?? new Uint8Array(), { stream: !done }));
        if (parsed.length) setEvents((current) => [...current, ...parsed]);
        if (done) { const tail = parser.finish(); if (tail.length) setEvents((current) => [...current, ...tail]); break; }
      }
    } catch (error) { clientFailure(error instanceof Error ? error.message : "Unknown error"); }
    finally { setRunning(false); await refreshHistory(); }
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    const requestedTaskId = restoreId.trim();
    if (!requestedTaskId || running) return;
    setRunning(true); setPreviewRevision(0);
    try {
      const response = await fetch(`/api/missions?taskId=${encodeURIComponent(requestedTaskId)}`, { cache: "no-store" });
      const payload = (await response.json()) as PersistedMission | { error?: string; detail?: string };
      if (!response.ok || !("events" in payload) || !Array.isArray(payload.events)) {
        const failure = "error" in payload ? payload.detail || payload.error : undefined;
        throw new Error(failure || "Mission could not be restored");
      }
      setEvents(payload.events);
      setTaskId(payload.taskId || requestedTaskId);
      setRestoreId(payload.taskId || requestedTaskId);
    } catch (error) {
      setEvents([]);
      clientFailure(error instanceof Error ? error.message : "Unknown restore error");
    } finally { setRunning(false); }
  }

  return <div className="missionConsole">
    <form className="prompt" onSubmit={execute}><span>›</span><input aria-label="Prompt" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Diga ao Monstro o que construir..."/><button disabled={running}>{running ? "RUNNING" : "EXECUTE"}</button></form>
    <form className="prompt historyPrompt" onSubmit={restore}><span>↺</span><select aria-label="Mission history" value={restoreId} onChange={(event) => setRestoreId(event.target.value)}><option value="">{historyError ? historyError : history.length ? "Selecione uma missão persistida..." : "Nenhuma missão persistida"}</option>{history.map((mission) => <option key={mission.taskId} value={mission.taskId}>{formatMissionHistoryLabel(mission)}</option>)}</select><button type="button" disabled={running} onClick={() => void refreshHistory()}>REFRESH</button><button disabled={running || !restoreId.trim()}>RESTORE</button></form>
    {taskId ? <div className="missionFeed"><div><b>MISSION</b> {taskId}</div></div> : null}
    <div className="missionFeed">{events.slice(-4).map((event) => <div key={event.id}><b>{event.phase.toUpperCase()}</b> {event.type}{event.detail ? ` · ${event.detail}` : ""}</div>)}</div>
    <div className="pipeline livePipeline">{pipeline.map((phase, index) => <div key={phase} className={index < activeIndex ? "done" : index === activeIndex ? "running" : ""}><b>{String(index + 1).padStart(2,"0")}</b><span>{phase.toUpperCase()}</span></div>)}</div>
    {progress ? <section className="traceProgress" aria-label="Mission trace progress"><div><b>BUILD</b><strong>{progress.build.length}</strong><span>{progress.build.at(-1)?.path ?? "—"}</span></div><div><b>EVALUATE</b><strong>{progress.evaluations.at(-1)?.score ?? "—"}</strong><span>{progress.evaluations.at(-1)?.accepted ? "ACCEPTED" : progress.evaluations.length ? "REVIEW" : "WAITING"}</span></div><div><b>REPAIR</b><strong>{progress.repairs.length}</strong><span>{progress.repairs.at(-1)?.path ?? "—"}</span></div><div><b>REQUIREMENTS</b><strong>{new Set([...progress.build.flatMap((item) => item.requirementIds), ...progress.evaluations.flatMap((item) => item.requirementIds)]).size}</strong><span>{progress.evaluations.at(-1)?.findingCodes.join(", ") || "TRACKED"}</span></div></section> : null}
    <section className="livePreviewStage" aria-label="Live preview"><div className="previewToolbar"><span><i className={previewUrl ? "online" : ""} /> {previewUrl ? "MISSION PREVIEW" : "WAITING FOR BUILD"}</span><div><button type="button" disabled={!previewUrl} onClick={() => setPreviewRevision((value) => value + 1)}>REFRESH</button>{previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer">OPEN ↗</a> : null}</div></div>{previewSrc ? <iframe key={previewSrc} title="MONSTRO generated preview" src={previewSrc} sandbox="allow-scripts allow-forms allow-modals allow-popups" /> : <div className="previewEmpty"><div className="orb"><div className="core">M</div></div><h1>BUILD. RUN.<br/><em>OBSERVE. REPAIR.</em></h1><p>Execute ou restaure uma missão para renderizar o artefato real aqui.</p></div>}</section>
  </div>;
}
