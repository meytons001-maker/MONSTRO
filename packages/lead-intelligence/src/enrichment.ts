import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { rows, sql, withDatabase } from "./duckdb.js";
import { SCHEMA_SQL } from "./schema.js";
import { upsertCommercialAccount } from "./portfolio.js";

const MAX_BYTES = 1_000_000;
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const FREE_EMAIL_DOMAINS = new Set(["gmail.com","hotmail.com","outlook.com","yahoo.com","yahoo.com.br","icloud.com","bol.com.br","uol.com.br","live.com","terra.com.br","globo.com"]);

function privateAddress(address: string) {
  if (address === "::1" || address === "::" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

export async function validatePublicUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Somente URLs HTTP ou HTTPS são permitidas.");
  if (url.username || url.password) throw new Error("URLs com credenciais não são permitidas.");
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Destino local não permitido.");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("Destino privado ou não resolvido não permitido.");
  return url;
}

function normalizePhone(value: string) { return value.replace(/\D/g, ""); }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

async function publicFetch(input: string, redirectCount = 0): Promise<{ url: string; html: string }> {
  if (redirectCount > 3) throw new Error("Limite de redirecionamentos excedido.");
  const url = await validatePublicUrl(input);
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "MONSTRO-Lead-Intelligence/1.3 (+public-business-research)" } });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirecionamento sem destino.");
    return publicFetch(new URL(location, url).toString(), redirectCount + 1);
  }
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) throw new Error("A fonte não retornou HTML.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("A página excede o limite de 1 MB.");
  const bytes=new Uint8Array(await response.arrayBuffer()).slice(0,MAX_BYTES);
  const headerCharset=contentType.match(/charset=([^;\s]+)/i)?.[1]?.replace(/["']/g,"");
  const headerSample=new TextDecoder("windows-1252").decode(bytes.slice(0,4096));
  const metaCharset=headerSample.match(/<meta[^>]+charset=["']?([^"'\s/>]+)/i)?.[1]??headerSample.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i)?.[1];
  let html:string;try{html=new TextDecoder(headerCharset||metaCharset||"utf-8").decode(bytes)}catch{html=new TextDecoder("utf-8").decode(bytes)}
  return { url: response.url || url.toString(), html };
}

export async function enrichFromPublicWebsite(databasePath: string, cnpjInput: string, candidateUrl: string) {
  const cnpj = cnpjInput.replace(/\D/g, "");
  if (cnpj.length !== 14) throw new Error("CNPJ inválido.");
  const runId = randomUUID();
  try {
    const page = await publicFetch(candidateUrl);
    const registry = await withDatabase(databasePath, async (connection) => {
      await connection.run(SCHEMA_SQL);
      return (await rows(connection, `SELECT e.cnpj,e.phone_1,e.phone_2,e.email,e.trade_name,c.legal_name FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE e.cnpj=${sql(cnpj)} LIMIT 1`))[0];
    });
    if (!registry) throw new Error("Empresa não encontrada na base cadastrada.");
    const plain = page.html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const pageDigits = plain.replace(/\D/g, "");
    const exactCnpj = pageDigits.includes(cnpj);
    const registryDomain = String(registry.email ?? "").split("@")[1]?.toLowerCase();
    const pageHost = new URL(page.url).hostname.toLowerCase().replace(/^www\./, "");
    const domainMatch = Boolean(registryDomain && (pageHost === registryDomain || pageHost.endsWith(`.${registryDomain}`)));
    const confirmation = exactCnpj ? "confirmed_cnpj" : domainMatch ? "registry_domain_candidate" : "candidate";
    const emails = unique([...page.html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0].toLowerCase())).slice(0, 10);
    const phones = unique([...plain.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}/g)].map((match) => normalizePhone(match[0])).filter((value) => value.length >= 10 && value.length <= 13)).slice(0, 10);
    const social = unique([...page.html.matchAll(/https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com)\/[^"'\s<>]+/gi)].map((match) => match[0])).slice(0, 10);
    const description = page.html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]?.trim();
    const discoveries: Array<{ fieldType: string; value: string; conflict: boolean; detail?: string }> = [{ fieldType: exactCnpj ? "official_site" : "site_candidate", value: page.url, conflict: false }];
    for (const email of emails) { const conflict = Boolean(exactCnpj && registry.email && String(registry.email).toLowerCase() !== email); discoveries.push({ fieldType: "commercial_email", value: email, conflict, detail: conflict ? `Cadastro: ${registry.email}` : undefined }); }
    for (const phone of phones) { const registered = [registry.phone_1, registry.phone_2].filter(Boolean).map((value) => normalizePhone(String(value))); const conflict = Boolean(exactCnpj && registered.length && !registered.includes(phone)); discoveries.push({ fieldType: "commercial_phone", value: phone, conflict, detail: conflict ? `Cadastro: ${registered.join(" / ")}` : undefined }); }
    const socialPlatforms=social.map((value)=>new URL(value).hostname.toLowerCase().replace(/^www\./,"").split(".")[0]);
    for (const [index,value] of social.entries()) {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      const platform = host.split(".")[0];
      const conflicting=socialPlatforms.filter((item)=>item===platform).length>1;
      discoveries.push({ fieldType: conflicting?`${platform}_conflicting`:exactCnpj?`official_${platform}`:`${platform}_candidate`, value, conflict: conflicting,detail:conflicting?"Múltiplos perfis vinculados pela mesma fonte; requer revisão manual.":undefined });
    }
    if (description) discoveries.push({ fieldType: exactCnpj ? "verified_company_description" : "company_description_candidate", value: description.slice(0, 500), conflict: false });
    await withDatabase(databasePath, async (connection) => {
      await connection.run(SCHEMA_SQL); await connection.run("BEGIN TRANSACTION");
      try {
        await connection.run(`INSERT INTO enrichment_runs (id,cnpj,candidate_url,status) VALUES (${sql(runId)},${sql(cnpj)},${sql(candidateUrl)},'completed')`);
        for (const item of discoveries) await connection.run(`INSERT INTO digital_discoveries (id,run_id,cnpj,field_type,value,source_url,confirmation_level,conflicts_with_registry,conflict_detail) VALUES (${sql(randomUUID())},${sql(runId)},${sql(cnpj)},${sql(item.fieldType)},${sql(item.value)},${sql(page.url)},${sql(confirmation)},${item.conflict},${item.detail ? sql(item.detail) : "NULL"})`);
        await connection.run("COMMIT");
      } catch (error) { await connection.run("ROLLBACK"); throw error; }
    });
    return { runId, cnpj, sourceUrl: page.url, confirmationLevel: confirmation, exactCnpj, domainMatch, discoveries };
  } catch (error) {
    await withDatabase(databasePath, async (connection) => { await connection.run(SCHEMA_SQL); await connection.run(`INSERT INTO enrichment_runs (id,cnpj,candidate_url,status,error) VALUES (${sql(runId)},${sql(cnpj)},${sql(candidateUrl)},'failed',${sql(error instanceof Error ? error.message : "Falha desconhecida")})`); });
    throw error;
  }
}

export async function getDigitalDiscoveries(databasePath: string, cnpj: string) {
  return withDatabase(databasePath, async (connection) => { await connection.run(SCHEMA_SQL); return rows(connection, `SELECT
    CASE
      WHEN confirmation_level='corroborated_domain' AND field_type='official_site' THEN 'site_candidate'
      WHEN field_type='social_profile' AND lower(value) LIKE '%instagram.com/%' THEN CASE WHEN confirmation_level='confirmed_cnpj' THEN 'official_instagram' ELSE 'instagram_candidate' END
      WHEN field_type='social_profile' AND lower(value) LIKE '%facebook.com/%' THEN CASE WHEN confirmation_level='confirmed_cnpj' THEN 'official_facebook' ELSE 'facebook_candidate' END
      WHEN field_type='service_description' THEN CASE WHEN confirmation_level='confirmed_cnpj' THEN 'verified_company_description' ELSE 'company_description_candidate' END
      ELSE field_type END field_type,
    value,source_url,cast(consulted_at AS VARCHAR) consulted_at,
    CASE WHEN confirmation_level='corroborated_domain' THEN 'registry_domain_candidate' ELSE confirmation_level END confirmation_level,
    CASE WHEN confirmation_level='corroborated_domain' THEN false ELSE conflicts_with_registry END conflicts_with_registry,
    CASE WHEN confirmation_level='corroborated_domain' THEN NULL ELSE conflict_detail END conflict_detail
    FROM digital_discoveries WHERE cnpj=${sql(cnpj.replace(/\D/g, ""))} ORDER BY consulted_at DESC`); });
}

export async function automaticallyEnrichCompany(databasePath:string,cnpjInput:string,{force=false,maxAgeDays=7}:{force?:boolean;maxAgeDays?:number}={}){
  const cnpj=cnpjInput.replace(/\D/g,"");if(cnpj.length!==14)throw new Error("CNPJ inválido.");
  const context=await withDatabase(databasePath,async(connection)=>{await connection.run(SCHEMA_SQL);const registry=(await rows(connection,`SELECT e.cnpj,e.email,e.trade_name,e.neighborhood,e.activity_start_date,e.primary_cnae,e.registration_status,c.legal_name FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root WHERE e.cnpj=${sql(cnpj)} LIMIT 1`))[0];const cached=(await rows(connection,`SELECT candidate_url,cast(consulted_at AS VARCHAR) consulted_at FROM enrichment_runs WHERE cnpj=${sql(cnpj)} AND status='completed' AND consulted_at > current_timestamp - INTERVAL '${Math.min(30,Math.max(1,maxAgeDays))} days' ORDER BY consulted_at DESC LIMIT 1`))[0];return{registry,cached}});
  if(!context.registry)throw new Error("Empresa não encontrada na base cadastrada.");
  if(context.cached&&!force)return{cnpj,status:"cached",sourceUrl:context.cached.candidate_url,consultedAt:context.cached.consulted_at,discoveries:await getDigitalDiscoveries(databasePath,cnpj)};
  const domain=String(context.registry.email??"").split("@")[1]?.trim().toLowerCase();
  if(!domain||FREE_EMAIL_DOMAINS.has(domain)||!domain.includes("."))return{cnpj,status:"unavailable",reason:"Cadastro sem domínio empresarial verificável para iniciar a pesquisa gratuita.",registry:context.registry};
  try{const result=await enrichFromPublicWebsite(databasePath,cnpj,`https://${domain}`);return{...result,status:result.exactCnpj?"success":"partial",registry:context.registry}}
  catch(error){return{cnpj,status:"error",reason:error instanceof Error?error.message:"Falha na consulta pública.",registry:context.registry}}
}

export async function runControlledEnrichmentSample(databasePath: string, limit = 20) {
  const sampleSize = Math.min(20, Math.max(1, limit));
  const candidates = await withDatabase(databasePath, async (connection) => rows(connection, `SELECT e.cnpj,coalesce(e.trade_name,c.legal_name,e.cnpj) company_name,e.email,lower(split_part(e.email,'@',2)) domain
    FROM establishments e LEFT JOIN companies c ON c.cnpj_root=e.cnpj_root
    WHERE e.registration_status='02' AND e.email IS NOT NULL AND split_part(e.email,'@',2) LIKE '%.%'
      AND lower(split_part(e.email,'@',2)) NOT IN ('gmail.com','hotmail.com','outlook.com','yahoo.com','yahoo.com.br','icloud.com','bol.com.br','uol.com.br','live.com','terra.com.br','globo.com')
      AND regexp_matches(lower(split_part(e.email,'@',2)), '^[a-z0-9.-]+\\.[a-z]{2,}$')
    QUALIFY row_number() OVER (PARTITION BY lower(split_part(e.email,'@',2)) ORDER BY e.cnpj)=1
    ORDER BY e.cnpj LIMIT ${sampleSize}`));
  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    const cnpj = String(candidate.cnpj); const candidateUrl = `https://${candidate.domain}`;
    let enrichment: Awaited<ReturnType<typeof enrichFromPublicWebsite>> | null = null; let error: string | null = null;
    try { enrichment = await enrichFromPublicWebsite(databasePath, cnpj, candidateUrl); }
    catch (caught) { error = caught instanceof Error ? caught.message : "Falha desconhecida"; }
    await upsertCommercialAccount(databasePath, { cnpj, product: "research", stage: "researching", leadOrigin: "controlled-enrichment-sample-v1.3", notes: `Amostra controlada; domínio cadastral ${candidate.domain}` });
    results.push({ cnpj, companyName: candidate.company_name, registryEmail: candidate.email, candidateUrl, confirmationLevel: enrichment?.confirmationLevel ?? null, discoveries: enrichment?.discoveries ?? [], error, addedToPortfolio: true });
  }
  const confirmed = results.filter((item) => item.confirmationLevel === "confirmed_cnpj");
  return {
    scope: { requested: sampleSize, processed: results.length, rule: "estabelecimentos ativos, um por domínio empresarial válido e não gratuito, ordenados por CNPJ" },
    summary: {
      sitesIdentified: confirmed.length,
      commercialChannelsFound: confirmed.filter((item) => Array.isArray(item.discoveries) && item.discoveries.some((discovery) => ["commercial_email", "commercial_phone"].includes(discovery.fieldType) || String(discovery.fieldType).startsWith("official_"))).length,
      withConflicts: confirmed.filter((item) => Array.isArray(item.discoveries) && item.discoveries.some((discovery) => discovery.conflict)).length,
      notEnriched: results.length - confirmed.length,
      addedToPortfolio: results.filter((item) => item.addedToPortfolio).length,
    },
    results,
    warning: "Resultados exclusivos desta amostra; não extrapolar para Salvador.",
  };
}
