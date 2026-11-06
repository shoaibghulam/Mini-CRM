import { Text } from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';

/** Destructive-action confirmation. `onConfirm` handles its own errors (see `attempt`). */
export function confirmRemoval(title: string, text: string, onConfirm: () => void): void {
  openConfirmModal({
    title,
    children: <Text size="sm">{text}</Text>,
    labels: { confirm: 'Удалить', cancel: 'Отмена' },
    confirmProps: { color: 'red' },
    onConfirm,
  });
}
