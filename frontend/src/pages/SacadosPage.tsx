import { Fragment, useCallback, useEffect, useState } from "react";
import {
  api,
  type AtividadeEconomica,
  type MunicipioHabilitado,
  type Sacado,
  type SacadoDetalhe,
} from "../api/client";

type FormEdicao = {
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
  limiteCredito: string;
};

function formVazio(): FormEdicao {
  return {
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
    limiteCredito: "",
  };
}

function paraForm(d: SacadoDetalhe): FormEdicao {
  return {
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
    limiteCredito: String(d.limite_credito),
  };
}

export function SacadosPage() {
  const [sacados, setSacados] = useState<Sacado[]>([]);
  const [atividades, setAtividades] = useState<AtividadeEconomica[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioHabilitado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<"PF" | "PJ">("PJ");
  const [documento, setDocumento] = useState("");
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [form, setForm] = useState<FormEdicao>(formVazio());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [s, a, m] = await Promise.all([api.sacados(), api.atividadesEconomicas(), api.municipiosHabilitados()]);
      setSacados(s);
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

  async function abrirDetalhes(s: Sacado) {
    if (expandido === s.sacado_id) {
      setExpandido(null);
      return;
    }
    setErro(null);
    try {
      const detalhe = await api.sacado(s.sacado_id);
      setForm(paraForm(detalhe));
      setExpandido(s.sacado_id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar detalhes");
    }
  }

  async function salvar(s: Sacado) {
    setErro(null);
    setSalvando(true);
    try {
      await api.atualizarSacado(s.sacado_id, {
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
        limiteCredito: form.limiteCredito ? Number(form.limiteCredito) : 0,
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
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
            <Fragment key={s.sacado_id}>
              <tr>
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
                  {" · "}
                  <button className="link" onClick={() => abrirDetalhes(s)}>
                    {expandido === s.sacado_id ? "fechar" : "detalhes"}
                  </button>
                </td>
              </tr>
              {expandido === s.sacado_id && (
                <tr>
                  <td colSpan={5}>
                    <div className="form-linha">
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
                      <input
                        placeholder="Limite de crédito"
                        value={form.limiteCredito}
                        onChange={(e) => setForm((f) => ({ ...f, limiteCredito: e.target.value }))}
                      />
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
                    </div>
                    <button onClick={() => salvar(s)} disabled={salvando}>
                      {salvando ? "salvando..." : "Salvar dados cadastrais"}
                    </button>
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
