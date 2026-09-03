import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminPool,
  appPool,
  comContexto,
  fecharPools,
  insertCruzado,
  limparTenant,
  semearTenant,
  SeedRefs,
  TABELAS_ISENTAS,
  TABELAS_NEGOCIO,
} from "./helpers";

const sufixo = Math.random().toString(36).slice(2, 8);
let alpha: SeedRefs;
let beta: SeedRefs;

beforeAll(async () => {
  alpha = await semearTenant(`iso-alpha-${sufixo}`);
  beta = await semearTenant(`iso-beta-${sufixo}`);
});

afterAll(async () => {
  if (alpha) await limparTenant(alpha.tenantId).catch(() => {});
  if (beta) await limparTenant(beta.tenantId).catch(() => {});
  await fecharPools();
});

describe("garantia mecânica: toda tabela de negócio tem FORCE RLS", () => {
  it("nenhuma tabela do schema public sem RLS forçado", async () => {
    const { rows } = await adminPool.query<{ relname: string; rowsecurity: boolean; forced: boolean }>(
      `SELECT c.relname,
              c.relrowsecurity      AS rowsecurity,
              c.relforcerowsecurity AS forced
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    const desprotegidas = rows
      .filter((r) => !TABELAS_ISENTAS.has(r.relname))
      .filter((r) => !(r.rowsecurity && r.forced))
      .map((r) => r.relname);
    expect(desprotegidas, `tabelas sem ENABLE+FORCE RLS: ${desprotegidas.join(", ")}`).toEqual([]);
  });

  it("a lista da suíte cobre todas as tabelas de negócio existentes", async () => {
    const { rows } = await adminPool.query<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    const existentes = rows
      .map((r) => r.relname)
      .filter((n) => !TABELAS_ISENTAS.has(n))
      .sort();
    expect(existentes).toEqual([...TABELAS_NEGOCIO].sort());
  });
});

describe("sem contexto de tenant, nada é visível (falha fechada)", () => {
  it.each(TABELAS_NEGOCIO)("%s retorna zero linhas", async (tabela) => {
    const { rows } = await appPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${tabela}`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("com contexto do tenant alpha, o tenant beta é invisível", () => {
  it.each(TABELAS_NEGOCIO)("SELECT em %s não enxerga linha do beta", async (tabela) => {
    await comContexto(appPool, alpha.tenantId, async (c) => {
      const proprio = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tabela} WHERE tenant_id = $1`,
        [alpha.tenantId],
      );
      expect(proprio.rows[0].n).toBeGreaterThanOrEqual(1); // vê o próprio seed

      const alheio = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tabela} WHERE tenant_id = $1`,
        [beta.tenantId],
      );
      expect(alheio.rows[0].n).toBe(0);
    });
  });

  it.each(TABELAS_NEGOCIO)("UPDATE em %s não afeta linha do beta", async (tabela) => {
    await comContexto(appPool, alpha.tenantId, async (c) => {
      const r = await c.query(
        `UPDATE ${tabela} SET tenant_id = tenant_id WHERE tenant_id = $1`,
        [beta.tenantId],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it.each(TABELAS_NEGOCIO)("DELETE em %s não remove linha do beta", async (tabela) => {
    await comContexto(appPool, alpha.tenantId, async (c) => {
      const r = await c.query(`DELETE FROM ${tabela} WHERE tenant_id = $1`, [beta.tenantId]);
      expect(r.rowCount).toBe(0);
    });
  });

  it.each(TABELAS_NEGOCIO)("INSERT em %s com tenant_id do beta é rejeitado", async (tabela) => {
    const { sql, params } = insertCruzado(tabela, beta);
    await expect(
      comContexto(appPool, alpha.tenantId, (c) => c.query(sql, params)),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});

describe("o dado do beta continua intacto após as tentativas do alpha", () => {
  it.each(TABELAS_NEGOCIO)("%s ainda tem o seed do beta", async (tabela) => {
    await comContexto(appPool, beta.tenantId, async (c) => {
      const { rows } = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tabela} WHERE tenant_id = $1`,
        [beta.tenantId],
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
    });
  });
});
