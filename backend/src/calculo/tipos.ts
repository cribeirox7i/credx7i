// Tipos do "contrato do motor" (spec seção 8.12). Motor puro: sem I/O, sem tenant,
// sem Date mutável — todas as datas trafegam como string ISO (YYYY-MM-DD).

export type SistemaAmortizacao = "PRICE" | "SAC";
export type TratamentoIof = "FINANCIADO" | "DESCONTADO";
export type TipoTomador = "PJ" | "PJ_SIMPLES" | "MEI" | "PF" | "COOPERATIVA" | "ISENTO";

export interface LinhaIof {
  aliquotaDia: number;
  aliquotaDiaReduzida: number;
  tetoValorReducao: number;
  aliquotaAdicional: number;
  tetoDias: number;
  isencaoTotal: boolean;
}

export interface ParametrosIof {
  linha: LinhaIof;
  tipoTomador: TipoTomador;
  /** Principal já operado pelo cedente nos últimos 12 meses com alíquota reduzida (L, seção 8.6.3). */
  principalReduzidoAcumulado12m: number;
}

export type NomeTributo = "IRRF" | "PIS" | "COFINS";

export interface LinhaTributo {
  tributo: NomeTributo;
  aliquota: number;
}

export interface ItemCusto {
  nome: string;
  valor: number;
}

export interface EntradaOperacao {
  sistemaAmortizacao: SistemaAmortizacao;
  /** PV: principal solicitado, antes de carência e de IOF financiado. */
  valorPrincipal: number;
  /** i por período. Informar OU `valorParcela` (inversão, seção 8.4) — nunca os dois. */
  taxaPeriodo?: number;
  valorParcela?: number;
  numeroParcelas: number;
  carenciaPeriodos: number;
  dataLiberacao: string;
  /** Feriados (qualquer abrangência já resolvida por quem chama) em ISO YYYY-MM-DD. */
  feriados: string[];
  tratamentoIof: TratamentoIof;
  iof: ParametrosIof;
  tributos: LinhaTributo[];
  custos: ItemCusto[];
}

export interface ParcelaCalculada {
  numero: number;
  vencimentoNominal: string;
  vencimento: string;
  diasCorridos: number;
  prestacao: number;
  amortizacao: number;
  juros: number;
  saldoDevedor: number;
  iofPrincipal: number;
}

export interface TributoDetalhe {
  tributo: NomeTributo;
  base: number;
  aliquota: number;
  valor: number;
}

export interface SaidaMotor {
  taxaPeriodo: number;
  taxaResolvidaPorInversao: boolean;
  valorPrincipalFinanciado: number;
  parcelas: ParcelaCalculada[];
  iofAdicional: number;
  iofPrincipalTotal: number;
  iofTotal: number;
  tributosDetalhe: TributoDetalhe[];
  tributosTotal: number;
  custosTotal: number;
  valorDesembolso: number;
  cet: number;
  cetConvergiu: boolean;
}
