import { Group, Paper, Text, Timeline, VisuallyHidden } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import type { TaskStatusHistoryRow } from '@/lib/database.types';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatRelative, nameOf } from '@/lib/format';
import classes from './Task.module.css';

interface HistoryTimelineProps {
  readonly rows: readonly TaskStatusHistoryRow[];
  readonly names: ReadonlyMap<string, string>;
}

/** Read-only: history is written only by the DB (RPC + creation trigger). Newest first. */
export function HistoryTimeline({ rows, names }: HistoryTimelineProps) {
  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        История пока пуста.
      </Text>
    );
  }
  const newestFirst = [...rows].reverse();
  return (
    <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
      <Timeline bulletSize={14} lineWidth={2} active={-1}>
        {newestFirst.map((row) => (
          <Timeline.Item
            key={row.id}
            bullet={<span className={classes.timelineBullet} data-status={row.to_status} />}
            title={
              <Group gap={6} wrap="wrap">
                {row.from_status ? (
                  <>
                    <StatusBadge status={row.from_status} size="sm" />
                    <IconArrowRight size={14} aria-hidden="true" />
                    <VisuallyHidden>перешла в статус</VisuallyHidden>
                  </>
                ) : (
                  <Text size="sm" fw={600}>
                    Задача создана:
                  </Text>
                )}
                <StatusBadge status={row.to_status} size="sm" />
              </Group>
            }
          >
            <Text size="sm" fw={600} mt={6}>
              {nameOf(names, row.actor_id)}
            </Text>
            <Text size="sm" c="dimmed">
              <time dateTime={row.created_at} className="tabular">
                {formatRelative(row.created_at)} · {formatDateTime(row.created_at)}
              </time>
            </Text>
            {row.comment && <blockquote className={classes.comment}>{row.comment}</blockquote>}
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
}
