import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryStorage } from '@/test/memoryStorage';
import { registerDraftFlush, flushClinicalDrafts, clearClinicalDrafts } from './clinicalDrafts';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('clearClinicalDrafts', () => {
  it('removes every clinical-draft* key and nothing else', () => {
    localStorage.setItem('clinical-draft-appt1', '{"x":1}');
    localStorage.setItem('clinical-draft-appt1-serverid', 'sd9');
    localStorage.setItem('clinical-draft-patient-p1', '{"y":2}');
    localStorage.setItem('access_token', 'tok');
    localStorage.setItem('sghcp_schedule', '{}');

    clearClinicalDrafts();

    expect(localStorage.getItem('clinical-draft-appt1')).toBeNull();
    expect(localStorage.getItem('clinical-draft-appt1-serverid')).toBeNull();
    expect(localStorage.getItem('clinical-draft-patient-p1')).toBeNull();
    expect(localStorage.getItem('access_token')).toBe('tok');
    expect(localStorage.getItem('sghcp_schedule')).toBe('{}');
  });
});

describe('flushClinicalDrafts', () => {
  it('awaits every registered flush and tolerates failures', async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    const bad = vi.fn().mockRejectedValue(new Error('network down'));
    const un1 = registerDraftFlush(ok);
    const un2 = registerDraftFlush(bad);

    await expect(flushClinicalDrafts()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);

    un1();
    un2();
  });

  it('does not call a flush after it unregisters', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const unregister = registerDraftFlush(fn);
    unregister();

    await flushClinicalDrafts();
    expect(fn).not.toHaveBeenCalled();
  });
});
