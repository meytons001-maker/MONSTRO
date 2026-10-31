import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboard, executeCommercialMission, exportCsv, initializeDatabase, interpretCommercialIntent, searchEstablishments } from "../src/index.js";
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
    assert.match(result.dossiers[0]?.priority.meaning ?? "", /não probabilidade de compra/);
    assert.ok(result.dossiers[0]?.missingIntegrations.includes("site oficial"));
  } finally { await cleanup(); }
});
