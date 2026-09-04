// Solver genérico de raiz, usado pela inversão parcela→taxa (8.4) e pelo CET (8.10) —
// mesma rotina, como pede a spec. Derivada por diferença central (não exige f'(x) analítica).

export interface ResultadoRaiz {
  raiz: number;
  convergiu: boolean;
  iteracoes: number;
}

export function newtonRaphson(
  f: (x: number) => number,
  x0: number,
  opts: { tolerancia?: number; maxIteracoes?: number; passoDerivada?: number } = {},
): ResultadoRaiz {
  const tolerancia = opts.tolerancia ?? 1e-10;
  const maxIteracoes = opts.maxIteracoes ?? 100;
  const h = opts.passoDerivada ?? 1e-6;

  let x = x0;
  for (let iter = 1; iter <= maxIteracoes; iter++) {
    const fx = f(x);
    if (Math.abs(fx) < tolerancia) {
      return { raiz: x, convergiu: true, iteracoes: iter };
    }
    const derivada = (f(x + h) - f(x - h)) / (2 * h);
    if (derivada === 0 || !Number.isFinite(derivada)) {
      return { raiz: x, convergiu: false, iteracoes: iter };
    }
    const proximo = x - fx / derivada;
    if (!Number.isFinite(proximo)) {
      return { raiz: x, convergiu: false, iteracoes: iter };
    }
    if (Math.abs(proximo - x) < tolerancia) {
      return { raiz: proximo, convergiu: true, iteracoes: iter };
    }
    x = proximo;
  }
  return { raiz: x, convergiu: false, iteracoes: maxIteracoes };
}
