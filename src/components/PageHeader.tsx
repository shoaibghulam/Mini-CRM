import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';

export interface Crumb {
  readonly label: string;
  /** Omit for the current page. */
  readonly to?: string;
}

interface PageHeaderProps {
  readonly title: ReactNode;
  readonly crumbs?: readonly Crumb[];
  /** Small line under the title (address, counts...). */
  readonly description?: ReactNode;
  /** Right-aligned on desktop, wraps under the title on phones. */
  readonly actions?: ReactNode;
  /** Inline element right after the title (status badge). */
  readonly badge?: ReactNode;
  /** Keep compact actions (an icon menu) beside the title on phones instead of wrapping below. */
  readonly inlineActions?: boolean;
}

export function PageHeader({ title, crumbs, description, actions, badge, inlineActions = false }: PageHeaderProps) {
  return (
    <Stack gap="xs" component="header" mb="lg">
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs
          component="nav"
          aria-label="Навигационная цепочка"
          separator={<IconChevronRight size={14} aria-hidden="true" />}
          separatorMargin={4}
          styles={{ root: { flexWrap: 'wrap', rowGap: 4 } }}
        >
          {crumbs.map((crumb) =>
            crumb.to ? (
              <Anchor key={crumb.label} component={Link} to={crumb.to} size="sm" c="dimmed" underline="hover">
                {crumb.label}
              </Anchor>
            ) : (
              <Text key={crumb.label} size="sm" aria-current="page" truncate maw={240}>
                {crumb.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-start" gap="md" wrap={inlineActions ? 'nowrap' : 'wrap'} preventGrowOverflow={false}>
        <Stack gap={6} style={{ flex: inlineActions ? '1 1 0' : '1 1 18rem', minWidth: 0 }}>
          <Group gap="sm" align="center" wrap="wrap" preventGrowOverflow={false}>
            <Title order={1} style={{ overflowWrap: 'anywhere' }}>
              {title}
            </Title>
            {badge}
          </Group>
          {description && (
            <Text c="dimmed" size="sm" component="div">
              {description}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  );
}
