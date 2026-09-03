/* eslint-disable camelcase */

exports.shorthands = undefined;

// Registry de tenants (PLANO_TECNICO seção 4.2). NÃO tem RLS por tenant: é a tabela de
// controle que mapeia slug -> tenant_id -> destino (pool/silo). Acesso de escrita só pelo
// role de plataforma; a aplicação só lê para resolver o slug do subdomínio.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE tenants (
      tenant_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug           text NOT NULL UNIQUE,
      nome           text NOT NULL,
      modo           text NOT NULL DEFAULT 'pool' CHECK (modo IN ('pool', 'silo')),
      db_secret_ref  text,
      storage_prefix text,
      status         text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'encerrado')),
      criado_em      timestamptz NOT NULL DEFAULT now()
    );

    -- slug: minúsculas, dígitos e hífen; é usado como subdomínio.
    ALTER TABLE tenants ADD CONSTRAINT tenants_slug_formato
      CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');

    GRANT USAGE ON SCHEMA public TO credx7i_app;
    GRANT SELECT ON tenants TO credx7i_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO credx7i_admin;
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS tenants;");
};
