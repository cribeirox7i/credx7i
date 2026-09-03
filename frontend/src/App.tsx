import { useEffect, useState } from "react";
import { api, type TenantAtual } from "./api/client";

type Estado =
  | { fase: "carregando" }
  | { fase: "ok"; health: boolean; tenant: TenantAtual }
  | { fase: "erro"; msg: string };

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [{ ok }, tenant] = await Promise.all([api.health(), api.tenantAtual()]);
        if (vivo) setEstado({ fase: "ok", health: ok, tenant });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", msg: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <main className="shell">
      <h1>CredX7i</h1>
      <p className="sub">Fase 1 - isolamento por tenant</p>

      {estado.fase === "carregando" && <p>Carregando...</p>}

      {estado.fase === "erro" && (
        <div className="card erro">
          <strong>Falha ao falar com o backend</strong>
          <p>{estado.msg}</p>
          <p className="dica">
            Em dev, informe o tenant na URL: <code>?tenant=alpha</code>. O backend precisa
            estar rodando em <code>localhost:3101</code> e o tenant precisa existir no registry.
          </p>
        </div>
      )}

      {estado.fase === "ok" && (
        <div className="card">
          <div className="linha">
            <span>Backend</span>
            <span>{estado.health ? "ok" : "sem resposta"}</span>
          </div>
          <div className="linha">
            <span>Tenant</span>
            <span>
              {estado.tenant.nome} <code>({estado.tenant.slug})</code>
            </span>
          </div>
          <div className="linha">
            <span>Modo</span>
            <span>{estado.tenant.modo}</span>
          </div>
          <div className="linha">
            <span>Status</span>
            <span>{estado.tenant.status}</span>
          </div>
        </div>
      )}
    </main>
  );
}
