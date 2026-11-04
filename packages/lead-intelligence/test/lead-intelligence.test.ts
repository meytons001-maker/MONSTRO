import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { automaticallyEnrichCompany, createProspectList, dashboard, executeCommercialMission, exportCsv, getCommercialAccount, getEstablishmentDossier, getProspectList, initializeDatabase, interpretCommercialIntent, listProspectLists, registerCommercialInteraction, scoreCommercialRecord, searchEstablishments, searchEstablishmentsPage, searchOpeningRadar, seedOpeningRadar, upsertCommercialAccount, validatePublicUrl } from "../src/index.js";
import { withDatabase } from "../src/duckdb.js";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "monstro-leads-"));
  const db = join(dir, "test.duckdb");
  await initializeDatabase(db);
  await withDatabase(db, async (connection) => {
    await connection.run(`INSERT INTO companies VALUES ('12345678','RESTAURANTE TESTE LTDA','2062','49',10000,'01',NULL,'2026-10')`);
    await connection.run(`INSERT INTO establishments VALUES
      ('12345678000190','12345678','0001','90','1','SABOR TESTE','02','20261001','00','20200101','5611201',NULL,'RUA','MODELO','10',NULL,'BARRA','40100000','BA','3849','71999999999',NULL,'CONTATO@EXEMPLO.COM','2026-10','https://dados.cnpjaberto.com.br',current_timestamp),
      ('87654321000100','87654321','0001','00','1',NULL,'08','20261001','01','20190101','4711301',NULL,'AVENIDA','EXEMPLO','20',NULL,'CENTRO','40000000','BA','3849',NULL,NULL,NULL,'2026-10','https://dados.cnpjaberto.com.br',current_timestamp)`);
    await connection.run(`INSERT INTO import_runs VALUES ('run','2026-10','https://dados.cnpjaberto.com.br',DATE '2026-10-19',current_timestamp,'3849',false,'sample',2,2)`);
    await connection.run(`INSERT INTO partners VALUES ('partner','12345678','2','MARIA TESTE',NULL,'49','20200101',NULL,NULL,NULL,NULL,NULL,'2026-10')`);
  });
  return { db, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("calculates dashboard metrics from persisted records", async () => {
  const { db, cleanup } = await fixture();
  try {
    const result = await dashboard(db);
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.active, 1);
    assert.equal(result.summary.with_phone, 1);
    assert.equal(result.summary.with_email, 1);
    assert.equal(result.source?.competence, "2026-10");
  } finally { await cleanup(); }
});

test("searches by CNPJ and applies configurable product segments", async () => {
  const { db, cleanup } = await fixture();
  try {
    const byCnpj = await searchEstablishments(db, { query: "12.345.678/0001-90" });
    assert.equal(byCnpj.length, 1);
    const xmenu = await searchEstablishments(db, { product: "xmenu" });
    assert.equal(xmenu.length, 1);
    assert.equal(xmenu[0]?.xmenu, true);
    const cotare = await searchEstablishments(db, { product: "cotare" });
    assert.equal(cotare.length, 1);
  } finally { await cleanup(); }
});

test("exports only existing values without fabrication", async () => {
  const { db, cleanup } = await fixture();
  try {
    const csv = await exportCsv(db, { active: true });
    assert.match(csv, /RESTAURANTE TESTE LTDA/);
    assert.doesNotMatch(csv, /87654321000100/);
  } finally { await cleanup(); }
});

test("interprets a commercial mission and returns auditable dossiers", async () => {
  const parsed = interpretCommercialIntent("Pesquise pizzarias na Pituba, Salvador, Bahia");
  assert.deepEqual(parsed.cnaes, ["5611203"]);
  assert.equal(parsed.neighborhood, "Pituba");
  const { db, cleanup } = await fixture();
  try {
    const result = await executeCommercialMission(db, { intent: "Pesquise restaurantes na Barra, Salvador" });
    assert.equal(result.dossiers.length, 1);
    assert.equal(result.dossiers[0]?.evidence[0]?.classification, "confirmed_fact");
    assert.equal(result.dossiers[0]?.scores.engagement.score, 0);
    assert.match(result.dossiers[0]?.scores.meaning ?? "", /engajamento/);
    assert.ok(result.dossiers[0]?.missingIntegrations.includes("site oficial"));
  } finally { await cleanup(); }
});

test("returns a filtered page with an independent total", async () => {
  const { db, cleanup } = await fixture();
  try {
    const result = await searchEstablishmentsPage(db, { active: true, hasPhone: true, limit: 1, offset: 0 });
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.pages, 1);
  } finally { await cleanup(); }
});

test("does not turn digits embedded in a company name into a broad CNPJ search",async()=>{const{db,cleanup}=await fixture();try{const result=await searchEstablishmentsPage(db,{query:"EMPRESA-INEXISTENTE-2026",limit:50});assert.equal(result.total,0);assert.equal(result.items.length,0)}finally{await cleanup()}});

test("keeps completeness, product fit and engagement independent", () => {
  const scores = scoreCommercialRecord({ registration_status: "02", primary_cnae: "5611201", phone_1: "71", email: null, xmenu: true }, ["5611201"]);
  assert.equal(scores.engagement.score, 0);
  assert.ok(scores.completeness.score < scores.productFit.score);
  assert.match(scores.meaning, /engajamento/);
});

test("opens a dossier with published partners", async () => {
  const { db, cleanup } = await fixture();
  try {
    const dossier = await getEstablishmentDossier(db, "12345678000190");
    assert.equal(dossier?.establishment.legal_name, "RESTAURANTE TESTE LTDA");
    assert.equal(dossier?.partners[0]?.partner_name, "MARIA TESTE");
  } finally { await cleanup(); }
});

test("persists and reopens prospecting lists with history", async () => {
  const { db, cleanup } = await fixture();
  try {
    const created = await createProspectList(db, { name: "Barra ativa", product: "xmenu", cnpjs: ["12345678000190"] });
    assert.equal(created.companyCount, 1);
    const summary = await listProspectLists(db);
    assert.equal(summary[0]?.company_count, 1);
    const reopened = await getProspectList(db, created.id);
    assert.equal(reopened?.items.length, 1);
    assert.equal(reopened?.history[0]?.action, "created");
  } finally { await cleanup(); }
});

test("serializes concurrent access to the same DuckDB file", async () => {
  const { db, cleanup } = await fixture();
  try {
    const [metrics, lists] = await Promise.all([dashboard(db), listProspectLists(db)]);
    assert.equal(metrics.summary.total, 2);
    assert.deepEqual(lists, []);
  } finally { await cleanup(); }
});

test("blocks private enrichment destinations", async () => {
  await assert.rejects(() => validatePublicUrl("http://127.0.0.1/internal"), /privado|local/i);
  await assert.rejects(() => validatePublicUrl("file:///etc/passwd"), /HTTP/i);
});

test("reports automatic enrichment as unavailable without a business domain", async()=>{const{db,cleanup}=await fixture();try{const result=await automaticallyEnrichCompany(db,"87654321000100");assert.equal(result.status,"unavailable");assert.match(String(result.reason),/domínio empresarial/i)}finally{await cleanup()}});

test("persists opening evidence without inventing missing dates or CNPJs",async()=>{const{db,cleanup}=await fixture();try{const seeded=await seedOpeningRadar(db);assert.equal(seeded.updated,12);const result=await searchOpeningRadar(db,{neighborhood:"Barra"});assert.ok(result.items.length>=2);const vague=result.items.find(item=>item.id==="aloalo-sobrado-braseiro");assert.equal(vague?.exact_date,null);assert.equal(vague?.period_text,"dezembro");assert.equal(vague?.cnpj,null);const history=await searchOpeningRadar(db,{eventType:"opening"});assert.ok(history.items.some(item=>item.classification==="opened"))}finally{await cleanup()}});

test("keeps the company radar responsive while opening signals are refreshed",async()=>{const{db,cleanup}=await fixture();try{const[companies,openings]=await Promise.all([searchEstablishmentsPage(db,{product:"xmenu",active:true,limit:50}),searchOpeningRadar(db,{neighborhood:"Barra"})]);assert.equal(companies.total,1);assert.ok(openings.items.length>=2)}finally{await cleanup()}});

test("persists commercial account, interaction and history separately from registry data", async () => {
  const { db, cleanup } = await fixture();
  try {
    await upsertCommercialAccount(db, { cnpj: "12345678000190", product: "xmenu", owner: "Ana", stage: "qualified", nextActivityAt: "2026-11-10T14:00:00", notes: "Contato autorizado", leadOrigin: "lista-teste" });
    await registerCommercialInteraction(db, { cnpj: "12345678000190", product: "xmenu", interactionType: "note", summary: "Diagnóstico inicial registrado", owner: "Ana", nextActivityAt: "2026-11-10T14:00:00" });
    const account = await getCommercialAccount(db, "12345678000190", "xmenu");
    assert.equal(account.accounts[0]?.stage, "qualified");
    assert.match(String(account.accounts[0]?.next_activity_at), /2026-11-10 14:00/);
    assert.equal(account.interactions[0]?.summary, "Diagnóstico inicial registrado");
    assert.equal(account.history.length, 2);
    const registry = await searchEstablishments(db, { query: "12345678000190" });
    assert.equal(registry[0]?.trade_name, "SABOR TESTE");
  } finally { await cleanup(); }
});
