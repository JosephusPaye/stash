# Stash

![Node.js CI](https://github.com/JosephusPaye/stash/workflows/Node.js%20CI/badge.svg)

🗃 A simple cache with configurable storage and support for [stale-while-revalidate](https://tools.ietf.org/html/rfc5861#section-3).

This project is part of [#CreateWeekly](https://twitter.com/JosephusPaye/status/1214853295023411200), my attempt to create something new publicly every week in 2020.

## How it works

With Stash, you wrap an expensive function whose result you want to cache using `stash.cache()`. The function wrapped is called a producer, and a key is provided to use when caching the produced value.

The first time `stash.cache()` is called, the producer is called, and the value produced is stored in the cache using the provided key. On subsequent calls, the cache is checked to see if there's an existing value that hasn't expired. If there is, that value is returned without calling the producer. If there isn't, the producer is called to produce a new value, which is then cached and returned.

When [stale-while-revalidate](https://tools.ietf.org/html/rfc5861#section-3) is enabled, expired items that haven't exceeded the `staleWhileRevalidate` value are returned immediately, and the producer is called asynchronously to update the value in the cache, which is returned on subsequent calls.

Out of the box, Stash provides an in-memory storage for cache items. It also allows you to [provide your own storage](#using-custom-storage).

The cache is updated only on demand, and stale items are not cleared automatically. You can call [`stash.clearStale()`](#stashclearstale) at an interval you choose to periodically remove stale items.

See [Usage](#usage) for examples, and [API](#api) for details.

## Installation

```
npm install @josephuspaye/stash --save
```

## Usage

### Basic usage

The following example cache data fetch remotely for up to 5 minutes.

```js
import { Stash, InMemoryStorage } from '@josephuspaye/stash';

const stash = new Stash(new InMemoryStorage());

function timeout(interval) {
  return new Promise((resolve) => {
    setTimeout(resolve, interval * 1000);
  });
}

async function fetchData(url, maxAge) {
  return stash.cache(url, { maxAge }, async () => {
    console.log('fetching remote data...');
    const response = await fetch(url);
    return response.json();
  });
}

async function main() {
  const fiveMinutes = 5 * 50;
  const url = 'https://swapi.dev/api/people/4/?format=json';

  // On first call, the request will be made, and results will be cached for 5 minutes
  const data = await fetchData(url, fiveMinutes);
  console.log({ data });

  // Subsequent calls in the next 5 minutes will be resolved from the cache, without making a request
  const sameData = await fetchData(url, fiveMinutes);
  console.log(data === sameData); // true

  // Wait 5 minutes for `maxAge` to expire
  await timeout(fiveMinutes);

  // With the cache expired, the next call will make a request and return fresh data (which will be cached)
  const newData = await fetchData(url, fiveMinutes);
  console.log(data !== sameData); // true
}

main();
```

### Using stale-while-revalidate

The following example cache data fetch remotely for up to 5 minutes, with a subsequent 5 minute window where stale data will be returned from the cache while the data is revalidated (i.e. updated) asynchronously in the background.

```js
import { Stash, InMemoryStorage } from '@josephuspaye/stash';

const stash = new Stash(new InMemoryStorage());

function timeout(interval) {
  return new Promise((resolve) => {
    setTimeout(resolve, interval * 1000);
  });
}

async function fetchData(url, maxAge, staleWhileRevalidate) {
  return stash.cache(url, { maxAge, staleWhileRevalidate }, async () => {
    console.log('fetching remote data...');
    const response = await fetch(url);
    return response.json();
  });
}

async function main() {
  const fiveMinutes = 5 * 60;
  const url = 'https://swapi.dev/api/people/4/?format=json';

  // On first call, the request is made and the results are cached for 5 minutes
  const data = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log({ data });

  // Subsequent calls in the next 5 minutes are resolved from the cache, without making a request
  // Data resolved during this time is considered "fresh".
  const cachedData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data === cachedData); // true

  // Wait 5 minutes for `maxAge` to expire
  await timeout(fiveMinutes);

  // `maxAge` has be exceeded, making the cached data "stale". Because `staleWhileRevalidate` is set,
  // the stale data will be resolved from the cache immediately, while a request is made in the
  // background to update the data in the cache.
  const staleData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data === staleData); // true

  // The next call will get fresh data that was fetched when the previous call revalidated,
  // without making another request
  const revalidatedData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data !== revalidatedData); // true

  // Wait 10 minutes for `maxAge` and `staleWhileRevalidate` to expire
  await timeout(fiveMinutes * 2);

  // After the `staleWhileRevalidate` window expires, the next call will make a request and cache the results
  // are cached for 5 minutes, just like the very first call above
  const newData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data !== newData); // true
}

main();
```

### Using custom storage

You can use a custom storage backend to store cache items, by implementing the [Storage interface](#types).

The following example shows how to use [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) in a browser to store cached items (note that this is a simple, unoptimized example for illustration only):

```js
import { Stash, InMemoryStorage } from '@josephuspaye/stash';

class LocalStorage {
  constructor() {
    this.storageKey = 'stash-cache';
  }

  readLocalStorage() {
    return JSON.parse(localStorage.get(this.storageKey) || '{}');
  }

  size() {
    return Object.keys(this.readLocalStorage()).length;
  }

  has(key) {
    return this.readLocalStorage()[key] !== undefined;
  }

  get(key) {
    return this.readLocalStorage()[key];
  }

  set(key, value) {
    const cache = this.readLocalStorage();
    cache[key] = value;
    localStorage.set(this.storageKey, JSON.stringify(cache));
    return this;
  }

  delete(key) {
    const cache = this.readLocalStorage();

    if (cache[key] !== undefined) {
      delete cache[key];
      localStorage.set(this.storageKey, JSON.stringify(cache));
      return true;
    }

    return false;
  }

  clearMatching(matcher) {
    const cache = this.readLocalStorage();

    for (const [key, value] of Object.entries(cache)) {
      if (matcher(key, value)) {
        delete cache[key];
      }
    }

    localStorage.set(this.storageKey, JSON.stringify(cache));
  }

  clear() {
    localStorage.set(this.storageKey, '{}');
  }
}

// Create stash instance with the custom LocalStorage backend
const stash = new Stash(new LocalStorage());

// use stash as normal
```

## API

### `InMemoryStorage`

In-memory storage backend for the cache. Cached items are stored in a JS [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), supporting keys and value of any type.

### `Stash`

The main Stash class.

```ts
export declare class Stash<K, V> {
  /**
   * Create a new stash with the given storage and default options. The default
   * options will be used when `stash.cache()` is called without options.
   * By default, `maxAge` is 1 hour, and `staleWhileRevalidate` is 0.
   */
  constructor(
    storage: Storage<K, V>,
    defaultCacheOptions?: Required<CacheOptions>
  );

  /**
   * Get the number of items stored in the cache
   */
  size(): number;

  /**
   * Run the given producer, store the value it produces in the cache, and return the value.
   *
   * - If no value for the given key is in the cache, the producer is called and the value
   *   it produces is stored in the cache
   *
   * - If a value for the given key in the cache, one of the following happens:
   *   - if the cached value has not exceeded `maxAge`, it is returned and the producer
   *     is not called
   *   - if the cached value has exceeded `maxAge`, and `staleWhileRevalidate` is set and
   *     has not been exceeded, then the stale value is returned, and the producer is
   *     called asynchronously to revalidate (i.e. update) the value
   */
  cache(key: K, producer: Producer<V>): Promise<V>;
  cache(key: K, options: CacheOptions, producer: Producer<V>): Promise<V>;

  /**
   * Clear all stale items in the cache
   */
  clearStale(): void;

  /**
   * Clear all items in the cache
   */
  clear(): void;
}
```

### Types

The following types are used in the API:

```ts
/**
 * Interface for cache storage backends
 */
interface Storage<K, V> {
  /**
   * Get the number of items stored
   */
  size(): number;

  /**
   * Check an item is stored with the given key
   */
  has(key: K): boolean;

  /**
   * Get the value of the item stored with the given key if available, or undefined otherwise
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
interface CachedValue<V> {
  /**
   * The value
   */
  value: V;

  /**
   * When the value was stored in the cache, in seconds since the UNIX Epoch
   */
  storedAt: number;

  /**
   * How long the item should be in the cache before it's considered stale, in seconds
   */
  maxAge: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate: number;
}

/**
 * A function (possibly async) that produces the value to cache
 */
type Producer<V> =
  | ((options: { isRevalidating: boolean }) => V)
  | ((options: { isRevalidating: boolean }) => Promise<V>);

/**
 * Options for caching items.
 */
type CacheOptions = {
  /**
   * How long the item should be in the cache before it's considered stale, in seconds
   */
  maxAge?: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate?: number;
};
```

## Licence

[MIT](LICENCE)
