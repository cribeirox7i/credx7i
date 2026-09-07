import { Pool, PoolClient } from "pg";
import { hashPassword } from "../src/authCrypto";

// Conexão de setup/teardown: role credx7i_owner (Direct, 5432). Sem BYPASSRLS -> também
// sujeita ao FORCE RLS, então toda operação em tabela de negócio passa por um contexto
// de tenant, igual à aplicação.
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_URL não definida (necessária para a suíte de isolamento)");

// Conexão que faz as asserções de isolamento: role credx7i_app. Preferir a direta
// (DATABASE_APP_URL); cair no pooler se não houver.
const appUrl = process.env.DATABASE_APP_URL ?? process.env.DATABASE_POOLER_URL;
if (!appUrl) throw new Error("DATABASE_APP_URL ou DATABASE_POOLER_URL necessária para a suíte");

export const adminPool = new Pool({ connectionString: adminUrl, max: 4 });
export const appPool = new Pool({ connectionString: appUrl, max: 4 });

export async function fecharPools() {
  await Promise.allSettled([adminPool.end(), appPool.end()]);
}

/** Executa `fn` numa transação com `app.tenant_id` fixado, e faz ROLLBACK ao final. */
export async function comContexto<T>(
  pool: Pool,
  tenantId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

/** Igual a comContexto mas com COMMIT (para o seed). */
export async function comContextoCommit<T>(
  pool: Pool,
  tenantId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Tabelas de negócio das Fases 1-3c. DEVE espelhar as listas de db/migrations/0004_rls.js,
// 0007_cadastros_credito.js e 0008_parametros_fiscais_proposta.js.
export const TABELAS_NEGOCIO = [
  "usuarios",
  "usuario_sessoes",
  "papeis",
  "permissoes",
  "auditoria",
  "arquivos",
  "municipio_habilitado",
  "atividade_economica",
  "cedente",
  "cedente_situacao_hist",
  "sacado",
  "iof_tabela",
  "tributo_receita_tabela",
  "tabela_custo",
  "tabela_custo_item",
  "proposta",
] as const;

// Tabelas do schema public que NÃO são de negócio (sem tenant_id / sem RLS por design):
// registry de tenants, controle de migrations, e o rate_limit (chaveado por IP, global).
export const TABELAS_ISENTAS = new Set(["tenants", "pgmigrations", "rate_limit"]);

export type SeedRefs = {
  tenantId: string;
  slug: string;
  userId: string;
  papelId: string;
  cedenteId: string;
  tabelaCustoId: string;
};

/** Cria um tenant e uma linha conhecida em cada tabela de negócio. */
export async function semearTenant(slug: string): Promise<SeedRefs> {
  const { rows } = await adminPool.query<{ tenant_id: string }>(
    "INSERT INTO tenants (slug, nome) VALUES ($1, $2) RETURNING tenant_id",
    [slug, `Tenant ${slug}`],
  );
  const tenantId = rows[0].tenant_id;

  const refs = await comContextoCommit(adminPool, tenantId, async (c) => {
    const u = await c.query<{ user_id: string }>(
      "INSERT INTO usuarios (tenant_id, nome, email) VALUES ($1, 'Seed', $2) RETURNING user_id",
      [tenantId, `seed-${slug}@example.com`],
    );
    const userId = u.rows[0].user_id;

    await c.query(
      "INSERT INTO usuario_sessoes (sessao_token, tenant_id, user_id, expira_em) VALUES ($1, $2, $3, now() + interval '1 day')",
      [`tok-${slug}`, tenantId, userId],
    );

    const p = await c.query<{ papel_id: string }>(
      "INSERT INTO papeis (tenant_id, nome) VALUES ($1, 'Operador') RETURNING papel_id",
      [tenantId],
    );
    const papelId = p.rows[0].papel_id;

    await c.query(
      "INSERT INTO permissoes (tenant_id, papel_id, recurso, leitura) VALUES ($1, $2, 'cedente', true)",
      [tenantId, papelId],
    );
    await c.query(
      "INSERT INTO auditoria (tenant_id, usuario_id, acao, entidade) VALUES ($1, $2, 'seed', 'teste')",
      [tenantId, userId],
    );
    await c.query(
      "INSERT INTO arquivos (tenant_id, chave, nome_original) VALUES ($1, $2, 'seed.pdf')",
      [tenantId, `${tenantId}/seed.pdf`],
    );

    await c.query(
      "INSERT INTO municipio_habilitado (tenant_id, municipio_ibge, nome, uf, tipo) VALUES ($1, '3550308', 'São Paulo', 'SP', 'SEDE')",
      [tenantId],
    );
    const ae = await c.query<{ atividade_economica_id: string }>(
      "INSERT INTO atividade_economica (tenant_id, codigo, descricao, segmento) VALUES ($1, '00.00-0', 'Seed', 'SERVICO') RETURNING atividade_economica_id",
      [tenantId],
    );
    const cedenteRow = await c.query<{ cedente_id: string }>(
      `INSERT INTO cedente (tenant_id, cnpj, razao_social, atividade_economica_id, municipio_ibge)
       VALUES ($1, $2, 'Cedente Seed', $3, '3550308') RETURNING cedente_id`,
      [tenantId, `cnpj-${slug}`, ae.rows[0].atividade_economica_id],
    );
    const cedenteId = cedenteRow.rows[0].cedente_id;
    await c.query(
      "INSERT INTO cedente_situacao_hist (tenant_id, cedente_id, status_novo, usuario_id) VALUES ($1, $2, 'RASCUNHO', $3)",
      [tenantId, cedenteId, userId],
    );
    await c.query(
      "INSERT INTO sacado (tenant_id, tipo_documento, documento, nome_razao_social) VALUES ($1, 'PJ', $2, 'Sacado Seed')",
      [tenantId, `doc-${slug}`],
    );

    await c.query(
      `INSERT INTO iof_tabela (tenant_id, tipo_tomador, enquadramento, vigencia_inicio, aliquota_dia, aliquota_adicional, teto_dias)
       VALUES ($1, 'PJ', 'PADRAO', '2020-01-01', 0.000082, 0.0038, 365)`,
      [tenantId],
    );
    await c.query(
      `INSERT INTO tributo_receita_tabela (tenant_id, tipo_tomador, enquadramento, tributo, aliquota, vigencia_inicio)
       VALUES ($1, 'PJ', 'PADRAO', 'IRRF', 0.005, '2020-01-01')`,
      [tenantId],
    );
    const tc = await c.query<{ tabela_custo_id: string }>(
      "INSERT INTO tabela_custo (tenant_id, nome, padrao) VALUES ($1, 'Seed', true) RETURNING tabela_custo_id",
      [tenantId],
    );
    const tabelaCustoId = tc.rows[0].tabela_custo_id;
    await c.query(
      "INSERT INTO tabela_custo_item (tenant_id, tabela_custo_id, nome, valor) VALUES ($1, $2, 'TED', 10)",
      [tenantId, tabelaCustoId],
    );
    await c.query(
      `INSERT INTO proposta (tenant_id, cedente_id, modalidade, sistema_amortizacao, taxa_prefixada,
                              valor_solicitado, n_parcelas, data_liberacao, tratamento_iof, tabela_custo_id)
       VALUES ($1, $2, 'Seed', 'PRICE', 0.02, 10000, 12, '2026-01-15', 'DESCONTADO', $3)`,
      [tenantId, cedenteId, tabelaCustoId],
    );

    return { userId, papelId, cedenteId, tabelaCustoId };
  });

  return { tenantId, slug, ...refs };
}

/** Apaga o tenant e todos os seus dados, na ordem de dependência. */
export async function limparTenant(tenantId: string) {
  await comContextoCommit(adminPool, tenantId, async (c) => {
    await c.query("DELETE FROM proposta WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM tabela_custo_item WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM tabela_custo WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM tributo_receita_tabela WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM iof_tabela WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM cedente_situacao_hist WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM sacado WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM cedente WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM atividade_economica WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM municipio_habilitado WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM auditoria WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM permissoes WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM usuario_sessoes WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM arquivos WHERE tenant_id = $1", [tenantId]);
    await c.query("UPDATE usuarios SET papel_id = NULL WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM papeis WHERE tenant_id = $1", [tenantId]);
    await c.query("DELETE FROM usuarios WHERE tenant_id = $1", [tenantId]);
  });
  await adminPool.query("DELETE FROM tenants WHERE tenant_id = $1", [tenantId]);
}

/** Tenant com um papel Administrador e um usuário admin ATIVO com a senha dada. */
export async function semearTenantComAdmin(
  slug: string,
  email: string,
  senha: string,
): Promise<SeedRefs> {
  const { rows } = await adminPool.query<{ tenant_id: string }>(
    "INSERT INTO tenants (slug, nome) VALUES ($1, $2) RETURNING tenant_id",
    [slug, `Tenant ${slug}`],
  );
  const tenantId = rows[0].tenant_id;
  const refs = await comContextoCommit(adminPool, tenantId, async (c) => {
    const p = await c.query<{ papel_id: string }>(
      "INSERT INTO papeis (tenant_id, nome, admin_tenant) VALUES ($1, 'Administrador', true) RETURNING papel_id",
      [tenantId],
    );
    const papelId = p.rows[0].papel_id;
    const u = await c.query<{ user_id: string }>(
      `INSERT INTO usuarios (tenant_id, nome, email, senha_hash, papel_id, status, deve_trocar_senha)
       VALUES ($1, 'Admin', $2, $3, $4, 'ATIVO', false) RETURNING user_id`,
      [tenantId, email, hashPassword(senha), papelId],
    );
    const cedenteRow = await c.query<{ cedente_id: string }>(
      "INSERT INTO cedente (tenant_id, cnpj, razao_social) VALUES ($1, $2, 'Cedente Seed') RETURNING cedente_id",
      [tenantId, `cnpj-${slug}`],
    );
    const tc = await c.query<{ tabela_custo_id: string }>(
      "INSERT INTO tabela_custo (tenant_id, nome, padrao) VALUES ($1, 'Seed', true) RETURNING tabela_custo_id",
      [tenantId],
    );
    return {
      userId: u.rows[0].user_id,
      papelId,
      cedenteId: cedenteRow.rows[0].cedente_id,
      tabelaCustoId: tc.rows[0].tabela_custo_id,
    };
  });
  return { tenantId, slug, ...refs };
}

// INSERT cruzado (tenant_id do outro tenant) por tabela: espera-se rejeição por WITH CHECK.
// Para as tabelas com FK intra-tenant, os ids do alvo são fornecidos pelo chamador.
export function insertCruzado(
  tabela: string,
  alvo: SeedRefs,
): { sql: string; params: unknown[] } {
  switch (tabela) {
    case "usuarios":
      return {
        sql: "INSERT INTO usuarios (tenant_id, nome, email) VALUES ($1, 'x', $2)",
        params: [alvo.tenantId, `cross-${alvo.slug}@example.com`],
      };
    case "usuario_sessoes":
      return {
        sql: "INSERT INTO usuario_sessoes (sessao_token, tenant_id, user_id, expira_em) VALUES ($1, $2, $3, now() + interval '1 day')",
        params: [`cross-${alvo.slug}`, alvo.tenantId, alvo.userId],
      };
    case "papeis":
      return {
        sql: "INSERT INTO papeis (tenant_id, nome) VALUES ($1, 'Cross')",
        params: [alvo.tenantId],
      };
    case "permissoes":
      return {
        sql: "INSERT INTO permissoes (tenant_id, papel_id, recurso) VALUES ($1, $2, 'cross')",
        params: [alvo.tenantId, alvo.papelId],
      };
    case "auditoria":
      return {
        sql: "INSERT INTO auditoria (tenant_id, acao, entidade) VALUES ($1, 'cross', 'x')",
        params: [alvo.tenantId],
      };
    case "arquivos":
      return {
        sql: "INSERT INTO arquivos (tenant_id, chave, nome_original) VALUES ($1, $2, 'x.pdf')",
        params: [alvo.tenantId, `${alvo.tenantId}/cross.pdf`],
      };
    case "municipio_habilitado":
      return {
        sql: "INSERT INTO municipio_habilitado (tenant_id, municipio_ibge, nome, uf, tipo) VALUES ($1, $2, 'Cross', 'SP', 'SEDE')",
        params: [alvo.tenantId, `cross-${alvo.slug}`],
      };
    case "atividade_economica":
      return {
        sql: "INSERT INTO atividade_economica (tenant_id, codigo, descricao, segmento) VALUES ($1, $2, 'Cross', 'SERVICO')",
        params: [alvo.tenantId, `cross-${alvo.slug}`],
      };
    case "cedente":
      return {
        sql: "INSERT INTO cedente (tenant_id, cnpj, razao_social) VALUES ($1, $2, 'Cross')",
        params: [alvo.tenantId, `cross-cnpj-${alvo.slug}`],
      };
    case "cedente_situacao_hist":
      return {
        sql: "INSERT INTO cedente_situacao_hist (tenant_id, cedente_id, status_novo) VALUES ($1, $2, 'RASCUNHO')",
        params: [alvo.tenantId, alvo.cedenteId],
      };
    case "sacado":
      return {
        sql: "INSERT INTO sacado (tenant_id, tipo_documento, documento, nome_razao_social) VALUES ($1, 'PJ', $2, 'Cross')",
        params: [alvo.tenantId, `cross-doc-${alvo.slug}`],
      };
    case "iof_tabela":
      return {
        sql: `INSERT INTO iof_tabela (tenant_id, tipo_tomador, enquadramento, vigencia_inicio, aliquota_dia, aliquota_adicional, teto_dias)
              VALUES ($1, 'PJ', 'PADRAO', '2020-01-01', 0, 0, 365)`,
        params: [alvo.tenantId],
      };
    case "tributo_receita_tabela":
      return {
        sql: `INSERT INTO tributo_receita_tabela (tenant_id, tipo_tomador, enquadramento, tributo, aliquota, vigencia_inicio)
              VALUES ($1, 'PJ', 'PADRAO', 'IRRF', 0, '2020-01-01')`,
        params: [alvo.tenantId],
      };
    case "tabela_custo":
      return {
        sql: "INSERT INTO tabela_custo (tenant_id, nome) VALUES ($1, 'Cross')",
        params: [alvo.tenantId],
      };
    case "tabela_custo_item":
      return {
        sql: "INSERT INTO tabela_custo_item (tenant_id, tabela_custo_id, nome, valor) VALUES ($1, $2, 'Cross', 0)",
        params: [alvo.tenantId, alvo.tabelaCustoId],
      };
    case "proposta":
      return {
        sql: `INSERT INTO proposta (tenant_id, cedente_id, modalidade, sistema_amortizacao, taxa_prefixada,
                                     valor_solicitado, n_parcelas, data_liberacao, tratamento_iof)
              VALUES ($1, $2, 'Cross', 'PRICE', 0.02, 1000, 1, '2026-01-15', 'DESCONTADO')`,
        params: [alvo.tenantId, alvo.cedenteId],
      };
    default:
      throw new Error(`insertCruzado sem caso para ${tabela}`);
  }
}
