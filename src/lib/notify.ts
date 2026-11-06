import { notifications } from '@mantine/notifications';
import { describeError } from '@/domain/errors';

export function notifyError(error: unknown): void {
  notifications.show({ color: 'red', title: 'Ошибка', message: describeError(error), autoClose: 8000 });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'green', message });
}

/**
 * Runs a write, shows the outcome, and reports success so the caller can
 * refetch / close. Errors are always shown, never swallowed.
 */
export async function attempt(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
  try {
    await action();
    notifySuccess(successMessage);
    return true;
  } catch (error) {
    notifyError(error);
    return false;
  }
}
