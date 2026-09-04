import { useCallback, useEffect, useState } from "react";
import { api, type Papel, type Usuario } from "../api/client";

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [papeis, setPapeis] = useState<Papel[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papelId, setPapelId] = useState("");
  const [criando, setCriando] = useState(false);
  const [linkConvite, setLinkConvite] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [u, p] = await Promise.all([api.usuarios(), api.papeis()]);
      setUsuarios(u);
      setPapeis(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCriando(true);
    try {
      const r = await api.criarUsuario(nome, email, papelId || null);
      setLinkConvite(r.conviteLink);
      setNome("");
      setEmail("");
      setPapelId("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    } finally {
      setCriando(false);
    }
  }

  async function alternarStatus(u: Usuario) {
    setErro(null);
    try {
      await api.atualizarUsuario(u.user_id, { status: u.status === "ATIVO" ? "INATIVO" : "ATIVO" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha");
    }
  }

  async function trocarPapel(u: Usuario, novo: string) {
    setErro(null);
    try {
      await api.atualizarUsuario(u.user_id, { papelId: novo || null });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha");
    }
  }

  async function reenviar(u: Usuario) {
    setErro(null);
    try {
      const r = await api.reenviarConvite(u.user_id);
      setLinkConvite(r.conviteLink);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha");
    }
  }

  return (
    <div className="pagina">
      <h1>Usuários</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <form className="form-linha" onSubmit={criar}>
        <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <input placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select value={papelId} onChange={(e) => setPapelId(e.target.value)}>
          <option value="">(sem papel)</option>
          {papeis.map((p) => (
            <option key={p.papel_id} value={p.papel_id}>
              {p.nome}
            </option>
          ))}
        </select>
        <button type="submit" disabled={criando}>
          {criando ? "..." : "Criar e convidar"}
        </button>
      </form>

      {linkConvite && (
        <div className="banner-ok">
          Link de convite (SMTP desligado - copie e envie):
          <br />
          <code>{linkConvite}</code>
        </div>
      )}

      <table className="grade">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Papel</th>
            <th>Status</th>
            <th>Convite</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.user_id}>
              <td>{u.nome}</td>
              <td>
                <code>{u.email}</code>
              </td>
              <td>
                <select value={u.papel_id ?? ""} onChange={(e) => trocarPapel(u, e.target.value)}>
                  <option value="">(sem papel)</option>
                  {papeis.map((p) => (
                    <option key={p.papel_id} value={p.papel_id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </td>
              <td>{u.status}</td>
              <td>
                {u.convite_pendente ? (
                  <button className="link" onClick={() => reenviar(u)}>
                    pendente (regerar)
                  </button>
                ) : (
                  <button className="link" onClick={() => reenviar(u)}>
                    enviar
                  </button>
                )}
              </td>
              <td>
                <button className="link" onClick={() => alternarStatus(u)}>
                  {u.status === "ATIVO" ? "desativar" : "ativar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
