import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TrueForgeConnection } from '../../src/trueforge/client';

// A TrueForge that accepts connections but never answers (the stall that used to lock a run).
let server: http.Server;
let base: string;
beforeAll(async () => {
  server = http.createServer(() => {});
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

describe('TrueForgeConnection.createSession', () => {
  for (const preferSaved of [false, true]) {
    it(`stops waiting as soon as the run is cancelled (${preferSaved ? 'saved agent via SDK' : 'inline manifest via fetch'})`, async () => {
      const tf = new TrueForgeConnection(base);
      const stop = new AbortController();
      const started = Date.now();
      const pending = tf.createSession({
        agentName: 'axiom-forge',
        model: 'm',
        inlineManifest: { model: { name: 'm' } },
        preferSaved,
        signal: stop.signal,
      });
      setTimeout(() => stop.abort(), 50);
      await expect(pending).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(2_000);
    });
  }
});
