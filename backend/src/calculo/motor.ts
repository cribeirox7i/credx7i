// Orquestrador único do motor (8.12): calcularOperacao(entrada) → saída completa,
// pronta pra virar snapshot (RN-19/RN-22) — serialização é responsabilidade de quem
// chama, aqui devolvemos um objeto plano.
import { cronogramaAmortizacao, aplicarCarencia } from "./amortizacao";
import { resolverTaxaPorParcela } from "./inversao";
import { gerarVencimentos } from "./cronograma";
import { calcularIof, ParcelaParaIof } from "./iof";
import { calcularTributos } from "./tributos";
import { somarCustos, calcularDesembolso } from "./custos";
import { calcularCet } from "./cet";
import { EntradaOperacao, ParcelaCalculada, SaidaMotor } from "./tipos";

const TOLERANCIA_CONVERGENCIA_PV = 0.01; // R$0,01
const MAX_ITERACOES_PV = 30;

function resolverTaxa(entrada: EntradaOperacao): { taxa: number; porInversao: boolean } {
  if (entrada.taxaPeriodo !== undefined) {
    return { taxa: entrada.taxaPeriodo, porInversao: false };
  }
  if (entrada.valorParcela === undefined) {
    throw new Error("Informe taxaPeriodo ou valorParcela.");
  }
  if (entrada.sistemaAmortizacao !== "PRICE") {
    throw new Error("Inversão parcela→taxa só se aplica à Price (parcela não é constante na SAC).");
  }
  const resultado = resolverTaxaPorParcela(
    entrada.valorPrincipal,
    entrada.carenciaPeriodos,
    entrada.valorParcela,
    entrada.numeroParcelas,
  );
  if (!resultado.convergiu) {
    throw new Error("Inversão parcela→taxa não convergiu.");
  }
  return { taxa: resultado.raiz, porInversao: true };
}

/** Monta cronograma de amortização + vencimentos + IOF para um dado principal a amortizar. */
function montarComPrincipal(
  pvAmortizado: number,
  i: number,
  entrada: EntradaOperacao,
) {
  const cronogramaAmort = cronogramaAmortizacao(
    entrada.sistemaAmortizacao,
    pvAmortizado,
    i,
    entrada.numeroParcelas,
  );
  const vencimentos = gerarVencimentos(
    entrada.dataLiberacao,
    entrada.numeroParcelas,
    entrada.carenciaPeriodos,
    entrada.feriados,
  );
  const parcelasParaIof: ParcelaParaIof[] = cronogramaAmort.map((p, idx) => ({
    numero: p.numero,
    amortizacao: p.amortizacao,
    diasCorridos: vencimentos[idx].diasCorridos,
  }));
  const iof = calcularIof(pvAmortizado, parcelasParaIof, entrada.iof);
  return { cronogramaAmort, vencimentos, iof };
}

export function calcularOperacao(entrada: EntradaOperacao): SaidaMotor {
  const { taxa: i, porInversao } = resolverTaxa(entrada);

  // pvSolicitado é o que sai de caixa (base_bruta, 8.9); carência e IOF financiado só
  // afetam o saldo amortizado, não o valor efetivamente desembolsado (RN documenta
  // essa leitura como simplificação V1 — ver plano da Fase 3a).
  const pvSolicitado = entrada.valorPrincipal;

  let pvParaAmortizar = pvSolicitado;
  let cronogramaAmort, vencimentos, iof;
  for (let iter = 0; iter < MAX_ITERACOES_PV; iter++) {
    const pvFinanciado = aplicarCarencia(pvParaAmortizar, i, entrada.carenciaPeriodos);
    const montado = montarComPrincipal(pvFinanciado, i, entrada);
    cronogramaAmort = montado.cronogramaAmort;
    vencimentos = montado.vencimentos;
    iof = montado.iof;

    if (entrada.tratamentoIof !== "FINANCIADO") break;
    const proximoPv = pvSolicitado + iof.iofTotal;
    if (Math.abs(proximoPv - pvParaAmortizar) < TOLERANCIA_CONVERGENCIA_PV) break;
    pvParaAmortizar = proximoPv;
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  cronogramaAmort = cronogramaAmort!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  vencimentos = vencimentos!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  iof = iof!;

  const valorPrincipalFinanciado = aplicarCarencia(pvParaAmortizar, i, entrada.carenciaPeriodos);

  const parcelas: ParcelaCalculada[] = cronogramaAmort.map((p, idx) => ({
    numero: p.numero,
    vencimentoNominal: vencimentos[idx].vencimentoNominal,
    vencimento: vencimentos[idx].vencimento,
    diasCorridos: vencimentos[idx].diasCorridos,
    prestacao: p.prestacao,
    amortizacao: p.amortizacao,
    juros: p.juros,
    saldoDevedor: p.saldoDevedor,
    iofPrincipal: iof.porParcela[idx].valor,
  }));

  const jurosTotal = cronogramaAmort.reduce((soma, p) => soma + p.juros, 0);
  const { detalhe: tributosDetalhe, total: tributosTotal } = calcularTributos(
    jurosTotal,
    entrada.tributos,
  );
  const custosTotal = somarCustos(entrada.custos);

  const iofRetido = entrada.tratamentoIof === "DESCONTADO" ? iof.iofTotal : 0;
  const valorDesembolso = calcularDesembolso({
    baseBruta: pvSolicitado,
    iofRetido,
    tributosRetidos: tributosTotal,
    custosRetidos: custosTotal,
  });

  const { cet, convergiu: cetConvergiu } = calcularCet(
    valorDesembolso,
    parcelas.map((p) => p.prestacao),
  );

  return {
    taxaPeriodo: i,
    taxaResolvidaPorInversao: porInversao,
    valorPrincipalFinanciado,
    parcelas,
    iofAdicional: iof.iofAdicional,
    iofPrincipalTotal: iof.iofPrincipalTotal,
    iofTotal: iof.iofTotal,
    tributosDetalhe,
    tributosTotal,
    custosTotal,
    valorDesembolso,
    cet,
    cetConvergiu,
  };
}
