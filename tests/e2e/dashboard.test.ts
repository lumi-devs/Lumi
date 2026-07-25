import { describe, it, expect, beforeAll } from 'vitest';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:8080';

describe('Dashboard E2E (Black Box)', () => {
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
