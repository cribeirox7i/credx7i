import { useCallback, useEffect, useState } from "react";
import { api, type Papel } from "../api/client";

export function PapeisPage() {
  const [papeis, setPapeis] = useState<Papel[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [admin, setAdmin] = useState(false);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setPapeis(await api.papeis());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao<T>(fn: () => Promise<T>) {
    setErro(null);
    try {
      await fn();
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha");
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    await acao(() => api.criarPapel(nome, admin));
    setNome("");
    setAdmin(false);
    setCriando(false);
  }

  return (
    <div className="pagina">
      <h1>Papéis</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <form className="form-linha" onSubmit={criar}>
        <input placeholder="Nome do papel" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <label className="check">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
          administrador do tenant
        </label>
        <button type="submit" disabled={criando}>
          {criando ? "..." : "Criar"}
        </button>
      </form>

      <table className="grade">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Admin do tenant</th>
            <th>Permissões</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {papeis.map((p) => (
            <tr key={p.papel_id}>
              <td>{p.nome}</td>
              <td>
                <input
                  type="checkbox"
                  checked={p.admin_tenant}
                  onChange={(e) => acao(() => api.atualizarPapel(p.papel_id, { adminTenant: e.target.checked }))}
                />
              </td>
              <td>{p.admin_tenant ? "(tudo)" : `${p.permissoes.length} recurso(s)`}</td>
              <td>
                <button className="link" onClick={() => acao(() => api.excluirPapel(p.papel_id))}>
                  excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="dica">
        A grade de permissões por recurso entra na Fase 3, quando existirem recursos de
        crédito para permissionar.
      </p>
    </div>
  );
}
