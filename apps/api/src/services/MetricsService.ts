/**
 * MetricsService - Base class for metrics collection
 *
 * Provides a foundation for tracking performance metrics, counters, and histograms
 * across different parts of the application.
 *
 * Design:
 * - In-memory storage with circular buffer for recent metrics
 * - Exportable to Prometheus, Grafana, or custom dashboards
 * - Thread-safe (single-process for now, can be extended for multi-process)
 *
 * Related:
 * - apps/api/src/services/metrics/DeleteMetrics.ts (delete-specific metrics)
 * - apps/api/src/services/monitoring/DeleteMonitor.ts (real-time monitoring)
 * - apps/api/src/routes/metrics.routes.ts (API endpoint)
 */

export interface MetricValue {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

export interface Histogram {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface Counter {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface Gauge {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricsSummary {
  counters: Counter[];
  gauges: Gauge[];
  histograms: Record<string, Histogram>;
  recentValues: Record<string, MetricValue[]>;
}

/**
 * Base MetricsService class
 *
 * Example usage:
 * ```typescript
 * const metrics = new MetricsService('delete-operations');
 * metrics.incrementCounter('jobs_completed', { status: 'success' });
 * metrics.recordValue('job_duration_ms', 1234, { accountId: 'acc_123' });
 * ```
 */
export class MetricsService {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private recentValues: Map<string, MetricValue[]> = new Map();

  // Configuration
  private readonly MAX_RECENT_VALUES = 1000; // Keep last 1000 values per metric
  private readonly HISTOGRAM_BUCKETS = [10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000]; // milliseconds

  constructor(private namespace: string) {}

  /**
   * Increment a counter metric
   *
   * @example
   * metrics.incrementCounter('api_requests', { endpoint: '/api/data', status: '200' });
   */
  incrementCounter(name: string, labels?: Record<string, string>, increment: number = 1): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += increment;
    } else {
      this.counters.set(key, { name, value: increment, labels });
    }
  }

  /**
   * Set a gauge metric (point-in-time value)
   *
   * @example
   * metrics.setGauge('active_connections', 42);
   * metrics.setGauge('queue_depth', 10, { queue: 'delete' });
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, { name, value, labels });
  }

  /**
   * Record a value in a histogram (for percentile calculations)
   *
   * @example
   * metrics.recordHistogram('request_duration_ms', 123);
   */
  recordHistogram(name: string, value: number): void {
    let histogram = this.histograms.get(name);

    if (!histogram) {
      histogram = {
        buckets: this.HISTOGRAM_BUCKETS.map((le) => ({ le, count: 0 })),
        sum: 0,
        count: 0,
      };
      this.histograms.set(name, histogram);
    }

    // Update histogram
    histogram.sum += value;
    histogram.count += 1;

    // Increment bucket counts
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count += 1;
      }
    }
  }

  /**
   * Record a time-series value (stored in circular buffer)
   *
   * @example
   * metrics.recordValue('cpu_usage', 42.5, { host: 'api-01' });
   */
  recordValue(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    let values = this.recentValues.get(key);

    if (!values) {
      values = [];
      this.recentValues.set(key, values);
    }

    values.push({
      timestamp: Date.now(),
      value,
      labels,
    });

    // Maintain circular buffer
    if (values.length > this.MAX_RECENT_VALUES) {
      values.shift(); // Remove oldest value
    }

    // Also record in histogram for percentile calculations
    this.recordHistogram(name, value);
  }

  /**
   * Get percentile from histogram
   *
   * @example
   * const p95 = metrics.getPercentile('job_duration_ms', 0.95);
   */
  getPercentile(name: string, percentile: number): number | null {
    const histogram = this.histograms.get(name);
    if (!histogram || histogram.count === 0) {
      return null;
    }

    const targetCount = Math.ceil(histogram.count * percentile);
    let cumulativeCount = 0;

    for (const bucket of histogram.buckets) {
      cumulativeCount += bucket.count;
      if (cumulativeCount >= targetCount) {
        return bucket.le;
      }
    }

    // If we get here, return the highest bucket
    return histogram.buckets[histogram.buckets.length - 1].le;
  }

  /**
   * Get average from histogram
   */
  getAverage(name: string): number | null {
    const histogram = this.histograms.get(name);
    if (!histogram || histogram.count === 0) {
      return null;
    }

    return histogram.sum / histogram.count;
  }

  /**
   * Get recent values for a metric
   */
  getRecentValues(name: string, labels?: Record<string, string>, limit?: number): MetricValue[] {
    const key = this.getMetricKey(name, labels);
    const values = this.recentValues.get(key) || [];

    if (limit) {
      return values.slice(-limit);
    }

    return values;
  }

  /**
   * Get summary of all metrics
   */
  getSummary(): MetricsSummary {
    const recentValues: Record<string, MetricValue[]> = {};
    this.recentValues.forEach((values, key) => {
      recentValues[key] = values.slice(-100); // Last 100 values
    });

    return {
      counters: Array.from(this.counters.values()),
      gauges: Array.from(this.gauges.values()),
      histograms: Object.fromEntries(this.histograms.entries()),
      recentValues,
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    this.counters.forEach((counter) => {
      const labels = this.formatLabels(counter.labels);
      lines.push(`${this.namespace}_${counter.name}${labels} ${counter.value}`);
    });

    // Export gauges
    this.gauges.forEach((gauge) => {
      const labels = this.formatLabels(gauge.labels);
      lines.push(`${this.namespace}_${gauge.name}${labels} ${gauge.value}`);
    });

    // Export histograms
    this.histograms.forEach((histogram, name) => {
      // Histogram buckets
      histogram.buckets.forEach((bucket) => {
        lines.push(
          `${this.namespace}_${name}_bucket{le="${bucket.le}"} ${bucket.count}`
        );
      });
      // Histogram sum and count
      lines.push(`${this.namespace}_${name}_sum ${histogram.sum}`);
      lines.push(`${this.namespace}_${name}_count ${histogram.count}`);
    });

    return lines.join('\n');
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.recentValues.clear();
  }

  /**
   * Helper: Generate unique key for metric + labels
   */
  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  /**
   * Helper: Format labels for Prometheus
   */
  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${labelStr}}`;
  }
}
