import { describe, expect, it } from "vitest";
import { cronogramaPrice, cronogramaSac, pmtPrice, aplicarCarencia } from "../../src/calculo/amortizacao";

describe("Price", () => {
  it("PMT bate com a fórmula fechada (PV=10000, i=2%, n=12)", () => {
    // PMT = 10000 * 0.02 / (1 - 1.02^-12) ≈ 945,596...
    const pmt = pmtPrice(10000, 0.02, 12);
    expect(pmt).toBeCloseTo(945.5959, 3);
  });

  it("saldo devedor fecha em zero e a soma de amortizações reconstrói o PV", () => {
    const parcelas = cronogramaPrice(10000, 0.02, 12);
    expect(parcelas).toHaveLength(12);
    expect(parcelas[11].saldoDevedor).toBe(0);
    const somaAmortizacao = parcelas.reduce((s, p) => s + p.amortizacao, 0);
    expect(somaAmortizacao).toBeCloseTo(10000, 6);
  });

  it("prestação é constante (exceto ajuste de arredondamento na última)", () => {
    const parcelas = cronogramaPrice(10000, 0.02, 12);
    const pmt = parcelas[0].prestacao;
    for (const p of parcelas.slice(0, -1)) {
      expect(p.prestacao).toBeCloseTo(pmt, 6);
    }
  });

  it("total de juros = n·PMT − PV", () => {
    const parcelas = cronogramaPrice(10000, 0.02, 12);
    const pmt = pmtPrice(10000, 0.02, 12);
    const somaJuros = parcelas.reduce((s, p) => s + p.juros, 0);
    expect(somaJuros).toBeCloseTo(12 * pmt - 10000, 3);
  });

  it("taxa zero: PMT = PV/n", () => {
    expect(pmtPrice(12000, 0, 12)).toBeCloseTo(1000, 9);
  });
});

describe("SAC", () => {
  it("amortização constante, parcela decrescente, saldo fecha em zero", () => {
    const parcelas = cronogramaSac(12000, 0.02, 12);
    expect(parcelas).toHaveLength(12);
    for (const p of parcelas) {
      expect(p.amortizacao).toBeCloseTo(1000, 6);
    }
    expect(parcelas[11].saldoDevedor).toBe(0);
    for (let k = 1; k < parcelas.length; k++) {
      expect(parcelas[k].prestacao).toBeLessThan(parcelas[k - 1].prestacao);
    }
  });

  it("total de juros = i·PV·(n+1)/2", () => {
    const pv = 12000;
    const i = 0.02;
    const n = 12;
    const parcelas = cronogramaSac(pv, i, n);
    const somaJuros = parcelas.reduce((s, p) => s + p.juros, 0);
    expect(somaJuros).toBeCloseTo((i * pv * (n + 1)) / 2, 6);
  });
});

describe("carência (8.5)", () => {
  it("PV' = PV·(1+i)^c", () => {
    expect(aplicarCarencia(10000, 0.02, 3)).toBeCloseTo(10000 * Math.pow(1.02, 3), 9);
  });

  it("sem carência, PV' = PV", () => {
    expect(aplicarCarencia(10000, 0.02, 0)).toBe(10000);
  });
});
