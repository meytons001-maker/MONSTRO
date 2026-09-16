const files = ["app/page.tsx", "engine/orchestrator.ts", "agents/vision.ts", "runtime/sandbox.ts"];
const phases = ["UNDERSTAND", "PLAN", "BUILD", "RUN", "EVALUATE", "REPAIR", "DELIVER"];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div><span className="mark">M</span><strong>MONSTRO</strong><small> V0 / ENGINEERING COCKPIT</small></div>
        <div className="status"><i /> CORE ONLINE</div>
      </header>

      <section className="workspace">
        <aside className="panel chat">
          <div className="panelTitle">CHAT / INTENT</div>
          <div className="message system">MONSTRO está pronto para receber uma missão.</div>
          <div className="message user">Crie uma experiência web 3D cinematográfica e valide o resultado.</div>
          <div className="message monster"><b>MONSTRO</b><br/>Entendido. Vou planejar, construir, executar e avaliar antes de entregar.</div>
          <div className="prompt"><span>›</span><input aria-label="Prompt" placeholder="Diga ao Monstro o que construir..."/><button>EXECUTE</button></div>
        </aside>

        <section className="panel code">
          <div className="panelTitle">CODE WORKSPACE <span>main.ts</span></div>
          <div className="codeBody">
            <nav>{files.map((file, i) => <div className={i === 0 ? "active" : ""} key={file}>⌁ {file}</div>)}</nav>
            <pre><code>{`// MONSTRO generated workspace\n\nexport async function mission() {\n  const plan = await monstro.plan(intent);\n  const build = await monstro.build(plan);\n  const runtime = await monstro.run(build);\n  return monstro.evaluate(runtime);\n}`}</code></pre>
          </div>
        </section>

        <section className="panel preview">
          <div className="panelTitle">LIVE PREVIEW <span>localhost:3000</span></div>
          <div className="viewport">
            <div className="orb"><div className="core">M</div></div>
            <h1>BUILD WHAT<br/><em>DOESN'T EXIST.</em></h1>
            <p>Generated. Executed. Observed. Improved.</p>
          </div>
        </section>
      </section>

      <section className="inspector">
        <div className="panelTitle">MONSTRO INSPECTOR <span>MISSION PIPELINE</span></div>
        <div className="pipeline">{phases.map((phase, i) => <div key={phase} className={i < 3 ? "done" : i === 3 ? "running" : ""}><b>{String(i + 1).padStart(2,"0")}</b><span>{phase}</span></div>)}</div>
        <div className="telemetry"><span>FPS <b>60</b></span><span>RUNTIME <b>READY</b></span><span>TESTS <b>0 ERRORS</b></span><span>ITERATION <b>01</b></span></div>
      </section>
    </main>
  );
}
