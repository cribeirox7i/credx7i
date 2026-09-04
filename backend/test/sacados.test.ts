import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/server";
import { adminPool, appPool, limparTenant, semearTenantComAdmin, SeedRefs } from "./helpers";

const sufixo = Math.random().toString(36).slice(2, 8);
const SENHA = "Cred!x7i2026";
let alpha: SeedRefs;
let tokenAlpha: string;

function api(method: "get" | "post" | "patch", path: string) {
  return (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path);
}

async function logar(slug: string, email: string): Promise<string> {
  const r = await api("post", "/api/auth/login").set("X-Tenant-Slug", slug).send({ email, senha: SENHA });
  return r.body.token as string;
}

beforeAll(async () => {
  alpha = await semearTenantComAdmin(`sac-alpha-${sufixo}`, "admin@alpha.test", SENHA);
  tokenAlpha = await logar(alpha.slug, "admin@alpha.test");
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  await Promise.allSettled([adminPool.end(), appPool.end()]);
});

function comoAlpha(req: request.Test) {
  return req.set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${tokenAlpha}`);
}

describe("sacados", () => {
  it("cria PJ (CNPJ válido), lê e lista", async () => {
    const criar = await comoAlpha(api("post", "/api/sacados")).send({
      tipoDocumento: "PJ",
      documento: "11222333000181",
      nomeRazaoSocial: "Sacado Comércio Ltda",
    });
    expect(criar.status).toBe(201);
    const sacadoId = criar.body.sacadoId as string;

    const lista = await comoAlpha(api("get", "/api/sacados"));
    expect(lista.body.some((s: { sacado_id: string }) => s.sacado_id === sacadoId)).toBe(true);

    const detalhe = await comoAlpha(api("get", `/api/sacados/${sacadoId}`));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.bloqueado).toBe(false);
  });

  it("cria PF (CPF válido)", async () => {
    const r = await comoAlpha(api("post", "/api/sacados")).send({
      tipoDocumento: "PF",
      documento: "52998224725", // CPF válido conhecido
      nomeRazaoSocial: "Fulano de Tal",
    });
    expect(r.status).toBe(201);
  });

  it("rejeita CPF com dígito verificador inválido", async () => {
    const r = await comoAlpha(api("post", "/api/sacados")).send({
      tipoDocumento: "PF",
      documento: "52998224700",
      nomeRazaoSocial: "Inválido",
    });
    expect(r.status).toBe(400);
  });

  it("RN-01: rejeita município fora da área habilitada", async () => {
    const r = await comoAlpha(api("post", "/api/sacados")).send({
      tipoDocumento: "PJ",
      documento: "11444777000161",
      nomeRazaoSocial: "Fora da Área",
      municipioIbge: "9999999",
    });
    expect(r.status).toBe(400);
  });

  it("unicidade de documento por tenant", async () => {
    const dados = { tipoDocumento: "PJ", documento: "07526557000100", nomeRazaoSocial: "Duplicado" };
    const primeira = await comoAlpha(api("post", "/api/sacados")).send(dados);
    expect(primeira.status).toBe(201);
    const segunda = await comoAlpha(api("post", "/api/sacados")).send(dados);
    expect(segunda.status).toBe(409);
  });

  it("PATCH altera limite de crédito e bloqueio", async () => {
    const criar = await comoAlpha(api("post", "/api/sacados")).send({
      tipoDocumento: "PJ",
      documento: "07526557000290",
      nomeRazaoSocial: "Pra Bloquear",
    });
    const sacadoId = criar.body.sacadoId as string;

    const patch = await comoAlpha(api("patch", `/api/sacados/${sacadoId}`)).send({
      limiteCredito: 50000,
      bloqueado: true,
    });
    expect(patch.status).toBe(204);

    const detalhe = await comoAlpha(api("get", `/api/sacados/${sacadoId}`));
    expect(detalhe.body.bloqueado).toBe(true);
    expect(Number(detalhe.body.limite_credito)).toBe(50000);
  });
});
