import { Router } from "express";
import { assertTenant } from "../tenantContext";
import { withTenant } from "../db";

export const tenantsRouter = Router();

/**
 * Prova o caminho fim a fim: subdomínio -> registry -> contexto -> transação com RLS.
 * Lê a própria linha do tenant de dentro de `withTenant`, exercitando a política.
 */
tenantsRouter.get("/atual", async (req, res) => {
  const tenantId = assertTenant(req);
  try {
    const dados = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        "SELECT slug, nome, modo, status FROM tenants WHERE tenant_id = $1",
        [tenantId],
      );
      return rows[0] ?? null;
    });
    if (!dados) {
      res.status(404).json({ error: "tenant não encontrado" });
      return;
    }
    res.json(dados);
  } catch {
    res.status(500).json({ error: "falha ao consultar o tenant" });
  }
});
