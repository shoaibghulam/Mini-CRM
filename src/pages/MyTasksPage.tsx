import { useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Group, Stack, Text, Title } from '@mantine/core';
import { IconChecklist } from '@tabler/icons-react';
import type { TaskRow } from '@/lib/database.types';
import { fetchTasksByAssignee } from '@/api/tasks';
import { fetchSites } from '@/api/sites';
import { useProfile } from '@/auth/authContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { AsyncView, EmptyNote } from '@/components/AsyncView';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TaskList } from '@/components/TaskList';
import { STATUS_LABELS } from '@/domain/status';
import { ASSIGNEE_ACTIONABLE, ASSIGNEE_FOCUS_ORDER, groupByStatus } from '@/domain/taskGroups';
import { pluralRu } from '@/lib/format';

interface MyTasksData {
  readonly tasks: readonly TaskRow[];
  readonly siteNames: ReadonlyMap<number, string>;
}

async function loadMyTasks(userId: string): Promise<MyTasksData> {
  const [tasks, sites] = await Promise.all([fetchTasksByAssignee(userId), fetchSites()]);
  return { tasks, siteNames: new Map(sites.map((s) => [s.id, s.name])) };
}

const EMPTY_NAMES: ReadonlyMap<string, string> = new Map();

function summary(tasks: readonly TaskRow[]): string {
  const todo = tasks.filter((t) => ASSIGNEE_ACTIONABLE.has(t.status)).length;
  if (tasks.length === 0) return 'Задачи, назначенные вам';
  if (todo === 0) return 'Сейчас от вас ничего не требуется';
  return `Требуют вашего действия: ${todo} ${pluralRu(todo, ['задача', 'задачи', 'задач'])}`;
}

function MyTasksView({ userId }: { userId: string }) {
  const loader = useCallback(() => loadMyTasks(userId), [userId]);
  const [state, reload] = useAsyncData(loader);

  return (
    <>
      <PageHeader title="Мои задачи" description={state.status === 'success' ? summary(state.data.tasks) : undefined} />
      <AsyncView state={state} onRetry={reload}>
        {({ tasks, siteNames }) =>
          tasks.length === 0 ? (
            <EmptyNote title="Задач пока нет" icon={<IconChecklist size={28} stroke={1.5} aria-hidden="true" />}>
              Когда постановщик назначит вам задачу, она появится здесь.
            </EmptyNote>
          ) : (
            <Stack gap="xl">
              {groupByStatus(tasks, ASSIGNEE_FOCUS_ORDER).map((group) => (
                <section key={group.status} aria-labelledby={`group-${group.status}`}>
                  <Group gap="xs" mb="sm">
                    <Title order={2} size="h3" id={`group-${group.status}`}>
                      <StatusBadge status={group.status} />
                    </Title>
                    <Text c="dimmed" size="sm" className="tabular">
                      {group.items.length} {pluralRu(group.items.length, ['задача', 'задачи', 'задач'])}
                    </Text>
                  </Group>
                  <TaskList
                    tasks={group.items}
                    names={EMPTY_NAMES}
                    siteNames={siteNames}
                    hideAssignee
                    hideStatus
                    label={STATUS_LABELS[group.status]}
                  />
                </section>
              ))}
            </Stack>
          )
        }
      </AsyncView>
    </>
  );
}

/** Assignee-only screen. Managers are sent to the site list. */
export function MyTasksPage() {
  const profile = useProfile();
  if (profile.role !== 'assignee') return <Navigate to="/sites" replace />;
  return <MyTasksView userId={profile.id} />;
}
