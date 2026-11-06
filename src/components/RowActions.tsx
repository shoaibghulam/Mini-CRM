import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';

interface RowActionsProps {
  /** Used in the accessible name: «Действия: <subject>». */
  readonly subject: string;
  readonly onEdit?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly size?: 'md' | 'lg';
}

/** Secondary (edit) and destructive (delete) actions kept out of the way behind one menu. */
export function RowActions({ subject, onEdit, onRemove, size = 'lg' }: RowActionsProps) {
  if (!onEdit && !onRemove) return null;
  return (
    <Menu>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size={size} aria-label={`Действия: ${subject}`}>
          <IconDots size={20} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onEdit && (
          <Menu.Item leftSection={<IconPencil size={16} aria-hidden="true" />} onClick={onEdit}>
            Изменить
          </Menu.Item>
        )}
        {onRemove && (
          <Menu.Item color="red" leftSection={<IconTrash size={16} aria-hidden="true" />} onClick={onRemove}>
            Удалить
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
