const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3101";

// Em dev não há DNS wildcard: o tenant vai por querystring (?tenant=slug), lido aqui e
// repassado como header X-Tenant-Slug em toda chamada. Em produção o backend resolve o
// tenant pelo subdomínio e este header é ignorado.
function tenantSlug(): string | null {
  const q = new URLSearchParams(window.location.search).get("tenant");
  return q && q.trim() ? q.trim() : null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const slug = tenantSlug();
  if (slug) headers["X-Tenant-Slug"] = slug;

  const res = await fetch(`${API_URL}${path}`, { headers, ...options });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type TenantAtual = { slug: string; nome: string; modo: string; status: string };

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  tenantAtual: () => request<TenantAtual>("/api/tenants/atual"),
};
