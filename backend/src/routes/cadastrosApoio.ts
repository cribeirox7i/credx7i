import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigePermissao } from "../permissao";

export const cadastrosApoioRouter = Router();
cadastrosApoioRouter.use(requireUserAuth);

const erroPg = (e: unknown) => (e as { code?: string })?.code;

// -------------------------------------------------------- municipios-habilitados

cadastrosApoioRouter.get(
  "/municipios-habilitados",
  exigePermissao("tabela_apoio", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `SELECT municipio_habilitado_id, municipio_ibge, nome, uf, tipo
           FROM municipio_habilitado
          ORDER BY nome`,
      );
      return r.rows;
    });
    res.json(rows);
  },
);

const novoMunicipio = z.object({
  municipioIbge: z.string().min(1),
  nome: z.string().min(1),
  uf: z.string().length(2),
  tipo: z.enum(["SEDE", "LIMITROFE"]),
});

cadastrosApoioRouter.post(
  "/municipios-habilitados",
  exigePermissao("tabela_apoio", "inclusao"),
  async (req, res) => {
    const parsed = novoMunicipio.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "município inválido" });
      return;
    }
    const { municipioIbge, nome, uf, tipo } = parsed.data;
    try {
      const id = await withTenant(req.tenantId!, async (c) => {
        const r = await c.query<{ municipio_habilitado_id: string }>(
          `INSERT INTO municipio_habilitado (tenant_id, municipio_ibge, nome, uf, tipo)
           VALUES ($1, $2, $3, $4, $5) RETURNING municipio_habilitado_id`,
          [req.tenantId, municipioIbge.trim(), nome.trim(), uf.toUpperCase(), tipo],
        );
        return r.rows[0].municipio_habilitado_id;
      });
      res.status(201).json({ municipioHabilitadoId: id });
    } catch (e) {
      if (erroPg(e) === "23505") {
        res.status(409).json({ error: "município já habilitado para este tenant" });
        return;
      }
      res.status(500).json({ error: "não foi possível cadastrar o município" });
    }
  },
);

// --------------------------------------------------------- atividades-economicas

cadastrosApoioRouter.get(
  "/atividades-economicas",
  exigePermissao("tabela_apoio", "leitura"),
  async (req, res) => {
    const rows = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `SELECT atividade_economica_id, codigo, descricao, segmento
           FROM atividade_economica
          ORDER BY descricao`,
      );
      return r.rows;
    });
    res.json(rows);
  },
);

const novaAtividade = z.object({
  codigo: z.string().min(1),
  descricao: z.string().min(1),
  segmento: z.enum(["INDUSTRIA", "COMERCIO", "SERVICO", "PUBLICO"]),
});

cadastrosApoioRouter.post(
  "/atividades-economicas",
  exigePermissao("tabela_apoio", "inclusao"),
  async (req, res) => {
    const parsed = novaAtividade.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "atividade econômica inválida" });
      return;
    }
    const { codigo, descricao, segmento } = parsed.data;
    try {
      const id = await withTenant(req.tenantId!, async (c) => {
        const r = await c.query<{ atividade_economica_id: string }>(
          `INSERT INTO atividade_economica (tenant_id, codigo, descricao, segmento)
           VALUES ($1, $2, $3, $4) RETURNING atividade_economica_id`,
          [req.tenantId, codigo.trim(), descricao.trim(), segmento],
        );
        return r.rows[0].atividade_economica_id;
      });
      res.status(201).json({ atividadeEconomicaId: id });
    } catch (e) {
      if (erroPg(e) === "23505") {
        res.status(409).json({ error: "já existe uma atividade com esse código" });
        return;
      }
      res.status(500).json({ error: "não foi possível cadastrar a atividade" });
    }
  },
);
