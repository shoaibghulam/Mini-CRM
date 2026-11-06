/**
 * Turns Supabase / PostgREST / Postgres errors into Russian user messages.
 * Unknown errors fall through with their original text, so nothing is hidden.
 */
interface ErrorLike {
  message?: unknown;
  code?: unknown;
}

const MESSAGE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/invalid login credentials/i, 'Неверный email или пароль'],
  [/task not found/i, 'Задача не найдена или недоступна'],
  [/transition .* is not allowed/i, 'Такой переход статуса запрещён'],
  [/not allowed for your role/i, 'Это действие недоступно для вашей роли'],
  [/comment is required/i, 'Нужен комментарий'],
  [/comment is too long/i, 'Комментарий слишком длинный (до 2000 символов)'],
  [/no profile/i, 'Для пользователя не создан профиль'],
  [/not authenticated/i, 'Сессия истекла, войдите снова'],
  [/accepted tasks are frozen/i, 'Принятую задачу нельзя изменить'],
  [/cannot reassign while under review/i, 'Нельзя сменить исполнителя, пока задача на проверке'],
  [/assignee must be a user with role assignee/i, 'Исполнителем может быть только пользователь с ролью «Исполнитель»'],
  [/status can only be changed via/i, 'Статус меняется только через действия задачи'],
  [/failed to fetch|networkerror|load failed/i, 'Нет связи с сервером. Проверьте подключение и повторите.'],
];

/** Codes whose generic message is complete on its own; the raw Postgres text would only confuse the user. */
const SELF_EXPLANATORY_CODES: ReadonlySet<string> = new Set(['23503']);

const CODE_RULES: Readonly<Record<string, string>> = {
  '23503': 'Нельзя удалить: есть связанные записи. Для объекта сначала удалите или перенесите его задачи.',
  '42501': 'Недостаточно прав для этого действия',
  '23514': 'Данные не прошли проверку в базе',
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : {};
}

export function describeError(error: unknown): string {
  const { message, code } = asErrorLike(error);
  const text = typeof message === 'string' ? message : String(error);
  const byMessage = MESSAGE_RULES.find(([pattern]) => pattern.test(text));
  if (byMessage) return byMessage[1];
  if (typeof code === 'string' && code in CODE_RULES) {
    return SELF_EXPLANATORY_CODES.has(code) ? `${CODE_RULES[code]}` : `${CODE_RULES[code]} (${text})`;
  }
  return text || 'Неизвестная ошибка';
}
