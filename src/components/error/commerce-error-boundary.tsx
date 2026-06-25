"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  CustomerCard,
  CustomerPrimaryButton,
  CustomerShell,
} from "@/components/customer/customer-shell";

type CommerceErrorBoundaryProps = {
  children: ReactNode;
  pageTitle: string;
  backHref?: string;
  backLabel?: string;
};

type CommerceErrorBoundaryState = {
  error: Error | null;
};

export class CommerceErrorBoundary extends Component<
  CommerceErrorBoundaryProps,
  CommerceErrorBoundaryState
> {
  state: CommerceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CommerceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.pageTitle}] runtime error:`, error, info);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <CustomerShell
          backHref={this.props.backHref ?? "/chat"}
          backLabel={this.props.backLabel ?? "Back to chat"}
          subtitle={this.props.pageTitle}
          footer={
            <div className="space-y-2">
              <CustomerPrimaryButton type="button" onClick={this.handleRetry}>
                Try Again
              </CustomerPrimaryButton>
              <Link
                href="/chat"
                className="flex h-10 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700"
              >
                ← Back to Chat
              </Link>
            </div>
          }
        >
          <CustomerCard className="py-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="size-6 text-red-600" />
              </div>
              <h1 className="text-base font-semibold text-gray-900">
                Something went wrong
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                We couldn&apos;t finish loading this page. Your payment may still
                have gone through — check chat or order tracking.
              </p>
              <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-red-700">
                {this.state.error.message || "Unknown error"}
              </p>
            </div>
          </CustomerCard>
        </CustomerShell>
      );
    }

    return this.props.children;
  }
}

type CommerceRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  pageTitle: string;
};

export function CommerceRouteError({
  error,
  reset,
  pageTitle,
}: CommerceRouteErrorProps) {
  console.error(`[${pageTitle}] route error:`, error);

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle={pageTitle}
      footer={
        <div className="space-y-2">
          <CustomerPrimaryButton type="button" onClick={reset}>
            Try Again
          </CustomerPrimaryButton>
          <Link
            href="/chat"
            className="flex h-10 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700"
          >
            ← Back to Chat
          </Link>
        </div>
      }
    >
      <CustomerCard className="py-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="size-6 text-red-600" />
          </div>
          <h1 className="text-base font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {error.message || "An unexpected error occurred."}
          </p>
        </div>
      </CustomerCard>
    </CustomerShell>
  );
}
