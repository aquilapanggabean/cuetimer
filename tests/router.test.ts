import { describe, it, expect } from 'vitest';
import { resolveRoute } from '../src/ui/router';

describe('Router', () => {
  it('resolves routes correctly based on hash and query parameters', () => {
    expect(resolveRoute('#/stage', '')).toBe('stage');
    expect(resolveRoute('#/view', '')).toBe('stage');
    expect(resolveRoute('', '?view=stage')).toBe('stage');
    expect(resolveRoute('#/overlay', '')).toBe('overlay');
    expect(resolveRoute('', '?view=overlay')).toBe('overlay');
    expect(resolveRoute('#/operator', '')).toBe('operator');
    expect(resolveRoute('#/create', '')).toBe('operator');
    expect(resolveRoute('', '')).toBe('operator');
  });
});
