// @ts-check

import { test } from 'uvu';
import * as assert from 'uvu/assert';

import { InMemoryStorage } from '../';

function sampleCachedValue(value = 42) {
  return {
    value,
    storedAt: Date.now() / 1000,
    maxAge: 0,
    staleWhileRevalidate: 0,
  };
}

test('InMemoryStorage.size() retrieves the number of items in storage', async () => {
  const storage = new InMemoryStorage();

  assert.is(await storage.size(), 0, 'initial size of storage is 0');

  await storage.set('k1', sampleCachedValue(41));
  await storage.set('k2', sampleCachedValue(42));
  await storage.set('k3', sampleCachedValue(43));

  assert.is(await storage.size(), 3, 'size() returns the expected size');

  await storage.delete('k1');
  await storage.delete('k2');

  assert.is(
    await storage.size(),
    1,
    'size() returns the expected size after deleting items'
  );
});

test('InMemoryStorage.has() determines whether an item is stored by its key', async () => {
  const storage = new InMemoryStorage();

  assert.is(
    await storage.has('missing-key'),
    false,
    'has() returns false for missing keys'
  );

  const value = sampleCachedValue();

  await storage.set('existing-key', value);

  assert.is(
    await storage.has('existing-key'),
    true,
    'has() returns true for existing keys'
  );
});

test('InMemoryStorage.get() retrieves the value of an item by its key', async () => {
  const storage = new InMemoryStorage();

  assert.is(
    await storage.get('missing-key'),
    undefined,
    'get() returns undefined for missing keys'
  );

  const value = sampleCachedValue();

  await storage.set('existing-key', value);

  assert.is(
    await storage.get('existing-key'),
    value,
    'get() returns expected value for existing key'
  );
});

test('InMemoryStorage.set() adds an item to storage, overwriting existing keys', async () => {
  const storage = new InMemoryStorage();

  const value = sampleCachedValue(42);
  const returnValue = await storage.set('new-key', value);

  assert.is(
    await storage.get('new-key'),
    value,
    'value added with set() can be retrieved'
  );

  const newValue = sampleCachedValue(43);
  await storage.set('new-key', newValue);

  assert.is.not(
    await storage.get('new-key'),
    value,
    'set() overwrites previous value for the same key'
  );
  assert.is(
    await storage.get('new-key'),
    newValue,
    'value added with set() can be retrieved'
  );
});

test('InMemoryStorage.delete() removes an item from storage', async () => {
  const storage = new InMemoryStorage();

  assert.is(
    await storage.delete('missing-key'),
    false,
    'delete() returns false for missing keys'
  );

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);

  await storage.set('k1', v1);
  await storage.set('k2', v2);

  assert.is(
    await storage.get('k1'),
    v1,
    "item that hasn't been deleted can be retrieved"
  );
  assert.is(
    await storage.get('k2'),
    v2,
    "item that hasn't been deleted can be retrieved"
  );

  const returnValue = await storage.delete('k2');
  assert.is(
    returnValue,
    true,
    'delete() returns true for existing item that has been deleted'
  );

  assert.is(
    await storage.get('k1'),
    v1,
    "delete() doesn't delete unrelated items"
  );
  assert.is(
    await storage.get('k2'),
    undefined,
    'delete() deletes the item with the given key'
  );
});

test('InMemoryStorage.clearMatching() removes items that match a given criteria', async () => {
  const storage = new InMemoryStorage();

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);
  const v3 = sampleCachedValue(43);
  const v4 = sampleCachedValue(44);

  await storage.set('k1', v1);
  await storage.set('k2', v2);
  await storage.set('k3', v3);
  await storage.set('k4', v4);

  assert.is(await storage.size(), 4);

  // Delete items with an even value
  await storage.clearMatching((key, cached) => {
    return cached.value % 2 === 0;
  });

  assert.is(await storage.size(), 2);

  assert.is(await storage.has('k2'), false, 'first matching item was cleared');
  assert.is(await storage.has('k4'), false, 'second matching item was cleared');

  assert.is(await storage.has('k1'), true, 'first non-matching item remains');
  assert.is(await storage.has('k3'), true, 'second non-matching item remains');
});

test('InMemoryStorage.clear() removes all items in storage', async () => {
  const storage = new InMemoryStorage();

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);

  await storage.set('k1', v1);
  await storage.set('k2', v2);

  assert.is(await storage.size(), 2);

  await storage.clear();

  assert.is(await storage.size(), 0, 'clear() removes all items');

  assert.is(await storage.has('k1'), false, 'first item was removed');
  assert.is(await storage.has('k2'), false, 'last item was removed');
});

test.run();
