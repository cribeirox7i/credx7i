import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type TenantAtual } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const GRUPOS_ABERTOS_KEY = "credx7i_menu_grupos_abertos";

function lerGruposAbertos(): Record<string, boolean> {
  try {
    const bruto = localStorage.getItem(GRUPOS_ABERTOS_KEY);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function salvarGruposAbertos(estado: Record<string, boolean>) {
  try {
    localStorage.setItem(GRUPOS_ABERTOS_KEY, JSON.stringify(estado));
  } catch {
    /* localStorage indisponível */
  }
}

type ItemNav = { to: string; label: string; visivel: boolean };
type GrupoNav = { titulo: string; itens: ItemNav[] };

function GrupoMenu({
  grupo,
  aberto,
  onToggle,
}: {
  grupo: GrupoNav;
  aberto: boolean;
  onToggle: () => void;
}) {
  const itensVisiveis = grupo.itens.filter((i) => i.visivel);
  if (itensVisiveis.length === 0) return null;

  return (
    <div className="grupo-nav">
      <button type="button" className={`grupo-nav-titulo${aberto ? " aberto" : ""}`} onClick={onToggle}>
        <span className="grupo-nav-seta">▸</span>
        {grupo.titulo}
      </button>
      {aberto && (
        <div className="grupo-nav-itens">
          {itensVisiveis.map((i) => (
            <NavLink key={i.to} to={i.to}>
              {i.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { estado, logout, pode } = useAuth();
  const nav = useNavigate();
  const [tenant, setTenant] = useState<TenantAtual | null>(null);
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>(() => {
    const salvo = lerGruposAbertos();
    // primeira visita: todos os grupos começam abertos
    return { Cadastro: true, Operações: true, Gerencial: true, ...salvo };
  });

  useEffect(() => {
    api.tenantAtual().then(setTenant, () => {});
  }, []);

  if (estado.fase !== "logado") return null;

  function alternarGrupo(titulo: string) {
    setGruposAbertos((atual) => {
      const novo = { ...atual, [titulo]: !atual[titulo] };
      salvarGruposAbertos(novo);
      return novo;
    });
  }

  const grupos: GrupoNav[] = [
    {
      titulo: "Cadastro",
      itens: [
        { to: "/cedentes", label: "Cedentes", visivel: estado.adminTenant || pode("cedente", "leitura") },
        { to: "/sacados", label: "Sacados", visivel: estado.adminTenant || pode("sacado", "leitura") },
        {
          to: "/cadastros-apoio",
          label: "Cadastros de apoio",
          visivel: estado.adminTenant || pode("tabela_apoio", "leitura"),
        },
        {
          to: "/parametros-fiscais",
          label: "Parâmetros fiscais",
          visivel: estado.adminTenant || pode("parametro_fiscal", "leitura"),
        },
      ],
    },
    {
      titulo: "Operações",
      itens: [{ to: "/propostas", label: "Propostas", visivel: estado.adminTenant || pode("proposta", "leitura") }],
    },
    {
      titulo: "Gerencial",
      itens: [
        { to: "/usuarios", label: "Usuários", visivel: estado.adminTenant },
        { to: "/papeis", label: "Papéis", visivel: estado.adminTenant },
      ],
    },
  ];

  return (
    <div className="app-shell">
      <aside className="barra-lateral">
        <div className="marca-lateral">CredX7i</div>
        <div className="tenant-lateral">{tenant?.nome ?? ""}</div>
        <nav>
          <NavLink to="/" end>
            Início
          </NavLink>
          {grupos.map((g) => (
            <GrupoMenu key={g.titulo} grupo={g} aberto={!!gruposAbertos[g.titulo]} onToggle={() => alternarGrupo(g.titulo)} />
          ))}
        </nav>
      </aside>

      <div className="area-principal">
        <header className="topo">
          <span className="usuario-atual">{estado.usuario.nome}</span>
          <button
            className="link"
            onClick={() => logout().then(() => nav("/login", { replace: true }))}
          >
            Sair
          </button>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
