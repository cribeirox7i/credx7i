import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigePermissao } from "../permissao";

export const parametrosFiscaisRouter = Router();
parametrosFiscaisRouter.use(requireUserAuth);

const TIPO_TOMADOR = ["PJ", "PJ_SIMPLES", "MEI", "PF", "COOPERATIVA", "ISENTO"] as const;
const ENQUADRAMENTO = ["PADRAO", "PNMPO", "RURAL", "HABITACIONAL", "EXPORTACAO", "RENEGOCIACAO"] as const;

// ------------------------------------------------------------------- iof-tabela

parametrosFiscaisRouter.get(
  "/iof-tabela",
  exigePermissao("parametro_fiscal", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `SELECT iof_tabela_id, tipo_tomador, enquadramento, vigencia_inicio, vigencia_fim,
                aliquota_dia, aliquota_dia_reduzida, teto_valor_reducao, aliquota_adicional,
                teto_dias, isencao_total
           FROM iof_tabela
          ORDER BY tipo_tomador, enquadramento, vigencia_inicio DESC`,
      );
      return r.rows;
    });
    res.json(rows);
  },
);

const novaLinhaIof = z.object({
  tipoTomador: z.enum(TIPO_TOMADOR),
  enquadramento: z.enum(ENQUADRAMENTO),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string().nullable().optional(),
  aliquotaDia: z.number().nonnegative(),
  aliquotaDiaReduzida: z.number().nonnegative(),
  tetoValorReducao: z.number().nonnegative(),
  aliquotaAdicional: z.number().nonnegative(),
  tetoDias: z.number().int().nonnegative(),
  isencaoTotal: z.boolean().optional(),
});

parametrosFiscaisRouter.post(
  "/iof-tabela",
  exigePermissao("parametro_fiscal", "inclusao"),
  async (req, res) => {
    const parsed = novaLinhaIof.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "linha de IOF inválida" });
      return;
    }
    const d = parsed.data;
    try {
      const id = await withTenant(req.tenantId!, async (c) => {
        const r = await c.query<{ iof_tabela_id: string }>(
          `INSERT INTO iof_tabela
             (tenant_id, tipo_tomador, enquadramento, vigencia_inicio, vigencia_fim,
              aliquota_dia, aliquota_dia_reduzida, teto_valor_reducao, aliquota_adicional,
              teto_dias, isencao_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING iof_tabela_id`,
          [
            req.tenantId,
            d.tipoTomador,
            d.enquadramento,
            d.vigenciaInicio,
            d.vigenciaFim ?? null,
            d.aliquotaDia,
            d.aliquotaDiaReduzida,
            d.tetoValorReducao,
            d.aliquotaAdicional,
            d.tetoDias,
            d.isencaoTotal ?? false,
          ],
        );
        return r.rows[0].iof_tabela_id;
      });
      res.status(201).json({ iofTabelaId: id });
    } catch {
      res.status(500).json({ error: "não foi possível cadastrar a linha de IOF" });
    }
  },
);

// -------------------------------------------------------------- tributos-tabela

parametrosFiscaisRouter.get(
  "/tributos-tabela",
  exigePermissao("parametro_fiscal", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `SELECT tributo_receita_tabela_id, tipo_tomador, enquadramento, tributo,
                aliquota, vigencia_inicio, vigencia_fim
           FROM tributo_receita_tabela
          ORDER BY tipo_tomador, enquadramento, tributo, vigencia_inicio DESC`,
      );
      return r.rows;
    });
    res.json(rows);
  },
);

const novaLinhaTributo = z.object({
  tipoTomador: z.enum(TIPO_TOMADOR),
  enquadramento: z.enum(ENQUADRAMENTO),
  tributo: z.enum(["IRRF", "PIS", "COFINS"]),
  aliquota: z.number().nonnegative(),
  vigenciaInicio: z.string(),
  vigenciaFim: z.string().nullable().optional(),
});

parametrosFiscaisRouter.post(
  "/tributos-tabela",
  exigePermissao("parametro_fiscal", "inclusao"),
  async (req, res) => {
    const parsed = novaLinhaTributo.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "linha de tributo inválida" });
      return;
    }
    const d = parsed.data;
    try {
      const id = await withTenant(req.tenantId!, async (c) => {
        const r = await c.query<{ tributo_receita_tabela_id: string }>(
          `INSERT INTO tributo_receita_tabela
             (tenant_id, tipo_tomador, enquadramento, tributo, aliquota, vigencia_inicio, vigencia_fim)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING tributo_receita_tabela_id`,
          [req.tenantId, d.tipoTomador, d.enquadramento, d.tributo, d.aliquota, d.vigenciaInicio, d.vigenciaFim ?? null],
        );
        return r.rows[0].tributo_receita_tabela_id;
      });
      res.status(201).json({ tributoReceitaTabelaId: id });
    } catch {
      res.status(500).json({ error: "não foi possível cadastrar a linha de tributo" });
    }
  },
);

// ---------------------------------------------------------------- tabelas-custo

parametrosFiscaisRouter.get(
  "/tabelas-custo",
  exigePermissao("parametro_fiscal", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const tabelas = await c.query(
        "SELECT tabela_custo_id, nome, padrao FROM tabela_custo ORDER BY nome",
      );
      const itens = await c.query(
        "SELECT tabela_custo_item_id, tabela_custo_id, nome, valor FROM tabela_custo_item",
      );
      return tabelas.rows.map((t) => ({
        ...t,
        itens: itens.rows.filter((i) => i.tabela_custo_id === t.tabela_custo_id),
      }));
    });
    res.json(rows);
  },
);

const novaTabelaCusto = z.object({
  nome: z.string().min(1),
  padrao: z.boolean().optional(),
  itens: z.array(z.object({ nome: z.string().min(1), valor: z.number().nonnegative() })),
});

parametrosFiscaisRouter.post(
  "/tabelas-custo",
  exigePermissao("parametro_fiscal", "inclusao"),
  async (req, res) => {
    const parsed = novaTabelaCusto.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "tabela de custo inválida" });
      return;
    }
    const d = parsed.data;
    try {
      const id = await withTenant(req.tenantId!, async (c) => {
        if (d.padrao) {
          await c.query("UPDATE tabela_custo SET padrao = false WHERE padrao = true");
        }
        const t = await c.query<{ tabela_custo_id: string }>(
          "INSERT INTO tabela_custo (tenant_id, nome, padrao) VALUES ($1, $2, $3) RETURNING tabela_custo_id",
          [req.tenantId, d.nome.trim(), d.padrao ?? false],
        );
        const tabelaCustoId = t.rows[0].tabela_custo_id;
        for (const item of d.itens) {
          await c.query(
            "INSERT INTO tabela_custo_item (tenant_id, tabela_custo_id, nome, valor) VALUES ($1, $2, $3, $4)",
            [req.tenantId, tabelaCustoId, item.nome.trim(), item.valor],
          );
        }
        return tabelaCustoId;
      });
      res.status(201).json({ tabelaCustoId: id });
    } catch {
      res.status(500).json({ error: "não foi possível cadastrar a tabela de custo" });
    }
  },
);

const patchTabelaCusto = z.object({ padrao: z.literal(true) });

parametrosFiscaisRouter.patch(
  "/tabelas-custo/:id",
  exigePermissao("parametro_fiscal", "edicao"),
  async (req, res) => {
    const parsed = patchTabelaCusto.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "só é possível marcar a tabela como padrão por aqui" });
      return;
    }
    try {
      const n = await withTenant(req.tenantId!, async (c) => {
        await c.query("UPDATE tabela_custo SET padrao = false WHERE padrao = true");
        const r = await c.query("UPDATE tabela_custo SET padrao = true WHERE tabela_custo_id = $1", [
          req.params.id,
        ]);
        return r.rowCount ?? 0;
      });
      if (n === 0) {
        res.status(404).json({ error: "tabela de custo não encontrada" });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "não foi possível atualizar" });
    }
  },
);
