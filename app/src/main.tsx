import React from "react";
import ReactDOM from "react-dom/client";
// Archivo, with its width axis: the app's one typeface, bundled so Windows and macOS read alike (SIL OFL 1.1).
import "@fontsource-variable/archivo/wdth.css";
import "./styles/shadcn.css";
// The skin of the shadcn Select triggers. It sits before App.css, so the almanac's stylesheet keeps the last word.
import "./styles/selects.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
