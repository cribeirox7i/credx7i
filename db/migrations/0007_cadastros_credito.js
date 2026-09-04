/* eslint-disable camelcase */

exports.shorthands = undefined;

// Fase 3b - núcleo cadastral de cedente/sacado + tabelas de apoio mínimas (RF-CAD-01/02,
// RF-CAD-04/05, RF-CAD-09 parcial: município habilitado, atividade econômica).
//
// municipio_ibge NÃO é FK de banco para municipio_habilitado (a chave lá é composta por
// tenant_id + municipio_ibge, FK direta ficaria destoante do estilo do schema atual) - a
// validação de área habilitada (RN-01) é feita no backend, com uma query explícita.

const TABELAS_ESCRITA_TOTAL = ["municipio_habilitado", "atividade_economica", "cedente", "sacado"];
const TABELAS_APPEND_ONLY = ["cedente_situacao_hist"];

function habilitarRls(pgm, tabela, grant) {
  pgm.sql(`
    ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${tabela}
      USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    GRANT ${grant} ON ${tabela} TO credx7i_app;
  `);
}

exports.up = (pgm) => {
  pgm.sql(`
    -- ------------------------------------------------------- municipio_habilitado
    CREATE TABLE municipio_habilitado (
      municipio_habilitado_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
      municipio_ibge  text NOT NULL,
      nome            text NOT NULL,
      uf              text NOT NULL,
      tipo            text NOT NULL CHECK (tipo IN ('SEDE', 'LIMITROFE')),
      criado_em       timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX municipio_habilitado_tenant_ibge_uk
      ON municipio_habilitado (tenant_id, municipio_ibge);

    -- --------------------------------------------------------- atividade_economica
    CREATE TABLE atividade_economica (
      atividade_economica_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  uuid NOT NULL REFERENCES tenants(tenant_id),
      codigo     text NOT NULL,
      descricao  text NOT NULL,
      segmento   text NOT NULL CHECK (segmento IN ('INDUSTRIA', 'COMERCIO', 'SERVICO', 'PUBLICO')),
      criado_em  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX atividade_economica_tenant_codigo_uk
      ON atividade_economica (tenant_id, codigo);

    -- --------------------------------------------------------------------- cedente
    CREATE TABLE cedente (
      cedente_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
      cnpj           text NOT NULL,
      razao_social   text NOT NULL,
      nome_fantasia  text,
      porte          text CHECK (porte IN ('MEI', 'ME', 'EPP')),
      data_abertura  date,
      atividade_economica_id uuid REFERENCES atividade_economica(atividade_economica_id),
      logradouro     text,
      numero         text,
      complemento    text,
      bairro         text,
      cep            text,
      municipio_ibge text,
      uf             text,
      telefone       text,
      celular        text,
      email          text,
      tipo_tomador   text NOT NULL DEFAULT 'PJ'
                       CHECK (tipo_tomador IN ('PJ', 'PJ_SIMPLES', 'MEI', 'PF', 'COOPERATIVA', 'ISENTO')),
      isencao_base_legal text,
      declara_simples    boolean NOT NULL DEFAULT false,
      declaracao_pnmpo   boolean NOT NULL DEFAULT false,
      receita_bruta      numeric,
      status_cadastro    text NOT NULL DEFAULT 'RASCUNHO'
                       CHECK (status_cadastro IN ('RASCUNHO', 'EM_ANALISE', 'APROVADO', 'REPROVADO', 'SUSPENSO', 'BLOQUEADO')),
      criado_em      timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX cedente_tenant_cnpj_uk ON cedente (tenant_id, cnpj);

    -- ----------------------------------------------------- cedente_situacao_hist
    -- Append-only (RN-11): credx7i_app recebe só SELECT e INSERT.
    CREATE TABLE cedente_situacao_hist (
      cedente_situacao_hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
      cedente_id      uuid NOT NULL REFERENCES cedente(cedente_id),
      status_anterior text,
      status_novo     text NOT NULL,
      observacao      text,
      usuario_id      uuid REFERENCES usuarios(user_id),
      ocorrido_em     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX cedente_situacao_hist_cedente_idx
      ON cedente_situacao_hist (cedente_id, ocorrido_em DESC);

    -- ---------------------------------------------------------------------- sacado
    CREATE TABLE sacado (
      sacado_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
      tipo_documento  text NOT NULL CHECK (tipo_documento IN ('PF', 'PJ')),
      documento       text NOT NULL,
      nome_razao_social text NOT NULL,
      atividade_economica_id uuid REFERENCES atividade_economica(atividade_economica_id),
      logradouro      text,
      numero          text,
      complemento     text,
      bairro          text,
      cep             text,
      municipio_ibge  text,
      uf              text,
      telefone        text,
      celular         text,
      email           text,
      limite_credito  numeric NOT NULL DEFAULT 0,
      bloqueado       boolean NOT NULL DEFAULT false,
      criado_em       timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX sacado_tenant_documento_uk ON sacado (tenant_id, documento);
  `);

  for (const t of TABELAS_ESCRITA_TOTAL) {
    habilitarRls(pgm, t, "SELECT, INSERT, UPDATE, DELETE");
  }
  for (const t of TABELAS_APPEND_ONLY) {
    habilitarRls(pgm, t, "SELECT, INSERT");
  }
};

exports.down = (pgm) => {
  for (const t of [...TABELAS_ESCRITA_TOTAL, ...TABELAS_APPEND_ONLY]) {
    pgm.sql(`
      DROP POLICY IF EXISTS tenant_isolation ON ${t};
      ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;
      REVOKE ALL ON ${t} FROM credx7i_app;
    `);
  }
  pgm.sql(`
    DROP TABLE IF EXISTS sacado;
    DROP TABLE IF EXISTS cedente_situacao_hist;
    DROP TABLE IF EXISTS cedente;
    DROP TABLE IF EXISTS atividade_economica;
    DROP TABLE IF EXISTS municipio_habilitado;
  `);
};
