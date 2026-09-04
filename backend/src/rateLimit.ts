import type { NextFunction, Request, Response } from "express";
import { queryRegistry } from "./db";

// Rate limit apoiado no Postgres (tabela rate_limit), não em memória - numa função
// serverless o contador em memória não é confiável entre instâncias (é um dos riscos
// listados no PLANO_TECNICO, item 9). Chaveado por IP: quem martela login de vários
// tenants do mesmo IP é barrado igual.

type Opcoes = { janelaMs: number; limite: number };

function ipDoCliente(req: Request): string {
  const xff = req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "desconhecido";
}

export function limitador(escopo: string, { janelaMs, limite }: Opcoes) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const chave = ipDoCliente(req);
    const janelaInicio = new Date(Math.floor(Date.now() / janelaMs) * janelaMs);

    try {
      const { rows } = await queryRegistry<{ contador: number }>(
        `INSERT INTO rate_limit (escopo, chave, janela_inicio, contador)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (escopo, chave, janela_inicio)
         DO UPDATE SET contador = rate_limit.contador + 1
         RETURNING contador`,
        [escopo, chave, janelaInicio],
      );
      const contador = rows[0]?.contador ?? 1;

      // limpeza oportunista de janelas velhas (sem cron dedicado nesta fase)
      if (Math.random() < 0.02) {
        queryRegistry("DELETE FROM rate_limit WHERE janela_inicio < now() - interval '2 hours'").catch(
          () => {},
        );
      }

      if (contador > limite) {
        const retryAposS = Math.ceil((janelaInicio.getTime() + janelaMs - Date.now()) / 1000);
        res.setHeader("Retry-After", String(Math.max(retryAposS, 1)));
        res.status(429).json({ error: "muitas tentativas - aguarde alguns minutos e tente de novo" });
        return;
      }
    } catch (e) {
      // Um rate limiter quebrado não deve derrubar o login: falha aberta, mas registra.
      console.error("[rateLimit] falha ao contabilizar, liberando a requisição:", e);
    }

    next();
  };
}

// Instâncias separadas por escopo: uso legítimo de um endpoint não consome a cota de outro.
export const loginRateLimiter = limitador("login", { janelaMs: 15 * 60 * 1000, limite: 10 });
export const esqueciSenhaRateLimiter = limitador("esqueci-senha", { janelaMs: 15 * 60 * 1000, limite: 10 });
