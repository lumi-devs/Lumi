import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../apps/dashboard/src/server.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:8080';
let serverInstance: any = null;

describe('Dashboard E2E (Black Box)', () => {
  beforeAll(async () => {
    const isRunning = await fetch(`${DASHBOARD_URL}/`, { redirect: 'manual' })
      .then(() => true)
      .catch(() => false);

    if (!isRunning) {
      const mockRpc = { call: async () => ({}) } as any;
      serverInstance = createServer(mockRpc);
    }
  });

  afterAll(() => {
    if (serverInstance && typeof serverInstance.stop === 'function') {
      serverInstance.stop();
    }
  });
  it('should redirect unauthenticated users to /login', async () => {
    // This is a true black-box test. It assumes the dashboard is running
    // on DASHBOARD_URL and hits the network exactly like a real user.
    const response = await fetch(`${DASHBOARD_URL}/`, {
      redirect: 'manual' // Prevent fetch from following the redirect so we can inspect it
    });

    // The server should respond with a 302 Found redirect
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await fetch(`${DASHBOARD_URL}/some-fake-route`);
    expect(response.status).toBe(404);
  });
});
