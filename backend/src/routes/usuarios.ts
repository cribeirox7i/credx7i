import { Router } from "express";
import { z } from "zod";
import { withTenant } from "../db";
import { requireUserAuth } from "../auth";
import { exigeAdminTenant } from "../permissao";
import { gerarConvite } from "../convite";

export const usuariosRouter = Router();

// Todo o router exige sessão + papel de administrador do tenant.
usuariosRouter.use(requireUserAuth, exigeAdminTenant);

const erroPg = (e: unknown) => (e as { code?: string })?.code;

// ------------------------------------------------------------------ usuarios

usuariosRouter.get("/usuarios", async (req, res) => {
  const rows = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query(
      `SELECT u.user_id, u.nome, u.email, u.status, u.deve_trocar_senha,
              u.papel_id, p.nome AS papel_nome,
              (u.convite_token IS NOT NULL) AS convite_pendente
         FROM usuarios u
         LEFT JOIN papeis p ON p.papel_id = u.papel_id
        ORDER BY u.nome`,
    );
    return r.rows;
  });
  res.json(rows);
});

const novoUsuario = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  papelId: z.string().uuid().nullable().optional(),
});

usuariosRouter.post("/usuarios", async (req, res) => {
  const parsed = novoUsuario.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "nome e e-mail válidos são obrigatórios" });
    return;
  }
  const { nome, email, papelId } = parsed.data;

  try {
    const resultado = await withTenant(req.tenantId!, async (c) => {
      const ins = await c.query<{ user_id: string }>(
        `INSERT INTO usuarios (tenant_id, nome, email, papel_id, status, deve_trocar_senha)
         VALUES ($1, $2, $3, $4, 'ATIVO', true)
         RETURNING user_id`,
        [req.tenantId, nome.trim(), email.trim(), papelId ?? null],
      );
      const userId = ins.rows[0].user_id;
      const convite = await gerarConvite(c, req.tenantSlug!, { userId, nome, email });
      return { userId, convite };
    });
    res.status(201).json({
      userId: resultado.userId,
      conviteLink: resultado.convite.link,
      conviteEnviado: resultado.convite.enviado,
      expiraEm: resultado.convite.expiraEm,
    });
  } catch (e) {
    if (erroPg(e) === "23505") {
      res.status(409).json({ error: "já existe um usuário com esse e-mail" });
      return;
    }
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "papel inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível criar o usuário" });
  }
});

const patchUsuario = z.object({
  nome: z.string().min(1).optional(),
  papelId: z.string().uuid().nullable().optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
});

usuariosRouter.patch("/usuarios/:id", async (req, res) => {
  const parsed = patchUsuario.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "nada para atualizar" });
    return;
  }
  if (parsed.data.status === "INATIVO" && req.params.id === req.usuario!.userId) {
    res.status(400).json({ error: "você não pode desativar a si mesmo" });
    return;
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    const col = k === "papelId" ? "papel_id" : k;
    campos.push(`${col} = $${campos.length + 1}`);
    valores.push(v);
  }
  valores.push(req.params.id);

  try {
    const n = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query(
        `UPDATE usuarios SET ${campos.join(", ")} WHERE user_id = $${valores.length}`,
        valores,
      );
      // desativar mata as sessões
      if (parsed.data.status === "INATIVO") {
        await c.query("DELETE FROM usuario_sessoes WHERE user_id = $1", [req.params.id]);
      }
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "usuário não encontrado" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    if (erroPg(e) === "23503") {
      res.status(400).json({ error: "papel inexistente" });
      return;
    }
    res.status(500).json({ error: "não foi possível atualizar" });
  }
});

usuariosRouter.post("/usuarios/:id/convite", async (req, res) => {
  const link = await withTenant(req.tenantId!, async (c) => {
    const { rows } = await c.query<{ user_id: string; nome: string; email: string }>(
      "SELECT user_id, nome, email FROM usuarios WHERE user_id = $1",
      [req.params.id],
    );
    if (!rows[0]) return null;
    const convite = await gerarConvite(c, req.tenantSlug!, {
      userId: rows[0].user_id,
      nome: rows[0].nome,
      email: rows[0].email,
    });
    return convite;
  });
  if (!link) {
    res.status(404).json({ error: "usuário não encontrado" });
    return;
  }
  res.json({ conviteLink: link.link, conviteEnviado: link.enviado, expiraEm: link.expiraEm });
});

// -------------------------------------------------------------------- papeis

usuariosRouter.get("/papeis", async (req, res) => {
  const rows = await withTenant(req.tenantId!, async (c) => {
    const r = await c.query(
      `SELECT p.papel_id, p.nome, p.admin_tenant,
              COALESCE(
                json_agg(json_build_object(
                  'recurso', pe.recurso, 'leitura', pe.leitura, 'inclusao', pe.inclusao,
                  'edicao', pe.edicao, 'exclusao', pe.exclusao
                )) FILTER (WHERE pe.recurso IS NOT NULL), '[]'
              ) AS permissoes
         FROM papeis p
         LEFT JOIN permissoes pe ON pe.papel_id = p.papel_id
        GROUP BY p.papel_id
        ORDER BY p.nome`,
    );
    return r.rows;
  });
  res.json(rows);
});

const novoPapel = z.object({ nome: z.string().min(1), adminTenant: z.boolean().optional() });

usuariosRouter.post("/papeis", async (req, res) => {
  const parsed = novoPapel.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "nome é obrigatório" });
    return;
  }
  try {
    const id = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query<{ papel_id: string }>(
        "INSERT INTO papeis (tenant_id, nome, admin_tenant) VALUES ($1, $2, $3) RETURNING papel_id",
        [req.tenantId, parsed.data.nome.trim(), parsed.data.adminTenant ?? false],
      );
      return r.rows[0].papel_id;
    });
    res.status(201).json({ papelId: id });
  } catch (e) {
    if (erroPg(e) === "23505") {
      res.status(409).json({ error: "já existe um papel com esse nome" });
      return;
    }
    res.status(500).json({ error: "não foi possível criar o papel" });
  }
});

const patchPapel = z.object({
  nome: z.string().min(1).optional(),
  adminTenant: z.boolean().optional(),
});

usuariosRouter.patch("/papeis/:id", async (req, res) => {
  const parsed = patchPapel.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "nada para atualizar" });
    return;
  }
  try {
    const n = await withTenant(req.tenantId!, async (c) => {
      // não deixar remover admin_tenant do último papel administrador
      if (parsed.data.adminTenant === false) {
        const { rows } = await c.query<{ n: string }>(
          "SELECT count(*) AS n FROM papeis WHERE admin_tenant = true AND papel_id <> $1",
          [req.params.id],
        );
        if (Number(rows[0].n) === 0) {
          throw new Error("ULTIMO_ADMIN");
        }
      }
      const campos: string[] = [];
      const valores: unknown[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        const col = k === "adminTenant" ? "admin_tenant" : k;
        campos.push(`${col} = $${campos.length + 1}`);
        valores.push(v);
      }
      valores.push(req.params.id);
      const r = await c.query(
        `UPDATE papeis SET ${campos.join(", ")} WHERE papel_id = $${valores.length}`,
        valores,
      );
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "papel não encontrado" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === "ULTIMO_ADMIN") {
      res.status(400).json({ error: "não é possível remover o último papel administrador" });
      return;
    }
    if (erroPg(e) === "23505") {
      res.status(409).json({ error: "já existe um papel com esse nome" });
      return;
    }
    res.status(500).json({ error: "não foi possível atualizar" });
  }
});

usuariosRouter.delete("/papeis/:id", async (req, res) => {
  try {
    const n = await withTenant(req.tenantId!, async (c) => {
      const r = await c.query("DELETE FROM papeis WHERE papel_id = $1", [req.params.id]);
      return r.rowCount ?? 0;
    });
    if (n === 0) {
      res.status(404).json({ error: "papel não encontrado" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    if (erroPg(e) === "23503") {
      res.status(409).json({ error: "há usuários com esse papel - reatribua antes de excluir" });
      return;
    }
    res.status(500).json({ error: "não foi possível excluir" });
  }
});

const permissoesBody = z.array(
  z.object({
    recurso: z.string().min(1),
    leitura: z.boolean().default(false),
    inclusao: z.boolean().default(false),
    edicao: z.boolean().default(false),
    exclusao: z.boolean().default(false),
  }),
);

usuariosRouter.put("/papeis/:id/permissoes", async (req, res) => {
  const parsed = permissoesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "lista de permissões inválida" });
    return;
  }
  try {
    const ok = await withTenant(req.tenantId!, async (c) => {
      const existe = await c.query("SELECT 1 FROM papeis WHERE papel_id = $1", [req.params.id]);
      if (existe.rowCount === 0) return false;
      await c.query("DELETE FROM permissoes WHERE papel_id = $1", [req.params.id]);
      for (const p of parsed.data) {
        await c.query(
          `INSERT INTO permissoes (tenant_id, papel_id, recurso, leitura, inclusao, edicao, exclusao)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.tenantId, req.params.id, p.recurso, p.leitura, p.inclusao, p.edicao, p.exclusao],
        );
      }
      return true;
    });
    if (!ok) {
      res.status(404).json({ error: "papel não encontrado" });
      return;
    }
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "não foi possível salvar as permissões" });
  }
});
