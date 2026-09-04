import { useCallback, useEffect, useState } from "react";
import { api, type AtividadeEconomica, type MunicipioHabilitado } from "../api/client";

export function CadastrosApoioPage() {
  const [municipios, setMunicipios] = useState<MunicipioHabilitado[]>([]);
  const [atividades, setAtividades] = useState<AtividadeEconomica[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [ibge, setIbge] = useState("");
  const [nomeMunicipio, setNomeMunicipio] = useState("");
  const [ufMunicipio, setUfMunicipio] = useState("");
  const [tipoMunicipio, setTipoMunicipio] = useState<"SEDE" | "LIMITROFE">("SEDE");

  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [segmento, setSegmento] = useState<AtividadeEconomica["segmento"]>("SERVICO");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [m, a] = await Promise.all([api.municipiosHabilitados(), api.atividadesEconomicas()]);
      setMunicipios(m);
      setAtividades(a);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criarMunicipio(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.criarMunicipioHabilitado({
        municipioIbge: ibge,
        nome: nomeMunicipio,
        uf: ufMunicipio,
        tipo: tipoMunicipio,
      });
      setIbge("");
      setNomeMunicipio("");
      setUfMunicipio("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    }
  }

  async function criarAtividade(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.criarAtividadeEconomica({ codigo, descricao, segmento });
      setCodigo("");
      setDescricao("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    }
  }

  return (
    <div className="pagina">
      <h1>Cadastros de apoio</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <h2>Municípios habilitados</h2>
      <form className="form-linha" onSubmit={criarMunicipio}>
        <input placeholder="Código IBGE" value={ibge} onChange={(e) => setIbge(e.target.value)} required />
        <input placeholder="Nome" value={nomeMunicipio} onChange={(e) => setNomeMunicipio(e.target.value)} required />
        <input placeholder="UF" maxLength={2} value={ufMunicipio} onChange={(e) => setUfMunicipio(e.target.value)} required />
        <select value={tipoMunicipio} onChange={(e) => setTipoMunicipio(e.target.value as "SEDE" | "LIMITROFE")}>
          <option value="SEDE">Sede</option>
          <option value="LIMITROFE">Limítrofe</option>
        </select>
        <button type="submit">Adicionar</button>
      </form>
      <table className="grade">
        <thead>
          <tr>
            <th>IBGE</th>
            <th>Nome</th>
            <th>UF</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {municipios.map((m) => (
            <tr key={m.municipio_habilitado_id}>
              <td>{m.municipio_ibge}</td>
              <td>{m.nome}</td>
              <td>{m.uf}</td>
              <td>{m.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Atividades econômicas</h2>
      <form className="form-linha" onSubmit={criarAtividade}>
        <input placeholder="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        <input placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        <select value={segmento} onChange={(e) => setSegmento(e.target.value as AtividadeEconomica["segmento"])}>
          <option value="INDUSTRIA">Indústria</option>
          <option value="COMERCIO">Comércio</option>
          <option value="SERVICO">Serviço</option>
          <option value="PUBLICO">Público</option>
        </select>
        <button type="submit">Adicionar</button>
      </form>
      <table className="grade">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th>Segmento</th>
          </tr>
        </thead>
        <tbody>
          {atividades.map((a) => (
            <tr key={a.atividade_economica_id}>
              <td>{a.codigo}</td>
              <td>{a.descricao}</td>
              <td>{a.segmento}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
