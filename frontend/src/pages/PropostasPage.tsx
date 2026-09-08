import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Cedente,
  type Enquadramento,
  type Proposta,
  type ResultadoSimulacao,
  type TabelaCusto,
} from "../api/client";

const ENQUADRAMENTOS: Enquadramento[] = ["PADRAO", "PNMPO", "RURAL", "HABITACIONAL", "EXPORTACAO", "RENEGOCIACAO"];

type ModoTaxa = "TAXA" | "PARCELA";

export function PropostasPage() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [tabelasCusto, setTabelasCusto] = useState<TabelaCusto[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [cedenteId, setCedenteId] = useState("");
  const [modalidade, setModalidade] = useState("Capital de giro");
  const [sistemaAmortizacao, setSistemaAmortizacao] = useState<"PRICE" | "SAC">("PRICE");
  const [modoTaxa, setModoTaxa] = useState<ModoTaxa>("TAXA");
  const [taxaPrefixada, setTaxaPrefixada] = useState("0.025");
  const [valorParcelaInformado, setValorParcelaInformado] = useState("");
  const [valorSolicitado, setValorSolicitado] = useState("10000");
  const [nParcelas, setNParcelas] = useState("12");
  const [carenciaPeriodos, setCarenciaPeriodos] = useState("0");
  const [dataLiberacao, setDataLiberacao] = useState("");
  const [tratamentoIof, setTratamentoIof] = useState<"FINANCIADO" | "DESCONTADO">("DESCONTADO");
  const [enquadramentoIof, setEnquadramentoIof] = useState<Enquadramento>("PADRAO");
  const [tabelaCustoId, setTabelaCustoId] = useState("");
  const [criando, setCriando] = useState(false);

  const [simulando, setSimulando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoSimulacao>>({});
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [p, c, t] = await Promise.all([api.propostas(), api.cedentes(), api.tabelasCusto()]);
      setPropostas(p);
      setCedentes(c);
      setTabelasCusto(t);
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
      await api.criarProposta({
        cedenteId,
        modalidade,
        sistemaAmortizacao,
        taxaPrefixada: modoTaxa === "TAXA" ? Number(taxaPrefixada) : null,
        valorParcelaInformado: modoTaxa === "PARCELA" ? Number(valorParcelaInformado) : null,
        valorSolicitado: Number(valorSolicitado),
        nParcelas: Number(nParcelas),
        carenciaPeriodos: Number(carenciaPeriodos),
        dataLiberacao,
        tratamentoIof,
        enquadramentoIof,
        tabelaCustoId: tabelaCustoId || null,
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    } finally {
      setCriando(false);
    }
  }

  async function simular(p: Proposta) {
    setErro(null);
    setSimulando(p.proposta_id);
    try {
      const resultado = await api.simularProposta(p.proposta_id);
      setResultados((r) => ({ ...r, [p.proposta_id]: resultado }));
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao simular");
    } finally {
      setSimulando(null);
    }
  }

  async function deferir(p: Proposta) {
    setErro(null);
    setDecidindo(p.proposta_id);
    try {
      await api.deferirProposta(p.proposta_id);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao deferir");
    } finally {
      setDecidindo(null);
    }
  }

  async function reprovar(p: Proposta) {
    setErro(null);
    setDecidindo(p.proposta_id);
    try {
      await api.reprovarProposta(p.proposta_id, motivos[p.proposta_id] || undefined);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao reprovar");
    } finally {
      setDecidindo(null);
    }
  }

  const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="pagina">
      <h1>Propostas</h1>
      {erro && <div className="banner-erro">{erro}</div>}

      <form className="form-linha" onSubmit={criar}>
        <select value={cedenteId} onChange={(e) => setCedenteId(e.target.value)} required>
          <option value="">Cedente...</option>
          {cedentes.map((c) => (
            <option key={c.cedente_id} value={c.cedente_id}>
              {c.razao_social}
            </option>
          ))}
        </select>
        <input placeholder="Modalidade" value={modalidade} onChange={(e) => setModalidade(e.target.value)} required />
        <select value={sistemaAmortizacao} onChange={(e) => setSistemaAmortizacao(e.target.value as "PRICE" | "SAC")}>
          <option value="PRICE">Price</option>
          <option value="SAC">SAC</option>
        </select>
        <select value={modoTaxa} onChange={(e) => setModoTaxa(e.target.value as ModoTaxa)}>
          <option value="TAXA">Por taxa</option>
          <option value="PARCELA">Por parcela (inversão)</option>
        </select>
        {modoTaxa === "TAXA" ? (
          <input
            placeholder="Taxa por período (ex. 0.025)"
            value={taxaPrefixada}
            onChange={(e) => setTaxaPrefixada(e.target.value)}
          />
        ) : (
          <input
            placeholder="Valor da parcela"
            value={valorParcelaInformado}
            onChange={(e) => setValorParcelaInformado(e.target.value)}
          />
        )}
        <input
          placeholder="Valor solicitado"
          value={valorSolicitado}
          onChange={(e) => setValorSolicitado(e.target.value)}
          required
        />
        <input placeholder="Nº parcelas" value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} required />
        <input placeholder="Carência" value={carenciaPeriodos} onChange={(e) => setCarenciaPeriodos(e.target.value)} />
        <input type="date" value={dataLiberacao} onChange={(e) => setDataLiberacao(e.target.value)} required />
        <select value={tratamentoIof} onChange={(e) => setTratamentoIof(e.target.value as "FINANCIADO" | "DESCONTADO")}>
          <option value="DESCONTADO">IOF descontado</option>
          <option value="FINANCIADO">IOF financiado</option>
        </select>
        <select value={enquadramentoIof} onChange={(e) => setEnquadramentoIof(e.target.value as Enquadramento)}>
          {ENQUADRAMENTOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select value={tabelaCustoId} onChange={(e) => setTabelaCustoId(e.target.value)}>
          <option value="">(tabela de custo padrão)</option>
          {tabelasCusto.map((t) => (
            <option key={t.tabela_custo_id} value={t.tabela_custo_id}>
              {t.nome}
            </option>
          ))}
        </select>
        <button type="submit" disabled={criando}>
          {criando ? "..." : "Criar proposta"}
        </button>
      </form>

      <table className="grade">
        <thead>
          <tr>
            <th>Cedente</th>
            <th>Modalidade</th>
            <th>Sistema</th>
            <th>Valor</th>
            <th>Parcelas</th>
            <th>Status</th>
            <th>Simulada em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {propostas.map((p) => (
            <tr key={p.proposta_id}>
              <td>{p.cedente_razao_social}</td>
              <td>{p.modalidade}</td>
              <td>{p.sistema_amortizacao}</td>
              <td>{moeda(Number(p.valor_solicitado))}</td>
              <td>{p.n_parcelas}</td>
              <td>{p.status}</td>
              <td>{p.simulado_em ? new Date(p.simulado_em).toLocaleString("pt-BR") : "-"}</td>
              <td>
                {p.status === "RASCUNHO" ? (
                  <>
                    <button className="link" onClick={() => simular(p)} disabled={simulando === p.proposta_id}>
                      {simulando === p.proposta_id ? "simulando..." : "simular"}
                    </button>
                    {" · "}
                    <button
                      className="link"
                      onClick={() => deferir(p)}
                      disabled={decidindo === p.proposta_id || !p.simulado_em}
                      title={!p.simulado_em ? "simule antes de deferir" : undefined}
                    >
                      deferir
                    </button>
                    {" · "}
                    <input
                      placeholder="motivo (se reprovar)"
                      value={motivos[p.proposta_id] ?? ""}
                      onChange={(e) => setMotivos((m) => ({ ...m, [p.proposta_id]: e.target.value }))}
                      style={{ width: 140 }}
                    />
                    <button className="link" onClick={() => reprovar(p)} disabled={decidindo === p.proposta_id}>
                      reprovar
                    </button>
                  </>
                ) : (
                  <span>
                    {p.decidido_em && new Date(p.decidido_em).toLocaleString("pt-BR")}
                    {p.motivo_reprovacao && ` — ${p.motivo_reprovacao}`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {Object.entries(resultados).map(([propostaId, r]) => (
        <div key={propostaId} className="pagina">
          <h2>Resultado da simulação</h2>
          <p>
            Taxa: {(r.taxaPeriodo * 100).toFixed(4)}% {r.taxaResolvidaPorInversao ? "(resolvida por inversão)" : ""}
            {" · "}Desembolso: {moeda(r.valorDesembolso)} · CET: {(r.cet * 100).toFixed(4)}%
            {!r.cetConvergiu && " (não convergiu)"}
          </p>
          <p>
            IOF total: {moeda(r.iofTotal)} · Tributos: {moeda(r.tributosTotal)} · Custos: {moeda(r.custosTotal)}
          </p>
          <table className="grade">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Vencimento</th>
                <th>Prestação</th>
                <th>Amortização</th>
                <th>Juros</th>
                <th>Saldo devedor</th>
                <th>IOF</th>
              </tr>
            </thead>
            <tbody>
              {r.parcelas.map((p) => (
                <tr key={p.numero}>
                  <td>{p.numero}</td>
                  <td>{p.vencimento}</td>
                  <td>{moeda(p.prestacao)}</td>
                  <td>{moeda(p.amortizacao)}</td>
                  <td>{moeda(p.juros)}</td>
                  <td>{moeda(p.saldoDevedor)}</td>
                  <td>{moeda(p.iofPrincipal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
