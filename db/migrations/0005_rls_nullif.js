/* eslint-disable camelcase */

exports.shorthands = undefined;

// Um GUC customizado sem default, depois de ter sido setado uma vez na sessão, reverte
// para string vazia ('') e não NULL quando o SET LOCAL sai de escopo. Com o pooler em
// modo session isso faz `''::uuid` estourar ("invalid input syntax for type uuid") em
// vez de simplesmente não retornar linhas.
//
// NULLIF(..., '') normaliza '' -> NULL -> zero linhas (falha fechada), que é o
// comportamento desejado quando não há contexto de tenant.

const TABELAS = [
  "usuarios",
  "usuario_sessoes",
  "papeis",
  "permissoes",
  "arquivos",
  "auditoria",
];

exports.up = (pgm) => {
  for (const t of TABELAS) {
    pgm.sql(`
      DROP POLICY IF EXISTS tenant_isolation ON ${t};
      CREATE POLICY tenant_isolation ON ${t}
        USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK  (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }
};

exports.down = (pgm) => {
  for (const t of TABELAS) {
    pgm.sql(`
      DROP POLICY IF EXISTS tenant_isolation ON ${t};
      CREATE POLICY tenant_isolation ON ${t}
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK  (tenant_id = current_setting('app.tenant_id', true)::uuid);
    `);
  }
};
