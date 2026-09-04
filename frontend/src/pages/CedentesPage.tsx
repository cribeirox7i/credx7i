import { Fragment, useCallback, useEffect, useState } from "react";
import { api, type Cedente, type HistoricoStatusCedente, type StatusCadastro } from "../api/client";

const STATUS: StatusCadastro[] = ["RASCUNHO", "EM_ANALISE", "APROVADO", "REPROVADO", "SUSPENSO", "BLOQUEADO"];

export function CedentesPage() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [criando, setCriando] = useState(false);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoStatusCedente[]>([]);
  const [novoStatus, setNovoStatus] = useState<StatusCadastro>("EM_ANALISE");
  const [observacao, setObservacao] = useState("");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setCedentes(await api.cedentes());
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
      await api.criarCedente({ cnpj, razaoSocial });
      setCnpj("");
      setRazaoSocial("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    } finally {
      setCriando(false);
    }
  }

  async function abrirHistorico(c: Cedente) {
    if (expandido === c.cedente_id) {
      setExpandido(null);
      return;
    }
    setErro(null);
    try {
      setHistorico(await api.historicoStatusCedente(c.cedente_id));
      setExpandido(c.cedente_id);
      setNovoStatus("EM_ANALISE");
      setObservacao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar histórico");
    }
  }

  async function mudarStatus(c: Cedente) {
    setErro(null);
    try {
      await api.mudarStatusCedente(c.cedente_id, novoStatus, observacao || undefined);
      await carregar();
      setHistorico(await api.historicoStatusCedente(c.cedente_id));
      setObservacao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao mudar status");
    }
  }

  return (
    <div className="pagina">
      <h1>Cedentes</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <form className="form-linha" onSubmit={criar}>
        <input placeholder="CNPJ" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
        <input
          placeholder="Razão social"
          value={razaoSocial}
          onChange={(e) => setRazaoSocial(e.target.value)}
          required
        />
        <button type="submit" disabled={criando}>
          {criando ? "..." : "Criar"}
        </button>
      </form>

      <table className="grade">
        <thead>
          <tr>
            <th>CNPJ</th>
            <th>Razão social</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cedentes.map((c) => (
            <Fragment key={c.cedente_id}>
              <tr>
                <td>
                  <code>{c.cnpj}</code>
                </td>
                <td>{c.razao_social}</td>
                <td>{c.status_cadastro}</td>
                <td>
                  <button className="link" onClick={() => abrirHistorico(c)}>
                    {expandido === c.cedente_id ? "fechar" : "histórico de status"}
                  </button>
                </td>
              </tr>
              {expandido === c.cedente_id && (
                <tr>
                  <td colSpan={4}>
                    <div className="form-linha">
                      <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as StatusCadastro)}>
                        {STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Observação"
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                      />
                      <button onClick={() => mudarStatus(c)}>Mudar status</button>
                    </div>
                    <table className="grade">
                      <thead>
                        <tr>
                          <th>De</th>
                          <th>Para</th>
                          <th>Observação</th>
                          <th>Quando</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map((h) => (
                          <tr key={h.cedente_situacao_hist_id}>
                            <td>{h.status_anterior ?? "-"}</td>
                            <td>{h.status_novo}</td>
                            <td>{h.observacao ?? ""}</td>
                            <td>{new Date(h.ocorrido_em).toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
