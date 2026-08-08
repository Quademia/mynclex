import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => mocks.createServiceRoleClient(),
}));

import { accountExistsForEmail } from './account-lookup';

describe('accountExistsForEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is true when a profile row comes back', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'u-1' }, error: null });
    await expect(accountExistsForEmail('ama@example.com')).resolves.toBe(true);
  });

  it('is false when none does', async () => {
    await expect(accountExistsForEmail('nobody@example.com')).resolves.toBe(false);
  });

  it('normalises the address before looking it up', async () => {
    await accountExistsForEmail('  Ama.Mensah@Example.COM ');
    expect(mocks.from).toHaveBeenCalledWith('nclex_users');
    expect(mocks.eq).toHaveBeenCalledWith('email', 'ama.mensah@example.com');
  });

  // ⚠ The reason the query uses eq and not ilike. Underscores are
  // ordinary in email addresses, and ilike reads '_' as a
  // single-character wildcard — so 'a_b@x.com' would match 'axb@x.com'
  // and the log would name an account belonging to somebody else.
  it('matches exactly, so an underscore is not a wildcard', async () => {
    await accountExistsForEmail('first_last@example.com');
    expect(mocks.eq).toHaveBeenCalledWith('email', 'first_last@example.com');
    expect(mocks.select).toHaveBeenCalledWith('id');
  });

  // ⭐ null, not false. This value is written into an append-only table
  // that nothing may correct later, so "we could not find out" has to be
  // distinguishable from "we looked and she is not there" — otherwise a
  // database wobble becomes a permanent, confident, wrong support answer.
  describe('a failed lookup is null, never false', () => {
    it('when the query returns an error', async () => {
      mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } });
      await expect(accountExistsForEmail('ama@example.com')).resolves.toBeNull();
    });

    it('when the query throws', async () => {
      mocks.maybeSingle.mockRejectedValue(new Error('fetch failed'));
      await expect(accountExistsForEmail('ama@example.com')).resolves.toBeNull();
    });

    it('when there is no service-role key', async () => {
      mocks.createServiceRoleClient.mockImplementation(() => {
        throw new Error('supabaseKey is required');
      });
      await expect(accountExistsForEmail('ama@example.com')).resolves.toBeNull();
    });

    it('when the address is empty — nothing to look up', async () => {
      await expect(accountExistsForEmail('   ')).resolves.toBeNull();
      expect(mocks.from).not.toHaveBeenCalled();
    });
  });
});
