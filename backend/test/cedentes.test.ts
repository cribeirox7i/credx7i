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
  alpha = await semearTenantComAdmin(`ced-alpha-${sufixo}`, "admin@alpha.test", SENHA);
  beta = await semearTenantComAdmin(`ced-beta-${sufixo}`, "admin@beta.test", SENHA);
  tokenAlpha = await logar(alpha.slug, "admin@alpha.test");
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  if (beta) await limparTenant(beta.tenantId).catch(() => {});
  await Promise.allSettled([adminPool.end(), appPool.end()]);
});

function comoAlpha(req: request.Test) {
  return req.set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${tokenAlpha}`);
}

async function criarMunicipioAlpha() {
  const r = await comoAlpha(api("post", "/api/municipios-habilitados")).send({
    municipioIbge: "3550308",
    nome: "São Paulo",
    uf: "SP",
    tipo: "SEDE",
  });
  expect([201, 409]).toContain(r.status);
}

describe("cedentes", () => {
  it("cria, lê e lista (admin tem todas as permissões)", async () => {
    await criarMunicipioAlpha();
    const criar = await comoAlpha(api("post", "/api/cedentes")).send({
      cnpj: "11222333000181", // CNPJ válido (dígitos verificadores corretos)
      razaoSocial: "Fulano Comércio Ltda",
      municipioIbge: "3550308",
      uf: "SP",
    });
    expect(criar.status).toBe(201);
    const cedenteId = criar.body.cedenteId as string;

    const lista = await comoAlpha(api("get", "/api/cedentes"));
    expect(lista.status).toBe(200);
    expect(lista.body.some((c: { cedente_id: string }) => c.cedente_id === cedenteId)).toBe(true);

    const detalhe = await comoAlpha(api("get", `/api/cedentes/${cedenteId}`));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.status_cadastro).toBe("RASCUNHO");
  });

  it("rejeita CNPJ com dígito verificador inválido", async () => {
    const r = await comoAlpha(api("post", "/api/cedentes")).send({
      cnpj: "11222333000199", // dígitos errados
      razaoSocial: "Inválido Ltda",
    });
    expect(r.status).toBe(400);
  });

  it("RN-01: rejeita município fora da área habilitada", async () => {
    const r = await comoAlpha(api("post", "/api/cedentes")).send({
      cnpj: "11444777000161",
      razaoSocial: "Fora da Área Ltda",
      municipioIbge: "9999999",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/RN-01|área habilitada/);
  });

  it("unicidade de CNPJ por tenant", async () => {
    const dados = { cnpj: "11444777000161", razaoSocial: "Duplicado Ltda" };
    const primeira = await comoAlpha(api("post", "/api/cedentes")).send(dados);
    expect(primeira.status).toBe(201);
    const segunda = await comoAlpha(api("post", "/api/cedentes")).send(dados);
    expect(segunda.status).toBe(409);
  });

  it("mudança de status grava histórico (RN-11) e PATCH não altera status_cadastro", async () => {
    const criar = await comoAlpha(api("post", "/api/cedentes")).send({
      cnpj: "07526557000100",
      razaoSocial: "Histórico Ltda",
    });
    const cedenteId = criar.body.cedenteId as string;

    const patch = await comoAlpha(api("patch", `/api/cedentes/${cedenteId}`)).send({
      statusCadastro: "APROVADO", // não é campo aceito - deve ser ignorado (zod não conhece o campo)
      nomeFantasia: "Apelido",
    });
    expect(patch.status).toBe(204);
    const aposPatch = await comoAlpha(api("get", `/api/cedentes/${cedenteId}`));
    expect(aposPatch.body.status_cadastro).toBe("RASCUNHO");
    expect(aposPatch.body.nome_fantasia).toBe("Apelido");

    const mudar = await comoAlpha(api("post", `/api/cedentes/${cedenteId}/status`)).send({
      statusNovo: "EM_ANALISE",
      observacao: "iniciando análise",
    });
    expect(mudar.status).toBe(204);

    const historico = await comoAlpha(api("get", `/api/cedentes/${cedenteId}/historico-status`));
    expect(historico.status).toBe(200);
    expect(historico.body).toHaveLength(1);
    expect(historico.body[0].status_anterior).toBe("RASCUNHO");
    expect(historico.body[0].status_novo).toBe("EM_ANALISE");
  });

  it("isolamento: cedente de alpha não aparece pra beta", async () => {
    const tokenBeta = await logar(beta.slug, "admin@beta.test");
    const criar = await comoAlpha(api("post", "/api/cedentes")).send({
      cnpj: "07526557000290",
      razaoSocial: "Só Alpha Ltda",
    });
    const cedenteId = criar.body.cedenteId as string;

    const viaBeta = await api("get", `/api/cedentes/${cedenteId}`)
      .set("X-Tenant-Slug", beta.slug)
      .set("Authorization", `Bearer ${tokenBeta}`);
    expect(viaBeta.status).toBe(404);
  });

  it("exige autenticação", async () => {
    const r = await api("get", "/api/cedentes").set("X-Tenant-Slug", alpha.slug);
    expect(r.status).toBe(401);
  });
});
