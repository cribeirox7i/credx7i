import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { capturarTenantDaUrl } from "./api/client";
import "./index.css";

// dev: grava o ?tenant= antes de qualquer render/navegação
capturarTenantDaUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
