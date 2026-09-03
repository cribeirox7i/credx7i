import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { queryRegistry } from "./db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantSlug?: string;
    }
  }
}

type TenantRow = { tenant_id: string; slug: string; status: string };

// Cache curto do registry: resolver o slug a cada request bateria no banco sem necessidade.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { row: TenantRow | null; expira: number }>();

async function resolverTenant(slug: string): Promise<TenantRow | null> {
  const agora = Date.now();
  const hit = cache.get(slug);
  if (hit && hit.expira > agora) return hit.row;

  const { rows } = await queryRegistry<TenantRow>(
    "SELECT tenant_id, slug, status FROM tenants WHERE slug = $1",
    [slug],
  );
  const row = rows[0] ?? null;
  cache.set(slug, { row, expira: agora + CACHE_TTL_MS });
  return row;
}

/**
 * Descobre o slug do tenant a partir do subdomínio (`<slug>.credx7i...`). Em dev aceita
 * o header `X-Tenant-Slug` ou `?tenant=` para não depender de DNS wildcard local.
 *
 * O slug NUNCA vem do corpo da requisição: o cliente não escolhe o seu tenant.
 */
function extrairSlug(req: Request): string | null {
  const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
  const base = config.TENANT_BASE_DOMAIN.toLowerCase();
  if (host.endsWith("." + base)) {
    const sub = host.slice(0, -(base.length + 1));
    if (sub && sub !== "www") return sub;
  }

  if (!process.env.VERCEL) {
    const header = req.header("x-tenant-slug");
    if (header) return header.trim().toLowerCase();
    const q = req.query.tenant;
    if (typeof q === "string" && q) return q.trim().toLowerCase();
  }

  return null;
}

/**
 * Middleware: resolve `req.tenantId` / `req.tenantSlug`. Falha com 400 e mensagem clara
 * quando o tenant não pode ser determinado -- evita o "sumiu tudo" silencioso do RLS
 * (uma query sem contexto simplesmente não retorna linhas).
 */
export async function tenantContext(req: Request, res: Response, next: NextFunction) {
  const slug = extrairSlug(req);
  if (!slug) {
    res.status(400).json({ error: "tenant não identificado na requisição" });
    return;
  }

  let row: TenantRow | null;
  try {
    row = await resolverTenant(slug);
  } catch {
    res.status(503).json({ error: "não foi possível resolver o tenant" });
    return;
  }

  if (!row) {
    res.status(404).json({ error: "tenant não encontrado" });
    return;
  }
  if (row.status !== "ativo") {
    res.status(403).json({ error: "tenant não está ativo" });
    return;
  }

  req.tenantId = row.tenant_id;
  req.tenantSlug = row.slug;
  next();
}

/** Uso nos handlers: garante que o contexto foi resolvido antes de abrir `withTenant`. */
export function assertTenant(req: Request): string {
  if (!req.tenantId) throw new Error("contexto de tenant ausente");
  return req.tenantId;
}
