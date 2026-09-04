// Inversão parcela → taxa (8.4): resolve i tal que PMT = PV·i/(1-(1+i)^-n), pelo mesmo
// solver do CET. Só se aplica à Price — na SAC a parcela não é constante, então "por
// parcela" não tem o mesmo sentido (a spec só define a fórmula para Price).
import { pmtPrice, aplicarCarencia } from "./amortizacao";
import { newtonRaphson, ResultadoRaiz } from "./newtonRaphson";

export function resolverTaxaPorParcela(
  pvBase: number,
  carenciaPeriodos: number,
  pmtDesejado: number,
  n: number,
  chuteInicial = 0.02,
): ResultadoRaiz {
  const f = (i: number) => {
    const pv = aplicarCarencia(pvBase, i, carenciaPeriodos);
    return pmtPrice(pv, i, n) - pmtDesejado;
  };
  return newtonRaphson(f, chuteInicial);
}
