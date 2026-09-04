// Validação de dígito verificador de CPF/CNPJ (algoritmo padrão da Receita). Só formato
// e dígito - não confirma existência real do documento.

function apenasDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

function todosIguais(v: string): boolean {
  return v.split("").every((c) => c === v[0]);
}

function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = digitos
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor: string): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11 || todosIguais(cpf)) return false;
  const d1 = digitoVerificador(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(cpf.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}

export function validarCnpj(valor: string): boolean {
  const cnpj = apenasDigitos(valor);
  if (cnpj.length !== 14 || todosIguais(cnpj)) return false;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = digitoVerificador(cnpj.slice(0, 12), pesos1);
  const d2 = digitoVerificador(cnpj.slice(0, 12) + d1, pesos2);
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

export function validarDocumento(tipo: "PF" | "PJ", valor: string): boolean {
  return tipo === "PF" ? validarCpf(valor) : validarCnpj(valor);
}
