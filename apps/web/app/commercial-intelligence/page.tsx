"use client";

import { FormEvent, useState } from "react";
import styles from "../lead-intelligence/lead-intelligence.module.css";

type Dossier = { establishment: Record<string, string | boolean | null>; priority: { score: number; reasons: string[]; meaning: string }; evidence: Array<{ statement: string; source: string }>; missingIntegrations: string[]; questions: string[]; approachDraft: string };
type MissionResult = { mission: { id: string; status: string; phases: string[] }; criteria: { segment: string | null; neighborhood: string | null; cnaes: string[] }; coverage: { sourceReturned: number; deduplicated: number; verified: number; region: string; limitations: string[] }; dossiers: Dossier[] };
const ACCEPTANCE_COMMAND = "Pesquise pizzarias na Pituba, Salvador, Bahia. Encontre estabelecimentos reais e prepare um dossiê comercial.";

export default function CommercialIntelligencePage() {
  const [intent, setIntent] = useState(ACCEPTANCE_COMMAND); const [result, setResult] = useState<MissionResult | null>(null);
  const [selected, setSelected] = useState(0); const [status, setStatus] = useState("pronto"); const [error, setError] = useState("");
  async function execute(event: FormEvent) {
    event.preventDefault(); setStatus("pesquisando"); setError("");
    const response = await fetch("/api/commercial-intelligence/missions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent, limit: 25 }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Falha na pesquisa"); setStatus("erro"); return; }
    setResult(data); setSelected(0); setStatus("concluído");
  }
  const dossier = result?.dossiers[selected];
  return <main className={styles.shell}>
    <header className={styles.header}><div><span className={styles.eyebrow}>MONSTRO / COMMERCIAL INTELLIGENCE ENGINE</span><h1 className={styles.title}>Cockpit de Inteligência Comercial</h1><p className={styles.meta}>Pesquisa cadastral rastreável · integrações ausentes são declaradas</p></div><span className={styles.tag}>{status.toUpperCase()}</span></header>
    <form className={styles.controls} onSubmit={execute}><input className={styles.input} aria-label="Comando da missão" value={intent} onChange={(event) => setIntent(event.target.value)} /><button className={styles.button} disabled={status === "pesquisando"}>{status === "pesquisando" ? "PESQUISANDO" : "EXECUTAR MISSÃO"}</button></form>
    {error && <p className={`${styles.panel} ${styles.error}`} role="alert">{error}</p>}
    {result && <><section className={styles.grid}><article className={styles.card}><strong className={styles.value}>{result.coverage.sourceReturned}</strong><span className={styles.label}>retornados</span></article><article className={styles.card}><strong className={styles.value}>{result.coverage.deduplicated}</strong><span className={styles.label}>deduplicados</span></article><article className={styles.card}><strong className={styles.value}>{result.coverage.verified}</strong><span className={styles.label}>verificados</span></article><article className={styles.card}><strong className={styles.value}>{result.criteria.cnaes.join(", ") || "TODOS"}</strong><span className={styles.label}>CNAE interpretado</span></article></section>
      <section className={styles.columns}><article className={styles.panel}><h2>Plano e cobertura</h2><p>{result.mission.phases.join(" → ").toUpperCase()}</p><p>Região: {result.coverage.region}</p>{result.coverage.limitations.map((item) => <p key={item}>Limite: {item}</p>)}</article><article className={styles.panel}><h2>Empresas</h2>{result.dossiers.length === 0 ? <p>Nenhum registro na cobertura importada. Isso não comprova inexistência de empresas.</p> : result.dossiers.map((item, index) => <button className={styles.button} key={String(item.establishment.cnpj)} onClick={() => setSelected(index)}>{String(item.establishment.trade_name ?? item.establishment.legal_name)} · {String(item.establishment.cnpj)} · score {item.priority.score}</button>)}</article></section>
      {dossier && <section className={styles.panel}><h2>Dossiê verificável</h2><h3>{String(dossier.establishment.trade_name ?? dossier.establishment.legal_name)}</h3><p>CNPJ {String(dossier.establishment.cnpj)} · CNAE {String(dossier.establishment.primary_cnae)} · {String(dossier.establishment.neighborhood)}</p><h3>Evidência</h3>{dossier.evidence.map((item) => <p key={item.statement}>{item.statement} <a href={item.source}>fonte</a></p>)}<h3>Prioridade {dossier.priority.score}/95</h3><p>{dossier.priority.meaning}</p><ul>{dossier.priority.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>Pendências explícitas</h3><p>{dossier.missingIntegrations.join(", ")}</p><h3>Perguntas sugeridas</h3><ul>{dossier.questions.map((question) => <li key={question}>{question}</li>)}</ul><h3>Rascunho — exige aprovação humana</h3><p>{dossier.approachDraft}</p></section>}
    </>}
  </main>;
}
