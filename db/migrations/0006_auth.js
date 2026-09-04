/* eslint-disable camelcase */

exports.shorthands = undefined;

// Fase 2 - autenticação própria (e-mail + senha, sessão em tabela, token opaco).
exports.up = (pgm) => {
  pgm.sql(`
    -- papel ganha a flag de administrador do tenant (gerencia usuários, papéis,
    -- permissões). É o que resolve o bootstrap: o primeiro usuário recebe um papel
    -- com admin_tenant = true.
    ALTER TABLE papeis ADD COLUMN admin_tenant boolean NOT NULL DEFAULT false;

    -- usuario -> papel (um papel por usuário; permissões vêm do papel).
    ALTER TABLE usuarios ADD COLUMN papel_id uuid REFERENCES papeis(papel_id);

    -- convite / redefinição de senha: token de uso único com validade.
    ALTER TABLE usuarios ADD COLUMN convite_token text;
    ALTER TABLE usuarios ADD COLUMN convite_expira_em timestamptz;
    CREATE UNIQUE INDEX usuarios_convite_token_uk ON usuarios (convite_token)
      WHERE convite_token IS NOT NULL;

    -- Rate limit das rotas de login/redefinição. Chaveado por IP, NÃO por tenant:
    -- alguém martelando login de vários tenants do mesmo IP tem que ser barrado igual.
    -- Tabela de plataforma, sem RLS por tenant (como 'tenants').
    CREATE TABLE rate_limit (
      escopo        text NOT NULL,
      chave         text NOT NULL,
      janela_inicio timestamptz NOT NULL,
      contador      integer NOT NULL DEFAULT 0,
      PRIMARY KEY (escopo, chave, janela_inicio)
    );
    CREATE INDEX rate_limit_janela_idx ON rate_limit (janela_inicio);
    GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit TO credx7i_app;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS rate_limit;
    DROP INDEX IF EXISTS usuarios_convite_token_uk;
    ALTER TABLE usuarios DROP COLUMN IF EXISTS convite_expira_em;
    ALTER TABLE usuarios DROP COLUMN IF EXISTS convite_token;
    ALTER TABLE usuarios DROP COLUMN IF EXISTS papel_id;
    ALTER TABLE papeis DROP COLUMN IF EXISTS admin_tenant;
  `);
};
