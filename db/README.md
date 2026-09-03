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

2. **Montar as connection strings** em `backend/.env` (copiar de `backend/.env.example`).

   O host direto `db.<ref>.supabase.co` é **IPv6-only** nos projetos novos do Supabase.
   Sem IPv6 na rede, ele nem resolve - então as três strings vão pelo **pooler** (IPv4),
   e o usuário leva o ref do projeto grudado (`credx7i_owner.<ref>`, `credx7i_app.<ref>`):

   - `DATABASE_URL` - role `credx7i_owner`, **session pooler** (porta 5432). Migrations.
   - `DATABASE_POOLER_URL` - role `credx7i_app`, **transaction pooler** (porta 6543). Runtime.
   - `DATABASE_APP_URL` - role `credx7i_app`, **session pooler** (porta 5432). Suíte de isolamento.

   Ex.: `postgresql://credx7i_owner.yjpinvutihkykcckbdet:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

   (Com IPv6 disponível, dá para usar o host direto nas duas de porta 5432; o pooler
   transaction continua obrigatório para o runtime serverless.)

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
