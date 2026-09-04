// Cria os tenants de desenvolvimento `alpha` e `beta`, cada um com um papel
// Administrador e um usuário admin com senha conhecida.
// Uso: npm run seed:dev
import { Pool, PoolClient } from "pg";
import { scryptSync, randomBytes } from "node:crypto";

require("dotenv").config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");
const pool = new Pool({ connectionString: url, max: 2 });

const SENHA_ADMIN = "Cred!x7i2026"; // dev only: maiúscula, minúscula, dígito, símbolo, 8+

function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(senha, salt, 64).toString("hex")}`;
}

async function comCtx<T>(tenantId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function main() {
  for (const slug of ["alpha", "beta"]) {
    const t = await pool.query<{ tenant_id: string }>(
      `INSERT INTO tenants (slug, nome) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING tenant_id`,
      [slug, `ESC ${slug[0].toUpperCase()}${slug.slice(1)}`],
    );
    const tenantId = t.rows[0].tenant_id;

    await comCtx(tenantId, async (c) => {
      const papel = await c.query<{ papel_id: string }>(
        `INSERT INTO papeis (tenant_id, nome, admin_tenant) VALUES ($1, 'Administrador', true)
         ON CONFLICT (tenant_id, lower(nome)) DO UPDATE SET admin_tenant = true
         RETURNING papel_id`,
        [tenantId],
      );
      const papelId = papel.rows[0].papel_id;

      const email = `admin@${slug}.dev`;
      await c.query(
        `INSERT INTO usuarios (tenant_id, nome, email, senha_hash, papel_id, status, deve_trocar_senha)
         VALUES ($1, 'Admin', $2, $3, $4, 'ATIVO', false)
         ON CONFLICT (tenant_id, lower(email))
         DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel_id = EXCLUDED.papel_id,
                       status = 'ATIVO', deve_trocar_senha = false`,
        [tenantId, email, hashPassword(SENHA_ADMIN), papelId],
      );
      console.log(`${slug}: tenant ${tenantId} | login ${email} / ${SENHA_ADMIN}`);
    });
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
