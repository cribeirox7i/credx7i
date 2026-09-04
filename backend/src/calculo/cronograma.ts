// Cronograma de vencimentos com ajuste de dia não útil (8.11, RN-53 a RN-56). Datas em
// UTC puro (meio-dia) pra não sofrer de virada de DST/timezone local do processo.

function paraData(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarMeses(iso: string, meses: number): string {
  const data = paraData(iso);
  const diaOriginal = data.getUTCDate();
  data.setUTCMonth(data.getUTCMonth() + meses);
  // Se o mês de destino é mais curto (ex. 31/jan + 1 mês), o JS já rola pro mês
  // seguinte — não é o comportamento desejado; força o último dia do mês de destino.
  if (data.getUTCDate() !== diaOriginal) {
    data.setUTCDate(0);
  }
  return paraIso(data);
}

function ehFimDeSemana(data: Date): boolean {
  const dia = data.getUTCDay();
  return dia === 0 || dia === 6;
}

/** Posterga pro próximo dia útil (convenção "seguinte", RF-CAL-10). */
export function ajustarDiaUtil(iso: string, feriados: Set<string>): string {
  let data = paraData(iso);
  while (ehFimDeSemana(data) || feriados.has(paraIso(data))) {
    data = new Date(data.getTime() + 24 * 60 * 60 * 1000);
  }
  return paraIso(data);
}

export function diasCorridosEntre(inicioIso: string, fimIso: string): number {
  const inicio = paraData(inicioIso).getTime();
  const fim = paraData(fimIso).getTime();
  return Math.round((fim - inicio) / (24 * 60 * 60 * 1000));
}

export interface VencimentoParcela {
  numero: number;
  vencimentoNominal: string;
  vencimento: string;
  diasCorridos: number;
}

/**
 * venc_nominal_1 = liberação + 1 período + carência; venc_nominal_k sempre a partir de
 * venc_nominal_1 (RN-53 — o ajuste de uma parcela não desloca as seguintes).
 */
export function gerarVencimentos(
  dataLiberacao: string,
  n: number,
  carenciaPeriodos: number,
  feriadosIso: string[],
): VencimentoParcela[] {
  const feriados = new Set(feriadosIso);
  const vencimentoNominal1 = somarMeses(dataLiberacao, 1 + carenciaPeriodos);
  const resultado: VencimentoParcela[] = [];
  for (let k = 1; k <= n; k++) {
    const vencimentoNominal = somarMeses(vencimentoNominal1, k - 1);
    const vencimento = ajustarDiaUtil(vencimentoNominal, feriados);
    resultado.push({
      numero: k,
      vencimentoNominal,
      vencimento,
      diasCorridos: diasCorridosEntre(dataLiberacao, vencimento),
    });
  }
  return resultado;
}
