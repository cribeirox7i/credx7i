/* eslint-disable camelcase */

exports.shorthands = undefined;

// Fase 3c - parâmetros fiscais versionados por vigência (RF-PAR-07/08) e proposta de
// crédito (RF-ANA-01), a primeira a ligar cedente + motor de cálculo (backend/src/calculo).

const DOMINIO_TIPO_TOMADOR = "CHECK (tipo_tomador IN ('PJ', 'PJ_SIMPLES', 'MEI', 'PF', 'COOPERATIVA', 'ISENTO'))";
const DOMINIO_ENQUADRAMENTO =
  "CHECK (enquadramento IN ('PADRAO', 'PNMPO', 'RURAL', 'HABITACIONAL', 'EXPORTACAO', 'RENEGOCIACAO'))";

const TABELAS_ESCRITA_TOTAL = [
  "iof_tabela",
  "tributo_receita_tabela",
  "tabela_custo",
  "tabela_custo_item",
  "proposta",
];

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
    -- ------------------------------------------------------------------ iof_tabela
    CREATE TABLE iof_tabela (
      iof_tabela_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
      tipo_tomador   text NOT NULL ${DOMINIO_TIPO_TOMADOR},
      enquadramento  text NOT NULL ${DOMINIO_ENQUADRAMENTO},
      vigencia_inicio date NOT NULL,
      vigencia_fim    date,
      aliquota_dia            numeric NOT NULL DEFAULT 0,
      aliquota_dia_reduzida   numeric NOT NULL DEFAULT 0,
      teto_valor_reducao      numeric NOT NULL DEFAULT 0,
      aliquota_adicional      numeric NOT NULL DEFAULT 0,
      teto_dias               integer NOT NULL DEFAULT 365,
      isencao_total           boolean NOT NULL DEFAULT false,
      criado_em      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX iof_tabela_resolucao_idx
      ON iof_tabela (tenant_id, tipo_tomador, enquadramento, vigencia_inicio DESC);

    -- ---------------------------------------------------------- tributo_receita_tabela
    CREATE TABLE tributo_receita_tabela (
      tributo_receita_tabela_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenants(tenant_id),
      tipo_tomador   text NOT NULL ${DOMINIO_TIPO_TOMADOR},
      enquadramento  text NOT NULL ${DOMINIO_ENQUADRAMENTO},
      tributo        text NOT NULL CHECK (tributo IN ('IRRF', 'PIS', 'COFINS')),
      aliquota       numeric NOT NULL DEFAULT 0,
      vigencia_inicio date NOT NULL,
      vigencia_fim    date,
      criado_em      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX tributo_receita_tabela_resolucao_idx
      ON tributo_receita_tabela (tenant_id, tipo_tomador, enquadramento, vigencia_inicio DESC);

    -- ------------------------------------------------------------------ tabela_custo
    CREATE TABLE tabela_custo (
      tabela_custo_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  uuid NOT NULL REFERENCES tenants(tenant_id),
      nome       text NOT NULL,
      padrao     boolean NOT NULL DEFAULT false,
      criado_em  timestamptz NOT NULL DEFAULT now()
    );

    -- ------------------------------------------------------------- tabela_custo_item
    CREATE TABLE tabela_custo_item (
      tabela_custo_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       uuid NOT NULL REFERENCES tenants(tenant_id),
      tabela_custo_id uuid NOT NULL REFERENCES tabela_custo(tabela_custo_id) ON DELETE CASCADE,
      nome            text NOT NULL,
      valor           numeric NOT NULL DEFAULT 0,
      criado_em       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX tabela_custo_item_tabela_idx ON tabela_custo_item (tabela_custo_id);

    -- ------------------------------------------------------------------------ proposta
    CREATE TABLE proposta (
      proposta_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenants(tenant_id),
      cedente_id    uuid NOT NULL REFERENCES cedente(cedente_id),
      modalidade    text NOT NULL,
      sistema_amortizacao text NOT NULL CHECK (sistema_amortizacao IN ('PRICE', 'SAC')),
      taxa_prefixada         numeric,
      valor_parcela_informado numeric,
      valor_solicitado       numeric NOT NULL,
      n_parcelas             integer NOT NULL,
      carencia_periodos      integer NOT NULL DEFAULT 0,
      data_liberacao         date NOT NULL,
      tratamento_iof  text NOT NULL CHECK (tratamento_iof IN ('FINANCIADO', 'DESCONTADO')),
      enquadramento_iof text NOT NULL DEFAULT 'PADRAO'
        CHECK (enquadramento_iof IN ('PADRAO', 'PNMPO', 'RURAL', 'HABITACIONAL', 'EXPORTACAO', 'RENEGOCIACAO')),
      tabela_custo_id uuid REFERENCES tabela_custo(tabela_custo_id),
      -- único estado nesta fase (3c) - o domínio cresce quando a 3d trouxer o fluxo
      -- de comitê/deferimento (RF-ANA-05/06/07), não é enfeite.
      status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status = 'RASCUNHO'),
      simulacao_snapshot jsonb,
      simulado_em    timestamptz,
      criado_em      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX proposta_tenant_cedente_idx ON proposta (tenant_id, cedente_id);
  `);

  for (const t of TABELAS_ESCRITA_TOTAL) {
    habilitarRls(pgm, t, "SELECT, INSERT, UPDATE, DELETE");
  }
};

exports.down = (pgm) => {
  for (const t of TABELAS_ESCRITA_TOTAL) {
    pgm.sql(`
      DROP POLICY IF EXISTS tenant_isolation ON ${t};
      ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;
      REVOKE ALL ON ${t} FROM credx7i_app;
    `);
  }
  pgm.sql(`
    DROP TABLE IF EXISTS proposta;
    DROP TABLE IF EXISTS tabela_custo_item;
    DROP TABLE IF EXISTS tabela_custo;
    DROP TABLE IF EXISTS tributo_receita_tabela;
    DROP TABLE IF EXISTS iof_tabela;
  `);
};
