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

export type MunicipioHabilitado = {
  municipio_habilitado_id: string;
  municipio_ibge: string;
  nome: string;
  uf: string;
  tipo: "SEDE" | "LIMITROFE";
};
export type AtividadeEconomica = {
  atividade_economica_id: string;
  codigo: string;
  descricao: string;
  segmento: "INDUSTRIA" | "COMERCIO" | "SERVICO" | "PUBLICO";
};
export type StatusCadastro = "RASCUNHO" | "EM_ANALISE" | "APROVADO" | "REPROVADO" | "SUSPENSO" | "BLOQUEADO";
export type TipoTomador = "PJ" | "PJ_SIMPLES" | "MEI" | "PF" | "COOPERATIVA" | "ISENTO";
export type Cedente = {
  cedente_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  porte: "MEI" | "ME" | "EPP" | null;
  tipo_tomador: TipoTomador;
  status_cadastro: StatusCadastro;
  municipio_ibge: string | null;
  uf: string | null;
  criado_em: string;
};
export type HistoricoStatusCedente = {
  cedente_situacao_hist_id: string;
  status_anterior: string | null;
  status_novo: string;
  observacao: string | null;
  usuario_id: string | null;
  ocorrido_em: string;
};
export type Sacado = {
  sacado_id: string;
  tipo_documento: "PF" | "PJ";
  documento: string;
  nome_razao_social: string;
  limite_credito: number;
  bloqueado: boolean;
  municipio_ibge: string | null;
  uf: string | null;
  criado_em: string;
};

export type Enquadramento = "PADRAO" | "PNMPO" | "RURAL" | "HABITACIONAL" | "EXPORTACAO" | "RENEGOCIACAO";
export type IofTabelaLinha = {
  iof_tabela_id: string;
  tipo_tomador: TipoTomador;
  enquadramento: Enquadramento;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  aliquota_dia: number;
  aliquota_dia_reduzida: number;
  teto_valor_reducao: number;
  aliquota_adicional: number;
  teto_dias: number;
  isencao_total: boolean;
};
export type TributoTabelaLinha = {
  tributo_receita_tabela_id: string;
  tipo_tomador: TipoTomador;
  enquadramento: Enquadramento;
  tributo: "IRRF" | "PIS" | "COFINS";
  aliquota: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
};
export type TabelaCustoItem = { tabela_custo_item_id: string; nome: string; valor: number };
export type TabelaCusto = {
  tabela_custo_id: string;
  nome: string;
  padrao: boolean;
  itens: TabelaCustoItem[];
};

export type Proposta = {
  proposta_id: string;
  cedente_id: string;
  cedente_razao_social: string;
  modalidade: string;
  sistema_amortizacao: "PRICE" | "SAC";
  taxa_prefixada: number | null;
  valor_parcela_informado: number | null;
  valor_solicitado: number;
  n_parcelas: number;
  carencia_periodos: number;
  data_liberacao: string;
  tratamento_iof: "FINANCIADO" | "DESCONTADO";
  enquadramento_iof: Enquadramento;
  tabela_custo_id: string | null;
  status: string;
  simulado_em: string | null;
  criado_em: string;
};
export type ParcelaSimulada = {
  numero: number;
  vencimentoNominal: string;
  vencimento: string;
  diasCorridos: number;
  prestacao: number;
  amortizacao: number;
  juros: number;
  saldoDevedor: number;
  iofPrincipal: number;
};
export type ResultadoSimulacao = {
  taxaPeriodo: number;
  taxaResolvidaPorInversao: boolean;
  valorPrincipalFinanciado: number;
  parcelas: ParcelaSimulada[];
  iofAdicional: number;
  iofPrincipalTotal: number;
  iofTotal: number;
  tributosDetalhe: { tributo: string; base: number; aliquota: number; valor: number }[];
  tributosTotal: number;
  custosTotal: number;
  valorDesembolso: number;
  cet: number;
  cetConvergiu: boolean;
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

  municipiosHabilitados: () => req<MunicipioHabilitado[]>("/api/municipios-habilitados"),
  criarMunicipioHabilitado: (dados: { municipioIbge: string; nome: string; uf: string; tipo: "SEDE" | "LIMITROFE" }) =>
    req<{ municipioHabilitadoId: string }>("/api/municipios-habilitados", {
      method: "POST",
      body: JSON.stringify(dados),
    }),
  atividadesEconomicas: () => req<AtividadeEconomica[]>("/api/atividades-economicas"),
  criarAtividadeEconomica: (dados: { codigo: string; descricao: string; segmento: AtividadeEconomica["segmento"] }) =>
    req<{ atividadeEconomicaId: string }>("/api/atividades-economicas", {
      method: "POST",
      body: JSON.stringify(dados),
    }),

  cedentes: () => req<Cedente[]>("/api/cedentes"),
  criarCedente: (dados: { cnpj: string; razaoSocial: string; municipioIbge?: string; uf?: string }) =>
    req<{ cedenteId: string }>("/api/cedentes", { method: "POST", body: JSON.stringify(dados) }),
  atualizarCedente: (id: string, dados: Record<string, unknown>) =>
    req<void>(`/api/cedentes/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  mudarStatusCedente: (id: string, statusNovo: StatusCadastro, observacao?: string) =>
    req<void>(`/api/cedentes/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ statusNovo, observacao }),
    }),
  historicoStatusCedente: (id: string) =>
    req<HistoricoStatusCedente[]>(`/api/cedentes/${id}/historico-status`),

  sacados: () => req<Sacado[]>("/api/sacados"),
  criarSacado: (dados: { tipoDocumento: "PF" | "PJ"; documento: string; nomeRazaoSocial: string }) =>
    req<{ sacadoId: string }>("/api/sacados", { method: "POST", body: JSON.stringify(dados) }),
  atualizarSacado: (id: string, dados: Partial<{ limiteCredito: number; bloqueado: boolean }>) =>
    req<void>(`/api/sacados/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),

  iofTabela: () => req<IofTabelaLinha[]>("/api/iof-tabela"),
  criarLinhaIof: (dados: {
    tipoTomador: TipoTomador;
    enquadramento: Enquadramento;
    vigenciaInicio: string;
    aliquotaDia: number;
    aliquotaDiaReduzida: number;
    tetoValorReducao: number;
    aliquotaAdicional: number;
    tetoDias: number;
    isencaoTotal?: boolean;
  }) => req<{ iofTabelaId: string }>("/api/iof-tabela", { method: "POST", body: JSON.stringify(dados) }),

  tributosTabela: () => req<TributoTabelaLinha[]>("/api/tributos-tabela"),
  criarLinhaTributo: (dados: {
    tipoTomador: TipoTomador;
    enquadramento: Enquadramento;
    tributo: "IRRF" | "PIS" | "COFINS";
    aliquota: number;
    vigenciaInicio: string;
  }) => req<{ tributoReceitaTabelaId: string }>("/api/tributos-tabela", { method: "POST", body: JSON.stringify(dados) }),

  tabelasCusto: () => req<TabelaCusto[]>("/api/tabelas-custo"),
  criarTabelaCusto: (dados: { nome: string; padrao?: boolean; itens: { nome: string; valor: number }[] }) =>
    req<{ tabelaCustoId: string }>("/api/tabelas-custo", { method: "POST", body: JSON.stringify(dados) }),
  marcarTabelaCustoPadrao: (id: string) =>
    req<void>(`/api/tabelas-custo/${id}`, { method: "PATCH", body: JSON.stringify({ padrao: true }) }),

  propostas: () => req<Proposta[]>("/api/propostas"),
  proposta: (id: string) => req<Proposta>(`/api/propostas/${id}`),
  criarProposta: (dados: {
    cedenteId: string;
    modalidade: string;
    sistemaAmortizacao: "PRICE" | "SAC";
    taxaPrefixada?: number | null;
    valorParcelaInformado?: number | null;
    valorSolicitado: number;
    nParcelas: number;
    carenciaPeriodos: number;
    dataLiberacao: string;
    tratamentoIof: "FINANCIADO" | "DESCONTADO";
    enquadramentoIof: Enquadramento;
    tabelaCustoId?: string | null;
  }) => req<{ propostaId: string }>("/api/propostas", { method: "POST", body: JSON.stringify(dados) }),
  atualizarProposta: (id: string, dados: Record<string, unknown>) =>
    req<void>(`/api/propostas/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
  simularProposta: (id: string) =>
    req<ResultadoSimulacao>(`/api/propostas/${id}/simular`, { method: "POST" }),
};
