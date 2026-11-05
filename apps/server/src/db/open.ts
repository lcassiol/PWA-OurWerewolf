import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:')
    mkdirSync(dirname(resolve(path)), { recursive: true });
  return new DatabaseSync(path);
}
