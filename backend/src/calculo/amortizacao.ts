// Price e SAC (seções 8.2, 8.3) com carência por capitalização (8.5).

export interface ParcelaAmortizacao {
  numero: number;
  prestacao: number;
  amortizacao: number;
  juros: number;
  saldoDevedor: number;
}

/** PV' = PV · (1+i)^c — juros da carência incorporados ao principal (8.5). */
export function aplicarCarencia(pv: number, i: number, carenciaPeriodos: number): number {
  return pv * Math.pow(1 + i, carenciaPeriodos);
}

/** PMT = PV·i / (1 − (1+i)^-n). No limite i→0, PMT = PV/n. */
export function pmtPrice(pv: number, i: number, n: number): number {
  if (i === 0) return pv / n;
  return (pv * i) / (1 - Math.pow(1 + i, -n));
}

export function cronogramaPrice(pv: number, i: number, n: number): ParcelaAmortizacao[] {
  const pmt = pmtPrice(pv, i, n);
  const parcelas: ParcelaAmortizacao[] = [];
  let saldo = pv;
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    let amortizacao = pmt - juros;
    if (k === n) {
      // Fecha o saldo em zero absorvendo erro de arredondamento de ponto flutuante.
      amortizacao = saldo;
    }
    saldo = saldo - amortizacao;
    parcelas.push({
      numero: k,
      prestacao: k === n ? amortizacao + juros : pmt,
      amortizacao,
      juros,
      saldoDevedor: k === n ? 0 : saldo,
    });
  }
  return parcelas;
}

export function cronogramaSac(pv: number, i: number, n: number): ParcelaAmortizacao[] {
  const amortizacaoFixa = pv / n;
  const parcelas: ParcelaAmortizacao[] = [];
  let saldo = pv;
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    saldo = saldo - amortizacaoFixa;
    const saldoDevedor = k === n ? 0 : saldo;
    parcelas.push({
      numero: k,
      amortizacao: amortizacaoFixa,
      juros,
      prestacao: amortizacaoFixa + juros,
      saldoDevedor,
    });
  }
  return parcelas;
}

export function cronogramaAmortizacao(
  sistema: "PRICE" | "SAC",
  pv: number,
  i: number,
  n: number,
): ParcelaAmortizacao[] {
  return sistema === "PRICE" ? cronogramaPrice(pv, i, n) : cronogramaSac(pv, i, n);
}
