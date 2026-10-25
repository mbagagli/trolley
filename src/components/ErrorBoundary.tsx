import { Component, type ErrorInfo, type ReactNode } from "react";

import { PRODUCT } from "../config/product";
import { WorkspaceRecovery } from "./WorkspaceRecovery";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error
      ? error.message
      : "An unexpected interface error occurred.";
    return { message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `${PRODUCT.name} interface error`,
      error,
      info.componentStack,
    );
  }

  render(): ReactNode {
    if (!this.state.message) {
      return this.props.children;
    }
    return (
      <WorkspaceRecovery
        message={this.state.message}
        title="This view encountered a problem"
      />
    );
  }
}
