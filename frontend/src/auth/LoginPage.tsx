import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type TenantAtual } from "../api/client";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { estado, login } = useAuth();
  const nav = useNavigate();
  const [tenant, setTenant] = useState<TenantAtual | null>(null);
  const [erroTenant, setErroTenant] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modoEsqueci, setModoEsqueci] = useState(false);
  const [avisoEsqueci, setAvisoEsqueci] = useState<string | null>(null);

  useEffect(() => {
    api.tenantAtual().then(setTenant, (e) => setErroTenant(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (estado.fase === "logado") nav(estado.mustChangePassword ? "/trocar-senha" : "/", { replace: true });
  }, [estado, nav]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modoEsqueci) {
        await api.esqueciSenha(email);
        setAvisoEsqueci("Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.");
      } else {
        await login(email, senha);
      }
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
        <div className="tenant-nome">
          {erroTenant ? <span className="txt-erro">{erroTenant}</span> : (tenant?.nome ?? "...")}
        </div>

        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        {!modoEsqueci && (
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>
        )}

        {erro && <div className="banner-erro">{erro}</div>}
        {avisoEsqueci && <div className="banner-ok">{avisoEsqueci}</div>}

        <button type="submit" disabled={enviando || !!erroTenant}>
          {enviando ? "..." : modoEsqueci ? "Enviar link" : "Entrar"}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => {
            setModoEsqueci((v) => !v);
            setErro(null);
            setAvisoEsqueci(null);
          }}
        >
          {modoEsqueci ? "Voltar ao login" : "Esqueci minha senha"}
        </button>
      </form>
    </div>
  );
}
