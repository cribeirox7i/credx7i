import { config } from "./config";

// Envio de e-mail ainda não implementado (sem SMTP configurado - Fase 2 não depende
// disso). Enquanto SMTP_URL não estiver setado, o link de convite vai para o log do
// servidor e para a resposta do admin que criou o usuário.
//
// Para ligar de verdade: adicionar `nodemailer`, ler `config.SMTP_URL`, e mandar aqui.

export async function enviarConviteEmail(dados: {
  nome: string;
  email: string;
  link: string;
}): Promise<{ enviado: boolean }> {
  if (!config.SMTP_URL) {
    console.log(`[email] (SMTP off) convite para ${dados.email}: ${dados.link}`);
    return { enviado: false };
  }
  // TODO: nodemailer com config.SMTP_URL
  console.log(`[email] SMTP_URL setado mas envio não implementado; link: ${dados.link}`);
  return { enviado: false };
}
