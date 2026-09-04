import { Router } from "express";
import { z } from "zod";
import { assertTenant } from "../tenantContext";
import { withTenant } from "../db";
import { hashPassword, verifyPassword } from "../authCrypto";
import { criarSessao, apagarSessao, requireUserAuth, tokenDoHeader } from "../auth";
import { erroSenha } from "../senha";
import { gerarConvite } from "../convite";
import { loginRateLimiter, esqueciSenhaRateLimiter } from "../rateLimit";

export const authRouter = Router();

const loginBody = z.object({ email: z.string().min(1), senha: z.string().min(1) });
const trocaBody = z.object({ senhaAtual: z.string().min(1), novaSenha: z.string().min(1) });
const emailBody = z.object({ email: z.string().min(1) });
const definirBody = z.object({ novaSenha: z.string().min(1) });

type UsuarioRow = {
  user_id: string;
  nome: string;
  email: string;
  status: string;
  senha_hash: string | null;
  deve_trocar_senha: boolean;
};

// POST /api/auth/login
authRouter.post("/login", loginRateLimiter, async (req, res) => {
  const tenantId = assertTenant(req);
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "e-mail e senha são obrigatórios" });
    return;
  }
  const { email, senha } = parsed.data;

  try {
    const resultado = await withTenant(tenantId, async (c) => {
      const { rows } = await c.query<UsuarioRow>(
        `SELECT user_id, nome, email, status, senha_hash, deve_trocar_senha
           FROM usuarios WHERE lower(email) = lower($1)`,
        [email.trim()],
      );
      const u = rows[0];
      if (!u || u.status !== "ATIVO" || !verifyPassword(senha, u.senha_hash)) return null;
      const { token, expiraEm } = await criarSessao(c, tenantId, u.user_id);
      return {
        token,
        expiraEm,
        mustChangePassword: u.deve_trocar_senha,
        usuario: { id: u.user_id, nome: u.nome, email: u.email },
      };
    });
    if (!resultado) {
      res.status(401).json({ error: "e-mail ou senha inválidos" });
      return;
    }
    res.json(resultado);
  } catch {
    res.status(500).json({ error: "falha no login" });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", requireUserAuth, async (req, res) => {
  await apagarSessao(req.tenantId!, req.sessaoToken!).catch(() => {});
  res.status(204).send();
});

// GET /api/auth/me
authRouter.get("/me", requireUserAuth, (req, res) => {
  const u = req.usuario!;
  res.json({
    usuario: { id: u.userId, nome: u.nome, email: u.email },
    mustChangePassword: u.deveTrocarSenha,
    adminTenant: u.adminTenant,
  });
});

// GET /api/auth/minhas-permissoes
authRouter.get("/minhas-permissoes", requireUserAuth, async (req, res) => {
  const u = req.usuario!;
  if (u.adminTenant) {
    res.json({ adminTenant: true, permissoes: [] });
    return;
  }
  if (!u.papelId) {
    res.json({ adminTenant: false, permissoes: [] });
    return;
  }
  const permissoes = await withTenant(req.tenantId!, async (c) => {
    const { rows } = await c.query(
      "SELECT recurso, leitura, inclusao, edicao, exclusao FROM permissoes WHERE papel_id = $1",
      [u.papelId],
    );
    return rows;
  });
  res.json({ adminTenant: false, permissoes });
});

// POST /api/auth/trocar-senha
authRouter.post("/trocar-senha", requireUserAuth, async (req, res) => {
  const parsed = trocaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "senha atual e nova senha são obrigatórias" });
    return;
  }
  const msg = erroSenha(parsed.data.novaSenha);
  if (msg) {
    res.status(400).json({ error: msg });
    return;
  }

  const u = req.usuario!;
  try {
    const ok = await withTenant(req.tenantId!, async (c) => {
      const { rows } = await c.query<{ senha_hash: string | null }>(
        "SELECT senha_hash FROM usuarios WHERE user_id = $1",
        [u.userId],
      );
      if (!rows[0] || !verifyPassword(parsed.data.senhaAtual, rows[0].senha_hash)) return false;

      // atualiza a senha e revoga toda OUTRA sessão do usuário, atômico
      await c.query(
        "UPDATE usuarios SET senha_hash = $1, deve_trocar_senha = false WHERE user_id = $2",
        [hashPassword(parsed.data.novaSenha), u.userId],
      );
      await c.query(
        "DELETE FROM usuario_sessoes WHERE user_id = $1 AND sessao_token <> $2",
        [u.userId, req.sessaoToken],
      );
      return true;
    });
    if (!ok) {
      res.status(401).json({ error: "senha atual incorreta" });
      return;
    }
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "falha ao trocar a senha" });
  }
});

// POST /api/auth/esqueci-senha - resposta sempre genérica (não revela se o e-mail existe)
authRouter.post("/esqueci-senha", esqueciSenhaRateLimiter, async (req, res) => {
  const tenantId = assertTenant(req);
  const parsed = emailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "e-mail é obrigatório" });
    return;
  }
  try {
    await withTenant(tenantId, async (c) => {
      const { rows } = await c.query<{ user_id: string; nome: string; email: string }>(
        "SELECT user_id, nome, email FROM usuarios WHERE lower(email) = lower($1) AND status = 'ATIVO'",
        [parsed.data.email.trim()],
      );
      if (rows[0]) {
        await gerarConvite(c, req.tenantSlug!, {
          userId: rows[0].user_id,
          nome: rows[0].nome,
          email: rows[0].email,
        });
      }
    });
  } catch {
    /* best-effort */
  }
  res.json({ ok: true });
});

// GET /api/auth/convite/:token
authRouter.get("/convite/:token", async (req, res) => {
  const tenantId = assertTenant(req);
  const dados = await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ nome: string; email: string }>(
      "SELECT nome, email FROM usuarios WHERE convite_token = $1 AND convite_expira_em > now()",
      [req.params.token],
    );
    return rows[0] ?? null;
  }).catch(() => null);

  if (!dados) {
    res.status(404).json({ error: "convite inválido ou expirado" });
    return;
  }
  res.json(dados);
});

// POST /api/auth/convite/:token/definir-senha
authRouter.post("/convite/:token/definir-senha", async (req, res) => {
  const tenantId = assertTenant(req);
  const parsed = definirBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "senha é obrigatória" });
    return;
  }
  const msg = erroSenha(parsed.data.novaSenha);
  if (msg) {
    res.status(400).json({ error: msg });
    return;
  }

  try {
    const resultado = await withTenant(tenantId, async (c) => {
      const { rows } = await c.query<UsuarioRow>(
        `SELECT user_id, nome, email, status, senha_hash, deve_trocar_senha
           FROM usuarios WHERE convite_token = $1 AND convite_expira_em > now()`,
        [req.params.token],
      );
      const u = rows[0];
      if (!u) return { tipo: "erro" as const, status: 404, msg: "convite inválido ou expirado" };
      if (u.status !== "ATIVO") {
        return { tipo: "erro" as const, status: 403, msg: "usuário desativado - fale com o administrador" };
      }

      await c.query(
        `UPDATE usuarios
            SET senha_hash = $1, deve_trocar_senha = false,
                convite_token = NULL, convite_expira_em = NULL
          WHERE user_id = $2`,
        [hashPassword(parsed.data.novaSenha), u.user_id],
      );
      const { token, expiraEm } = await criarSessao(c, tenantId, u.user_id);
      return {
        tipo: "ok" as const,
        dados: {
          token,
          expiraEm,
          mustChangePassword: false,
          usuario: { id: u.user_id, nome: u.nome, email: u.email },
        },
      };
    });

    if (resultado.tipo === "erro") {
      res.status(resultado.status).json({ error: resultado.msg });
      return;
    }
    res.json(resultado.dados);
  } catch {
    res.status(500).json({ error: "falha ao definir a senha" });
  }
});
