// Custos/tarifas (8.8) e valor líquido a desembolsar (8.9). V1: custos sempre retidos
// no desembolso (diluição nas parcelas fica de TODO — ver plano da Fase 3a).
import { ItemCusto } from "./tipos";

export function somarCustos(itens: ItemCusto[]): number {
  return itens.reduce((soma, item) => soma + item.valor, 0);
}

export function calcularDesembolso(params: {
  baseBruta: number;
  iofRetido: number;
  tributosRetidos: number;
  custosRetidos: number;
  recomprasLiquidadas?: number;
}): number {
  return (
    params.baseBruta -
    params.iofRetido -
    params.tributosRetidos -
    params.custosRetidos -
    (params.recomprasLiquidadas ?? 0)
  );
}
