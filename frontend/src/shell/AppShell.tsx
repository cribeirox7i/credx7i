import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type TenantAtual } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function AppShell() {
  const { estado, logout } = useAuth();
  const nav = useNavigate();
  const [tenant, setTenant] = useState<TenantAtual | null>(null);

  useEffect(() => {
    api.tenantAtual().then(setTenant, () => {});
  }, []);

  if (estado.fase !== "logado") return null;

  return (
    <div className="app-shell">
      <aside className="barra-lateral">
        <div className="marca-lateral">CredX7i</div>
        <div className="tenant-lateral">{tenant?.nome ?? ""}</div>
        <nav>
          <NavLink to="/" end>
            Início
          </NavLink>
          {estado.adminTenant && (
            <>
              <NavLink to="/usuarios">Usuários</NavLink>
              <NavLink to="/papeis">Papéis</NavLink>
            </>
          )}
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
