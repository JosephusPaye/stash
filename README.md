# Stash

![Tests](https://github.com/JosephusPaye/stash/workflows/Tests/badge.svg)

🗃 A simple cache with configurable storage and support for [stale-while-revalidate](https://tools.ietf.org/html/rfc5861#section-3).

This project is part of [#CreateWeekly](https://twitter.com/JosephusPaye/status/1214853295023411200), my attempt to create something new publicly every week in 2020.

## How it works

Stash allows you to wrap an expensive function whose result you want to cache using `stash.cache()`. The function wrapped is called a producer, and a key is provided to use for caching the produced value.

The first time `stash.cache()` is called, the producer is called and the value produced is stored in the cache using the provided key. On subsequent calls, the cache is checked to see if there's an existing value for the key that hasn't expired. If there is, that value is returned without calling the producer. If there isn't, the producer is called to produce a new value, which is then cached and returned.

When [stale-while-revalidate](https://tools.ietf.org/html/rfc5861#section-3) is enabled, expired items that haven't exceeded the `staleWhileRevalidate` value are returned immediately, and the producer is called asynchronously to update the value in the cache, for return on subsequent calls. See [Using stale-while-revalidate](#using-stale-while-revalidate) for how to use.

Out of the box, Stash provides an in-memory storage for cached items, and you can [provide your own storage](#using-custom-storage).

The cache is updated only on demand, and stale items are not removed automatically. You can call `stash.clearStale()` periodically at an interval you choose to remove stale items.

See [Usage](#usage) for examples, and [API](#api) for details.

## Installation

```
npm install @josephuspaye/stash --save
```

## Usage

### Basic usage

The following example shows how to cache remotely fetched data for up to 5 minutes.

<details>
<summary>View example</summary>

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
    const response = await fetch(url);
    return response.json();
  });
}

async function main() {
  const fiveMinutes = 5 * 60;
  const url = 'https://swapi.dev/api/people/4/?format=json';

  // On first call, a request will be made and results will be cached for 5 minutes
  const data = await fetchData(url, fiveMinutes);
  console.log({ data });

  // Subsequent calls in the next 5 minutes will be resolved from the cache, without making a request
  const sameData = await fetchData(url, fiveMinutes);
  console.log(data === sameData); // true

  // Wait 5 minutes for `maxAge` to expire
  await timeout(fiveMinutes);

  // With the cache expired, the next call will make a request and return fresh data (which will then be cached)
  const newData = await fetchData(url, fiveMinutes);
  console.log(data !== sameData); // true
}

main();
```

</details>

### Using stale-while-revalidate

The following example shows how to cache remotely fetched data for up to 5 minutes, with a subsequent 5 minute window where stale data will be returned from the cache while the data is revalidated (i.e. updated) asynchronously in the background.

<details>
<summary>View example</summary>

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
    const response = await fetch(url);
    return response.json();
  });
}

async function main() {
  const fiveMinutes = 5 * 60;
  const url = 'https://swapi.dev/api/people/4/?format=json';

  // On first call, a request will be made and the results will be cached for 5 minutes
  const data = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log({ data });

  // Subsequent calls in the next 5 minutes will be resolved from the cache, without making a request.
  // Data resolved during this time is considered "fresh".
  const cachedData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data === cachedData); // true

  // Wait 5 minutes for `maxAge` to expire
  await timeout(fiveMinutes);

  // `maxAge` has been exceeded, making the cached data "stale". Because `staleWhileRevalidate` is set,
  // the stale data will be resolved from the cache immediately on the next call, while a request is
  // made in the background to update the data in the cache.
  const staleData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data === staleData); // true

  // The next call will get fresh data that was fetched when the previous call revalidated,
  // without making another request
  const revalidatedData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data !== revalidatedData); // true

  // Wait 10 minutes for `maxAge` and `staleWhileRevalidate` to expire
  await timeout(fiveMinutes * 2);

  // After the `staleWhileRevalidate` window expires, the next call will make a request and cache the results
  // for 5 minutes, just like the first call in this method above
  const newData = await fetchData(url, fiveMinutes, fiveMinutes);
  console.log(data !== newData); // true
}

main();
```

</details>

### Using custom storage

You can use a custom storage backend to store cached items by implementing the [Storage interface](#types).

The following example shows how to use [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) in a browser to store cached items. Note that this is a simple, unoptimized example for illustration only.

<details>
<summary>View example</summary>

```js
import { Stash, InMemoryStorage } from '@josephuspaye/stash';

class LocalStorage {
  constructor() {
    this.storageKey = 'stash-cache';
  }

  async getCache() {
    return JSON.parse(localStorage.get(this.storageKey) || '{}');
  }

  async size() {
    return Object.keys(await this.getCache()).length;
  }

  async has(key) {
    return (await this.getCache())[key] !== undefined;
  }

  async get(key) {
    return (await this.getCache())[key];
  }

  async set(key, value) {
    const cache = await this.getCache();
    cache[key] = value;
    localStorage.set(this.storageKey, JSON.stringify(cache));
  }

  async delete(key) {
    const cache = await this.getCache();

    if (cache[key] !== undefined) {
      delete cache[key];
      localStorage.set(this.storageKey, JSON.stringify(cache));
      return true;
    }

    return false;
  }

  async clearMatching(matcher) {
    const cache = await this.getCache();

    for (const [key, value] of Object.entries(cache)) {
      if (matcher(key, value)) {
        delete cache[key];
      }
    }

    localStorage.set(this.storageKey, JSON.stringify(cache));
  }

  async clear() {
    localStorage.set(this.storageKey, '{}');
  }
}

// Create stash instance with the custom LocalStorage backend
const stash = new Stash(new LocalStorage());

// use `stash` as normal...
```

</details>

## API

### `InMemoryStorage` class

An in-memory storage backend for the cache. Cached items are stored in a JS [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), supporting keys and values of any type.

### `Stash` class

The main Stash class.

<details>
<summary>View details</summary>

```ts
class Stash<K, V> {
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
  size(): Promise<number>;

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
  cache(key: K, producer: Producer<V>): Promise<V>;
  cache(key: K, options: CacheOptions, producer: Producer<V>): Promise<V>;

  /**
   * Clear all stale items in the cache
   */
  clearStale(): Promise<void>;

  /**
   * Clear all items in the cache
   */
  clear(): Promise<void>;
}
```

</details>

### Types

The following additional types are used in the API:

<details>
<summary>View types</summary>

```ts
/**
 * Interface for cache storage backends
 */
interface Storage<K, V> {
  /**
   * Get the number of items stored
   */
  size(): Promise<number>;

  /**
   * Check if an item is stored with the given key
   */
  has(key: K): Promise<boolean>;

  /**
   * Get the value of the item stored with the given key. Returns the value if found, undefined otherwise.
   */
  get(key: K): Promise<CachedValue<V> | undefined>;

  /**
   * Store the given value with the given key
   */
  set(key: K, cached: CachedValue<V>): Promise<void>;

  /**
   * Delete the item with the given key. Returns true if an item was found and deleted, false otherwise.
   */
  delete(key: K): Promise<boolean>;

  /**
   * Delete all items that match with the given matcher
   *
   * @param matcher A matcher that takes the key and value of an item and returns true if the item
   *                should be deleted, and false otherwise
   */
  clearMatching(
    matcher: (key: K, cached: CachedValue<V>) => boolean
  ): Promise<void>;

  /**
   * Delete all items in storage
   */
  clear(): Promise<void>;
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
   * How long an item should be in the cache before it's considered stale, in seconds
   */
  maxAge: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate: number;
}

/**
 * A function (possibly async) that produces a value to cache
 */
type Producer<V> =
  | ((options: { isRevalidating: boolean }) => V)
  | ((options: { isRevalidating: boolean }) => Promise<V>);

/**
 * Options for caching items
 */
type CacheOptions = {
  /**
   * How long an item should be in the cache before it's considered stale, in seconds
   */
  maxAge?: number;

  /**
   * For how long a stale value should be returned after it becomes stale, in seconds
   */
  staleWhileRevalidate?: number;
};
```

</details>

## Licence

[MIT](LICENCE)
