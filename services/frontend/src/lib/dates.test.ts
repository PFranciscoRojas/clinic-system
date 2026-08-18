import { describe, expect, it } from 'vitest';
import { fmtDateOnly, fmtDateTime, parseDateOnly } from './dates';

describe('parseDateOnly', () => {
  it('keeps the calendar day a DATE column meant, in any timezone', () => {
    // new Date('2026-07-02') is UTC midnight, which in Bogotá (UTC-5) is the
    // first of July. A session_date must not slide a day for being read west
    // of Greenwich.
    expect(parseDateOnly('2026-07-02').getDate()).toBe(2);
    expect(parseDateOnly('2026-07-02T00:00:00Z').getDate()).toBe(2);
  });
});

describe('fmtDateTime', () => {
  it('carries the time of day, which is what tells two of the same day apart', () => {
    // Built from local parts on purpose: asserting a literal string would make
    // this test say something different on a machine in another timezone, and
    // what is being checked is the shape, not the reader's offset.
    const at = new Date(2026, 7, 18, 14, 35);
    const out = fmtDateTime(at.toISOString());

    expect(out).toMatch(/\d{2}:\d{2}/);
    expect(out).toContain(fmtDateOnly('2026-08-18'));
    expect(out).not.toBe(fmtDateOnly('2026-08-18'));
  });

  it('does not shift the instant the way a calendar date is shifted', () => {
    // parseDateOnly anchors to local noon so a day cannot slide. Doing that to
    // a timestamp would move an 8 p.m. session to midday.
    const at = new Date(2026, 7, 18, 20, 5);
    expect(fmtDateTime(at.toISOString())).toContain('08:05 p');
  });
});
