import { useCallback, useEffect, useState } from "react";
import { api, type Sacado } from "../api/client";

export function SacadosPage() {
  const [sacados, setSacados] = useState<Sacado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<"PF" | "PJ">("PJ");
  const [documento, setDocumento] = useState("");
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setSacados(await api.sacados());
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
      await api.criarSacado({ tipoDocumento, documento, nomeRazaoSocial: nome });
      setDocumento("");
      setNome("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    } finally {
      setCriando(false);
    }
  }

  async function alternarBloqueio(s: Sacado) {
    setErro(null);
    try {
      await api.atualizarSacado(s.sacado_id, { bloqueado: !s.bloqueado });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao atualizar");
    }
  }

  return (
    <div className="pagina">
      <h1>Sacados</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <form className="form-linha" onSubmit={criar}>
        <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as "PF" | "PJ")}>
          <option value="PJ">PJ</option>
          <option value="PF">PF</option>
        </select>
        <input
          placeholder={tipoDocumento === "PJ" ? "CNPJ" : "CPF"}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          required
        />
        <input placeholder="Nome / Razão social" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <button type="submit" disabled={criando}>
          {criando ? "..." : "Criar"}
        </button>
      </form>

      <table className="grade">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Nome / Razão social</th>
            <th>Limite</th>
            <th>Bloqueado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sacados.map((s) => (
            <tr key={s.sacado_id}>
              <td>
                <code>{s.documento}</code>
              </td>
              <td>{s.nome_razao_social}</td>
              <td>{Number(s.limite_credito).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              <td>{s.bloqueado ? "sim" : "não"}</td>
              <td>
                <button className="link" onClick={() => alternarBloqueio(s)}>
                  {s.bloqueado ? "desbloquear" : "bloquear"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
