// Cria (ou reaproveita) os tenants de desenvolvimento `alpha` e `beta` no registry.
// Uso: npx tsx scripts/seed-dev.ts
import { Pool } from "pg";

require("dotenv").config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = new Pool({ connectionString: url, max: 2 });

async function main() {
  for (const slug of ["alpha", "beta"]) {
    const { rows } = await pool.query(
      `INSERT INTO tenants (slug, nome)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING tenant_id, slug, nome, modo, status`,
      [slug, `ESC ${slug[0].toUpperCase()}${slug.slice(1)}`],
    );
    console.log(rows[0]);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
