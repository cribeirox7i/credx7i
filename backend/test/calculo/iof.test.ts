import { describe, expect, it } from "vitest";
import { calcularIof } from "../../src/calculo/iof";
import { LinhaIof, ParametrosIof } from "../../src/calculo/tipos";

const linhaPadrao: LinhaIof = {
  aliquotaDia: 0.000082, // 0,0082% a.d. (referência Decreto 6.306/2007)
  aliquotaDiaReduzida: 0.0000411,
  tetoValorReducao: 30000,
  aliquotaAdicional: 0.0038,
  tetoDias: 365,
  isencaoTotal: false,
};

const parcelasBase = [
  { numero: 1, amortizacao: 5000, diasCorridos: 30 },
  { numero: 2, amortizacao: 5000, diasCorridos: 60 },
];

describe("IOF (8.6)", () => {
  it("PJ sem Simples: usa alíquota cheia, adicional sobre o principal total", () => {
    const params: ParametrosIof = {
      linha: linhaPadrao,
      tipoTomador: "PJ",
      principalReduzidoAcumulado12m: 0,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    expect(resultado.iofAdicional).toBeCloseTo(10000 * 0.0038, 9);
    const esperadoP1 = 5000 * 30 * linhaPadrao.aliquotaDia;
    const esperadoP2 = 5000 * 60 * linhaPadrao.aliquotaDia;
    expect(resultado.porParcela[0].valor).toBeCloseTo(esperadoP1, 9);
    expect(resultado.porParcela[1].valor).toBeCloseTo(esperadoP2, 9);
    expect(resultado.iofPrincipalTotal).toBeCloseTo(esperadoP1 + esperadoP2, 9);
    expect(resultado.iofTotal).toBeCloseTo(resultado.iofAdicional + resultado.iofPrincipalTotal, 9);
  });

  it("RN-48: isencaoTotal zera tudo", () => {
    const params: ParametrosIof = {
      linha: { ...linhaPadrao, isencaoTotal: true },
      tipoTomador: "PJ",
      principalReduzidoAcumulado12m: 0,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    expect(resultado.iofTotal).toBe(0);
    expect(resultado.iofAdicional).toBe(0);
    expect(resultado.porParcela.every((p) => p.valor === 0)).toBe(true);
  });

  it("RN-48: alíquota dia e adicional zeradas também zera tudo (ex. PNMPO)", () => {
    const params: ParametrosIof = {
      linha: { ...linhaPadrao, aliquotaDia: 0, aliquotaAdicional: 0 },
      tipoTomador: "PJ",
      principalReduzidoAcumulado12m: 0,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    expect(resultado.iofTotal).toBe(0);
  });

  it("teto de dias (8.6.1): dias além do teto não geram IOF adicional de dia", () => {
    const linhaTetoBaixo: LinhaIof = { ...linhaPadrao, tetoDias: 40 };
    const params: ParametrosIof = {
      linha: linhaTetoBaixo,
      tipoTomador: "PJ",
      principalReduzidoAcumulado12m: 0,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    // parcela 2 tem 60 dias corridos, mas o teto é 40 -> usa 40
    const esperadoP2 = 5000 * 40 * linhaPadrao.aliquotaDia;
    expect(resultado.porParcela[1].valor).toBeCloseTo(esperadoP2, 9);
  });

  it("PJ_SIMPLES: sem consumo prévio da faixa, principal inteiro usa alíquota reduzida", () => {
    const params: ParametrosIof = {
      linha: linhaPadrao,
      tipoTomador: "PJ_SIMPLES",
      principalReduzidoAcumulado12m: 0,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    const esperadoP1 = 5000 * 30 * linhaPadrao.aliquotaDiaReduzida;
    const esperadoP2 = 5000 * 60 * linhaPadrao.aliquotaDiaReduzida;
    expect(resultado.porParcela[0].valor).toBeCloseTo(esperadoP1, 9);
    expect(resultado.porParcela[1].valor).toBeCloseTo(esperadoP2, 9);
    // RN-47: adicional não reduz mesmo no Simples
    expect(resultado.iofAdicional).toBeCloseTo(10000 * 0.0038, 9);
  });

  it("PJ_SIMPLES: faixa parcialmente consumida mistura alíquota normal e reduzida proporcionalmente", () => {
    // L=25000 já consumidos, teto 30000 -> só 5000 dos 10000 desta operação são reduzidos (50%)
    const params: ParametrosIof = {
      linha: linhaPadrao,
      tipoTomador: "PJ_SIMPLES",
      principalReduzidoAcumulado12m: 25000,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    const fracaoReduzida = 0.5;
    const esperadoP1 =
      5000 * fracaoReduzida * 30 * linhaPadrao.aliquotaDiaReduzida +
      5000 * (1 - fracaoReduzida) * 30 * linhaPadrao.aliquotaDia;
    expect(resultado.porParcela[0].valor).toBeCloseTo(esperadoP1, 9);
  });

  it("PJ_SIMPLES: faixa já esgotada (L >= teto) usa alíquota cheia", () => {
    const params: ParametrosIof = {
      linha: linhaPadrao,
      tipoTomador: "PJ_SIMPLES",
      principalReduzidoAcumulado12m: 30000,
    };
    const resultado = calcularIof(10000, parcelasBase, params);
    const esperadoP1 = 5000 * 30 * linhaPadrao.aliquotaDia;
    expect(resultado.porParcela[0].valor).toBeCloseTo(esperadoP1, 9);
  });
});
