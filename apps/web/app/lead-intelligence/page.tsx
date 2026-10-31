"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./lead-intelligence.module.css";

type Metric = { key: string; total: number };
type Payload = {
  metrics: { summary: { total: number; active: number; with_phone: number; with_email: number }; cnaes: Metric[]; neighborhoods: Metric[]; source: { competence: string; coverage: string; imported_rows: number } | null; incomplete: { total: number } };
  establishments: Array<Record<string, string | number | boolean | null>>;
};

export default function LeadIntelligencePage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(event?: FormEvent) {
    event?.preventDefault(); setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (query) params.set("q", query); if (product) params.set("product", product); if (active) params.set("active", "true");
    try {
      const response = await fetch(`/api/lead-intelligence?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os leads.");
      setPayload(data);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha inesperada."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const maximum = Math.max(1, ...(payload?.metrics.cnaes.map((item) => item.total) ?? [1]));
  const exportUrl = `/api/lead-intelligence?${new URLSearchParams({ ...(query && { q: query }), ...(product && { product }), ...(active && { active: "true" }), format: "csv" })}`;

  return <main className={styles.shell}>
    <header className={styles.header}><div><div className={styles.eyebrow}>MONSTRO / CRM INTELLIGENCE</div><h1 className={styles.title}>Lead Intelligence</h1><div className={styles.meta}>Estabelecimentos de Salvador/BA · código RFB 3849 · sem enriquecimento inventado</div></div><div className={styles.meta}>Competência {payload?.metrics.source?.competence ?? "não carregada"} · cobertura {payload?.metrics.source?.coverage ?? "—"}</div></header>
    {error && <div className={`${styles.panel} ${styles.error}`} role="alert">{error}</div>}
    <section className={styles.grid}>{[
      ["Importados", payload?.metrics.summary.total], ["Ativos", payload?.metrics.summary.active], ["Com telefone", payload?.metrics.summary.with_phone], ["Com e-mail", payload?.metrics.summary.with_email],
    ].map(([label, value]) => <div className={styles.card} key={String(label)}><div className={styles.value}>{Number(value ?? 0).toLocaleString("pt-BR")}</div><div className={styles.label}>{label}</div></div>)}</section>
    <form className={styles.controls} onSubmit={load}><input className={styles.input} aria-label="Pesquisar" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="CNPJ, razão social ou nome fantasia"/><select className={styles.select} value={product} onChange={(e) => setProduct(e.target.value)}><option value="">Todos os produtos</option><option value="xmenu">XMenu potencial</option><option value="cotare">Cotare potencial</option></select><label className={styles.select}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/> somente ativos</label><button className={styles.button} disabled={loading}>{loading ? "CARREGANDO" : "PESQUISAR"}</button><a className={styles.button} href={exportUrl}>EXPORTAR CSV</a></form>
    <section className={styles.columns}><div className={styles.panel}><div className={styles.label}>Distribuição por CNAE</div><div className={styles.bars}>{payload?.metrics.cnaes.map((item) => <div className={styles.bar} key={item.key}><span>{item.key}</span><div className={styles.track}><div className={styles.fill} style={{width:`${item.total/maximum*100}%`}}/></div><b>{item.total}</b></div>)}</div></div><div className={styles.panel}><div className={styles.label}>Distribuição por bairro</div><div className={styles.bars}>{payload?.metrics.neighborhoods.map((item) => <div className={styles.bar} key={item.key}><span>{item.key}</span><div className={styles.track}><div className={styles.fill} style={{width:`${item.total/Math.max(1,payload.metrics.neighborhoods[0]?.total ?? 1)*100}%`}}/></div><b>{item.total}</b></div>)}</div><p className={styles.meta}>Registros incompletos: {payload?.metrics.incomplete.total ?? 0}</p></div></section>
    <section className={styles.panel}><table className={styles.table}><thead><tr><th>CNPJ</th><th>Empresa</th><th>CNAE</th><th>Bairro</th><th>Contato publicado</th><th>Segmentação</th></tr></thead><tbody>{payload?.establishments.map((item) => <tr key={String(item.cnpj)}><td>{String(item.cnpj)}</td><td><b>{String(item.trade_name ?? item.legal_name ?? "Não informado")}</b><br/><span className={styles.meta}>{String(item.legal_name ?? "Razão social não relacionada")}</span></td><td>{String(item.primary_cnae)}</td><td>{String(item.neighborhood ?? "Não informado")}</td><td>{String(item.phone_1 ?? "—")}<br/>{String(item.email ?? "—")}</td><td>{item.xmenu && <span className={styles.tag}>XMENU</span>}{item.cotare && <span className={styles.tag}>COTARE</span>}</td></tr>)}</tbody></table></section>
  </main>;
}
