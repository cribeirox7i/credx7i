import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, guardarToken, lerToken, onNaoAutenticado, type Permissao, type UsuarioSessao } from "../api/client";

type Estado =
  | { fase: "carregando" }
  | { fase: "deslogado" }
  | {
      fase: "logado";
      usuario: UsuarioSessao;
      adminTenant: boolean;
      mustChangePassword: boolean;
      permissoes: Permissao[];
    };

type AuthCtx = {
  estado: Estado;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  recarregar: () => Promise<void>;
  aplicarSessao: (token: string) => Promise<void>;
  pode: (recurso: string, op: keyof Omit<Permissao, "recurso">) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  const carregar = useCallback(async () => {
    if (!lerToken()) {
      setEstado({ fase: "deslogado" });
      return;
    }
    try {
      const [me, perms] = await Promise.all([api.me(), api.minhasPermissoes()]);
      setEstado({
        fase: "logado",
        usuario: me.usuario,
        adminTenant: me.adminTenant,
        mustChangePassword: me.mustChangePassword,
        permissoes: perms.permissoes,
      });
    } catch {
      guardarToken(null);
      setEstado({ fase: "deslogado" });
    }
  }, []);

  useEffect(() => {
    onNaoAutenticado(() => {
      guardarToken(null);
      setEstado({ fase: "deslogado" });
    });
    void carregar();
  }, [carregar]);

  const aplicarSessao = useCallback(
    async (token: string) => {
      guardarToken(token);
      await carregar();
    },
    [carregar],
  );

  const login = useCallback(
    async (email: string, senha: string) => {
      const r = await api.login(email, senha);
      await aplicarSessao(r.token);
    },
    [aplicarSessao],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    guardarToken(null);
    setEstado({ fase: "deslogado" });
  }, []);

  const pode = useCallback(
    (recurso: string, op: keyof Omit<Permissao, "recurso">) => {
      if (estado.fase !== "logado") return false;
      if (estado.adminTenant) return true;
      const p = estado.permissoes.find((x) => x.recurso === recurso);
      return !!p?.[op];
    },
    [estado],
  );

  const valor = useMemo<AuthCtx>(
    () => ({ estado, login, logout, recarregar: carregar, aplicarSessao, pode }),
    [estado, login, logout, carregar, aplicarSessao, pode],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
