import { MissionConsole } from "./mission-console";

const files = ["app/page.tsx", "lib/mission-runtime.ts", "lib/preview-registry.ts", "api/previews/[taskId]/route.ts"];

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
          <div className="message monster"><b>MONSTRO</b><br/>Execute uma intenção. O pipeline e o preview gerado serão atualizados em tempo real.</div>
        </aside>

        <section className="panel code">
          <div className="panelTitle">CODE WORKSPACE <span>preview gateway</span></div>
          <div className="codeBody">
            <nav>{files.map((file, i) => <div className={i === 2 ? "active" : ""} key={file}>⌁ {file}</div>)}</nav>
            <pre><code>{`// Managed MONSTRO preview\n\npreview = await sandbox.startPreview(manifest);\nawait previewRegistry.register(task.id, preview);\n\n// browser -> gateway -> isolated preview`}</code></pre>
          </div>
        </section>

        <section className="panel preview"><div className="panelTitle">LIVE PREVIEW <span>gateway online</span></div><MissionConsole /></section>
      </section>

      <section className="inspector">
        <div className="panelTitle">MONSTRO INSPECTOR <span>NEXT: BROWSER EVIDENCE</span></div>
        <div className="telemetry"><span>TRANSPORT <b>NDJSON STREAM</b></span><span>PREVIEW <b>GATEWAY</b></span><span>CORE <b>OBSERVABLE</b></span></div>
      </section>
    </main>
  );
}
