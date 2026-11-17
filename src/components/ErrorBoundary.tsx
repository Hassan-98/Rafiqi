import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Root error boundary. Without it, any render throw white-screens the whole
 * app permanently — the worst possible failure for a daily worship app.
 * Shows a calm Arabic recovery screen; "retry" re-renders in place and, if
 * the tree throws again immediately, falls back to a full reload.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  /** Throws within ~2s of a retry mean the state itself is poisoned → reload. */
  private lastRetryAt = 0;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Persist the last crash so a support conversation has something to go on.
    try {
      localStorage.setItem(
        'myzikr:lastCrash',
        JSON.stringify({
          at: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
        }),
      );
    } catch {
      /* storage may be full — never let the crash screen itself crash */
    }
  }

  private retry = () => {
    const now = Date.now();
    if (now - this.lastRetryAt < 2000) {
      window.location.reload();
      return;
    }
    this.lastRetryAt = now;
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        dir="rtl"
        className="min-h-dvh flex flex-col items-center justify-center gap-4 px-8 text-center bg-cream dark:bg-dark-bg"
      >
        <span className="text-5xl" aria-hidden>
          🕊️
        </span>
        <h1 className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark">
          حدث خلل غير متوقع
        </h1>
        <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
          لا تقلق — بياناتك محفوظة. جرّب المتابعة، وإن تكرر الخلل أعد فتح التطبيق.
        </p>
        <button
          onClick={this.retry}
          className="mt-2 px-8 py-3 rounded-xl bg-teal text-on-accent font-semibold text-sm shadow-[var(--shadow-md)] active:scale-[0.97] transition-transform"
        >
          المتابعة
        </button>
      </div>
    );
  }
}
