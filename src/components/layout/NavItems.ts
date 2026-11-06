import { IconBuildingCommunity, IconChecklist, type Icon } from '@tabler/icons-react';
import type { UserRole } from '@/lib/database.types';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: Icon;
}

export function navItemsFor(role: UserRole): readonly NavItem[] {
  const sites: NavItem = { to: '/sites', label: 'Объекты', icon: IconBuildingCommunity };
  if (role !== 'assignee') return [sites];
  return [{ to: '/my-tasks', label: 'Мои задачи', icon: IconChecklist }, sites];
}
