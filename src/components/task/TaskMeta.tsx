import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Paper, Text, Title } from '@mantine/core';
import type { SiteRow, TaskRow } from '@/lib/database.types';
import { formatLongDateTime, formatRelative, nameOf } from '@/lib/format';
import classes from './Task.module.css';

interface TaskMetaProps {
  readonly task: TaskRow;
  readonly site: SiteRow | null;
  readonly names: ReadonlyMap<string, string>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Side panel on desktop, block under the description on phones. */
export function TaskMeta({ task, site, names }: TaskMetaProps) {
  return (
    <Paper withBorder p="lg" component="aside" aria-labelledby="task-meta-heading">
      <Title order={2} id="task-meta-heading" size="h3" mb="md">
        Детали
      </Title>
      <dl className={classes.metaList}>
        <Field label="Объект">
          {site ? (
            <Anchor component={Link} to={`/sites/${site.id}`} fw={500}>
              {site.name}
            </Anchor>
          ) : (
            '—'
          )}
          {site?.address && (
            <Text size="sm" c="dimmed">
              {site.address}
            </Text>
          )}
        </Field>
        <Field label="Исполнитель">{nameOf(names, task.assignee_id)}</Field>
        <Field label="Постановщик">{nameOf(names, task.author_id)}</Field>
        <Field label="Создана">
          <time dateTime={task.created_at} className="tabular">
            {formatLongDateTime(task.created_at)}
          </time>
          <Text size="sm" c="dimmed">
            {formatRelative(task.created_at)}
          </Text>
        </Field>
      </dl>
    </Paper>
  );
}
