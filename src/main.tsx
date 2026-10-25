import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/manrope/wght.css";

import { MOTION_DURATION } from "./config/motion";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installCloseProtection } from "./services/closeProtection";
import { workspaceStore } from "./state/workspaceStore";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The application root element was not found.");
}

const motionVariables = {
  feedback: "fast", sorting: "shift", drop: "base", layout: "layout",
  settle: "settle", completion: "completion",
} as const;
for (const [key, suffix] of Object.entries(motionVariables)) {
  const duration = MOTION_DURATION[key as keyof typeof MOTION_DURATION];
  document.documentElement.style.setProperty(
    `--duration-${suffix}`, `${duration}ms`,
  );
}

/** Register desktop close protection before loading workspace data.
 *
 * Browser preview keeps its separate storage behavior. Report registration
 * failures visibly so users know to wait for the saved indicator.
 * Args:
 *     none: This function does not accept arguments.
 * Returns:
 *     Promise<void>: Resolve after workspace initialization.
 */
async function initializeWorkspace(): Promise<void> {
  if (typeof window.__TAURI_INTERNALS__ !== "undefined") {
    try {
      await installCloseProtection(workspaceStore);
    } catch (error) {
      console.error("Could not register save-on-close protection.", error);
      workspaceStore.showToast(
        "Close protection unavailable. Wait for Saved locally before quitting.",
        "error",
      );
    }
  }
  await workspaceStore.initialize();
}

void initializeWorkspace();

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
