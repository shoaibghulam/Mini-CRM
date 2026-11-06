import { describe, it, expect } from 'vitest';
import { isValidRequiredComment, normalizeComment, parseId, requiredText } from '@/domain/validation';

describe('parseId', () => {
  it.each<[string | undefined, number | null]>([
    ['42', 42],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
    ['', null],
    [undefined, null],
    ['99999999999999999999', null],
  ])('%j -> %j', (raw, expected) => {
    expect(parseId(raw)).toBe(expected);
  });
});

describe('normalizeComment', () => {
  it.each<[string | null | undefined, string | null]>([
    [undefined, null],
    [null, null],
    ['', null],
    ['   \n\t ', null],
    ['  fix the wall  ', 'fix the wall'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeComment(input)).toBe(expected);
  });
});

describe('isValidRequiredComment', () => {
  it('rejects whitespace-only and accepts real text', () => {
    expect(isValidRequiredComment('   ')).toBe(false);
    expect(isValidRequiredComment('Переделать')).toBe(true);
  });
});

describe('requiredText', () => {
  const validate = requiredText('Обязательное поле');
  it('returns the message for blank input and null otherwise', () => {
    expect(validate('  ')).toBe('Обязательное поле');
    expect(validate('Объект 1')).toBeNull();
  });
});
