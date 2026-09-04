import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { DefinirSenhaPage } from "./auth/DefinirSenhaPage";
import { TrocarSenhaPage } from "./auth/TrocarSenhaPage";
import { AppShell } from "./shell/AppShell";
import { InicioPage } from "./pages/InicioPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { PapeisPage } from "./pages/PapeisPage";
import { CedentesPage } from "./pages/CedentesPage";
import { SacadosPage } from "./pages/SacadosPage";
import { CadastrosApoioPage } from "./pages/CadastrosApoioPage";

function Protegido({ children }: { children: React.ReactNode }) {
  const { estado } = useAuth();
  if (estado.fase === "carregando") return <div className="tela-centro">Carregando...</div>;
  if (estado.fase === "deslogado") return <Navigate to="/login" replace />;
  if (estado.mustChangePassword) return <Navigate to="/trocar-senha" replace />;
  return <>{children}</>;
}

function SoAdmin({ children }: { children: React.ReactNode }) {
  const { estado } = useAuth();
  if (estado.fase === "logado" && !estado.adminTenant) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/definir-senha" element={<DefinirSenhaPage />} />
          <Route path="/trocar-senha" element={<TrocarSenhaPage />} />
          <Route
            path="/"
            element={
              <Protegido>
                <AppShell />
              </Protegido>
            }
          >
            <Route index element={<InicioPage />} />
            <Route path="cedentes" element={<CedentesPage />} />
            <Route path="sacados" element={<SacadosPage />} />
            <Route path="cadastros-apoio" element={<CadastrosApoioPage />} />
            <Route
              path="usuarios"
              element={
                <SoAdmin>
                  <UsuariosPage />
                </SoAdmin>
              }
            />
            <Route
              path="papeis"
              element={
                <SoAdmin>
                  <PapeisPage />
                </SoAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
