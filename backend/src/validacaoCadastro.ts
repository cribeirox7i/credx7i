import { PoolClient } from "pg";

// RN-01: o município do cadastro (cedente/sacado) precisa estar na área habilitada do
// tenant (município-sede ou limítrofe). A query já roda sob o contexto de tenant
// (withTenant), então o RLS de municipio_habilitado filtra por si só - não precisa
// repassar tenant_id aqui.
export async function municipioHabilitado(c: PoolClient, municipioIbge: string): Promise<boolean> {
  if (!municipioIbge) return true; // endereço é opcional no cadastro inicial
  const r = await c.query("SELECT 1 FROM municipio_habilitado WHERE municipio_ibge = $1", [
    municipioIbge,
  ]);
  return (r.rowCount ?? 0) > 0;
}
