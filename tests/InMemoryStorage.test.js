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

test('InMemoryStorage.size() retrieves the number of items in storage', () => {
  const storage = new InMemoryStorage();

  assert.is(storage.size(), 0, 'initial size of storage is 0');

  storage.set('k1', sampleCachedValue(41));
  storage.set('k2', sampleCachedValue(42));
  storage.set('k3', sampleCachedValue(43));

  assert.is(storage.size(), 3, 'size() returns the expected size');

  storage.delete('k1');
  storage.delete('k2');
  assert.is(
    storage.size(),
    1,
    'size() returns the expected size after deleting items'
  );
});

test('InMemoryStorage.has() determines whether an item is stored by its key', () => {
  const storage = new InMemoryStorage();

  assert.is(
    storage.has('missing-key'),
    false,
    'has() returns false for missing keys'
  );

  const value = sampleCachedValue();

  storage.set('existing-key', value);
  assert.is(
    storage.has('existing-key'),
    true,
    'has() returns true for existing keys'
  );
});

test('InMemoryStorage.get() retrieves the value of an item by its key', () => {
  const storage = new InMemoryStorage();

  assert.is(
    storage.get('missing-key'),
    undefined,
    'get() returns undefined for missing keys'
  );

  const value = sampleCachedValue();

  storage.set('existing-key', value);
  assert.is(
    storage.get('existing-key'),
    value,
    'get() returns expected value for existing key'
  );
});

test('InMemoryStorage.set() adds an item to storage, overwriting existing keys', () => {
  const storage = new InMemoryStorage();

  const value = sampleCachedValue(42);
  const returnValue = storage.set('new-key', value);

  assert.is(
    storage,
    returnValue,
    'set() returns the storage instance for chaining'
  );
  assert.is(
    storage.get('new-key'),
    value,
    'value added with set() can be retrieved'
  );

  const newValue = sampleCachedValue(43);
  storage.set('new-key', newValue);

  assert.is.not(
    storage.get('new-key'),
    value,
    'set() overwrites previous value for the same key'
  );
  assert.is(
    storage.get('new-key'),
    newValue,
    'value added with set() can be retrieved'
  );
});

test('InMemoryStorage.delete() removes an item from storage', () => {
  const storage = new InMemoryStorage();

  assert.is(
    storage.delete('missing-key'),
    false,
    'delete() returns false for missing keys'
  );

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);

  storage.set('k1', v1);
  storage.set('k2', v2);

  assert.is(
    storage.get('k1'),
    v1,
    "item that hasn't been deleted can be retrieved"
  );
  assert.is(
    storage.get('k2'),
    v2,
    "item that hasn't been deleted can be retrieved"
  );

  const returnValue = storage.delete('k2');
  assert.is(
    returnValue,
    true,
    'delete() returns true for existing item that has been deleted'
  );

  assert.is(storage.get('k1'), v1, "delete() doesn't delete unrelated items");
  assert.is(
    storage.get('k2'),
    undefined,
    'delete() deletes the item with the given key'
  );
});

test('InMemoryStorage.clearMatching() removes items that match a given criteria', () => {
  const storage = new InMemoryStorage();

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);
  const v3 = sampleCachedValue(43);
  const v4 = sampleCachedValue(44);

  storage.set('k1', v1);
  storage.set('k2', v2);
  storage.set('k3', v3);
  storage.set('k4', v4);

  assert.is(storage.size(), 4);

  // Delete items with an even value
  storage.clearMatching((key, cached) => {
    return cached.value % 2 === 0;
  });

  assert.is(storage.size(), 2);

  assert.is(storage.has('k2'), false, 'first matching item was cleared');
  assert.is(storage.has('k4'), false, 'second matching item was cleared');

  assert.is(storage.has('k1'), true, 'first non-matching item remains');
  assert.is(storage.has('k3'), true, 'second non-matching item remains');
});

test('InMemoryStorage.clear() removes all items in storage', () => {
  const storage = new InMemoryStorage();

  const v1 = sampleCachedValue(41);
  const v2 = sampleCachedValue(42);

  storage.set('k1', v1);
  storage.set('k2', v2);

  assert.is(storage.size(), 2);

  storage.clear();

  assert.is(storage.size(), 0, 'clear() removes all items');

  assert.is(storage.has('k1'), false, 'first item was removed');
  assert.is(storage.has('k2'), false, 'last item was removed');
});

test.run();
