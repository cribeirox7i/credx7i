// Resolução dos parâmetros fiscais versionados por vigência (RF-PAR-07/08) que
// alimentam o motor de cálculo (backend/src/calculo). Usado só pela rota de
// simulação de proposta - a query já roda sob withTenant, então RLS filtra por
// tenant sozinho.
import { PoolClient } from "pg";
import { ItemCusto, LinhaIof, LinhaTributo, TipoTomador } from "./calculo";

export class SemParametroFiscalError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "SemParametroFiscalError";
  }
}

type Enquadramento = "PADRAO" | "PNMPO" | "RURAL" | "HABITACIONAL" | "EXPORTACAO" | "RENEGOCIACAO";

async function buscarLinhaIof(
  c: PoolClient,
  tipoTomador: TipoTomador,
  enquadramento: Enquadramento,
  dataOperacao: string,
): Promise<LinhaIof | null> {
  const r = await c.query(
    `SELECT aliquota_dia, aliquota_dia_reduzida, teto_valor_reducao, aliquota_adicional,
            teto_dias, isencao_total
       FROM iof_tabela
      WHERE tipo_tomador = $1 AND enquadramento = $2
        AND vigencia_inicio <= $3 AND (vigencia_fim IS NULL OR vigencia_fim >= $3)
      ORDER BY vigencia_inicio DESC
      LIMIT 1`,
    [tipoTomador, enquadramento, dataOperacao],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    aliquotaDia: Number(row.aliquota_dia),
    aliquotaDiaReduzida: Number(row.aliquota_dia_reduzida),
    tetoValorReducao: Number(row.teto_valor_reducao),
    aliquotaAdicional: Number(row.aliquota_adicional),
    tetoDias: Number(row.teto_dias),
    isencaoTotal: row.isencao_total,
  };
}

/** RN-44: sem linha específica para tipo_tomador/enquadramento, cai para PJ/PADRAO. */
export async function resolverLinhaIof(
  c: PoolClient,
  tipoTomador: TipoTomador,
  enquadramento: Enquadramento,
  dataOperacao: string,
): Promise<LinhaIof> {
  const especifica = await buscarLinhaIof(c, tipoTomador, enquadramento, dataOperacao);
  if (especifica) return especifica;
  if (tipoTomador === "PJ" && enquadramento === "PADRAO") {
    throw new SemParametroFiscalError(
      "nenhuma linha de IOF (PJ/PADRAO) vigente para a data da operação - cadastre a tabela de IOF antes de simular",
    );
  }
  const fallback = await buscarLinhaIof(c, "PJ", "PADRAO", dataOperacao);
  if (!fallback) {
    throw new SemParametroFiscalError(
      "nenhuma linha de IOF vigente (nem específica nem PJ/PADRAO) para a data da operação - cadastre a tabela de IOF antes de simular",
    );
  }
  return fallback;
}

async function buscarTributos(
  c: PoolClient,
  tipoTomador: TipoTomador,
  enquadramento: Enquadramento,
  dataOperacao: string,
): Promise<LinhaTributo[]> {
  const r = await c.query(
    `SELECT DISTINCT ON (tributo) tributo, aliquota
       FROM tributo_receita_tabela
      WHERE tipo_tomador = $1 AND enquadramento = $2
        AND vigencia_inicio <= $3 AND (vigencia_fim IS NULL OR vigencia_fim >= $3)
      ORDER BY tributo, vigencia_inicio DESC`,
    [tipoTomador, enquadramento, dataOperacao],
  );
  return r.rows.map((row) => ({ tributo: row.tributo, aliquota: Number(row.aliquota) }));
}

/** Mesma lógica de fallback do IOF, mas lista vazia é um resultado válido (sem tributo ainda). */
export async function resolverTributos(
  c: PoolClient,
  tipoTomador: TipoTomador,
  enquadramento: Enquadramento,
  dataOperacao: string,
): Promise<LinhaTributo[]> {
  const especificos = await buscarTributos(c, tipoTomador, enquadramento, dataOperacao);
  if (especificos.length > 0) return especificos;
  if (tipoTomador === "PJ" && enquadramento === "PADRAO") return [];
  return buscarTributos(c, "PJ", "PADRAO", dataOperacao);
}

/** Custos zerados é um resultado válido (não é erro) - RF-PAR-07 não obriga tabela. */
export async function resolverCustos(
  c: PoolClient,
  tabelaCustoId: string | null,
): Promise<ItemCusto[]> {
  const id =
    tabelaCustoId ??
    (
      await c.query<{ tabela_custo_id: string }>(
        "SELECT tabela_custo_id FROM tabela_custo WHERE padrao = true LIMIT 1",
      )
    ).rows[0]?.tabela_custo_id ??
    null;
  if (!id) return [];
  const r = await c.query<{ nome: string; valor: string }>(
    "SELECT nome, valor FROM tabela_custo_item WHERE tabela_custo_id = $1",
    [id],
  );
  return r.rows.map((row) => ({ nome: row.nome, valor: Number(row.valor) }));
}
