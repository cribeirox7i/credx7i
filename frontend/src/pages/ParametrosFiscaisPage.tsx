import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Enquadramento,
  type IofTabelaLinha,
  type TabelaCusto,
  type TipoTomador,
  type TributoTabelaLinha,
} from "../api/client";

const TIPOS_TOMADOR: TipoTomador[] = ["PJ", "PJ_SIMPLES", "MEI", "PF", "COOPERATIVA", "ISENTO"];
const ENQUADRAMENTOS: Enquadramento[] = ["PADRAO", "PNMPO", "RURAL", "HABITACIONAL", "EXPORTACAO", "RENEGOCIACAO"];

export function ParametrosFiscaisPage() {
  const [iofTabela, setIofTabela] = useState<IofTabelaLinha[]>([]);
  const [tributos, setTributos] = useState<TributoTabelaLinha[]>([]);
  const [tabelasCusto, setTabelasCusto] = useState<TabelaCusto[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  // IOF
  const [tipoTomador, setTipoTomador] = useState<TipoTomador>("PJ");
  const [enquadramento, setEnquadramento] = useState<Enquadramento>("PADRAO");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [aliquotaDia, setAliquotaDia] = useState("0.000082");
  const [aliquotaDiaReduzida, setAliquotaDiaReduzida] = useState("0.0000411");
  const [tetoValorReducao, setTetoValorReducao] = useState("30000");
  const [aliquotaAdicional, setAliquotaAdicional] = useState("0.0038");
  const [tetoDias, setTetoDias] = useState("365");
  const [isencaoTotal, setIsencaoTotal] = useState(false);

  // Tributo
  const [tipoTomadorTrib, setTipoTomadorTrib] = useState<TipoTomador>("PJ");
  const [enquadramentoTrib, setEnquadramentoTrib] = useState<Enquadramento>("PADRAO");
  const [tributo, setTributo] = useState<"IRRF" | "PIS" | "COFINS">("IRRF");
  const [aliquotaTrib, setAliquotaTrib] = useState("0.005");
  const [vigenciaInicioTrib, setVigenciaInicioTrib] = useState("");

  // Tabela de custo
  const [nomeTabela, setNomeTabela] = useState("");
  const [itensTexto, setItensTexto] = useState("");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [i, t, c] = await Promise.all([api.iofTabela(), api.tributosTabela(), api.tabelasCusto()]);
      setIofTabela(i);
      setTributos(t);
      setTabelasCusto(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criarLinhaIof(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.criarLinhaIof({
        tipoTomador,
        enquadramento,
        vigenciaInicio,
        aliquotaDia: Number(aliquotaDia),
        aliquotaDiaReduzida: Number(aliquotaDiaReduzida),
        tetoValorReducao: Number(tetoValorReducao),
        aliquotaAdicional: Number(aliquotaAdicional),
        tetoDias: Number(tetoDias),
        isencaoTotal,
      });
      setVigenciaInicio("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    }
  }

  async function criarLinhaTributo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.criarLinhaTributo({
        tipoTomador: tipoTomadorTrib,
        enquadramento: enquadramentoTrib,
        tributo,
        aliquota: Number(aliquotaTrib),
        vigenciaInicio: vigenciaInicioTrib,
      });
      setVigenciaInicioTrib("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    }
  }

  async function criarTabelaCusto(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const itens = itensTexto
        .split("\n")
        .map((linha) => linha.trim())
        .filter(Boolean)
        .map((linha) => {
          const [nome, valor] = linha.split(",").map((s) => s.trim());
          return { nome, valor: Number(valor) };
        });
      await api.criarTabelaCusto({ nome: nomeTabela, itens });
      setNomeTabela("");
      setItensTexto("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    }
  }

  async function marcarPadrao(id: string) {
    setErro(null);
    try {
      await api.marcarTabelaCustoPadrao(id);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao atualizar");
    }
  }

  return (
    <div className="pagina">
      <h1>Parâmetros fiscais</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <h2>Tabela de IOF</h2>
      <form className="form-linha" onSubmit={criarLinhaIof}>
        <select value={tipoTomador} onChange={(e) => setTipoTomador(e.target.value as TipoTomador)}>
          {TIPOS_TOMADOR.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={enquadramento} onChange={(e) => setEnquadramento(e.target.value as Enquadramento)}>
          {ENQUADRAMENTOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} required />
        <input placeholder="Alíq. dia" value={aliquotaDia} onChange={(e) => setAliquotaDia(e.target.value)} />
        <input
          placeholder="Alíq. dia reduzida"
          value={aliquotaDiaReduzida}
          onChange={(e) => setAliquotaDiaReduzida(e.target.value)}
        />
        <input
          placeholder="Teto redução (R$)"
          value={tetoValorReducao}
          onChange={(e) => setTetoValorReducao(e.target.value)}
        />
        <input
          placeholder="Alíq. adicional"
          value={aliquotaAdicional}
          onChange={(e) => setAliquotaAdicional(e.target.value)}
        />
        <input placeholder="Teto dias" value={tetoDias} onChange={(e) => setTetoDias(e.target.value)} />
        <label>
          <input type="checkbox" checked={isencaoTotal} onChange={(e) => setIsencaoTotal(e.target.checked)} />
          Isenção total
        </label>
        <button type="submit">Adicionar</button>
      </form>
      <table className="grade">
        <thead>
          <tr>
            <th>Tomador</th>
            <th>Enquadramento</th>
            <th>Vigência</th>
            <th>Alíq. dia</th>
            <th>Alíq. adicional</th>
            <th>Isento</th>
          </tr>
        </thead>
        <tbody>
          {iofTabela.map((l) => (
            <tr key={l.iof_tabela_id}>
              <td>{l.tipo_tomador}</td>
              <td>{l.enquadramento}</td>
              <td>{l.vigencia_inicio}</td>
              <td>{l.aliquota_dia}</td>
              <td>{l.aliquota_adicional}</td>
              <td>{l.isencao_total ? "sim" : "não"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Tributos sobre a receita</h2>
      <form className="form-linha" onSubmit={criarLinhaTributo}>
        <select value={tipoTomadorTrib} onChange={(e) => setTipoTomadorTrib(e.target.value as TipoTomador)}>
          {TIPOS_TOMADOR.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={enquadramentoTrib} onChange={(e) => setEnquadramentoTrib(e.target.value as Enquadramento)}>
          {ENQUADRAMENTOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select value={tributo} onChange={(e) => setTributo(e.target.value as "IRRF" | "PIS" | "COFINS")}>
          <option value="IRRF">IRRF</option>
          <option value="PIS">PIS</option>
          <option value="COFINS">COFINS</option>
        </select>
        <input placeholder="Alíquota" value={aliquotaTrib} onChange={(e) => setAliquotaTrib(e.target.value)} />
        <input
          type="date"
          value={vigenciaInicioTrib}
          onChange={(e) => setVigenciaInicioTrib(e.target.value)}
          required
        />
        <button type="submit">Adicionar</button>
      </form>
      <table className="grade">
        <thead>
          <tr>
            <th>Tomador</th>
            <th>Enquadramento</th>
            <th>Tributo</th>
            <th>Alíquota</th>
            <th>Vigência</th>
          </tr>
        </thead>
        <tbody>
          {tributos.map((t) => (
            <tr key={t.tributo_receita_tabela_id}>
              <td>{t.tipo_tomador}</td>
              <td>{t.enquadramento}</td>
              <td>{t.tributo}</td>
              <td>{t.aliquota}</td>
              <td>{t.vigencia_inicio}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Tabelas de custo</h2>
      <form className="form-linha" onSubmit={criarTabelaCusto}>
        <input placeholder="Nome da tabela" value={nomeTabela} onChange={(e) => setNomeTabela(e.target.value)} required />
        <textarea
          placeholder={"um item por linha: nome, valor\nex: TED, 10"}
          value={itensTexto}
          onChange={(e) => setItensTexto(e.target.value)}
        />
        <button type="submit">Adicionar</button>
      </form>
      <table className="grade">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Padrão</th>
            <th>Itens</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tabelasCusto.map((t) => (
            <tr key={t.tabela_custo_id}>
              <td>{t.nome}</td>
              <td>{t.padrao ? "sim" : "não"}</td>
              <td>{t.itens.map((i) => `${i.nome}: ${i.valor}`).join(", ")}</td>
              <td>
                {!t.padrao && (
                  <button className="link" onClick={() => marcarPadrao(t.tabela_custo_id)}>
                    marcar como padrão
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
