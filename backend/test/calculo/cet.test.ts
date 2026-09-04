import { describe, expect, it } from "vitest";
import { pmtPrice } from "../../src/calculo/amortizacao";
import { calcularCet } from "../../src/calculo/cet";

describe("CET (8.10)", () => {
  it("sem custos/IOF, CET converge para a própria taxa de juros da operação", () => {
    const pv = 10000;
    const i = 0.025;
    const n = 12;
    const pmt = pmtPrice(pv, i, n);
    const prestacoes = Array(n).fill(pmt);
    const { cet, convergiu } = calcularCet(pv, prestacoes);
    expect(convergiu).toBe(true);
    expect(cet).toBeCloseTo(i, 8);
  });

  it("com desembolso líquido menor (custos retidos), CET > taxa de juros nominal", () => {
    const pv = 10000;
    const i = 0.025;
    const n = 12;
    const pmt = pmtPrice(pv, i, n);
    const prestacoes = Array(n).fill(pmt);
    const desembolsoLiquido = pv - 200; // custo retido de R$200
    const { cet, convergiu } = calcularCet(desembolsoLiquido, prestacoes);
    expect(convergiu).toBe(true);
    expect(cet).toBeGreaterThan(i);
  });
});
