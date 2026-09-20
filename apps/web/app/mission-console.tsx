"use client";

import { MissionNdjsonParser, type MissionTransportEvent } from "@monstro/contracts";
import { FormEvent, useEffect, useState } from "react";
import { formatMissionResumeAction, parseMissionDetailPayload, type MissionDetail } from "../lib/mission-detail";
import { deriveMissionConsoleActions } from "../lib/mission-console-actions";
import { deriveMissionConsoleView, missionPipeline } from "../lib/mission-console-view";
import { beginMissionConsoleOperation, completeMissionConsoleOperation, failMissionConsoleOperation, initialMissionConsoleLifecycle, missionConsoleOperationLabel } from "../lib/mission-console-lifecycle";
import { deriveMissionConsoleStatus } from "../lib/mission-console-status";
import { formatMissionHistoryLabel, parseMissionHistoryPayload, type MissionHistoryItem } from "../lib/mission-history";

export function MissionConsole() {
  const [intent, setIntent] = useState("Crie uma experiência web cinematográfica e valide o resultado.");
  const [events, setEvents] = useState<MissionTransportEvent[]>([]);
  const [lifecycle, setLifecycle] = useState(initialMissionConsoleLifecycle);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [taskId, setTaskId] = useState("");
  const [restoreId, setRestoreId] = useState("");
  const [history, setHistory] = useState<MissionHistoryItem[]>([]);
  const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null);
  const [historyError, setHistoryError] = useState("");

  const view = deriveMissionConsoleView({ events, history, restoreId, missionDetail });
  const status = deriveMissionConsoleStatus(lifecycle, view);
  const actions = deriveMissionConsoleActions({ intent, restoreId, status, view });
  const previewSrc = view.previewUrl ? `${view.previewUrl}${view.previewUrl.includes("?") ? "&" : "?"}rev=${previewRevision}` : undefined;
  const operationLabel = missionConsoleOperationLabel(lifecycle);

  async function refreshHistory() {
    try {
      const response = await fetch("/api/missions", { cache: "no-store" });
      if (!response.ok) throw new Error("Mission history unavailable");
      setHistory(parseMissionHistoryPayload(await response.json())); setHistoryError("");
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "Mission history unavailable"); }
  }

  useEffect(() => { void refreshHistory(); }, []);

  function clientFailure(detail: string) {
    setEvents((current) => [...current, { id: `client:error:${Date.now()}`, taskId: taskId || restoreId || "client", type: "mission.failed", phase: "failed", timestamp: new Date().toISOString(), detail }]);
  }

  async function consumeMissionStream(response: Response) {
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as { error?: string; reason?: string };
      throw new Error(payload.reason || payload.error || "Mission transport unavailable");
    }
    const responseTaskId = response.headers.get("X-Monstro-Task")?.trim();
    if (responseTaskId) { setTaskId(responseTaskId); setRestoreId(responseTaskId); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); const parser = new MissionNdjsonParser();
    while (true) {
      const { value, done } = await reader.read();
      const parsed = parser.push(decoder.decode(value ?? new Uint8Array(), { stream: !done }));
      if (parsed.length) setEvents((current) => [...current, ...parsed]);
      if (done) { const tail = parser.finish(); if (tail.length) setEvents((current) => [...current, ...tail]); break; }
    }
  }

  async function loadMission(requestedTaskId: string) {
    const response = await fetch(`/api/missions?taskId=${encodeURIComponent(requestedTaskId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      const failure = payload && typeof payload === "object" ? (payload as { error?: string; detail?: string }).detail || (payload as { error?: string }).error : undefined;
      throw new Error(failure || "Mission could not be restored");
    }
    const detail = parseMissionDetailPayload(payload);
    setMissionDetail(detail); setEvents(detail.events); setTaskId(detail.taskId); setRestoreId(detail.taskId);
    return detail;
  }

  async function execute(event: FormEvent) {
    event.preventDefault(); if (!actions.canExecute) return;
    setEvents([]); setMissionDetail(null); setLifecycle(beginMissionConsoleOperation("executing")); setPreviewRevision(0); setTaskId("");
    try { await consumeMissionStream(await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }) })); }
    catch (error) { const detail = error instanceof Error ? error.message : "Unknown error"; setLifecycle(failMissionConsoleOperation(detail)); clientFailure(detail); }
    finally { setLifecycle((current) => current.failure ? current : completeMissionConsoleOperation()); await refreshHistory(); }
  }

  async function restore(event: FormEvent) {
    event.preventDefault(); const requestedTaskId = restoreId.trim(); if (!actions.canRestore) return;
    setLifecycle(beginMissionConsoleOperation("restoring")); setPreviewRevision(0);
    try { await loadMission(requestedTaskId); }
    catch (error) { const detail = error instanceof Error ? error.message : "Unknown restore error"; setEvents([]); setMissionDetail(null); setLifecycle(failMissionConsoleOperation(detail)); clientFailure(detail); }
    finally { setLifecycle((current) => current.failure ? current : completeMissionConsoleOperation()); }
  }

  async function resume() {
    const requestedTaskId = restoreId.trim(); if (!actions.canResume) return;
    setLifecycle(beginMissionConsoleOperation("resuming")); setPreviewRevision(0);
    try {
      const detail = await loadMission(requestedTaskId);
      if (!detail.effectiveResume.resumable) throw new Error(detail.effectiveResume.reason);
      await consumeMissionStream(await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeTaskId: requestedTaskId }) }));
    } catch (error) { const detail = error instanceof Error ? error.message : "Unknown resume error"; setLifecycle(failMissionConsoleOperation(detail)); clientFailure(detail); }
    finally { setLifecycle((current) => current.failure ? current : completeMissionConsoleOperation()); await refreshHistory(); }
  }

  return <div className="missionConsole">
    <form className="prompt" onSubmit={execute}><span>›</span><input aria-label="Prompt" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="Diga ao Monstro o que construir..."/><button disabled={!actions.canExecute}>{lifecycle.operation === "executing" ? operationLabel : "EXECUTE"}</button></form>
    <form className="prompt historyPrompt" onSubmit={restore}><span>↺</span><select aria-label="Mission history" value={restoreId} onChange={(event) => { setRestoreId(event.target.value); setMissionDetail(null); }}><option value="">{historyError ? historyError : history.length ? "Selecione uma missão persistida..." : "Nenhuma missão persistida"}</option>{history.map((mission) => <option key={mission.taskId} value={mission.taskId}>{formatMissionHistoryLabel(mission)}</option>)}</select><button type="button" disabled={!actions.canRefreshHistory} onClick={() => void refreshHistory()}>REFRESH</button><button disabled={!actions.canRestore}>{lifecycle.operation === "restoring" ? operationLabel : "RESTORE"}</button><button type="button" disabled={!actions.canResume} title={view.resumeReason} onClick={() => void resume()}>{lifecycle.operation === "resuming" ? operationLabel : view.canResume ? view.resumeLabel : "RESUME"}</button></form>
    {status.failure ? <div className="missionFeed"><div><b>CLIENT</b> {status.failure}</div></div> : null}
    {taskId ? <div className="missionFeed"><div><b>MISSION</b> {taskId} · {status.label}{missionDetail?.taskId === taskId ? ` · ${formatMissionResumeAction(missionDetail.effectiveResume)}` : ""}</div></div> : null}
    <div className="missionFeed">{events.slice(-4).map((event) => <div key={event.id}><b>{event.phase.toUpperCase()}</b> {event.type}{event.detail ? ` · ${event.detail}` : ""}</div>)}</div>
    <div className="pipeline livePipeline">{missionPipeline.map((phase, index) => <div key={phase} className={index < view.activeIndex ? "done" : index === view.activeIndex ? "running" : ""}><b>{String(index + 1).padStart(2,"0")}</b><span>{phase.toUpperCase()}</span></div>)}</div>
    {view.progress ? <section className="traceProgress" aria-label="Mission trace progress"><div><b>BUILD</b><strong>{view.progress.build.length}</strong><span>{view.progress.build.at(-1)?.path ?? "—"}</span></div><div><b>EVALUATE</b><strong>{view.progress.evaluations.at(-1)?.score ?? "—"}</strong><span>{view.progress.evaluations.at(-1)?.accepted ? "ACCEPTED" : view.progress.evaluations.length ? "REVIEW" : "WAITING"}</span></div><div><b>REPAIR</b><strong>{view.progress.repairs.length}</strong><span>{view.progress.repairs.at(-1)?.path ?? "—"}</span></div><div><b>REQUIREMENTS</b><strong>{new Set([...view.progress.build.flatMap((item) => item.requirementIds), ...view.progress.evaluations.flatMap((item) => item.requirementIds)]).size}</strong><span>{view.progress.evaluations.at(-1)?.findingCodes.join(", ") || "TRACKED"}</span></div></section> : null}
    <section className="livePreviewStage" aria-label="Live preview"><div className="previewToolbar"><span><i className={view.previewUrl ? "online" : ""} /> {view.previewUrl ? "MISSION PREVIEW" : "WAITING FOR BUILD"}</span><div><button type="button" disabled={!actions.canRefreshPreview} onClick={() => setPreviewRevision((value) => value + 1)}>REFRESH</button>{view.previewUrl ? <a href={view.previewUrl} target="_blank" rel="noreferrer">OPEN ↗</a> : null}</div></div>{previewSrc ? <iframe key={previewSrc} title="MONSTRO generated preview" src={previewSrc} sandbox="allow-scripts allow-forms allow-modals allow-popups" /> : <div className="previewEmpty"><div className="orb"><div className="core">M</div></div><h1>BUILD. RUN.<br/><em>OBSERVE. REPAIR.</em></h1><p>Execute, restaure ou retome uma missão para renderizar o artefato real aqui.</p></div>}</section>
  </div>;
}
