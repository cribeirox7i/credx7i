/* eslint-disable camelcase */

exports.shorthands = undefined;

// Tabelas de plataforma (PLANO_TECNICO seção 6.2). Toda tabela de negócio tem
// tenant_id uuid NOT NULL REFERENCES tenants(tenant_id). RLS é aplicado na migration 0004.
exports.up = (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------- usuarios
    CREATE TABLE usuarios (
      user_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id),
      nome              text NOT NULL,
      email             text NOT NULL,
      senha_hash        text,
      status            text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO')),
      deve_trocar_senha boolean NOT NULL DEFAULT false,
      criado_em         timestamptz NOT NULL DEFAULT now()
    );
    -- unicidade de e-mail por tenant, case-insensitive, garantida NO BANCO
    -- (o WebCRM tinha isso só no código e um INSERT direto furava).
    CREATE UNIQUE INDEX usuarios_tenant_email_uk ON usuarios (tenant_id, lower(email));

    -- ---------------------------------------------------------- usuario_sessoes
    CREATE TABLE usuario_sessoes (
      sessao_token text PRIMARY KEY,
      tenant_id    uuid NOT NULL REFERENCES tenants(tenant_id),
      user_id      uuid NOT NULL REFERENCES usuarios(user_id) ON DELETE CASCADE,
      criado_em    timestamptz NOT NULL DEFAULT now(),
      expira_em    timestamptz NOT NULL
    );
    CREATE INDEX usuario_sessoes_tenant_user_idx ON usuario_sessoes (tenant_id, user_id);

    -- ----------------------------------------------------------------- papeis
    CREATE TABLE papeis (
      papel_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
      nome      text NOT NULL
    );
    CREATE UNIQUE INDEX papeis_tenant_nome_uk ON papeis (tenant_id, lower(nome));

    -- ------------------------------------------------------------- permissoes
    CREATE TABLE permissoes (
      tenant_id uuid NOT NULL REFERENCES tenants(tenant_id),
      papel_id  uuid NOT NULL REFERENCES papeis(papel_id) ON DELETE CASCADE,
      recurso   text NOT NULL,
      leitura   boolean NOT NULL DEFAULT false,
      inclusao  boolean NOT NULL DEFAULT false,
      edicao    boolean NOT NULL DEFAULT false,
      exclusao  boolean NOT NULL DEFAULT false,
      PRIMARY KEY (papel_id, recurso)
    );
    CREATE INDEX permissoes_tenant_idx ON permissoes (tenant_id, recurso);

    -- -------------------------------------------------------------- auditoria
    -- Append-only: credx7i_app recebe só SELECT e INSERT (migration 0004).
    CREATE TABLE auditoria (
      auditoria_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
      usuario_id      uuid REFERENCES usuarios(user_id),
      ocorrido_em     timestamptz NOT NULL DEFAULT now(),
      acao            text NOT NULL,
      entidade        text NOT NULL,
      entidade_id     text,
      valor_anterior  jsonb,
      valor_novo      jsonb,
      ip              inet,
      user_agent      text
    );
    CREATE INDEX auditoria_tenant_ocorrido_idx ON auditoria (tenant_id, ocorrido_em DESC);
    CREATE INDEX auditoria_tenant_entidade_idx ON auditoria (tenant_id, entidade, entidade_id);

    -- --------------------------------------------------------------- arquivos
    -- Metadados dos objetos no R2 (PLANO_TECNICO seção 9.3). Uso real na Fase 4.
    CREATE TABLE arquivos (
      arquivo_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(tenant_id),
      chave         text NOT NULL,
      nome_original text NOT NULL,
      mime          text,
      tamanho       bigint,
      status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'orfao')),
      criado_em     timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX arquivos_tenant_chave_uk ON arquivos (tenant_id, chave);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS arquivos;
    DROP TABLE IF EXISTS auditoria;
    DROP TABLE IF EXISTS permissoes;
    DROP TABLE IF EXISTS papeis;
    DROP TABLE IF EXISTS usuario_sessoes;
    DROP TABLE IF EXISTS usuarios;
  `);
};
