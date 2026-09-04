const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3101";

// --- tenant (dev): slug vem de ?tenant= na primeira carga e fica em sessionStorage.
// Em produção o backend resolve pelo subdomínio e o header abaixo é ignorado.
const TENANT_KEY = "credx7i_tenant";

export function capturarTenantDaUrl() {
  const q = new URLSearchParams(window.location.search).get("tenant");
  if (q && q.trim()) {
    try {
      sessionStorage.setItem(TENANT_KEY, q.trim().toLowerCase());
    } catch {
      /* sessionStorage indisponível */
    }
  }
}

function tenantSlug(): string | null {
  try {
    return sessionStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

// --- token de sessão: por tenant (dev pode ter alpha e beta na mesma origem)
function tokenKey(): string {
  return `credx7i_token_${tenantSlug() ?? "_"}`;
}
export function lerToken(): string | null {
  try {
    return localStorage.getItem(tokenKey());
  } catch {
    return null;
  }
}
export function guardarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(), token);
    else localStorage.removeItem(tokenKey());
  } catch {
    /* ignore */
  }
}

let aoDeslogar: (() => void) | null = null;
export function onNaoAutenticado(fn: () => void) {
  aoDeslogar = fn;
}

async function req<T>(path: string, opcoes?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const slug = tenantSlug();
  if (slug) headers["X-Tenant-Slug"] = slug;
  const token = lerToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers, ...opcoes });
  if (res.status === 401) {
    aoDeslogar?.();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type TenantAtual = { slug: string; nome: string; modo: string; status: string };
export type UsuarioSessao = { id: string; nome: string; email: string };
export type Permissao = {
  recurso: string;
  leitura: boolean;
  inclusao: boolean;
  edicao: boolean;
  exclusao: boolean;
};
export type Usuario = {
  user_id: string;
  nome: string;
  email: string;
  status: "ATIVO" | "INATIVO";
  deve_trocar_senha: boolean;
  papel_id: string | null;
  papel_nome: string | null;
  convite_pendente: boolean;
};
export type Papel = {
  papel_id: string;
  nome: string;
  admin_tenant: boolean;
  permissoes: Permissao[];
};

export const api = {
  health: () => req<{ ok: boolean }>("/health"),
  tenantAtual: () => req<TenantAtual>("/api/tenants/atual"),

  login: (email: string, senha: string) =>
    req<{ token: string; mustChangePassword: boolean; usuario: UsuarioSessao }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    }),
  logout: () => req<void>("/api/auth/logout", { method: "POST" }),
  me: () =>
    req<{ usuario: UsuarioSessao; mustChangePassword: boolean; adminTenant: boolean }>("/api/auth/me"),
  minhasPermissoes: () =>
    req<{ adminTenant: boolean; permissoes: Permissao[] }>("/api/auth/minhas-permissoes"),
  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    req<void>("/api/auth/trocar-senha", {
      method: "POST",
      body: JSON.stringify({ senhaAtual, novaSenha }),
    }),
  esqueciSenha: (email: string) =>
    req<{ ok: true }>("/api/auth/esqueci-senha", { method: "POST", body: JSON.stringify({ email }) }),
  validarConvite: (token: string) =>
    req<{ nome: string; email: string }>(`/api/auth/convite/${token}`),
  definirSenhaConvite: (token: string, novaSenha: string) =>
    req<{ token: string; usuario: UsuarioSessao }>(`/api/auth/convite/${token}/definir-senha`, {
      method: "POST",
      body: JSON.stringify({ novaSenha }),
    }),

  usuarios: () => req<Usuario[]>("/api/usuarios"),
  criarUsuario: (nome: string, email: string, papelId: string | null) =>
    req<{ userId: string; conviteLink: string; conviteEnviado: boolean }>("/api/usuarios", {
      method: "POST",
      body: JSON.stringify({ nome, email, papelId }),
    }),
  atualizarUsuario: (id: string, dados: Partial<{ nome: string; papelId: string | null; status: string }>) =>
    req<void>(`/api/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  reenviarConvite: (id: string) =>
    req<{ conviteLink: string; conviteEnviado: boolean }>(`/api/usuarios/${id}/convite`, { method: "POST" }),

  papeis: () => req<Papel[]>("/api/papeis"),
  criarPapel: (nome: string, adminTenant: boolean) =>
    req<{ papelId: string }>("/api/papeis", { method: "POST", body: JSON.stringify({ nome, adminTenant }) }),
  atualizarPapel: (id: string, dados: Partial<{ nome: string; adminTenant: boolean }>) =>
    req<void>(`/api/papeis/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  excluirPapel: (id: string) => req<void>(`/api/papeis/${id}`, { method: "DELETE" }),
};
