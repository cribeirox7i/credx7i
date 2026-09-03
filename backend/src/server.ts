import express from "express";
import cors from "cors";
import { config } from "./config";
import { tenantContext } from "./tenantContext";
import { tenantsRouter } from "./routes/tenants";

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin(origin, callback) {
      // sem origin (curl, health check, server-to-server) passa; quem autentica é o
      // middleware, não o CORS. callback(null, false) só omite o header, nunca lança erro
      // (um throw viraria 500 com stack trace).
      callback(null, !origin || config.corsOrigins.includes(origin));
    },
  }),
);

app.use(express.json({ limit: "1mb" }));

// Headers de segurança em toda resposta, inclusive dev local (não passa pelo vercel.json).
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  next();
});

// Liveness puro, sem tocar no banco nem resolver tenant.
app.get("/health", (_req, res) => res.json({ ok: true }));

// Tudo sob /api exige um tenant resolvido (subdomínio, ou header/query em dev).
app.use("/api", tenantContext);
app.use("/api/tenants", tenantsRouter);

// Sob Vercel a variável VERCEL existe e o app é exportado como handler; local dev abre a porta.
if (!process.env.VERCEL) {
  app.listen(config.PORT, () => {
    console.log(`[server] CredX7i backend em http://localhost:${config.PORT}`);
  });
}

export default app;
