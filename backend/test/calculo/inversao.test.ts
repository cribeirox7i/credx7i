import { describe, expect, it } from "vitest";
import { pmtPrice } from "../../src/calculo/amortizacao";
import { resolverTaxaPorParcela } from "../../src/calculo/inversao";

describe("inversão parcela→taxa (8.4)", () => {
  it("recupera a taxa original sem carência", () => {
    const pv = 10000;
    const iOriginal = 0.025;
    const n = 12;
    const pmt = pmtPrice(pv, iOriginal, n);
    const resultado = resolverTaxaPorParcela(pv, 0, pmt, n);
    expect(resultado.convergiu).toBe(true);
    expect(resultado.raiz).toBeCloseTo(iOriginal, 8);
  });

  it("recupera a taxa original com carência (PV capitalizado antes da inversão)", () => {
    const pv = 10000;
    const iOriginal = 0.03;
    const n = 10;
    const carencia = 2;
    const pvComCarencia = pv * Math.pow(1 + iOriginal, carencia);
    const pmt = pmtPrice(pvComCarencia, iOriginal, n);
    const resultado = resolverTaxaPorParcela(pv, carencia, pmt, n);
    expect(resultado.convergiu).toBe(true);
    expect(resultado.raiz).toBeCloseTo(iOriginal, 6);
  });
});
