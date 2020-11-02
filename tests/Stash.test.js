import { test } from 'uvu';
import * as assert from 'uvu/assert';

import { Stash, InMemoryStorage } from '../';

function fastForward(interval) {
  return new Promise((resolve) => {
    setTimeout(resolve, interval * 1000);
  });
}

test('Stash.size() retrives the number of items cached in the stash', async () => {
  const stash = new Stash(new InMemoryStorage());

  assert.is(stash.size(), 0, 'initial size of stash is 0');

  await stash.cache('k1', () => 41);
  await stash.cache('k2', () => 42);
  await stash.cache('k3', () => 43);

  assert.is(stash.size(), 3, 'size() returns the expected size');

  stash.clear();

  assert.is(
    stash.size(),
    0,
    'size() returns the expected size after clearing items'
  );
});

test('Stash.cache() throws when called without a producer', async () => {
  const stash = new Stash(new InMemoryStorage());

  try {
    await stash.cache('k1');
    assert.ok(false, 'did not throw for missing producer');
  } catch (err) {
    assert.is(err.message, 'expected producer to be a function, got undefined');
  }

  try {
    await stash.cache('k1', {});
    assert.ok(false, 'did not throw for missing producer');
  } catch (err) {
    assert.is(err.message, 'expected producer to be a function, got undefined');
  }

  try {
    await stash.cache('k1', {}, {});
    assert.ok(false, 'did not throw for missing producer');
  } catch (err) {
    assert.is(err.message, 'producer is not a function');
  }
});

test('Stash.cache() caches a value for a given time', async () => {
  const stash = new Stash(new InMemoryStorage());

  // 1. Test caching of an initial value
  let producer = () => 41;
  let value = await stash.cache('k1', { maxAge: 1 }, producer);
  assert.is(value, 41, 'cache() returns the produced value');

  // 2. Test that the cached value is returned while it's still fresh
  producer = () => {
    throw Error('produced called unnecessarily');
  };

  // Get the cached value 3 times before it expires
  for (let i = 0; i < 3; i++) {
    try {
      value = await stash.cache('k1', { maxAge: 1 }, producer);
      assert.is(value, 41, 'cache() returns the cached value');
    } catch (err) {
      assert.ok(false, 'producer was called while value was fresh');
    }
  }

  // Fast forward to expire the value
  await fastForward(1);

  // 3. Test that the expired value is not returned, instead a new value is produced
  let producerCalled = false;
  producer = () => {
    producerCalled = true;
    return 42;
  };

  value = await stash.cache('k1', { maxAge: 1 }, producer);
  assert.is(value, 42, 'cache() returns the produced value');

  assert.ok(producerCalled, 'producer was called after value expired');
});

test('Stash.cache() supports stale-while-revalidate', async () => {
  const stash = new Stash(new InMemoryStorage());

  // 1. Test caching of an initial value
  let producer = () => 41;
  let value = await stash.cache(
    'k1',
    { maxAge: 1, staleWhileRevalidate: 1 },
    producer
  );
  assert.is(value, 41, 'cache() returns the produced value');

  // 2. Test that the cached value is returned while it's still fresh
  producer = () => {
    throw Error('produced called unnecessarily');
  };

  // Get the cached value 3 times before it expires
  for (let i = 0; i < 3; i++) {
    try {
      value = await stash.cache(
        'k1',
        { maxAge: 1, staleWhileRevalidate: 1 },
        producer
      );
      assert.is(value, 41, 'cache() returns the cached value');
    } catch (err) {
      assert.ok(false, 'producer was called while value was fresh');
    }
  }

  // Fast forward to expire the value and trigger stale-while-revalidate
  await fastForward(1);

  // 3. Test that the stale value is returned in the revalidate time window
  producer = () => 42;

  try {
    value = await stash.cache(
      'k1',
      { maxAge: 1, staleWhileRevalidate: 1 },
      producer
    );
    assert.is(value, 41, 'cache() returns the stale value');
  } catch (err) {
    assert.ok(
      false,
      'producer was called synchronously while value was stale with staleWhileRevalidate set'
    );
  }

  // 4. Test that the next call returns the revalidated value, updated asynchronously
  //    from the previous call which returned the stale value
  producer = () => {
    throw Error('produced called unnecessarily');
  };

  try {
    value = await stash.cache(
      'k1',
      { maxAge: 1, staleWhileRevalidate: 1 },
      producer
    );
    assert.is(value, 42, 'cache() returns the revalidated value');
  } catch (err) {
    assert.ok(
      false,
      'producer was called synchronously while value was stale with staleWhileRevalidate'
    );
  }

  // Fast forward to exceed the revalidate time window
  await fastForward(2);

  // 5. Test that the expired stale value is not returned, instead a new value is produced
  let producerCalled = false;
  producer = () => {
    producerCalled = true;
    return 43;
  };

  value = await stash.cache(
    'k1',
    { maxAge: 1, staleWhileRevalidate: 1 },
    producer
  );
  assert.is(value, 43, 'cache() returns the produced value');

  assert.ok(producerCalled, 'producer was called after stale value expired');
});

test('Stash.cache() uses defaultCacheOptions when cacheOptions is not given', async () => {
  const stash = new Stash(new InMemoryStorage(), {
    maxAge: 1,
    staleWhileRevalidate: 1,
  });

  // 1. Test caching of an initial value
  let producer = () => 41;
  let value = await stash.cache('k1', producer);
  assert.is(value, 41, 'cache() returns the produced value');

  // 2. Test that the cached value is returned while it's still fresh
  producer = () => {
    throw Error('produced called unnecessarily');
  };

  // Get the cached value 3 times before it expires
  for (let i = 0; i < 3; i++) {
    try {
      value = await stash.cache('k1', producer);
      assert.is(value, 41, 'cache() returns the cached value');
    } catch (err) {
      assert.ok(false, 'producer was called while value was fresh');
    }
  }

  // Fast forward to expire the value and trigger stale-while-revalidate
  await fastForward(1);

  // 3. Test that the stale value is returned in the revalidate time window
  producer = () => 42;

  try {
    value = await stash.cache('k1', producer);
    assert.is(value, 41, 'cache() returns the stale value');
  } catch (err) {
    assert.ok(
      false,
      'producer was called synchronously while value was stale with staleWhileRevalidate set'
    );
  }

  // 4. Test that the next call returns the revalidated value, updated asynchronously
  //    from the previous call which returned the stale value
  producer = () => {
    throw Error('produced called unnecessarily');
  };

  try {
    value = await stash.cache('k1', producer);
    assert.is(value, 42, 'cache() returns the revalidated value');
  } catch (err) {
    assert.ok(
      false,
      'producer was called synchronously while value was stale with staleWhileRevalidate'
    );
  }

  // Fast forward to exceed the revalidate time window
  await fastForward(2);

  // 5. Test that the expired stale value is not returned, instead a new value is produced
  let producerCalled = false;
  producer = () => {
    producerCalled = true;
    return 43;
  };

  value = await stash.cache('k1', producer);
  assert.is(value, 43, 'cache() returns the produced value');

  assert.ok(producerCalled, 'producer was called after stale value expired');
});

test('Stash.clearStale() removes stale items from the stash', async () => {
  const stash = new Stash(new InMemoryStorage());

  // Cache two items
  await stash.cache('k1', { maxAge: 1 }, () => 41);
  await stash.cache('k2', { maxAge: 2 }, () => 42);

  // Check that the two items were cached
  assert.is(stash.size(), 2);

  // Fast forward to expire the first item
  await fastForward(1);

  // Clear stale items
  stash.clearStale();

  // Check that there's only one item left in the cache
  assert.is(stash.size(), 1);

  // Check that the right item remained
  const value = await stash.cache('k2', { maxAge: 2 }, () => {
    throw new Error('producer called unnecessarily');
  });

  assert.is(value, 42, "clearStale() doesn't remove non-stale items");
});

test('Stash.clear() removes all items from the stash', async () => {
  const stash = new Stash(new InMemoryStorage());

  // Cache two items
  await stash.cache('k1', { maxAge: 2 }, () => 41);
  await stash.cache('k2', { maxAge: 2 }, () => 42);

  // Check that the two items were cached
  assert.is(stash.size(), 2);

  // Clear all items
  stash.clear();

  // Check that all items were cleared from the cache
  assert.is(stash.size(), 0);

  // Check that adding an item again triggers the producer
  const value = await stash.cache('k2', { maxAge: 2 }, () => 43);
  assert.is(value, 43, "clearStale() doesn't remove non-stale items");
});

test.run();
