import { describe, expect, it } from 'vitest';
import { daysBetween, istDateString, istDayRange, istIsoString, isValidDateString } from '../src/util/time';

// 2026-10-16 04:30 UTC is 10:00 IST
const NOW = new Date('2026-10-16T04:30:00Z');

describe('time utils', () => {
  it('formats IST ISO strings with +05:30', () => {
    expect(istIsoString(NOW)).toBe('2026-10-16T10:00:00+05:30');
  });
  it('rolls the IST date over before UTC does', () => {
    expect(istDateString(new Date('2026-10-16T19:00:00Z'))).toBe('2026-10-17'); // 00:30 IST
  });
  it('validates real calendar dates only', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('17-10-2026')).toBe(false);
  });
  it('counts whole IST days', () => {
    expect(daysBetween(NOW, '2026-10-16')).toBe(0);
    expect(daysBetween(NOW, '2026-10-18')).toBe(2);
    expect(daysBetween(NOW, '2026-10-15')).toBe(-1);
  });
  it('computes an IST day range', () => {
    const { start, end } = istDayRange('2026-10-17');
    expect(start.toISOString()).toBe('2026-10-16T18:30:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });
});
