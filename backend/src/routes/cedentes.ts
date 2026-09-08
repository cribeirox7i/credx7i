import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigePermissao } from "../permissao";
import { validarCnpj } from "../documentos";
import { municipioHabilitado } from "../validacaoCadastro";

export const cedentesRouter = Router();
cedentesRouter.use(requireUserAuth);

const erroPg = (e: unknown) => (e as { code?: string })?.code;

function camelParaSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// Campos opcionais aceitam null (não só undefined): a tela de edição manda null pra
// limpar um campo em branco - só os NOT NULL do banco (tipoTomador, declara* etc.)
// ficam de fora do .nullable().
const camposCedente = z.object({
  cnpj: z.string().min(1),
  razaoSocial: z.string().min(1),
  nomeFantasia: z.string().nullable().optional(),
  porte: z.enum(["MEI", "ME", "EPP"]).nullable().optional(),
  dataAbertura: z.string().nullable().optional(),
  atividadeEconomicaId: z.string().uuid().nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  municipioIbge: z.string().nullable().optional(),
  uf: z.string().length(2).nullable().optional(),
  telefone: z.string().nullable().optional(),
  celular: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  tipoTomador: z.enum(["PJ", "PJ_SIMPLES", "MEI", "PF", "COOPERATIVA", "ISENTO"]).optional(),
  isencaoBaseLegal: z.string().nullable().optional(),
  declaraSimples: z.boolean().optional(),
  declaracaoPnmpo: z.boolean().optional(),
  receitaBruta: z.number().nonnegative().nullable().optional(),
});

// ------------------------------------------------------------------- cedentes

cedentesRouter.get("/cedentes", exigePermissao("cedente", "leitura"), async (req, res) => {
  const rows = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query(
      `SELECT cedente_id, cnpj, razao_social, nome_fantasia, porte, tipo_tomador,
              status_cadastro, municipio_ibge, uf, criado_em
         FROM cedente
        ORDER BY razao_social`,
    );
    return r.rows;
  });
  res.json(rows);
});

cedentesRouter.get("/cedentes/:id", exigePermissao("cedente", "leitura"), async (req, res) => {
  const row = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query("SELECT * FROM cedente WHERE cedente_id = $1", [req.params.id]);
    return r.rows[0] ?? null;
  });
  if (!row) {
    res.status(404).json({ error: "cedente não encontrado" });
    return;
  }
  res.json(row);
});

cedentesRouter.post("/cedentes", exigePermissao("cedente", "inclusao"), async (req, res) => {
  const parsed = camposCedente.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "dados do cedente inválidos" });
    return;
  }
  if (!validarCnpj(parsed.data.cnpj)) {
    res.status(400).json({ error: "CNPJ inválido" });
    return;
  }

  try {
    const id = await withTenant(req.tenantId!, async (c) => {
      if (parsed.data.municipioIbge && !(await municipioHabilitado(c, parsed.data.municipioIbge))) {
        throw new Error("MUNICIPIO_FORA_DA_AREA");
      }
      const campos = ["tenant_id", "cnpj"];
      const valores: unknown[] = [req.tenantId, parsed.data.cnpj.replace(/\D/g, "")];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (k === "cnpj" || v === undefined) continue;
        campos.push(camelParaSnake(k));
        valores.push(v);
      }
      const marcadores = campos.map((_, i) => `$${i + 1}`);
      const r = await c.query<{ cedente_id: string }>(
        `INSERT INTO cedente (${campos.join(", ")}) VALUES (${marcadores.join(", ")})
         RETURNING cedente_id`,
        valores,
      );
      return r.rows[0].cedente_id;
    });
    res.status(201).json({ cedenteId: id });
  } catch (e) {
    if (e instanceof Error && e.message === "MUNICIPIO_FORA_DA_AREA") {
      res.status(400).json({ error: "município fora da área habilitada (RN-01)" });
      return;
    }
    if (erroPg(e) === "23505") {
      res.status(409).json({ error: "já existe um cedente com esse CNPJ" });
      return;
    }
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "atividade econômica inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível criar o cedente" });
  }
});

const patchCedente = camposCedente.partial().omit({ cnpj: true });

cedentesRouter.patch("/cedentes/:id", exigePermissao("cedente", "edicao"), async (req, res) => {
  const parsed = patchCedente.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "nada para atualizar" });
    return;
  }

  try {
    const n = await withTenant(req.tenantId!, async (c) => {
      if (parsed.data.municipioIbge && !(await municipioHabilitado(c, parsed.data.municipioIbge))) {
        throw new Error("MUNICIPIO_FORA_DA_AREA");
      }
      const campos: string[] = [];
      const valores: unknown[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        campos.push(`${camelParaSnake(k)} = $${campos.length + 1}`);
        valores.push(v);
      }
      valores.push(req.params.id);
      const r = await c.query(
        `UPDATE cedente SET ${campos.join(", ")} WHERE cedente_id = $${valores.length}`,
        valores,
      );
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "cedente não encontrado" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === "MUNICIPIO_FORA_DA_AREA") {
      res.status(400).json({ error: "município fora da área habilitada (RN-01)" });
      return;
    }
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "atividade econômica inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível atualizar" });
  }
});

// ------------------------------------------------------- status (RF-CAD-02, RN-11)

const STATUS_VALIDOS = ["RASCUNHO", "EM_ANALISE", "APROVADO", "REPROVADO", "SUSPENSO", "BLOQUEADO"] as const;
const mudarStatus = z.object({
  statusNovo: z.enum(STATUS_VALIDOS),
  observacao: z.string().optional(),
});

cedentesRouter.post(
  "/cedentes/:id/status",
  exigePermissao("cedente", "edicao"),
  async (req, res) => {
    const parsed = mudarStatus.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "status inválido" });
      return;
    }
    try {
      const ok = await withTenant(req.tenantId!, async (c) => {
        const atual = await c.query<{ status_cadastro: string }>(
          "SELECT status_cadastro FROM cedente WHERE cedente_id = $1 FOR UPDATE",
          [req.params.id],
        );
        if (!atual.rows[0]) return false;
        const statusAnterior = atual.rows[0].status_cadastro;
        await c.query("UPDATE cedente SET status_cadastro = $1 WHERE cedente_id = $2", [
          parsed.data.statusNovo,
          req.params.id,
        ]);
        await c.query(
          `INSERT INTO cedente_situacao_hist
             (tenant_id, cedente_id, status_anterior, status_novo, observacao, usuario_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.tenantId,
            req.params.id,
            statusAnterior,
            parsed.data.statusNovo,
            parsed.data.observacao ?? null,
            req.usuario!.userId,
          ],
        );
        return true;
      });
      if (!ok) {
        res.status(404).json({ error: "cedente não encontrado" });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "não foi possível mudar o status" });
    }
  },
);

cedentesRouter.get(
  "/cedentes/:id/historico-status",
  exigePermissao("cedente", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `SELECT cedente_situacao_hist_id, status_anterior, status_novo, observacao,
                usuario_id, ocorrido_em
           FROM cedente_situacao_hist
          WHERE cedente_id = $1
          ORDER BY ocorrido_em DESC`,
        [req.params.id],
      );
      return r.rows;
    });
    res.json(rows);
  },
);
