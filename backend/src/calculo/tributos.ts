// Tributos sobre a receita da operação (8.7): aplicação genérica base×alíquota, sem
// nada fixado em código (RN-17/RN-45) — as linhas (tributo + alíquota vigente) vêm de
// fora. V1: base única = juros totais da operação (aproximação de "receita"); base por
// tributo diferenciada fica pra quando a decisão de negócio da seção 19 (item 7) fechar.
import { LinhaTributo, TributoDetalhe } from "./tipos";

export function calcularTributos(base: number, linhas: LinhaTributo[]): {
  detalhe: TributoDetalhe[];
  total: number;
} {
  const detalhe = linhas.map((linha) => ({
    tributo: linha.tributo,
    base,
    aliquota: linha.aliquota,
    valor: base * linha.aliquota,
  }));
  const total = detalhe.reduce((soma, d) => soma + d.valor, 0);
  return { detalhe, total };
}
