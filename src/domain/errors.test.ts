import { describe, it, expect } from 'vitest';
import { describeError } from '@/domain/errors';

describe('describeError', () => {
  it('translates RPC exceptions', () => {
    expect(describeError({ message: 'comment is required', code: '23514' })).toBe('Нужен комментарий');
    expect(describeError({ message: 'comment is too long', code: '23514' })).toBe(
      'Комментарий слишком длинный (до 2000 символов)'
    );
    expect(describeError({ message: 'transition new -> accepted is not allowed', code: '23514' })).toBe(
      'Такой переход статуса запрещён'
    );
    expect(describeError({ message: 'task not found', code: 'P0002' })).toBe('Задача не найдена или недоступна');
  });

  it('explains the FK restrict on site delete without leaking raw Postgres text', () => {
    const text = describeError({ message: 'update or delete on table "sites" violates foreign key', code: '23503' });
    expect(text).toContain('удалите или перенесите');
    expect(text).not.toContain('violates foreign key');
  });

  it('translates network failures', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toContain('Нет связи с сервером');
  });

  it('passes unknown errors through instead of hiding them', () => {
    expect(describeError(new Error('network down'))).toBe('network down');
    expect(describeError('boom')).toBe('boom');
  });
});
