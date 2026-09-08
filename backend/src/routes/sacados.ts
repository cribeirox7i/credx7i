import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigePermissao } from "../permissao";
import { validarDocumento } from "../documentos";
import { municipioHabilitado } from "../validacaoCadastro";

export const sacadosRouter = Router();
sacadosRouter.use(requireUserAuth);

const erroPg = (e: unknown) => (e as { code?: string })?.code;

function camelParaSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

// Campos opcionais aceitam null (não só undefined): a tela de edição manda null pra
// limpar um campo em branco - limiteCredito fica de fora (NOT NULL DEFAULT 0 no banco).
const camposSacado = z.object({
  tipoDocumento: z.enum(["PF", "PJ"]),
  documento: z.string().min(1),
  nomeRazaoSocial: z.string().min(1),
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
  limiteCredito: z.number().nonnegative().optional(),
  bloqueado: z.boolean().optional(),
});

sacadosRouter.get("/sacados", exigePermissao("sacado", "leitura"), async (req, res) => {
  const rows = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query(
      `SELECT sacado_id, tipo_documento, documento, nome_razao_social, limite_credito,
              bloqueado, municipio_ibge, uf, criado_em
         FROM sacado
        ORDER BY nome_razao_social`,
    );
    return r.rows;
  });
  res.json(rows);
});

sacadosRouter.get("/sacados/:id", exigePermissao("sacado", "leitura"), async (req, res) => {
  const row = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query("SELECT * FROM sacado WHERE sacado_id = $1", [req.params.id]);
    return r.rows[0] ?? null;
  });
  if (!row) {
    res.status(404).json({ error: "sacado não encontrado" });
    return;
  }
  res.json(row);
});

sacadosRouter.post("/sacados", exigePermissao("sacado", "inclusao"), async (req, res) => {
  const parsed = camposSacado.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "dados do sacado inválidos" });
    return;
  }
  if (!validarDocumento(parsed.data.tipoDocumento, parsed.data.documento)) {
    res.status(400).json({ error: parsed.data.tipoDocumento === "PF" ? "CPF inválido" : "CNPJ inválido" });
    return;
  }

  try {
    const id = await withTenant(req.tenantId!, async (c) => {
      if (parsed.data.municipioIbge && !(await municipioHabilitado(c, parsed.data.municipioIbge))) {
        throw new Error("MUNICIPIO_FORA_DA_AREA");
      }
      const campos = ["tenant_id", "documento"];
      const valores: unknown[] = [req.tenantId, parsed.data.documento.replace(/\D/g, "")];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (k === "documento" || v === undefined) continue;
        campos.push(camelParaSnake(k));
        valores.push(v);
      }
      const marcadores = campos.map((_, i) => `$${i + 1}`);
      const r = await c.query<{ sacado_id: string }>(
        `INSERT INTO sacado (${campos.join(", ")}) VALUES (${marcadores.join(", ")})
         RETURNING sacado_id`,
        valores,
      );
      return r.rows[0].sacado_id;
    });
    res.status(201).json({ sacadoId: id });
  } catch (e) {
    if (e instanceof Error && e.message === "MUNICIPIO_FORA_DA_AREA") {
      res.status(400).json({ error: "município fora da área habilitada (RN-01)" });
      return;
    }
    if (erroPg(e) === "23505") {
      res.status(409).json({ error: "já existe um sacado com esse documento" });
      return;
    }
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "atividade econômica inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível criar o sacado" });
  }
});

const patchSacado = camposSacado.partial().omit({ tipoDocumento: true, documento: true });

sacadosRouter.patch("/sacados/:id", exigePermissao("sacado", "edicao"), async (req, res) => {
  const parsed = patchSacado.safeParse(req.body);
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
        `UPDATE sacado SET ${campos.join(", ")} WHERE sacado_id = $${valores.length}`,
        valores,
      );
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "sacado não encontrado" });
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
