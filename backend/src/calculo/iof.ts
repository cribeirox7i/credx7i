// IOF prefixado (8.6.1 a 8.6.4): base + adicional, redução do Simples (8.6.3), isenção
// total / alíquota zero (RN-48). Pós-fixado (8.13), prorrogação/renegociação (8.6.5) e
// tipos de tomador além de PJ/PJ_SIMPLES ficam fora do V1 (tratados como alíquota cheia,
// sem redução).
import { ParametrosIof } from "./tipos";

export interface ParcelaParaIof {
  numero: number;
  amortizacao: number;
  diasCorridos: number;
}

export interface IofParcela {
  numero: number;
  valor: number;
}

export interface ResultadoIof {
  iofAdicional: number;
  iofPrincipalTotal: number;
  iofTotal: number;
  porParcela: IofParcela[];
}

const IOF_ZERADO: Omit<ResultadoIof, "porParcela"> = {
  iofAdicional: 0,
  iofPrincipalTotal: 0,
  iofTotal: 0,
};

/** RN-48: isenção total ou (α_dia=0 e α_adicional=0) ⇒ IOF zero. */
function isento(params: ParametrosIof): boolean {
  const { linha } = params;
  return linha.isencaoTotal || (linha.aliquotaDia === 0 && linha.aliquotaAdicional === 0);
}

export function calcularIof(
  principalTotal: number,
  parcelas: ParcelaParaIof[],
  params: ParametrosIof,
): ResultadoIof {
  if (isento(params)) {
    return { ...IOF_ZERADO, porParcela: parcelas.map((p) => ({ numero: p.numero, valor: 0 })) };
  }

  const { linha, tipoTomador, principalReduzidoAcumulado12m } = params;

  // RN-47: a alíquota adicional não tem redução pelo Simples, incide integral.
  const iofAdicional = principalTotal * linha.aliquotaAdicional;

  // 8.6.3: fração do principal desta operação que ainda cabe na faixa reduzida.
  let fracaoReduzida = 0;
  if (tipoTomador === "PJ_SIMPLES" && principalTotal > 0) {
    const parcelaReduzida = Math.max(
      0,
      Math.min(principalTotal, linha.tetoValorReducao - principalReduzidoAcumulado12m),
    );
    fracaoReduzida = parcelaReduzida / principalTotal;
  }

  const porParcela: IofParcela[] = parcelas.map((p) => {
    const diasEfetivos = Math.min(p.diasCorridos, linha.tetoDias);
    const baseReduzida = p.amortizacao * fracaoReduzida;
    const baseNormal = p.amortizacao * (1 - fracaoReduzida);
    const valor =
      baseReduzida * diasEfetivos * linha.aliquotaDiaReduzida +
      baseNormal * diasEfetivos * linha.aliquotaDia;
    return { numero: p.numero, valor };
  });

  const iofPrincipalTotal = porParcela.reduce((soma, p) => soma + p.valor, 0);

  return {
    iofAdicional,
    iofPrincipalTotal,
    iofTotal: iofAdicional + iofPrincipalTotal,
    porParcela,
  };
}
