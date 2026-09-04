// CET (8.10): resolve j tal que desembolso_liquido = Σ PMT_k/(1+j)^k, pelo mesmo
// Newton-Raphson usado na inversão parcela→taxa.
import { newtonRaphson } from "./newtonRaphson";

export function calcularCet(
  desembolsoLiquido: number,
  prestacoes: number[],
  chuteInicial = 0.02,
): { cet: number; convergiu: boolean } {
  const f = (j: number) =>
    prestacoes.reduce((soma, pmt, idx) => soma + pmt / Math.pow(1 + j, idx + 1), 0) -
    desembolsoLiquido;
  const resultado = newtonRaphson(f, chuteInicial);
  return { cet: resultado.raiz, convergiu: resultado.convergiu };
}
