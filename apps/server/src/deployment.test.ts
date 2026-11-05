import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../../..');

void test('trusted proxy overwrites forwarded addresses and cookie security is explicit', () => {
  const nginx = readFileSync(resolve(root, 'deploy/nginx.conf'), 'utf8');
  const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');

  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.doesNotMatch(nginx, /proxy_add_x_forwarded_for/);
  assert.match(compose, /COOKIE_SECURE:.*\?COOKIE_SECURE/);
  assert.doesNotMatch(compose, /COOKIE_SECURE:-false/);
});
