import type { PoolClient } from "pg";
import { config } from "./config";
import { generateToken } from "./authCrypto";
import { enviarConviteEmail } from "./email";

/**
 * Gera um token de convite novo (invalida o anterior), grava no usuário e tenta enviar
 * por e-mail. Roda dentro de um withTenant já aberto. Devolve o link sempre (o chamador
 * decide se mostra - o admin vê, o "esqueci a senha" não).
 */
export async function gerarConvite(
  client: PoolClient,
  tenantSlug: string,
  usuario: { userId: string; nome: string; email: string },
): Promise<{ enviado: boolean; link: string; expiraEm: string }> {
  const token = generateToken();
  const expiraEm = new Date(Date.now() + config.INVITE_TTL_HORAS * 3_600_000).toISOString();

  await client.query(
    "UPDATE usuarios SET convite_token = $1, convite_expira_em = $2 WHERE user_id = $3",
    [token, expiraEm, usuario.userId],
  );

  // O ?tenant= é para o dev (sem DNS wildcard); em produção o subdomínio já identifica.
  const link = `${config.FRONTEND_URL}/definir-senha?token=${token}&tenant=${tenantSlug}`;
  const { enviado } = await enviarConviteEmail({ nome: usuario.nome, email: usuario.email, link });
  return { enviado, link, expiraEm };
}
