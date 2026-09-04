import { describe, expect, it } from "vitest";
import { calcularOperacao } from "../../src/calculo/motor";
import { EntradaOperacao } from "../../src/calculo/tipos";

function entradaBase(overrides: Partial<EntradaOperacao> = {}): EntradaOperacao {
  return {
    sistemaAmortizacao: "PRICE",
    valorPrincipal: 10000,
    taxaPeriodo: 0.025,
    numeroParcelas: 12,
    carenciaPeriodos: 0,
    dataLiberacao: "2026-01-15",
    feriados: [],
    tratamentoIof: "DESCONTADO",
    iof: {
      linha: {
        aliquotaDia: 0.000082,
        aliquotaDiaReduzida: 0.0000411,
        tetoValorReducao: 30000,
        aliquotaAdicional: 0.0038,
        tetoDias: 365,
        isencaoTotal: false,
      },
      tipoTomador: "PJ",
      principalReduzidoAcumulado12m: 0,
    },
    tributos: [
      { tributo: "IRRF", aliquota: 0.005 },
      { tributo: "PIS", aliquota: 0.0065 },
      { tributo: "COFINS", aliquota: 0.03 },
    ],
    custos: [
      { nome: "Tarifa de análise", valor: 50 },
      { nome: "TED", valor: 10 },
    ],
    ...overrides,
  };
}

describe("calcularOperacao — integração (8.12)", () => {
  it("produz uma saída completa e internamente consistente", () => {
    const saida = calcularOperacao(entradaBase());

    expect(saida.parcelas).toHaveLength(12);
    expect(saida.parcelas[11].saldoDevedor).toBe(0);
    expect(saida.taxaResolvidaPorInversao).toBe(false);
    expect(saida.taxaPeriodo).toBeCloseTo(0.025, 9);

    expect(saida.iofTotal).toBeGreaterThan(0);
    expect(saida.iofTotal).toBeCloseTo(saida.iofAdicional + saida.iofPrincipalTotal, 9);
    expect(saida.tributosDetalhe).toHaveLength(3);
    expect(saida.tributosTotal).toBeCloseTo(
      saida.tributosDetalhe.reduce((s, d) => s + d.valor, 0),
      9,
    );
    expect(saida.custosTotal).toBeCloseTo(60, 9);

    // DESCONTADO: desembolso = solicitado − IOF − tributos − custos
    const desembolsoEsperado = 10000 - saida.iofTotal - saida.tributosTotal - saida.custosTotal;
    expect(saida.valorDesembolso).toBeCloseTo(desembolsoEsperado, 6);

    expect(saida.cetConvergiu).toBe(true);
    // CET (efetivo, com custos/IOF retidos) tem que ser maior que a taxa nominal.
    expect(saida.cet).toBeGreaterThan(saida.taxaPeriodo);

    // Todo vencimento é dia útil (sem feriados nesta entrada, só checa fim de semana).
    for (const p of saida.parcelas) {
      const dia = new Date(`${p.vencimento}T12:00:00Z`).getUTCDay();
      expect(dia).not.toBe(0);
      expect(dia).not.toBe(6);
    }
  });

  it("FINANCIADO: IOF entra no principal amortizado, não é retido no desembolso", () => {
    const saida = calcularOperacao(entradaBase({ tratamentoIof: "FINANCIADO" }));
    expect(saida.valorPrincipalFinanciado).toBeGreaterThan(10000);
    const desembolsoEsperado = 10000 - saida.tributosTotal - saida.custosTotal;
    expect(saida.valorDesembolso).toBeCloseTo(desembolsoEsperado, 6);
  });

  it("isenção total (RN-48) zera o IOF de ponta a ponta", () => {
    const saida = calcularOperacao(
      entradaBase({
        iof: {
          linha: {
            aliquotaDia: 0,
            aliquotaDiaReduzida: 0,
            tetoValorReducao: 30000,
            aliquotaAdicional: 0,
            tetoDias: 365,
            isencaoTotal: true,
          },
          tipoTomador: "PJ",
          principalReduzidoAcumulado12m: 0,
        },
      }),
    );
    expect(saida.iofTotal).toBe(0);
    expect(saida.parcelas.every((p) => p.iofPrincipal === 0)).toBe(true);
  });

  it("modo por parcela (inversão) recupera a taxa e a parcela informada", () => {
    // Primeiro calcula com taxa direta pra saber qual PMT ela gera.
    const referencia = calcularOperacao(entradaBase());
    const pmtReferencia = referencia.parcelas[0].prestacao;

    const saida = calcularOperacao(
      entradaBase({ taxaPeriodo: undefined, valorParcela: pmtReferencia }),
    );
    expect(saida.taxaResolvidaPorInversao).toBe(true);
    expect(saida.taxaPeriodo).toBeCloseTo(0.025, 6);
    expect(saida.parcelas[0].prestacao).toBeCloseTo(pmtReferencia, 6);
  });

  it("SAC: parcelas decrescentes e saldo final zero", () => {
    const saida = calcularOperacao(entradaBase({ sistemaAmortizacao: "SAC" }));
    expect(saida.parcelas[saida.parcelas.length - 1].saldoDevedor).toBe(0);
    for (let k = 1; k < saida.parcelas.length; k++) {
      expect(saida.parcelas[k].prestacao).toBeLessThan(saida.parcelas[k - 1].prestacao);
    }
  });
});
