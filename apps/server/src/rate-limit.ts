export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.now();
    const cutoff = current - this.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (recent.length >= this.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recent[0]! + this.windowMs - current) / 1_000),
      );
      this.buckets.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(current);
    this.buckets.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
