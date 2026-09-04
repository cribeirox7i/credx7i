import type { NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import { config } from "./config";
import { withTenant } from "./db";
import { generateToken } from "./authCrypto";

export interface UsuarioLogado {
  userId: string;
  nome: string;
  email: string;
  deveTrocarSenha: boolean;
  papelId: string | null;
  adminTenant: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioLogado;
      sessaoToken?: string;
    }
  }
}

export function tokenDoHeader(req: Request): string {
  const auth = req.header("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

/** Cria a sessão. Roda dentro de um withTenant já aberto (usa o client da transação). */
export async function criarSessao(
  client: PoolClient,
  tenantId: string,
  userId: string,
): Promise<{ token: string; expiraEm: string }> {
  const token = generateToken();
  const expiraEm = new Date(Date.now() + config.SESSION_TTL_DIAS * 86_400_000).toISOString();
  await client.query(
    "INSERT INTO usuario_sessoes (sessao_token, tenant_id, user_id, expira_em) VALUES ($1, $2, $3, $4)",
    [token, tenantId, userId, expiraEm],
  );
  return { token, expiraEm };
}

export async function apagarSessao(tenantId: string, token: string): Promise<void> {
  await withTenant(tenantId, (c) =>
    c.query("DELETE FROM usuario_sessoes WHERE sessao_token = $1", [token]),
  );
}

/**
 * Sessão válida = existe, não expirou, e o usuário ainda está ATIVO. Como a consulta roda
 * sob RLS com o tenant da requisição, um token de OUTRO tenant simplesmente não aparece
 * (coerência de tenant garantida pelo banco, não por comparação em código).
 */
export async function usuarioDaSessao(
  tenantId: string,
  token: string,
): Promise<UsuarioLogado | null> {
  if (!token) return null;
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      user_id: string;
      nome: string;
      email: string;
      status: string;
      deve_trocar_senha: boolean;
      papel_id: string | null;
      admin_tenant: boolean | null;
    }>(
      `SELECT u.user_id, u.nome, u.email, u.status, u.deve_trocar_senha,
              u.papel_id, p.admin_tenant
         FROM usuario_sessoes s
         JOIN usuarios u ON u.user_id = s.user_id
         LEFT JOIN papeis p ON p.papel_id = u.papel_id
        WHERE s.sessao_token = $1 AND s.expira_em > now()`,
      [token],
    );
    const r = rows[0];
    if (!r || r.status !== "ATIVO") return null;
    return {
      userId: r.user_id,
      nome: r.nome,
      email: r.email,
      deveTrocarSenha: r.deve_trocar_senha,
      papelId: r.papel_id,
      adminTenant: r.admin_tenant === true,
    };
  });
}

/** Middleware: exige sessão de usuário válida do tenant já resolvido. */
export async function requireUserAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    res.status(400).json({ error: "tenant não resolvido" });
    return;
  }
  const token = tokenDoHeader(req);
  const usuario = await usuarioDaSessao(req.tenantId, token).catch(() => null);
  if (!usuario) {
    res.status(401).json({ error: "não autenticado" });
    return;
  }
  req.usuario = usuario;
  req.sessaoToken = token;
  next();
}
