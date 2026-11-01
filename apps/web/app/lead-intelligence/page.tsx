"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./lead-intelligence.module.css";

type Metric = { key: string; total: number };
type Establishment = Record<string, string | number | boolean | null>;
type Payload = {
  metrics: { summary: { total: number; active: number; with_phone: number; with_email: number }; cnaes: Metric[]; neighborhoods: Metric[]; source: { competence: string; coverage: string; imported_rows: number } | null; incomplete: { total: number } };
  results: { items: Establishment[]; total: number; page: number; pages: number; limit: number; offset: number };
};

export default function LeadIntelligencePage() {
  const [payload, setPayload] = useState<Payload | null>(null); const [query, setQuery] = useState("");
  const [product, setProduct] = useState(""); const [neighborhood, setNeighborhood] = useState("");
  const [active, setActive] = useState(true); const [hasPhone, setHasPhone] = useState(false); const [hasEmail, setHasEmail] = useState(false);
  const [page, setPage] = useState(1); const [selectedCnpj, setSelectedCnpj] = useState<string[]>([]); const [focused, setFocused] = useState<Establishment | null>(null);
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);

  function parameters(requestedPage = page) {
    return new URLSearchParams({ ...(query && { q: query }), ...(product && { product }), ...(neighborhood && { neighborhood }), ...(active && { active: "true" }), ...(hasPhone && { hasPhone: "true" }), ...(hasEmail && { hasEmail: "true" }), page: String(requestedPage), pageSize: "50" });
  }
  async function load(event?: FormEvent, requestedPage = 1) {
    event?.preventDefault(); setLoading(true); setError(null);
    try { const response = await fetch(`/api/lead-intelligence?${parameters(requestedPage)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os leads."); setPayload(data); setPage(requestedPage); setFocused(data.results.items[0] ?? null); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha inesperada."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(undefined, 1); }, []);
  function toggle(cnpj: string) { setSelectedCnpj((current) => current.includes(cnpj) ? current.filter((item) => item !== cnpj) : [...current, cnpj]); }
  const exportUrl = `/api/lead-intelligence?${parameters(1)}&format=csv`;
  const maximum = Math.max(1, ...(payload?.metrics.cnaes.map((item) => item.total) ?? [1]));

  return <main className={styles.shell}>
    <header className={styles.header}><div><div className={styles.eyebrow}>MONSTRO / LEAD INTELLIGENCE V1.1</div><h1 className={styles.title}>Base empresarial de Salvador</h1><div className={styles.meta}>CNPJ como identificador único · dados cadastrais separados da prospecção</div></div><div className={styles.meta}>Competência {payload?.metrics.source?.competence ?? "—"} · cobertura {payload?.metrics.source?.coverage ?? "—"}</div></header>
    {error && <div className={`${styles.panel} ${styles.error}`} role="alert">{error}</div>}
    <section className={styles.grid}>{[["CNPJs únicos",payload?.metrics.summary.total],["Ativos",payload?.metrics.summary.active],["Com telefone",payload?.metrics.summary.with_phone],["Com e-mail",payload?.metrics.summary.with_email]].map(([label,value])=><div className={styles.card} key={String(label)}><div className={styles.value}>{Number(value??0).toLocaleString("pt-BR")}</div><div className={styles.label}>{label}</div></div>)}</section>
    <form className={styles.controls} onSubmit={(event)=>load(event,1)}><input className={styles.input} aria-label="Pesquisar" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="CNPJ, razão social ou nome fantasia"/><input className={styles.input} aria-label="Bairro" value={neighborhood} onChange={(event)=>setNeighborhood(event.target.value)} placeholder="Bairro"/><select className={styles.select} value={product} onChange={(event)=>setProduct(event.target.value)}><option value="">Todos os produtos</option><option value="xmenu">XMenu potencial</option><option value="cotare">Cotare potencial</option></select><label className={styles.select}><input type="checkbox" checked={active} onChange={(event)=>setActive(event.target.checked)}/> ativos</label><label className={styles.select}><input type="checkbox" checked={hasPhone} onChange={(event)=>setHasPhone(event.target.checked)}/> telefone</label><label className={styles.select}><input type="checkbox" checked={hasEmail} onChange={(event)=>setHasEmail(event.target.checked)}/> e-mail</label><button className={styles.button} disabled={loading}>{loading?"CARREGANDO":"FILTRAR"}</button><a className={styles.button} href={exportUrl}>CSV</a></form>
    <p className={styles.meta}>{payload?.results.total.toLocaleString("pt-BR") ?? 0} resultados · página {payload?.results.page ?? 1} de {payload?.results.pages ?? 1} · CSV limitado e identificado a 100.000 linhas</p>
    <section className={styles.columns}><div className={styles.panel}><div className={styles.label}>Distribuição por CNAE</div><div className={styles.bars}>{payload?.metrics.cnaes.map((item)=><div className={styles.bar} key={item.key}><span>{item.key}</span><div className={styles.track}><div className={styles.fill} style={{width:`${item.total/maximum*100}%`}}/></div><b>{item.total.toLocaleString("pt-BR")}</b></div>)}</div></div><div className={styles.panel}><div className={styles.label}>Distribuição por bairro</div><div className={styles.bars}>{payload?.metrics.neighborhoods.map((item)=><div className={styles.bar} key={item.key}><span>{item.key}</span><div className={styles.track}><div className={styles.fill} style={{width:`${item.total/Math.max(1,payload.metrics.neighborhoods[0]?.total??1)*100}%`}}/></div><b>{item.total.toLocaleString("pt-BR")}</b></div>)}</div></div></section>
    <section className={styles.panel}><div className={styles.controls}><button className={styles.button} disabled={page<=1||loading} onClick={()=>void load(undefined,page-1)}>ANTERIOR</button><button className={styles.button} disabled={!payload||page>=payload.results.pages||loading} onClick={()=>void load(undefined,page+1)}>PRÓXIMA</button><span className={styles.meta}>Lista de prospecção: {selectedCnpj.length} selecionados</span></div><table className={styles.table}><thead><tr><th>Selecionar</th><th>CNPJ</th><th>Empresa</th><th>CNAE</th><th>Bairro</th><th>Contato</th><th>Produto</th></tr></thead><tbody>{payload?.results.items.map((item)=><tr key={String(item.cnpj)}><td><input aria-label={`Selecionar ${item.cnpj}`} type="checkbox" checked={selectedCnpj.includes(String(item.cnpj))} onChange={()=>toggle(String(item.cnpj))}/></td><td><button className={styles.button} aria-label={`Abrir dossiê ${item.cnpj}`} onClick={()=>setFocused(item)}>ABRIR</button><br/>{String(item.cnpj)}</td><td><b>{String(item.trade_name??item.legal_name??"Não informado")}</b><br/><span className={styles.meta}>{String(item.legal_name??"")}</span></td><td>{String(item.primary_cnae)}</td><td>{String(item.neighborhood??"—")}</td><td>{String(item.phone_1??"—")}<br/>{String(item.email??"—")}</td><td>{item.xmenu&&<span className={styles.tag}>XMENU</span>}{item.cotare&&<span className={styles.tag}>COTARE</span>}</td></tr>)}</tbody></table></section>
    {focused&&<section className={styles.panel}><div className={styles.eyebrow}>DOSSIÊ CADASTRAL SELECIONADO</div><h2>{String(focused.trade_name??focused.legal_name??focused.cnpj)}</h2><p>CNPJ {String(focused.cnpj)} · situação {String(focused.registration_status)} · CNAE {String(focused.primary_cnae)}</p><p>{String(focused.street_type??"")} {String(focused.street??"")}, {String(focused.street_number??"s/n")} · {String(focused.neighborhood??"bairro não informado")} · Salvador/BA</p><p>Telefone: {String(focused.phone_1??focused.phone_2??"não informado")} · E-mail: {String(focused.email??"não informado")}</p><p className={styles.meta}>Fonte: {String(focused.source_url)} · competência {String(focused.source_competence)}</p></section>}
  </main>;
}
