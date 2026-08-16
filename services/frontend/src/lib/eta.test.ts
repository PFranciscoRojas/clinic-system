import { describe, it, expect } from 'vitest';
import { formatWait, formatQueue } from './eta';

describe('formatWait', () => {
  it('says nothing when there is no estimate', () => {
    expect(formatWait(undefined)).toBe('');
    expect(formatWait(0)).toBe('');
    expect(formatWait(NaN)).toBe('');
  });

  it('does not promise a number of minutes for a wait of seconds', () => {
    expect(formatWait(40)).toBe('menos de un minuto');
  });

  it('reports a short wait to the minute', () => {
    // One hour of audio on an empty queue: ~471 s.
    expect(formatWait(471)).toBe('unos 8 minutos');
  });

  it('rounds a long wait to five minutes, which is all it is good to', () => {
    expect(formatWait(37 * 60)).toBe('unos 35 minutos');
    expect(formatWait(38 * 60)).toBe('unos 40 minutos');
  });

  it('switches to hours once minutes stop being readable', () => {
    expect(formatWait(60 * 60)).toBe('una hora');
    expect(formatWait(110 * 60)).toBe('1 h 50 min');
    expect(formatWait(121 * 60)).toBe('unas 2 horas');
  });

  it('never rounds a real wait down to nothing', () => {
    for (let s = 1; s < 4000; s += 7) {
      expect(formatWait(s)).not.toBe('');
      expect(formatWait(s)).not.toContain('unos 0');
    }
  });
});

describe('formatQueue', () => {
  it('says nothing when the queue is empty', () => {
    expect(formatQueue(0)).toBe('');
    expect(formatQueue(undefined)).toBe('');
  });

  it('counts in singular and plural', () => {
    expect(formatQueue(1)).toBe('Hay otra grabación antes de la tuya.');
    expect(formatQueue(4)).toBe('Hay 4 grabaciones antes de la tuya.');
  });
});
