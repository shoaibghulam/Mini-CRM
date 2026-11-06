import { Group, Paper, Skeleton, Stack } from '@mantine/core';

const ROWS = [0, 1, 2, 3];

/** Mirrors the list rows (title, meta line, badge) so the layout does not jump on load. */
export function ListSkeleton({ rows = ROWS.length }: { rows?: number }) {
  return (
    <Paper withBorder>
      {ROWS.slice(0, rows).map((i) => (
        <Group key={i} justify="space-between" p="md" wrap="nowrap" style={{ borderTop: i ? '1px solid var(--app-border)' : undefined }}>
          <Stack gap={8} style={{ flex: 1 }}>
            <Skeleton h={16} w="45%" />
            <Skeleton h={12} w="70%" />
          </Stack>
          <Skeleton h={24} w={96} radius="sm" />
        </Group>
      ))}
    </Paper>
  );
}

export function DetailSkeleton() {
  return (
    <Stack gap="lg">
      <Skeleton h={14} w={220} />
      <Skeleton h={28} w="60%" />
      <Skeleton h={96} radius="lg" />
      <Paper withBorder p="lg">
        <Stack gap="sm">
          <Skeleton h={14} w="30%" />
          <Skeleton h={14} w="80%" />
          <Skeleton h={14} w="65%" />
        </Stack>
      </Paper>
    </Stack>
  );
}
