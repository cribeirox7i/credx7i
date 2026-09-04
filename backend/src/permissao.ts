import type { NextFunction, Request, Response } from "express";
import { withTenant } from "./db";

// Autorização dentro do tenant. NÃO é a fronteira entre tenants (isso é o RLS) - é só
// controle de função dentro da ESC. Checagem explícita por rota, sem roteador genérico
// nem mapa de recursos (foi essa costura que gerou os dois achados de auditoria no WebCRM).

/** Exige que o usuário tenha um papel com admin_tenant = true. */
export function exigeAdminTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario) {
    res.status(401).json({ error: "não autenticado" });
    return;
  }
  if (!req.usuario.adminTenant) {
    res.status(403).json({ error: "requer administrador do tenant" });
    return;
  }
  next();
}

const COLUNAS = {
  leitura: "leitura",
  inclusao: "inclusao",
  edicao: "edicao",
  exclusao: "exclusao",
} as const;
type Operacao = keyof typeof COLUNAS;

/** Exige que o papel do usuário conceda `operacao` sobre `recurso`. Admin do tenant passa. */
export function exigePermissao(recurso: string, operacao: Operacao) {
  const coluna = COLUNAS[operacao];
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = req.usuario;
    if (!u) {
      res.status(401).json({ error: "não autenticado" });
      return;
    }
    if (u.adminTenant) {
      next();
      return;
    }
    if (!u.papelId) {
      res.status(403).json({ error: "sem permissão para esta ação" });
      return;
    }
    const permitido = await withTenant(req.tenantId!, async (c) => {
      const { rows } = await c.query<{ v: boolean }>(
        `SELECT ${coluna} AS v FROM permissoes WHERE papel_id = $1 AND recurso = $2`,
        [u.papelId, recurso],
      );
      return rows[0]?.v === true;
    }).catch(() => false);

    if (!permitido) {
      res.status(403).json({ error: "sem permissão para esta ação" });
      return;
    }
    next();
  };
}
