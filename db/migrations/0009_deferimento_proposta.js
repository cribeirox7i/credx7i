/* eslint-disable camelcase */

exports.shorthands = undefined;

// Fase 3d (fatiada) - deferimento simples da proposta: só o que não depende de
// decisão de negócio pendente (score/rating/CAR/alçada ficam pra quando essas
// decisões fecharem - ver plano da fase). RN-19 (snapshot imutável) e RN-10
// (só defere pra cedente APROVADO) são aplicadas no backend, não aqui.
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE proposta DROP CONSTRAINT proposta_status_check;
    ALTER TABLE proposta ADD CONSTRAINT proposta_status_check
      CHECK (status IN ('RASCUNHO', 'DEFERIDA', 'REPROVADA'));

    ALTER TABLE proposta ADD COLUMN decidido_em timestamptz;
    ALTER TABLE proposta ADD COLUMN decidido_por uuid REFERENCES usuarios(user_id);
    ALTER TABLE proposta ADD COLUMN motivo_reprovacao text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE proposta DROP COLUMN IF EXISTS motivo_reprovacao;
    ALTER TABLE proposta DROP COLUMN IF EXISTS decidido_por;
    ALTER TABLE proposta DROP COLUMN IF EXISTS decidido_em;

    ALTER TABLE proposta DROP CONSTRAINT proposta_status_check;
    ALTER TABLE proposta ADD CONSTRAINT proposta_status_check CHECK (status = 'RASCUNHO');
  `);
};
