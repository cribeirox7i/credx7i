import { Fragment, useCallback, useEffect, useState } from "react";
import {
  api,
  type AtividadeEconomica,
  type Cedente,
  type CedenteDetalhe,
  type HistoricoStatusCedente,
  type MunicipioHabilitado,
  type StatusCadastro,
  type TipoTomador,
} from "../api/client";

const STATUS: StatusCadastro[] = ["RASCUNHO", "EM_ANALISE", "APROVADO", "REPROVADO", "SUSPENSO", "BLOQUEADO"];
const TIPOS_TOMADOR: TipoTomador[] = ["PJ", "PJ_SIMPLES", "MEI", "PF", "COOPERATIVA", "ISENTO"];
const PORTES = ["MEI", "ME", "EPP"] as const;

type FormEdicao = {
  nomeFantasia: string;
  porte: string;
  dataAbertura: string;
  atividadeEconomicaId: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipioIbge: string;
  uf: string;
  telefone: string;
  celular: string;
  email: string;
  tipoTomador: TipoTomador;
  isencaoBaseLegal: string;
  declaraSimples: boolean;
  declaracaoPnmpo: boolean;
  receitaBruta: string;
};

function formVazio(): FormEdicao {
  return {
    nomeFantasia: "",
    porte: "",
    dataAbertura: "",
    atividadeEconomicaId: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cep: "",
    municipioIbge: "",
    uf: "",
    telefone: "",
    celular: "",
    email: "",
    tipoTomador: "PJ",
    isencaoBaseLegal: "",
    declaraSimples: false,
    declaracaoPnmpo: false,
    receitaBruta: "",
  };
}

function paraForm(d: CedenteDetalhe): FormEdicao {
  return {
    nomeFantasia: d.nome_fantasia ?? "",
    porte: d.porte ?? "",
    dataAbertura: d.data_abertura ? d.data_abertura.slice(0, 10) : "",
    atividadeEconomicaId: d.atividade_economica_id ?? "",
    logradouro: d.logradouro ?? "",
    numero: d.numero ?? "",
    complemento: d.complemento ?? "",
    bairro: d.bairro ?? "",
    cep: d.cep ?? "",
    municipioIbge: d.municipio_ibge ?? "",
    uf: d.uf ?? "",
    telefone: d.telefone ?? "",
    celular: d.celular ?? "",
    email: d.email ?? "",
    tipoTomador: d.tipo_tomador,
    isencaoBaseLegal: d.isencao_base_legal ?? "",
    declaraSimples: d.declara_simples,
    declaracaoPnmpo: d.declaracao_pnmpo,
    receitaBruta: d.receita_bruta != null ? String(d.receita_bruta) : "",
  };
}

export function CedentesPage() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [atividades, setAtividades] = useState<AtividadeEconomica[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioHabilitado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [criando, setCriando] = useState(false);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [form, setForm] = useState<FormEdicao>(formVazio());
  const [salvando, setSalvando] = useState(false);

  const [historico, setHistorico] = useState<HistoricoStatusCedente[]>([]);
  const [novoStatus, setNovoStatus] = useState<StatusCadastro>("EM_ANALISE");
  const [observacao, setObservacao] = useState("");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [c, a, m] = await Promise.all([api.cedentes(), api.atividadesEconomicas(), api.municipiosHabilitados()]);
      setCedentes(c);
      setAtividades(a);
      setMunicipios(m);
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

  async function abrirDetalhes(c: Cedente) {
    if (expandido === c.cedente_id) {
      setExpandido(null);
      return;
    }
    setErro(null);
    try {
      const [detalhe, hist] = await Promise.all([
        api.cedente(c.cedente_id),
        api.historicoStatusCedente(c.cedente_id),
      ]);
      setForm(paraForm(detalhe));
      setHistorico(hist);
      setExpandido(c.cedente_id);
      setNovoStatus("EM_ANALISE");
      setObservacao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar detalhes");
    }
  }

  async function salvar(c: Cedente) {
    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarCedente(c.cedente_id, {
        nomeFantasia: form.nomeFantasia || null,
        porte: form.porte || null,
        dataAbertura: form.dataAbertura || null,
        atividadeEconomicaId: form.atividadeEconomicaId || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cep: form.cep || null,
        municipioIbge: form.municipioIbge || null,
        uf: form.uf || null,
        telefone: form.telefone || null,
        celular: form.celular || null,
        email: form.email || null,
        tipoTomador: form.tipoTomador,
        isencaoBaseLegal: form.isencaoBaseLegal || null,
        declaraSimples: form.declaraSimples,
        declaracaoPnmpo: form.declaracaoPnmpo,
        receitaBruta: form.receitaBruta ? Number(form.receitaBruta) : null,
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
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
                  <button className="link" onClick={() => abrirDetalhes(c)}>
                    {expandido === c.cedente_id ? "fechar" : "detalhes"}
                  </button>
                </td>
              </tr>
              {expandido === c.cedente_id && (
                <tr>
                  <td colSpan={4}>
                    <h3>Dados cadastrais</h3>
                    <div className="form-linha">
                      <input
                        placeholder="Nome fantasia"
                        value={form.nomeFantasia}
                        onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value }))}
                      />
                      <select
                        value={form.porte}
                        onChange={(e) => setForm((f) => ({ ...f, porte: e.target.value }))}
                      >
                        <option value="">Porte...</option>
                        {PORTES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={form.dataAbertura}
                        onChange={(e) => setForm((f) => ({ ...f, dataAbertura: e.target.value }))}
                        title="Data de abertura"
                      />
                      <select
                        value={form.tipoTomador}
                        onChange={(e) => setForm((f) => ({ ...f, tipoTomador: e.target.value as TipoTomador }))}
                      >
                        {TIPOS_TOMADOR.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <select
                        value={form.atividadeEconomicaId}
                        onChange={(e) => setForm((f) => ({ ...f, atividadeEconomicaId: e.target.value }))}
                      >
                        <option value="">Atividade econômica...</option>
                        {atividades.map((a) => (
                          <option key={a.atividade_economica_id} value={a.atividade_economica_id}>
                            {a.codigo} - {a.descricao}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-linha">
                      <input
                        placeholder="Logradouro"
                        value={form.logradouro}
                        onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))}
                      />
                      <input
                        placeholder="Número"
                        value={form.numero}
                        onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                      />
                      <input
                        placeholder="Complemento"
                        value={form.complemento}
                        onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
                      />
                      <input
                        placeholder="Bairro"
                        value={form.bairro}
                        onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))}
                      />
                      <input
                        placeholder="CEP"
                        value={form.cep}
                        onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                      />
                      <select
                        value={form.municipioIbge}
                        onChange={(e) => {
                          const m = municipios.find((x) => x.municipio_ibge === e.target.value);
                          setForm((f) => ({ ...f, municipioIbge: e.target.value, uf: m?.uf ?? f.uf }));
                        }}
                      >
                        <option value="">Município...</option>
                        {municipios.map((m) => (
                          <option key={m.municipio_habilitado_id} value={m.municipio_ibge}>
                            {m.nome} ({m.uf})
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="UF"
                        maxLength={2}
                        value={form.uf}
                        onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}
                      />
                    </div>
                    <div className="form-linha">
                      <input
                        placeholder="Telefone"
                        value={form.telefone}
                        onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                      />
                      <input
                        placeholder="Celular"
                        value={form.celular}
                        onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))}
                      />
                      <input
                        placeholder="E-mail"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                      <input
                        placeholder="Receita bruta"
                        value={form.receitaBruta}
                        onChange={(e) => setForm((f) => ({ ...f, receitaBruta: e.target.value }))}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={form.declaraSimples}
                          onChange={(e) => setForm((f) => ({ ...f, declaraSimples: e.target.checked }))}
                        />
                        Declara Simples
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={form.declaracaoPnmpo}
                          onChange={(e) => setForm((f) => ({ ...f, declaracaoPnmpo: e.target.checked }))}
                        />
                        Declaração PNMPO
                      </label>
                    </div>
                    {form.tipoTomador === "ISENTO" && (
                      <div className="form-linha">
                        <input
                          placeholder="Base legal da isenção"
                          value={form.isencaoBaseLegal}
                          onChange={(e) => setForm((f) => ({ ...f, isencaoBaseLegal: e.target.value }))}
                        />
                      </div>
                    )}
                    <button onClick={() => salvar(c)} disabled={salvando}>
                      {salvando ? "salvando..." : "Salvar dados cadastrais"}
                    </button>

                    <h3>Histórico de status</h3>
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
