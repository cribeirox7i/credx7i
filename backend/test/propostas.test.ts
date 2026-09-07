import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/server";
import { adminPool, appPool, limparTenant, semearTenantComAdmin, SeedRefs } from "./helpers";

const sufixo = Math.random().toString(36).slice(2, 8);
const SENHA = "Cred!x7i2026";
let alpha: SeedRefs;
let beta: SeedRefs;
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
  alpha = await semearTenantComAdmin(`prop-alpha-${sufixo}`, "admin@alpha.test", SENHA);
  beta = await semearTenantComAdmin(`prop-beta-${sufixo}`, "admin@beta.test", SENHA);
  tokenAlpha = await logar(alpha.slug, "admin@alpha.test");

  // semearTenantComAdmin não cadastra parâmetro fiscal - cadastra aqui só pra alpha,
  // beta fica de propósito sem nenhum (usado no teste de 422).
  await comoAlpha(api("post", "/api/iof-tabela")).send({
    tipoTomador: "PJ",
    enquadramento: "PADRAO",
    vigenciaInicio: "2020-01-01",
    aliquotaDia: 0.000082,
    aliquotaDiaReduzida: 0.0000411,
    tetoValorReducao: 30000,
    aliquotaAdicional: 0.0038,
    tetoDias: 365,
  });
  await comoAlpha(api("post", "/api/tributos-tabela")).send({
    tipoTomador: "PJ",
    enquadramento: "PADRAO",
    tributo: "IRRF",
    aliquota: 0.005,
    vigenciaInicio: "2020-01-01",
  });
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  if (beta) await limparTenant(beta.tenantId).catch(() => {});
  await Promise.allSettled([adminPool.end(), appPool.end()]);
});

function comoAlpha(req: request.Test) {
  return req.set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${tokenAlpha}`);
}

function dadosProposta(overrides: Record<string, unknown> = {}) {
  return {
    cedenteId: alpha.cedenteId,
    modalidade: "Capital de giro",
    sistemaAmortizacao: "PRICE",
    taxaPrefixada: 0.025,
    valorSolicitado: 10000,
    nParcelas: 12,
    carenciaPeriodos: 0,
    dataLiberacao: "2026-01-15",
    tratamentoIof: "DESCONTADO",
    tabelaCustoId: alpha.tabelaCustoId,
    ...overrides,
  };
}

describe("propostas", () => {
  it("cria e edita (RF-ANA-01: tudo editável em RASCUNHO)", async () => {
    const criar = await comoAlpha(api("post", "/api/propostas")).send(dadosProposta());
    expect(criar.status).toBe(201);
    const propostaId = criar.body.propostaId as string;

    const detalhe = await comoAlpha(api("get", `/api/propostas/${propostaId}`));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.status).toBe("RASCUNHO");
    expect(Number(detalhe.body.valor_solicitado)).toBe(10000);

    const editar = await comoAlpha(api("patch", `/api/propostas/${propostaId}`)).send({
      valorSolicitado: 15000,
      nParcelas: 24,
    });
    expect(editar.status).toBe(204);

    const aposEdicao = await comoAlpha(api("get", `/api/propostas/${propostaId}`));
    expect(Number(aposEdicao.body.valor_solicitado)).toBe(15000);
    expect(aposEdicao.body.n_parcelas).toBe(24);
  });

  it("rejeita taxaPrefixada e valorParcelaInformado juntos, ou nenhum dos dois", async () => {
    const ambos = await comoAlpha(api("post", "/api/propostas")).send(
      dadosProposta({ valorParcelaInformado: 900 }),
    );
    expect(ambos.status).toBe(400);

    const nenhum = await comoAlpha(api("post", "/api/propostas")).send(
      dadosProposta({ taxaPrefixada: undefined }),
    );
    expect(nenhum.status).toBe(400);
  });

  it("simula com sucesso usando a linha de IOF específica cadastrada no beforeAll", async () => {
    const criar = await comoAlpha(api("post", "/api/propostas")).send(dadosProposta());
    const propostaId = criar.body.propostaId as string;

    const simular = await comoAlpha(api("post", `/api/propostas/${propostaId}/simular`));
    expect(simular.status).toBe(200);
    expect(simular.body.parcelas).toHaveLength(12);
    expect(simular.body.parcelas[11].saldoDevedor).toBe(0);
    expect(simular.body.cetConvergiu).toBe(true);
    expect(simular.body.iofTotal).toBeGreaterThan(0);
    expect(simular.body.tributosTotal).toBeGreaterThan(0);

    const detalhe = await comoAlpha(api("get", `/api/propostas/${propostaId}`));
    expect(detalhe.body.simulado_em).not.toBeNull();
  });

  it("RN-44: sem linha específica pro enquadramento, cai pra PJ/PADRAO", async () => {
    const criar = await comoAlpha(api("post", "/api/propostas")).send(
      dadosProposta({ enquadramentoIof: "EXPORTACAO" }),
    );
    const propostaId = criar.body.propostaId as string;

    const simular = await comoAlpha(api("post", `/api/propostas/${propostaId}/simular`));
    expect(simular.status).toBe(200); // não existe linha EXPORTACAO -> cai pra PJ/PADRAO do seed
  });

  it("sem nenhuma linha de IOF aplicável -> 422", async () => {
    // tenant beta não tem seed de iof_tabela igual ao alpha (semearTenantComAdmin não cria).
    const tokenBeta = await logar(beta.slug, "admin@beta.test");
    const criar = await request(app)
      .post("/api/propostas")
      .set("X-Tenant-Slug", beta.slug)
      .set("Authorization", `Bearer ${tokenBeta}`)
      .send(dadosProposta({ cedenteId: beta.cedenteId, tabelaCustoId: null }));
    expect(criar.status).toBe(201);
    const propostaId = criar.body.propostaId as string;

    const simular = await request(app)
      .post(`/api/propostas/${propostaId}/simular`)
      .set("X-Tenant-Slug", beta.slug)
      .set("Authorization", `Bearer ${tokenBeta}`);
    expect(simular.status).toBe(422);
  });

  it("isolamento: proposta de alpha não aparece pra beta", async () => {
    const tokenBeta = await logar(beta.slug, "admin@beta.test");
    const criar = await comoAlpha(api("post", "/api/propostas")).send(dadosProposta());
    const propostaId = criar.body.propostaId as string;

    const viaBeta = await request(app)
      .get(`/api/propostas/${propostaId}`)
      .set("X-Tenant-Slug", beta.slug)
      .set("Authorization", `Bearer ${tokenBeta}`);
    expect(viaBeta.status).toBe(404);
  });
});
