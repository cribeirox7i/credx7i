-- CredX7i - roles do banco. Rodar UMA VEZ, como o papel `postgres`, no SQL Editor do
-- Supabase (ou via psql com a connection string "Direct"), antes da primeira migration.
--
-- Passo a passo e contexto em db/README.md.
--
-- Trocar os dois placeholders de senha antes de rodar. Guardar as senhas: elas entram
-- no backend/.env como parte das connection strings.

-- =========================================================================
-- credx7i_owner - dono do schema. Roda as migrations e é dono das tabelas.
-- NÃO é superusuário e NÃO tem BYPASSRLS.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx7i_owner') THEN
    CREATE ROLE credx7i_owner LOGIN PASSWORD 'TROCAR_SENHA_OWNER'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE, CREATE ON SCHEMA public TO credx7i_owner;

-- =========================================================================
-- credx7i_app - conexão de runtime da aplicação (via pooler). Sem BYPASSRLS.
-- Recebe os GRANTs por tabela dentro das migrations.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx7i_app') THEN
    CREATE ROLE credx7i_app LOGIN PASSWORD 'TROCAR_SENHA_APP'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO credx7i_app;

-- =========================================================================
-- credx7i_admin - rotinas de plataforma (provisionar tenant, relatório consolidado).
-- NOLOGIN por ora: ninguém conecta como ele nesta fase; recebe GRANTs para uso futuro
-- via SET ROLE a partir de credx7i_owner.
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'credx7i_admin') THEN
    CREATE ROLE credx7i_admin NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO credx7i_admin;
GRANT credx7i_admin TO credx7i_owner;

-- credx7i_owner passa a criar objetos que credx7i_app pode usar; os GRANTs específicos
-- ficam nas migrations (nada de ALTER DEFAULT PRIVILEGES: grant é sempre explícito, por
-- tabela, para que tabela nova não mapeada seja invisível à aplicação).
