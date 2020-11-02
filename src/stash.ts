/**
 * Interface for cache storage backends
 */
export interface Storage<K, V> {
  /**
   * Get the number of items stored
   */
  size(): number;

  /**
   * Check if an item is stored with the given key
   */
  has(key: K): boolean;

  /**
   * Get the value of the item stored with the given key. Returns the value if found, undefined otherwise.
   */
  get(key: K): CachedValue<V> | undefined;

  /**
   * Store the given value with the given key
   */
  set(key: K, cached: CachedValue<V>): this;

  /**
   * Delete the item with the given key. Returns true if an item was found and deleted, false otherwise.
   */
  delete(key: K): boolean;

  /**
   * Delete all items that match with the given matcher
   *
   * @param matcher A matcher that takes the key and value of an item and returns true if the item
   *                should be deleted, and false otherwise
   */
  clearMatching(matcher: (key: K, cached: CachedValue<V>) => boolean): void;

  /**
   * Delete all items in storage
   */
  clear(): void;
}

/**
 * A cached value
 */
export interface CachedValue<V> {
  /**
   * The value
   */
  value: V;

  /**
   * When the value was stored in the cache, in seconds since the UNIX Epoch
   */
  storedAt: number;

  /**
   * How long an item should be in the cache before it's considered stale, in seconds
   */
  maxAge: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate: number;
}

/**
 * In-memory storage backend for the cache. Stored in a JS Map.
 */
export class InMemoryStorage<K, V> implements Storage<K, V> {
  private map: Map<K, CachedValue<V>>;

  /**
   * Create a new in-memory storage backend.
   */
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

/**
 * A function (possibly async) that produces a value to cache
 */
export type Producer<V> =
  | ((options: { isRevalidating: boolean }) => V)
  | ((options: { isRevalidating: boolean }) => Promise<V>);

/**
 * Options for caching items
 */
export type CacheOptions = {
  /**
   * How long an item should be in the cache before it's considered stale, in seconds
   */
  maxAge?: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate?: number;
};

/**
 * A stash cache.
 */
export class Stash<K, V> {
  private storage: Storage<K, V>;
  private defaultCacheOptions: Required<CacheOptions>;

  /**
   * Create a new stash with the given storage and default options. The default
   * options will be used when `stash.cache()` is called without options.
   * By default, `maxAge` is 1 hour, and `staleWhileRevalidate` is 0.
   */
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

  /**
   * Get the number of items stored in the cache
   */
  size() {
    return this.storage.size();
  }

  /**
   * Run the given producer, store the value it produces in the cache, and return the value.
   *
   * - If no value for the given key is in the cache, the producer is called and the value
   *   it produces is stored in the cache
   *
   * - If a value for the given key is in the cache, one of the following happens:
   *   - if the value is fresh (e.g. it hasn't exceeded `maxAge`, it is returned and the
   *     producer is not called
   *   - if the value is stale and can be revalidated (i.e. it has exceeded `maxAge`
   *     and `staleWhileRevalidate` is set and has not been exceeded) then the stale
   *     value is returned, and the producer is called asynchronously to revalidate
   *     (i.e. update) the value
   */
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

  /**
   * Clear all stale items in the cache
   */
  clearStale() {
    this.storage.clearMatching((key, cached) => {
      return this.isFresh(cached) === false;
    });
  }

  /**
   * Clear all items in the cache
   */
  clear() {
    this.storage.clear();
  }

  /**
   * Check if the given cached item is fresh (i.e. it hasn't exceeded its `maxAge`)
   */
  private isFresh(cached: CachedValue<V>) {
    return Date.now() / 1000 < cached.storedAt + cached.maxAge;
  }

  /**
   * Check if the given item can be returned stale while it is revalidated
   */
  private canRevalidateStale(cached: CachedValue<V>) {
    return (
      Date.now() / 1000 <
      cached.storedAt + cached.maxAge + cached.staleWhileRevalidate
    );
  }

  /**
   * Revalidate the item with the given key by calling the producer again,
   * and adding the newly produced value to the cache.
   */
  private async revalidateAsync(
    key: K,
    producer: Producer<V>,
    options: CacheOptions
  ) {
    const value = await producer({ isRevalidating: true });
    this.addToCache(key, value, options);
  }

  /**
   * Add the given value to the cache with the given key
   */
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
