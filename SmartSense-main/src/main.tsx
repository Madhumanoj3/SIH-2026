import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import App from "./App";
import AnimatedBackground from "./components/AnimatedBackground";

// SmartSenseProvider now mounts inside App, only once a driver is actually
// signed in — see App.tsx. AnimatedBackground is a purely decorative, fixed
// layer sitting behind the whole app (auth screens included) — no state,
// no data dependency.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AnimatedBackground />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
