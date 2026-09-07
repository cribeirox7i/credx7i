import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigePermissao } from "../permissao";
import { calcularOperacao, EntradaOperacao, TipoTomador } from "../calculo";
import { resolverLinhaIof, resolverTributos, resolverCustos, SemParametroFiscalError } from "../resolverParametrosFiscais";

export const propostasRouter = Router();
propostasRouter.use(requireUserAuth);

const erroPg = (e: unknown) => (e as { code?: string })?.code;

function camelParaSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

const ENQUADRAMENTO = ["PADRAO", "PNMPO", "RURAL", "HABITACIONAL", "EXPORTACAO", "RENEGOCIACAO"] as const;

const objetoProposta = z.object({
  cedenteId: z.string().uuid(),
  modalidade: z.string().min(1),
  sistemaAmortizacao: z.enum(["PRICE", "SAC"]),
  taxaPrefixada: z.number().positive().nullable().optional(),
  valorParcelaInformado: z.number().positive().nullable().optional(),
  valorSolicitado: z.number().positive(),
  nParcelas: z.number().int().positive(),
  carenciaPeriodos: z.number().int().nonnegative().default(0),
  dataLiberacao: z.string(),
  tratamentoIof: z.enum(["FINANCIADO", "DESCONTADO"]),
  enquadramentoIof: z.enum(ENQUADRAMENTO).default("PADRAO"),
  tabelaCustoId: z.string().uuid().nullable().optional(),
});

const camposProposta = objetoProposta.refine(
  (d) => (d.taxaPrefixada != null) !== (d.valorParcelaInformado != null),
  { message: "informe taxaPrefixada OU valorParcelaInformado, nunca os dois nem nenhum" },
);

// ------------------------------------------------------------------ propostas

propostasRouter.get("/propostas", exigePermissao("proposta", "leitura"), async (req, res) => {
  const rows = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query(
      `SELECT p.proposta_id, p.cedente_id, ced.razao_social AS cedente_razao_social,
              p.modalidade, p.sistema_amortizacao, p.valor_solicitado, p.n_parcelas,
              p.status, p.simulado_em, p.criado_em
         FROM proposta p
         JOIN cedente ced ON ced.cedente_id = p.cedente_id
        ORDER BY p.criado_em DESC`,
    );
    return r.rows;
  });
  res.json(rows);
});

propostasRouter.get("/propostas/:id", exigePermissao("proposta", "leitura"), async (req, res) => {
  const row = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query("SELECT * FROM proposta WHERE proposta_id = $1", [req.params.id]);
    return r.rows[0] ?? null;
  });
  if (!row) {
    res.status(404).json({ error: "proposta não encontrada" });
    return;
  }
  res.json(row);
});

propostasRouter.post("/propostas", exigePermissao("proposta", "inclusao"), async (req, res) => {
  const parsed = camposProposta.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "dados da proposta inválidos" });
    return;
  }
  const d = parsed.data;
  try {
    const id = await withTenant(req.tenantId!, async (c) => {
      const campos = ["tenant_id"];
      const valores: unknown[] = [req.tenantId];
      for (const [k, v] of Object.entries(d)) {
        if (v === undefined) continue;
        campos.push(camelParaSnake(k));
        valores.push(v);
      }
      const marcadores = campos.map((_, i) => `$${i + 1}`);
      const r = await c.query<{ proposta_id: string }>(
        `INSERT INTO proposta (${campos.join(", ")}) VALUES (${marcadores.join(", ")})
         RETURNING proposta_id`,
        valores,
      );
      return r.rows[0].proposta_id;
    });
    res.status(201).json({ propostaId: id });
  } catch (e) {
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "cedente ou tabela de custo inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível criar a proposta" });
  }
});

const patchProposta = objetoProposta.partial();

propostasRouter.patch("/propostas/:id", exigePermissao("proposta", "edicao"), async (req, res) => {
  const parsed = patchProposta.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "nada para atualizar" });
    return;
  }
  try {
    const n = await withTenant(req.tenantId!, async (c) => {
      const campos: string[] = [];
      const valores: unknown[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        campos.push(`${camelParaSnake(k)} = $${campos.length + 1}`);
        valores.push(v);
      }
      valores.push(req.params.id);
      const r = await c.query(
        `UPDATE proposta SET ${campos.join(", ")} WHERE proposta_id = $${valores.length}`,
        valores,
      );
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "proposta não encontrada" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "cedente ou tabela de custo inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível atualizar" });
  }
});

// --------------------------------------------------------------------- simular

propostasRouter.post(
  "/propostas/:id/simular",
  exigePermissao("proposta", "edicao"),
  async (req, res) => {
    try {
      const resultado = await withTenant(req.tenantId!, async (c) => {
        const p = await c.query("SELECT * FROM proposta WHERE proposta_id = $1", [req.params.id]);
        const proposta = p.rows[0];
        if (!proposta) return { tipo: "NAO_ENCONTRADA" as const };

        const ced = await c.query<{ tipo_tomador: TipoTomador }>(
          "SELECT tipo_tomador FROM cedente WHERE cedente_id = $1",
          [proposta.cedente_id],
        );
        const tipoTomador = ced.rows[0]?.tipo_tomador ?? "PJ";
        const dataLiberacao: string = proposta.data_liberacao.toISOString().slice(0, 10);

        const linhaIof = await resolverLinhaIof(c, tipoTomador, proposta.enquadramento_iof, dataLiberacao);
        const tributos = await resolverTributos(c, tipoTomador, proposta.enquadramento_iof, dataLiberacao);
        const custos = await resolverCustos(c, proposta.tabela_custo_id);

        const entrada: EntradaOperacao = {
          sistemaAmortizacao: proposta.sistema_amortizacao,
          valorPrincipal: Number(proposta.valor_solicitado),
          taxaPeriodo: proposta.taxa_prefixada != null ? Number(proposta.taxa_prefixada) : undefined,
          valorParcela:
            proposta.valor_parcela_informado != null ? Number(proposta.valor_parcela_informado) : undefined,
          numeroParcelas: proposta.n_parcelas,
          carenciaPeriodos: proposta.carencia_periodos,
          dataLiberacao,
          feriados: [], // sem tabela de feriados ainda - ver plano da Fase 3c
          tratamentoIof: proposta.tratamento_iof,
          iof: {
            linha: linhaIof,
            tipoTomador,
            principalReduzidoAcumulado12m: 0, // sem histórico de operações ainda
          },
          tributos,
          custos,
        };

        const saida = calcularOperacao(entrada);

        await c.query(
          "UPDATE proposta SET simulacao_snapshot = $1, simulado_em = now() WHERE proposta_id = $2",
          [JSON.stringify(saida), req.params.id],
        );

        return { tipo: "OK" as const, saida };
      });

      if (resultado.tipo === "NAO_ENCONTRADA") {
        res.status(404).json({ error: "proposta não encontrada" });
        return;
      }
      res.json(resultado.saida);
    } catch (e) {
      if (e instanceof SemParametroFiscalError) {
        res.status(422).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: "não foi possível simular a proposta" });
    }
  },
);
