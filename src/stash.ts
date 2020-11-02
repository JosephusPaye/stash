export interface Storage<K, V> {
  size(): number;
  has(key: K): boolean;
  get(key: K): CachedValue<V> | undefined;
  set(key: K, cached: CachedValue<V>): this;
  delete(key: K): boolean;
  clearMatching(matcher: (key: K, cached: CachedValue<V>) => boolean): void;
  clear(): void;
}

export interface CachedValue<V> {
  value: V;
  storedAt: number;
  maxAge: number;
  staleWhileRevalidate: number;
}

export class InMemoryStorage<K, V> implements Storage<K, V> {
  private map: Map<K, CachedValue<V>>;

  constructor() {
    this.map = new Map<K, CachedValue<V>>();
  }

  size() {
    return this.map.size;
  }

  has(key: K) {
    return this.map.has(key);
  }

  get(key: K) {
    return this.map.get(key);
  }

  set(key: K, cached: CachedValue<V>) {
    this.map.set(key, cached);
    return this;
  }

  delete(key: K) {
    return this.map.delete(key);
  }

  clearMatching(matcher: (key: K, cached: CachedValue<V>) => boolean) {
    for (const [key, cached] of this.map.entries()) {
      if (matcher(key, cached)) {
        this.map.delete(key);
      }
    }
  }

  clear() {
    this.map.clear();
  }
}

export type Producer<V> =
  | ((options: { isRevalidating: boolean }) => V)
  | ((options: { isRevalidating: boolean }) => Promise<V>);

export type CacheOptions = {
  maxAge?: number;
  staleWhileRevalidate?: number;
};

export class Stash<K, V> {
  private storage: Storage<K, V>;
  private defaultCacheOptions: Required<CacheOptions>;

  constructor(
    storage: Storage<K, V>,
    defaultCacheOptions: Required<CacheOptions> = {
      maxAge: 60 * 60, // cache for 1 hour by default
      staleWhileRevalidate: 0,
    }
  ) {
    this.storage = storage;
    this.defaultCacheOptions = defaultCacheOptions;
  }

  size() {
    return this.storage.size();
  }

  async cache(key: K, producer: Producer<V>): Promise<V>;
  async cache(key: K, options: CacheOptions, producer: Producer<V>): Promise<V>;
  async cache(
    key: K,
    producerOrOptions: CacheOptions | Producer<V>,
    producerOnly?: Producer<V>
  ): Promise<V> {
    const producer =
      typeof producerOrOptions === 'function'
        ? producerOrOptions
        : producerOnly;

    if (producer === undefined) {
      throw new TypeError('expected producer to be a function, got undefined');
    } else if (typeof producer !== 'function') {
      throw new TypeError('producer is not a function');
    }

    const options =
      typeof producerOrOptions === 'object' ? producerOrOptions : {};

    if (this.storage.has(key)) {
      const cached = this.storage.get(key)!;

      if (this.isFresh(cached)) {
        return cached.value;
      }

      if (this.canRevalidateStale(cached)) {
        this.revalidateAsync(key, producer, options);
        return cached.value;
      }
    }

    const value = await producer({ isRevalidating: false });

    this.addToCache(key, value, options);

    return value;
  }

  clearStale() {
    this.storage.clearMatching((key, cached) => {
      return this.isFresh(cached) === false;
    });
  }

  clear() {
    this.storage.clear();
  }

  private isFresh(cached: CachedValue<V>) {
    return Date.now() / 1000 < cached.storedAt + cached.maxAge;
  }

  private canRevalidateStale(cached: CachedValue<V>) {
    return (
      Date.now() / 1000 <
      cached.storedAt + cached.maxAge + cached.staleWhileRevalidate
    );
  }

  private async revalidateAsync(
    key: K,
    producer: Producer<V>,
    options: CacheOptions
  ) {
    const value = await producer({ isRevalidating: true });
    this.addToCache(key, value, options);
  }

  private addToCache(key: K, value: V, options: CacheOptions) {
    const { maxAge, staleWhileRevalidate } = Object.assign(
      {},
      this.defaultCacheOptions,
      options
    );

    this.storage.set(key, {
      value,
      maxAge,
      staleWhileRevalidate,
      storedAt: Date.now() / 1000,
    });
  }
}
