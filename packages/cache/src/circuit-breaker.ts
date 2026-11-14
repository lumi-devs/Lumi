import { logger } from "@lumi/foundation";

export enum CircuitState {
  Closed = "closed",
  Open = "open",
  HalfOpen = "half_open",
}

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly successThreshold: number;
  readonly timeout: number;
  readonly onStateChange?: (state: CircuitState) => void;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30_000,
};

export class CircuitBreaker {
  private state = CircuitState.Closed;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  getState(): CircuitState {
    if (this.state === CircuitState.Open) {
      if (Date.now() - this.lastFailureTime >= this.options.timeout) {
        this.transitionTo(CircuitState.HalfOpen);
      }
    }
    return this.state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.Open) {
      throw new Error("Circuit breaker is open");
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HalfOpen) {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo(CircuitState.Closed);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    if (this.state === CircuitState.HalfOpen) {
      this.transitionTo(CircuitState.Open);
    } else if (this.state === CircuitState.Closed && this.failures >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.Open);
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    logger.warn("Circuit breaker state change", { from: oldState, to: newState });

    if (this.options.onStateChange) {
      this.options.onStateChange(newState);
    }
  }

  reset(): void {
    this.state = CircuitState.Closed;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}