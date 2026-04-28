declare module 'prometheus-client' {
  export class Counter {
    constructor(config: any);
    inc(labels?: any, value?: number): void;
    labels(...args: any[]): Counter;
  }

  export class Histogram {
    constructor(config: any);
    observe(value: number): void;
    observe(labels: any, value: number): void;
    labels(...args: any[]): Histogram;
  }

  export class Gauge {
    constructor(config: any);
    set(value: number): void;
    inc(value?: number): void;
    dec(value?: number): void;
    labels(...args: any[]): Gauge;
  }

  export function register(): any;
  export function collectDefaultMetrics(): void;
}
