/**
 * Debouncing and batching utilities for performance
 */

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export class BatchProcessor<T> {
  private queue: T[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private processor: (items: T[]) => Promise<void>,
    private delay: number = 100,
    private maxBatchSize: number = 50
  ) {}

  add(item: T): void {
    this.queue.push(item);

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.flush();
    }, this.delay);
  }

  private async flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.queue.length === 0) return;

    const items = this.queue.splice(0, this.queue.length);

    try {
      await this.processor(items);
    } catch (error) {
      console.error('Batch processing error:', error);
    }
  }
}
