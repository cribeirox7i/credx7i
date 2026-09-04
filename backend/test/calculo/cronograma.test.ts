import { describe, expect, it } from "vitest";
import { ajustarDiaUtil, gerarVencimentos, diasCorridosEntre } from "../../src/calculo/cronograma";

function proximoDiaDaSemana(diaAlvo: number): string {
  // Acha a próxima data (a partir de hoje) cujo getUTCDay() === diaAlvo, em ISO.
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  while (d.getUTCDay() !== diaAlvo) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

describe("ajustarDiaUtil (RF-CAL-10)", () => {
  it("posterga sábado para segunda", () => {
    const sabado = proximoDiaDaSemana(6);
    const ajustado = ajustarDiaUtil(sabado, new Set());
    const dia = new Date(`${ajustado}T12:00:00Z`).getUTCDay();
    expect(dia).toBe(1);
  });

  it("posterga domingo para segunda", () => {
    const domingo = proximoDiaDaSemana(0);
    const ajustado = ajustarDiaUtil(domingo, new Set());
    const dia = new Date(`${ajustado}T12:00:00Z`).getUTCDay();
    expect(dia).toBe(1);
  });

  it("dia útil não muda", () => {
    const terca = proximoDiaDaSemana(2);
    expect(ajustarDiaUtil(terca, new Set())).toBe(terca);
  });

  it("pula feriado em dia útil, indo pro próximo dia útil livre", () => {
    const terca = proximoDiaDaSemana(2);
    const ajustado = ajustarDiaUtil(terca, new Set([terca]));
    expect(ajustado).not.toBe(terca);
    const dia = new Date(`${ajustado}T12:00:00Z`).getUTCDay();
    expect([1, 2, 3, 4, 5]).toContain(dia);
  });

  it("feriado emendado com fim de semana pula os dois", () => {
    const sexta = proximoDiaDaSemana(5);
    const ajustado = ajustarDiaUtil(sexta, new Set([sexta]));
    const dia = new Date(`${ajustado}T12:00:00Z`).getUTCDay();
    expect(dia).toBe(1); // sexta feriado -> sábado -> domingo -> segunda
  });
});

describe("gerarVencimentos (8.11, RN-53)", () => {
  it("venc_nominal_k é sempre a partir de venc_nominal_1, não do vencimento ajustado anterior", () => {
    const vencimentos = gerarVencimentos("2026-01-15", 6, 0, []);
    expect(vencimentos).toHaveLength(6);
    for (let k = 1; k < vencimentos.length; k++) {
      const anterior = new Date(`${vencimentos[k - 1].vencimentoNominal}T12:00:00Z`);
      const atual = new Date(`${vencimentos[k].vencimentoNominal}T12:00:00Z`);
      const diffMeses =
        (atual.getUTCFullYear() - anterior.getUTCFullYear()) * 12 +
        (atual.getUTCMonth() - anterior.getUTCMonth());
      expect(diffMeses).toBe(1);
    }
  });

  it("carência desloca venc_nominal_1 em c períodos adicionais", () => {
    const semCarencia = gerarVencimentos("2026-01-15", 1, 0, []);
    const comCarencia = gerarVencimentos("2026-01-15", 1, 2, []);
    const semData = new Date(`${semCarencia[0].vencimentoNominal}T12:00:00Z`);
    const comData = new Date(`${comCarencia[0].vencimentoNominal}T12:00:00Z`);
    const diffMeses =
      (comData.getUTCFullYear() - semData.getUTCFullYear()) * 12 +
      (comData.getUTCMonth() - semData.getUTCMonth());
    expect(diffMeses).toBe(2);
  });

  it("diasCorridos bate com a diferença entre liberação e vencimento ajustado (RN-55)", () => {
    const vencimentos = gerarVencimentos("2026-01-15", 3, 0, []);
    for (const v of vencimentos) {
      expect(v.diasCorridos).toBe(diasCorridosEntre("2026-01-15", v.vencimento));
    }
  });
});
