import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

export function DefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const { aplicarSessao } = useAuth();

  const [estado, setEstado] = useState<
    { fase: "validando" } | { fase: "ok"; nome: string; email: string } | { fase: "invalido"; msg: string }
  >({ fase: "validando" });
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado({ fase: "invalido", msg: "link sem token" });
      return;
    }
    api.validarConvite(token).then(
      (d) => setEstado({ fase: "ok", ...d }),
      (e) => setEstado({ fase: "invalido", msg: e instanceof Error ? e.message : "convite inválido" }),
    );
  }, [token]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== senha2) {
      setErro("as senhas não conferem");
      return;
    }
    setEnviando(true);
    try {
      const r = await api.definirSenhaConvite(token, senha);
      await aplicarSessao(r.token);
      nav("/", { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha");
    } finally {
      setEnviando(false);
    }
  }

  if (estado.fase === "validando") return <div className="tela-centro">Validando convite...</div>;
  if (estado.fase === "invalido")
    return (
      <div className="tela-centro">
        <div className="cartao-form">
          <div className="marca">CredX7i</div>
          <div className="banner-erro">{estado.msg}</div>
          <button className="link" onClick={() => nav("/login")}>
            Ir para o login
          </button>
        </div>
      </div>
    );

  return (
    <div className="tela-centro">
      <form className="cartao-form" onSubmit={submeter}>
        <div className="marca">CredX7i</div>
        <div className="tenant-nome">Definir senha - {estado.email}</div>
        <label>
          Nova senha
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <label>
          Repita a senha
          <input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required />
        </label>
        <p className="dica">Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>
        {erro && <div className="banner-erro">{erro}</div>}
        <button type="submit" disabled={enviando}>
          {enviando ? "..." : "Definir e entrar"}
        </button>
      </form>
    </div>
  );
}
