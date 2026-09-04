# CredX7i

Módulo de crédito multitenant para Empresas Simples de Crédito (ESC).

Especificação completa em [`docs/`](docs/):

- [ESPECIFICACAO_FUNCIONAL.md](docs/ESPECIFICACAO_FUNCIONAL.md) - comportamento esperado, regras de negócio, modelo de informação.
- [PLANO_TECNICO.md](docs/PLANO_TECNICO.md) - arquitetura, multitenancy, isolamento, segurança, roteiro de fases.
- [ENGENHARIA_REVERSA_WEBESC.md](docs/ENGENHARIA_REVERSA_WEBESC.md) - engenharia reversa do sistema legado, base do motor de cálculo.

## Estado atual

Fases 0 a 2 do roteiro do plano técnico (seção 15): fundação, isolamento por tenant
(RLS), e autenticação própria (e-mail+senha, sessão em tabela, papéis e permissões,
convite). Ainda sem telas de crédito (Fase 3+).

Login de dev (após `npm run seed:dev`): `admin@alpha.dev` / `Cred!x7i2026`, abrindo
`http://localhost:5183/?tenant=alpha` (ou `?tenant=beta`).

## Estrutura

```
backend/    API Express + TypeScript (serverless na Vercel), Postgres via pg
frontend/   React + Vite (estático na Vercel)
db/         migrations (node-pg-migrate), roles.sql, README de operação do banco
docs/       especificação e plano
```

## Desenvolvimento

Pré-requisito: Node 20+ e uma connection string de um Postgres (projeto Supabase de dev).

```bash
# backend
cd backend
npm install
cp .env.example .env          # preencher DATABASE_URL e DATABASE_POOLER_URL
npm run migrate up            # aplica o schema (precisa dos roles criados, ver db/README.md)
npm run test:isolation        # prova o isolamento entre tenants
npm run dev                   # http://localhost:3101

# frontend (outro terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5183
```

## Arquitetura em uma frase

Cada ESC é um tenant isolado por Row Level Security no Postgres (`ENABLE` + `FORCE`,
política fail-closed). O backend conecta com um role sem `BYPASSRLS`, define
`app.tenant_id` por transação, e nenhuma tabela de negócio é acessível sem esse
contexto. Uma suíte automatizada prova o isolamento e quebra o build se uma tabela
nova nascer sem RLS.
