# Banco - operação

Postgres do projeto Supabase `credx7i-dev` (ref `yjpinvutihkykcckbdet`), região São Paulo.

## Modelo

- **Pool compartilhado com RLS** (PLANO_TECNICO seção 4). Todo tenant no mesmo banco,
  isolado por Row Level Security. Silo (banco dedicado) fica para a Fase 5.
- Três roles:
  | Role | Uso | Conexão |
  |------|-----|---------|
  | `credx7i_owner` | dona do schema, roda migrations | Direct, porta 5432 |
  | `credx7i_app` | runtime da aplicação, sem BYPASSRLS | Transaction pooler, porta 6543 |
  | `credx7i_admin` | rotinas de plataforma (futuro), NOLOGIN | via `SET ROLE` |

## Setup inicial (uma vez)

1. **Criar os roles.** No SQL Editor do Supabase (logado, roda como `postgres`), colar o
   conteúdo de [`roles.sql`](roles.sql) *depois de trocar os dois placeholders de senha*.
   Guardar as senhas.

2. **Montar as connection strings** em `backend/.env` (copiar de `backend/.env.example`):
   - `DATABASE_URL` - "Direct connection" do painel Supabase, trocando o usuário `postgres`
     por `credx7i_owner` e a senha pela senha do owner.
     Ex.: `postgresql://credx7i_owner:SENHA@db.yjpinvutihkykcckbdet.supabase.co:5432/postgres`
   - `DATABASE_POOLER_URL` - "Transaction pooler" do painel. **Atenção ao formato do
     usuário no pooler do Supabase (Supavisor):** é `credx7i_app.yjpinvutihkykcckbdet`
     (role + ponto + ref do projeto), não só `credx7i_app`.
     Ex.: `postgresql://credx7i_app.yjpinvutihkykcckbdet:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
   - `DATABASE_APP_URL` (opcional) - "Direct connection" com `credx7i_app` (sem o sufixo
     `.ref`), usada só pela suíte de isolamento.

3. **Aplicar as migrations:**
   ```bash
   cd backend
   npm run migrate up
   ```
   As migrations rodam como `credx7i_owner` (via `DATABASE_URL`). node-pg-migrate cria a
   tabela de controle `pgmigrations`.

4. **Conferir no painel** (Table editor) que `usuarios`, `usuario_sessoes`, `papeis`,
   `permissoes`, `auditoria`, `arquivos` nasceram com RLS habilitado.

## Migrations

- Ferramenta: `node-pg-migrate`, arquivos em [`migrations/`](migrations/), JavaScript
  CommonJS, numerados (`0001_...`, `0002_...`).
- SQL cru via `pgm.sql(...)` para RLS, políticas e grants (fica explícito e revisável).
- Comandos: `npm run migrate up`, `npm run migrate down`, `npm run migrate redo`.
- **Ao criar uma tabela de negócio nova:** adicionar o nome dela à lista em
  `0004_rls.js` (numa migration nova que replique o padrão), senão a suíte de isolamento
  quebra o build - de propósito.

## Suíte de isolamento

```bash
cd backend
npm run test:isolation
```

Cria dois tenants de teste, tenta cruzar dados entre eles em cada tabela de negócio
(espera zero linhas / erro de policy), confirma que sem contexto de tenant nada é
visível, e enumera o schema `public` falhando se alguma tabela de negócio estiver sem
`FORCE ROW LEVEL SECURITY`. Roda no CI e trava o merge.
