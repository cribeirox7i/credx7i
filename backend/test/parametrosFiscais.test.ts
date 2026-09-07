import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/server";
import { adminPool, appPool, limparTenant, semearTenantComAdmin, SeedRefs } from "./helpers";

const sufixo = Math.random().toString(36).slice(2, 8);
const SENHA = "Cred!x7i2026";
let alpha: SeedRefs;
let tokenAlpha: string;

// IP próprio por execução: o rate_limit persiste no banco entre runs, e um IP fixo
// somaria os logins de execuções seguidas dentro da janela de 15 min e estouraria o limite.
const IP_SUITE = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

function api(method: "get" | "post" | "patch", path: string) {
  return (request(app) as unknown as Record<string, (p: string) => request.Test>)
    [method](path)
    .set("X-Forwarded-For", IP_SUITE);
}

async function logar(slug: string, email: string): Promise<string> {
  const r = await api("post", "/api/auth/login").set("X-Tenant-Slug", slug).send({ email, senha: SENHA });
  return r.body.token as string;
}

beforeAll(async () => {
  alpha = await semearTenantComAdmin(`pf-alpha-${sufixo}`, "admin@alpha.test", SENHA);
  tokenAlpha = await logar(alpha.slug, "admin@alpha.test");
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  await Promise.allSettled([adminPool.end(), appPool.end()]);
});

function comoAlpha(req: request.Test) {
  return req.set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${tokenAlpha}`);
}

describe("parametros fiscais", () => {
  it("cria e lista linha de IOF", async () => {
    const criar = await comoAlpha(api("post", "/api/iof-tabela")).send({
      tipoTomador: "PJ",
      enquadramento: "PADRAO",
      vigenciaInicio: "2024-01-01",
      aliquotaDia: 0.000082,
      aliquotaDiaReduzida: 0.0000411,
      tetoValorReducao: 30000,
      aliquotaAdicional: 0.0038,
      tetoDias: 365,
    });
    expect(criar.status).toBe(201);

    const lista = await comoAlpha(api("get", "/api/iof-tabela"));
    expect(lista.status).toBe(200);
    expect(lista.body.some((l: { iof_tabela_id: string }) => l.iof_tabela_id === criar.body.iofTabelaId)).toBe(true);
  });

  it("cria e lista linha de tributo", async () => {
    const criar = await comoAlpha(api("post", "/api/tributos-tabela")).send({
      tipoTomador: "PJ",
      enquadramento: "PADRAO",
      tributo: "PIS",
      aliquota: 0.0065,
      vigenciaInicio: "2024-01-01",
    });
    expect(criar.status).toBe(201);

    const lista = await comoAlpha(api("get", "/api/tributos-tabela"));
    expect(
      lista.body.some(
        (l: { tributo_receita_tabela_id: string }) => l.tributo_receita_tabela_id === criar.body.tributoReceitaTabelaId,
      ),
    ).toBe(true);
  });

  it("cria tabela de custo com itens e marca como padrão desmarca a anterior", async () => {
    const primeira = await comoAlpha(api("post", "/api/tabelas-custo")).send({
      nome: "Tabela A",
      padrao: true,
      itens: [{ nome: "TED", valor: 10 }],
    });
    expect(primeira.status).toBe(201);

    const segunda = await comoAlpha(api("post", "/api/tabelas-custo")).send({
      nome: "Tabela B",
      itens: [{ nome: "Boleto", valor: 5 }],
    });
    expect(segunda.status).toBe(201);

    const marcar = await comoAlpha(api("patch", `/api/tabelas-custo/${segunda.body.tabelaCustoId}`)).send({
      padrao: true,
    });
    expect(marcar.status).toBe(204);

    const lista = await comoAlpha(api("get", "/api/tabelas-custo"));
    type Linha = { tabela_custo_id: string; padrao: boolean; itens: { nome: string; valor: string }[] };
    const rows: Linha[] = lista.body;
    const a = rows.find((r) => r.tabela_custo_id === primeira.body.tabelaCustoId)!;
    const b = rows.find((r) => r.tabela_custo_id === segunda.body.tabelaCustoId)!;
    expect(a.padrao).toBe(false);
    expect(b.padrao).toBe(true);
    expect(b.itens).toHaveLength(1);
    expect(b.itens[0].nome).toBe("Boleto");
  });
});
