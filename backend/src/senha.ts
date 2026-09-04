// Regra única de senha, usada em todo lugar que recebe senha nova (trocar-senha,
// definir-senha por convite, definir-senha pelo admin). Decisão do Carlos (2026-09-03):
// mesma do WebCRM - mínimo 8, com maiúscula, minúscula, dígito e símbolo.

export const MIN_SENHA_LEN = 8;

/** Devolve a mensagem de erro (pt-BR, pronta pra resposta) ou null se a senha passa. */
export function erroSenha(senha: string): string | null {
  if (senha.length < MIN_SENHA_LEN) return `A senha precisa ter ao menos ${MIN_SENHA_LEN} caracteres.`;
  if (!/[A-Z]/.test(senha)) return "A senha precisa ter ao menos 1 letra maiúscula.";
  if (!/[a-z]/.test(senha)) return "A senha precisa ter ao menos 1 letra minúscula.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter ao menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(senha)) return "A senha precisa ter ao menos 1 símbolo (ex.: ! @ # $ % *).";
  return null;
}
