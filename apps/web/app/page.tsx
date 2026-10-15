"use client";

import { FormEvent, useState } from "react";
import { requestAlphaMission } from "../lib/alpha-mission-client";
import type { AlphaMissionResult } from "../lib/alpha-mission-contract";

const files = ["mission.mjs", "engine/orchestrator.ts", "runtime/sandbox.ts"];
const phases = ["understand", "plan", "build", "run", "evaluate", "repair", "deliver"] as const;

export default function Home() {
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<AlphaMissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intent.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await requestAlphaMission(intent));
    } catch (missionError) {
      setError(missionError instanceof Error ? missionError.message : "Mission execution failed.");
    } finally {
      setLoading(false);
    }
  }

  const currentPhase = loading ? "run" : result?.phase;
  const currentIndex = currentPhase ? phases.indexOf(currentPhase as typeof phases[number]) : -1;

  return (
    <main className="shell">
      <header className="topbar">
        <div><span className="mark">M</span><strong>MONSTRO</strong><small> V0 / ENGINEERING COCKPIT</small></div>
        <div className={`status ${loading ? "busy" : ""}`}><i /> {loading ? "MISSION RUNNING" : "CORE READY"}</div>
      </header>

      <section className="workspace">
        <aside className="panel chat">
          <div className="panelTitle">CHAT / INTENT</div>
          <div className="message system">Envie uma missão Alpha limitada para execução no runtime local.</div>
          {result && <div className="message monster" aria-live="polite"><b>MONSTRO / DELIVER</b><br />{result.summary}</div>}
          {error && <div className="message error" role="alert"><b>EXECUTION ERROR</b><br />{error}</div>}
          <form className="prompt" onSubmit={execute}>
            <span>›</span>
            <input
              aria-label="Prompt"
              maxLength={2000}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Diga ao Monstro o que executar..."
              value={intent}
            />
            <button disabled={loading || !intent.trim()} type="submit">{loading ? "RUNNING…" : "EXECUTE"}</button>
          </form>
        </aside>

        <section className="panel code">
          <div className="panelTitle">MISSION ARTIFACT <span>{result ? "mission.mjs" : "waiting"}</span></div>
          <div className="codeBody">
            <nav>{files.map((file, index) => <div className={index === 0 && result ? "active" : ""} key={file}>⌁ {file}</div>)}</nav>
            <pre><code>{result?.artifact ?? "// Execute a mission to inspect its generated artifact."}</code></pre>
          </div>
        </section>

        <section className="panel preview">
          <div className="panelTitle">MISSION RESULT <span>{result?.taskId ?? "no task"}</span></div>
          <div className="viewport">
            <div className="orb"><div className="core">{loading ? "…" : "M"}</div></div>
            <h1>{result ? "MISSION" : "BUILD WHAT"}<br /><em>{result ? result.phase.toUpperCase() : "DOESN'T EXIST."}</em></h1>
            <p>{result ? `Task ${result.taskId} completed in iteration ${result.iteration}.` : "Generated. Executed. Observed. Improved."}</p>
          </div>
        </section>
      </section>

      <section className="inspector">
        <div className="panelTitle">MONSTRO INSPECTOR <span>MISSION PIPELINE</span></div>
        <div className="pipeline">{phases.map((phase, index) => {
          const className = currentIndex > index || result?.phase === "deliver" ? "done" : currentIndex === index ? "running" : "";
          return <div key={phase} className={className}><b>{String(index + 1).padStart(2, "0")}</b><span>{phase.toUpperCase()}</span></div>;
        })}</div>
        <div className="telemetry">
          <span>RUNTIME <b>{loading ? "RUNNING" : result ? "COMPLETE" : "READY"}</b></span>
          <span>PHASE <b>{currentPhase?.toUpperCase() ?? "IDLE"}</b></span>
          <span>ITERATION <b>{result?.iteration ?? 0}</b></span>
          <span>ARTIFACTS <b>{result ? 1 : 0}</b></span>
        </div>
      </section>
    </main>
  );
}
