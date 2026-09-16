import { MissionConsole } from "./mission-console";

const files = ["app/page.tsx", "core/orchestrator.ts", "core/mission.ts", "api/missions/route.ts"];

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
          <div className="message monster"><b>MONSTRO</b><br/>O cockpit agora recebe eventos de missão em streaming. Execute uma intenção para observar o pipeline.</div>
          <MissionConsole />
        </aside>

        <section className="panel code">
          <div className="panelTitle">CODE WORKSPACE <span>mission.ts</span></div>
          <div className="codeBody">
            <nav>{files.map((file, i) => <div className={i === 2 ? "active" : ""} key={file}>⌁ {file}</div>)}</nav>
            <pre><code>{`// Observable MONSTRO mission\n\njournal.subscribe(renderEvent);\n\nawait monstro.execute(task);\n\n// transport -> cockpit -> inspector`}</code></pre>
          </div>
        </section>

        <section className="panel preview">
          <div className="panelTitle">LIVE PREVIEW <span>mission transport online</span></div>
          <div className="viewport">
            <div className="orb"><div className="core">M</div></div>
            <h1>BUILD. RUN.<br/><em>OBSERVE. REPAIR.</em></h1>
            <p>The cockpit is becoming a live engineering instrument.</p>
          </div>
        </section>
      </section>

      <section className="inspector">
        <div className="panelTitle">MONSTRO INSPECTOR <span>LIVE EVENTS ARE SHOWN IN CHAT PIPELINE</span></div>
        <div className="telemetry"><span>TRANSPORT <b>NDJSON STREAM</b></span><span>MISSION API <b>ONLINE</b></span><span>CORE <b>OBSERVABLE</b></span></div>
      </section>
    </main>
  );
}
