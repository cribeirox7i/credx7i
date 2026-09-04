// Carrega o .env antes de qualquer teste (a suíte precisa das connection strings).
require("dotenv").config();

// Impede que importar src/server.ts abra a porta 3101 durante os testes (o gate no
// server.ts é `if (!process.env.VERCEL)`).
process.env.VERCEL = process.env.VERCEL || "test";
