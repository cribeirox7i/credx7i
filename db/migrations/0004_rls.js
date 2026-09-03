/* eslint-disable camelcase */

exports.shorthands = undefined;

// Isolamento por tenant imposto pelo Postgres (PLANO_TECNICO seção 7).
// Para toda tabela de negócio:
//   - ENABLE + FORCE ROW LEVEL SECURITY (FORCE aplica a política até ao dono da tabela)
//   - política tenant_isolation: só enxerga/grava linha cujo tenant_id bate com
//     current_setting('app.tenant_id'). Sem o contexto definido -> current_setting
//     retorna NULL -> zero linhas (falha fechada).
//   - GRANT explícito para credx7i_app (nada de default privileges: tabela nova não
//     mapeada aqui é invisível para a aplicação, além de ser pega pela suíte de isolamento).
//
// Ao criar uma tabela de negócio nova, ADICIONE o nome a esta lista numa migration nova.

const TABELAS_ESCRITA_TOTAL = [
  "usuarios",
  "usuario_sessoes",
  "papeis",
  "permissoes",
  "arquivos",
];

// auditoria é append-only: sem UPDATE nem DELETE para a aplicação.
const TABELAS_APPEND_ONLY = ["auditoria"];

function habilitarRls(pgm, tabela, grant) {
  pgm.sql(`
    ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${tabela}
      USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    GRANT ${grant} ON ${tabela} TO credx7i_app;
  `);
}

exports.up = (pgm) => {
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
};
