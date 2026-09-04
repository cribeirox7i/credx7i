import { z } from "zod";

// Carrega o .env em dev local. Na Vercel as variáveis já vêm do ambiente.
if (!process.env.VERCEL) {
  // require dinâmico para não quebrar o bundle serverless, onde dotenv não é dependência de runtime
  require("dotenv").config();
}

const schema = z.object({
  // Conexão de runtime da aplicação: pooler do Supabase (porta 6543, modo transaction),
  // com o role credx7i_app (sem BYPASSRLS). Ver db/README.md.
  DATABASE_POOLER_URL: z.string().min(1, "DATABASE_POOLER_URL não definida"),
  // Conexão direta (porta 5432) como credx7i_owner. Usada pelas migrations e pela suíte
  // de isolamento (que precisa criar/apagar tenants de teste). Não é usada pelo servidor.
  DATABASE_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3101),
  // Lista separada por vírgula das origens que podem chamar a API.
  CORS_ORIGINS: z.string().default("http://localhost:5183"),
  // Domínio base do produto: o subdomínio antes dele é o slug do tenant.
  TENANT_BASE_DOMAIN: z.string().default("credx7i.local"),
  // Sessão de usuário (token opaco em tabela).
  SESSION_TTL_DIAS: z.coerce.number().default(5),
  // Convite / redefinição de senha.
  INVITE_TTL_HORAS: z.coerce.number().default(48),
  // Base do frontend, para montar o link de convite.
  FRONTEND_URL: z.string().default("http://localhost:5183"),
  // SMTP é opcional: sem ele, o link de convite vai para o log e para a resposta do admin.
  SMTP_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const campos = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`configuração de ambiente inválida: ${campos}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};
