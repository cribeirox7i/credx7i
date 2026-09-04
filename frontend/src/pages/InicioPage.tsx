import { useEffect, useState } from "react";
import { api, type TenantAtual } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function InicioPage() {
  const { estado } = useAuth();
  const [tenant, setTenant] = useState<TenantAtual | null>(null);

  useEffect(() => {
    api.tenantAtual().then(setTenant, () => {});
  }, []);

  if (estado.fase !== "logado") return null;

  return (
    <div className="pagina">
      <h1>Início</h1>
      <div className="card">
        <div className="linha">
          <span>Tenant</span>
          <span>
            {tenant?.nome} <code>({tenant?.slug})</code>
          </span>
        </div>
        <div className="linha">
          <span>Usuário</span>
          <span>
            {estado.usuario.nome} <code>{estado.usuario.email}</code>
          </span>
        </div>
        <div className="linha">
          <span>Perfil</span>
          <span>{estado.adminTenant ? "Administrador do tenant" : "Usuário"}</span>
        </div>
      </div>
      <p className="dica">
        Fase 2 - autenticação por tenant. Cadastro de crédito entra na Fase 3.
      </p>
    </div>
  );
}
