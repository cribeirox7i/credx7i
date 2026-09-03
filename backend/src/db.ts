import { Pool, PoolClient, types } from "pg";
import { config } from "./config";

// OID 1700 = NUMERIC. Sem isto o driver entrega valores monetários como string e toda
// formatação/conta vira no-op silencioso. Erro já pago no WebCRM; nasce corrigido aqui.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// Pool de runtime: pooler do Supabase, role credx7i_app (sem BYPASSRLS). `max` baixo de
// propósito: cada instância serverless mantém o seu.
export const pool = new Pool({ connectionString: config.DATABASE_POOLER_URL, max: 5 });

/**
 * Executa `fn` dentro de uma transação com `app.tenant_id` fixado no contexto local.
 * Toda leitura/escrita de tabela de negócio DEVE passar por aqui: as políticas de RLS
 * comparam `tenant_id` da linha com `current_setting('app.tenant_id')`, e sem o contexto
 * definido nenhuma linha é visível (falha fechada).
 *
 * `set_config(..., true)` -> escopo LOCAL (só nesta transação), compatível com o pooler
 * em modo transaction.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consultas fora do contexto de tenant: apenas o registry (`tenants`), que não tem RLS
 * por tenant e é lido para resolver o slug -> tenant_id antes de qualquer transação de
 * negócio. Nunca use isto para tabela de negócio.
 */
export async function queryRegistry<T = unknown>(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}
