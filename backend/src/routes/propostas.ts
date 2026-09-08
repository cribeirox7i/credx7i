import { Router } from "express";
import { z } from "zod";
import { PoolClient } from "pg";
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
              p.status, p.simulado_em, p.decidido_em, p.decidido_por, p.motivo_reprovacao,
              p.criado_em
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

/** RN-19: proposta decidida (DEFERIDA/REPROVADA) é imutável. */
async function buscarStatus(c: PoolClient, propostaId: string): Promise<string | null> {
  const r = await c.query<{ status: string }>("SELECT status FROM proposta WHERE proposta_id = $1", [propostaId]);
  return r.rows[0]?.status ?? null;
}

propostasRouter.patch("/propostas/:id", exigePermissao("proposta", "edicao"), async (req, res) => {
  const parsed = patchProposta.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "nada para atualizar" });
    return;
  }
  try {
    const resultado = await withTenant(req.tenantId!, async (c) => {
      const status = await buscarStatus(c, req.params.id);
      if (status === null) return { tipo: "NAO_ENCONTRADA" as const };
      if (status !== "RASCUNHO") return { tipo: "IMUTAVEL" as const };

      const campos: string[] = [];
      const valores: unknown[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        campos.push(`${camelParaSnake(k)} = $${campos.length + 1}`);
        valores.push(v);
      }
      valores.push(req.params.id);
      await c.query(
        `UPDATE proposta SET ${campos.join(", ")} WHERE proposta_id = $${valores.length}`,
        valores,
      );
      return { tipo: "OK" as const };
    });
    if (resultado.tipo === "NAO_ENCONTRADA") {
      res.status(404).json({ error: "proposta não encontrada" });
      return;
    }
    if (resultado.tipo === "IMUTAVEL") {
      res.status(409).json({ error: "proposta já decidida - imutável (RN-19)" });
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
        if (proposta.status !== "RASCUNHO") return { tipo: "IMUTAVEL" as const };

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
      if (resultado.tipo === "IMUTAVEL") {
        res.status(409).json({ error: "proposta já decidida - imutável (RN-19)" });
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

// ------------------------------------------------------------- deferir/reprovar

propostasRouter.post(
  "/propostas/:id/deferir",
  exigePermissao("proposta", "edicao"),
  async (req, res) => {
    try {
      const resultado = await withTenant(req.tenantId!, async (c) => {
        const r = await c.query<{
          status: string;
          simulacao_snapshot: unknown;
          cedente_status: string;
        }>(
          `SELECT p.status, p.simulacao_snapshot, ced.status_cadastro AS cedente_status
             FROM proposta p
             JOIN cedente ced ON ced.cedente_id = p.cedente_id
            WHERE p.proposta_id = $1`,
          [req.params.id],
        );
        const row = r.rows[0];
        if (!row) return { tipo: "NAO_ENCONTRADA" as const };
        if (row.status !== "RASCUNHO") return { tipo: "IMUTAVEL" as const };
        if (row.simulacao_snapshot == null) return { tipo: "SEM_SIMULACAO" as const };
        if (row.cedente_status !== "APROVADO") return { tipo: "CEDENTE_NAO_APROVADO" as const };

        await c.query(
          `UPDATE proposta SET status = 'DEFERIDA', decidido_em = now(), decidido_por = $1
            WHERE proposta_id = $2`,
          [req.usuario!.userId, req.params.id],
        );
        return { tipo: "OK" as const };
      });

      switch (resultado.tipo) {
        case "NAO_ENCONTRADA":
          res.status(404).json({ error: "proposta não encontrada" });
          return;
        case "IMUTAVEL":
          res.status(409).json({ error: "proposta já decidida - imutável (RN-19)" });
          return;
        case "SEM_SIMULACAO":
          res.status(422).json({ error: "simule a proposta antes de deferir" });
          return;
        case "CEDENTE_NAO_APROVADO":
          res.status(400).json({ error: "só é possível deferir proposta de cedente com status APROVADO (RN-10)" });
          return;
        case "OK":
          res.status(204).send();
          return;
      }
    } catch {
      res.status(500).json({ error: "não foi possível deferir a proposta" });
    }
  },
);

const reprovarBody = z.object({ motivoReprovacao: z.string().optional() });

propostasRouter.post(
  "/propostas/:id/reprovar",
  exigePermissao("proposta", "edicao"),
  async (req, res) => {
    const parsed = reprovarBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "motivo de reprovação inválido" });
      return;
    }
    try {
      const resultado = await withTenant(req.tenantId!, async (c) => {
        const status = await buscarStatus(c, req.params.id);
        if (status === null) return { tipo: "NAO_ENCONTRADA" as const };
        if (status !== "RASCUNHO") return { tipo: "IMUTAVEL" as const };

        await c.query(
          `UPDATE proposta
              SET status = 'REPROVADA', decidido_em = now(), decidido_por = $1, motivo_reprovacao = $2
            WHERE proposta_id = $3`,
          [req.usuario!.userId, parsed.data.motivoReprovacao ?? null, req.params.id],
        );
        return { tipo: "OK" as const };
      });

      if (resultado.tipo === "NAO_ENCONTRADA") {
        res.status(404).json({ error: "proposta não encontrada" });
        return;
      }
      if (resultado.tipo === "IMUTAVEL") {
        res.status(409).json({ error: "proposta já decidida - imutável (RN-19)" });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "não foi possível reprovar a proposta" });
    }
  },
);
