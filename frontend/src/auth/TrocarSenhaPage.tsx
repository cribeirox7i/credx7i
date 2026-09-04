import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

export function TrocarSenhaPage() {
  const { estado, recarregar, logout } = useAuth();
  const nav = useNavigate();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [nova2, setNova2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (estado.fase === "deslogado") {
    nav("/login", { replace: true });
    return null;
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova !== nova2) {
      setErro("as senhas não conferem");
      return;
    }
    setEnviando(true);
    try {
      await api.trocarSenha(atual, nova);
      await recarregar();
      nav("/", { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-centro">
      <form className="cartao-form" onSubmit={submeter}>
        <div className="marca">CredX7i</div>
        <div className="tenant-nome">Trocar senha</div>
        <label>
          Senha atual
          <input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
        </label>
        <label>
          Nova senha
          <input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required />
        </label>
        <label>
          Repita a nova senha
          <input type="password" autoComplete="new-password" value={nova2} onChange={(e) => setNova2(e.target.value)} required />
        </label>
        <p className="dica">Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>
        {erro && <div className="banner-erro">{erro}</div>}
        <button type="submit" disabled={enviando}>
          {enviando ? "..." : "Salvar"}
        </button>
        <button type="button" className="link" onClick={() => logout().then(() => nav("/login"))}>
          Sair
        </button>
      </form>
    </div>
  );
}
