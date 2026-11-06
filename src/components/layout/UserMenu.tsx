import { Avatar, Badge, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconLogout } from '@tabler/icons-react';
import type { ProfileRow } from '@/lib/database.types';
import { ROLE_LABELS } from '@/domain/status';
import classes from './Layout.module.css';

interface UserMenuProps {
  readonly profile: ProfileRow;
  readonly onSignOut: () => void;
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function UserMenu({ profile, onSignOut }: UserMenuProps) {
  return (
    <Menu width={240}>
      <Menu.Target>
        <UnstyledButton className={classes.userButton} aria-label={`Профиль: ${profile.full_name}`}>
          <Avatar color="teal" radius="xl" size={32} aria-hidden="true">
            {initialsOf(profile.full_name)}
          </Avatar>
          <Stack gap={0} align="flex-start">
            <Text size="sm" fw={600} lh={1.2} truncate maw={160}>
              {profile.full_name}
            </Text>
            <Text size="xs" c="dimmed" lh={1.2}>
              {ROLE_LABELS[profile.role]}
            </Text>
          </Stack>
          <IconChevronDown size={16} aria-hidden="true" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          Вы вошли как <Badge size="sm" variant="light" ml={4}>{ROLE_LABELS[profile.role]}</Badge>
        </Menu.Label>
        <Menu.Item leftSection={<IconLogout size={16} aria-hidden="true" />} onClick={onSignOut}>
          Выйти
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
