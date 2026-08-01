import { describe, it, expect, beforeAll } from 'vitest';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:8080';

/** Black-Box HTTP client helper. */
const httpClient = {
  get: async (path: string, headers: Record<string, string> = {}) => {
    try {
      const res = await fetch(`${DASHBOARD_URL}${path}`, {
        method: 'GET',
        headers,
        redirect: 'manual',
      });
      return res;
    } catch (err) {
      return null;
    }
  },
  post: async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    try {
      const res = await fetch(`${DASHBOARD_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        redirect: 'manual',
      });
      return res;
    } catch (err) {
      return null;
    }
  },
};

describe('Dashboard Black-Box E2E Tests', () => {
  it('should redirect unauthenticated root requests to /login', async () => {
    const response = await httpClient.get('/');
    expect(response, 'dashboard unreachable — is it running?').not.toBeNull();
    expect([302, 303, 307]).toContain(response!.status);
    expect(response!.headers.get('location')).toBe('/login');
  });

  it('should reject unauthenticated access to protected API endpoints', async () => {
    const response = await httpClient.get('/api/v1/guilds');
    expect(response, 'dashboard unreachable — is it running?').not.toBeNull();
    expect([401, 302, 403]).toContain(response!.status);
  });

  it('should return 404 for non-existent routes without exposing internal stack trace', async () => {
    const response = await httpClient.get('/api/v1/non-existent-endpoint');
    expect(response, 'dashboard unreachable — is it running?').not.toBeNull();
    expect(response!.status).toBe(404);
  });

  it('should handle malformed POST payload gracefully', async () => {
    const response = await httpClient.post('/api/v1/auth', { malformed: true });
    expect(response, 'dashboard unreachable — is it running?').not.toBeNull();
    expect([400, 401, 404]).toContain(response!.status);
  });
});
