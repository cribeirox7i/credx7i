import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/server";
import { adminPool, appPool, limparTenant, semearTenantComAdmin, SeedRefs } from "./helpers";

const sufixo = Math.random().toString(36).slice(2, 8);
const SENHA = "Cred!x7i2026";
let alpha: SeedRefs;
let beta: SeedRefs;

// IP próprio por execução: o rate_limit persiste no banco entre runs, e um IP fixo
// somaria os logins de execuções seguidas dentro da janela de 15 min e estouraria o limite.
const IP_SUITE = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

// supertest: headers vão na Test (retornada por .get/.post), não no objeto de request.
function api(method: "get" | "post", path: string, ip = IP_SUITE) {
  return (request(app) as unknown as Record<string, (p: string) => request.Test>)
    [method](path)
    .set("X-Forwarded-For", ip);
}

async function logar(slug: string, email: string, senha = SENHA): Promise<string> {
  const r = await api("post", "/api/auth/login").set("X-Tenant-Slug", slug).send({ email, senha });
  return r.body.token as string;
}

beforeAll(async () => {
  alpha = await semearTenantComAdmin(`auth-alpha-${sufixo}`, "admin@alpha.test", SENHA);
  beta = await semearTenantComAdmin(`auth-beta-${sufixo}`, "admin@beta.test", SENHA);
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  if (beta) await limparTenant(beta.tenantId).catch(() => {});
  await Promise.allSettled([adminPool.end(), appPool.end()]);
});

describe("resolução de tenant", () => {
  it("sem tenant -> 400", async () => {
    expect((await api("get", "/api/auth/me")).status).toBe(400);
  });
  it("tenant desconhecido -> 404", async () => {
    const r = await api("get", "/api/tenants/atual").set("X-Tenant-Slug", "nao-existe-mesmo");
    expect(r.status).toBe(404);
  });
  it("/health não exige tenant", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });
});

describe("login", () => {
  it("credenciais corretas -> token", async () => {
    const r = await api("post", "/api/auth/login")
      .set("X-Tenant-Slug", alpha.slug)
      .send({ email: "admin@alpha.test", senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.usuario.email).toBe("admin@alpha.test");
  });

  it("senha errada -> 401", async () => {
    const r = await api("post", "/api/auth/login")
      .set("X-Tenant-Slug", alpha.slug)
      .send({ email: "admin@alpha.test", senha: "errada" });
    expect(r.status).toBe(401);
  });

  it("usuário de outro tenant -> 401", async () => {
    const r = await api("post", "/api/auth/login")
      .set("X-Tenant-Slug", beta.slug)
      .send({ email: "admin@alpha.test", senha: SENHA });
    expect(r.status).toBe(401);
  });
});

describe("sessão", () => {
  let token: string;
  beforeAll(async () => {
    token = await logar(alpha.slug, "admin@alpha.test");
  });

  it("/me com o token do próprio tenant", async () => {
    const r = await api("get", "/api/auth/me")
      .set("X-Tenant-Slug", alpha.slug)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.adminTenant).toBe(true);
  });

  it("mesmo token no subdomínio de outro tenant -> 401", async () => {
    const r = await api("get", "/api/auth/me")
      .set("X-Tenant-Slug", beta.slug)
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(401);
  });

  it("sem token -> 401", async () => {
    expect((await api("get", "/api/auth/me").set("X-Tenant-Slug", alpha.slug)).status).toBe(401);
  });

  it("logout invalida a sessão", async () => {
    const t = await logar(alpha.slug, "admin@alpha.test");
    await api("post", "/api/auth/logout").set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${t}`);
    const r = await api("get", "/api/auth/me").set("X-Tenant-Slug", alpha.slug).set("Authorization", `Bearer ${t}`);
    expect(r.status).toBe(401);
  });
});

describe("administração do tenant e convite", () => {
  let adminToken: string;
  const opEmail = `op-${sufixo}@alpha.test`;
  beforeAll(async () => {
    adminToken = await logar(alpha.slug, "admin@alpha.test");
  });

  it("admin cria usuário; convite define senha e loga; token é de uso único; operador não é admin", async () => {
    const criar = await api("post", "/api/usuarios")
      .set("X-Tenant-Slug", alpha.slug)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nome: "Operador", email: opEmail });
    expect(criar.status).toBe(201);
    const token = new URL(criar.body.conviteLink).searchParams.get("token")!;

    const fraca = await api("post", `/api/auth/convite/${token}/definir-senha`)
      .set("X-Tenant-Slug", alpha.slug)
      .send({ novaSenha: "abc" });
    expect(fraca.status).toBe(400);

    const definir = await api("post", `/api/auth/convite/${token}/definir-senha`)
      .set("X-Tenant-Slug", alpha.slug)
      .send({ novaSenha: "Op!Senha123" });
    expect(definir.status).toBe(200);
    const opToken = definir.body.token;

    const reuso = await api("post", `/api/auth/convite/${token}/definir-senha`)
      .set("X-Tenant-Slug", alpha.slug)
      .send({ novaSenha: "Op!Senha123" });
    expect(reuso.status).toBe(404);

    const proibido = await api("get", "/api/usuarios")
      .set("X-Tenant-Slug", alpha.slug)
      .set("Authorization", `Bearer ${opToken}`);
    expect(proibido.status).toBe(403);
  });

  it("admin não enxerga usuário de outro tenant", async () => {
    const r = await api("get", "/api/usuarios")
      .set("X-Tenant-Slug", alpha.slug)
      .set("Authorization", `Bearer ${adminToken}`);
    const emails = r.body.map((u: { email: string }) => u.email);
    expect(emails).toContain("admin@alpha.test");
    expect(emails).not.toContain("admin@beta.test");
  });
});

describe("rate limit de login", () => {
  it("11ª tentativa do mesmo IP na janela -> 429", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let ultima = 0;
    for (let i = 0; i < 11; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("X-Tenant-Slug", alpha.slug)
        .set("X-Forwarded-For", ip)
        .send({ email: "admin@alpha.test", senha: "seja-la-o-que-for" });
      ultima = r.status;
    }
    expect(ultima).toBe(429);
  });
});
