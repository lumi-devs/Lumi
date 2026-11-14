import { logger } from "@lumi/foundation";

export interface NegativeCacheMetricsOptions {
  readonly namespace: string;
  readonly alertThreshold?: number;
  readonly windowMs?: number;
  readonly onAlert?: (rate: number) => void;
}

export interface NegativeCacheSnapshot {
  readonly namespace: string;
  readonly negativeHits: number;
  readonly negativeMisses: number;
  readonly totalNegativeRequests: number;
  readonly negativeHitRate: number;
  readonly alertThreshold: number;
  readonly isAlerting: boolean;
}

export class NegativeCacheMetrics {
  private negativeHits = 0;
  private negativeMisses = 0;
  private readonly namespace: string;
  private readonly alertThreshold: number;
  private readonly windowMs: number;
  private readonly onAlert?: (rate: number) => void;
  private alerting = false;
  private windowStart = Date.now();

  constructor(options: NegativeCacheMetricsOptions) {
    this.namespace = options.namespace;
    this.alertThreshold = options.alertThreshold ?? 0.8;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
    this.onAlert = options.onAlert;
  }

  recordHit(): void {
    this.checkWindow();
    this.negativeHits++;
    this.evaluateAlert();
  }

  recordMiss(): void {
    this.checkWindow();
    this.negativeMisses++;
    this.evaluateAlert();
  }

  private checkWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.negativeHits = 0;
      this.negativeMisses = 0;
      this.windowStart = now;
      this.alerting = false;
    }
  }

  private evaluateAlert(): void {
    const total = this.negativeHits + this.negativeMisses;
    if (total === 0) return;

    const rate = this.negativeHits / total;
    const shouldAlert = rate >= this.alertThreshold;

    if (shouldAlert && !this.alerting) {
      this.alerting = true;
      logger.warn("Negative cache hit rate alert", {
        namespace: this.namespace,
        rate,
        threshold: this.alertThreshold,
        hits: this.negativeHits,
        misses: this.negativeMisses,
      });
      if (this.onAlert) {
        this.onAlert(rate);
      }
    } else if (!shouldAlert && this.alerting) {
      this.alerting = false;
      logger.info("Negative cache hit rate recovered", {
        namespace: this.namespace,
        rate,
        threshold: this.alertThreshold,
      });
    }
  }

  getSnapshot(): NegativeCacheSnapshot {
    const total = this.negativeHits + this.negativeMisses;
    const rate = total > 0 ? this.negativeHits / total : 0;

    return {
      namespace: this.namespace,
      negativeHits: this.negativeHits,
      negativeMisses: this.negativeMisses,
      totalNegativeRequests: total,
      negativeHitRate: rate,
      alertThreshold: this.alertThreshold,
      isAlerting: this.alerting,
    };
  }

  reset(): void {
    this.negativeHits = 0;
    this.negativeMisses = 0;
    this.windowStart = Date.now();
    this.alerting = false;
  }
}

export function createNegativeCacheMetrics(
  options: NegativeCacheMetricsOptions,
): NegativeCacheMetrics {
  return new NegativeCacheMetrics(options);
}