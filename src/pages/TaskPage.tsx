import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Paper, Text, Title } from '@mantine/core';
import type { SiteRow, TaskRow, TaskStatusHistoryRow } from '@/lib/database.types';
import { fetchTask } from '@/api/tasks';
import { fetchSite } from '@/api/sites';
import { fetchTaskHistory } from '@/api/history';
import { fetchProfileNames } from '@/api/profiles';
import { useProfile } from '@/auth/authContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useTaskEditor } from '@/hooks/useTaskEditor';
import { AsyncView, EmptyNote } from '@/components/AsyncView';
import { DetailSkeleton } from '@/components/Skeletons';
import { PageHeader, type Crumb } from '@/components/PageHeader';
import { RowActions } from '@/components/RowActions';
import { StatusBadge } from '@/components/StatusBadge';
import { HistoryTimeline } from '@/components/task/HistoryTimeline';
import { NextStepPanel } from '@/components/task/NextStepPanel';
import { TaskMeta } from '@/components/task/TaskMeta';
import { parseId } from '@/domain/validation';
import classes from '@/components/task/Task.module.css';

interface TaskData {
  readonly task: TaskRow;
  readonly site: SiteRow | null;
  readonly history: readonly TaskStatusHistoryRow[];
  readonly names: ReadonlyMap<string, string>;
}

async function loadTask(id: number): Promise<TaskData | null> {
  const task = await fetchTask(id);
  if (task === null) return null;
  const [site, history] = await Promise.all([fetchSite(task.site_id), fetchTaskHistory(id)]);
  const names = await fetchProfileNames([task.assignee_id, task.author_id, ...history.map((h) => h.actor_id)]);
  return { task, site, history, names };
}

function crumbsFor(isAssignee: boolean, site: SiteRow | null, title: string): Crumb[] {
  const root: Crumb = isAssignee ? { label: 'Мои задачи', to: '/my-tasks' } : { label: 'Объекты', to: '/sites' };
  const siteCrumb: Crumb[] = site && !isAssignee ? [{ label: site.name, to: `/sites/${site.id}` }] : [];
  return [root, ...siteCrumb, { label: title }];
}

function TaskView({ taskId }: { taskId: number }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const canManage = profile.role === 'manager';
  const loader = useCallback(() => loadTask(taskId), [taskId]);
  const [state, reload] = useAsyncData(loader);
  const editor = useTaskEditor(canManage, null, reload);

  return (
    <AsyncView state={state} onRetry={reload} skeleton={<DetailSkeleton />}>
      {(data) =>
        data === null ? (
          <>
            <PageHeader title="Задача не найдена" crumbs={crumbsFor(!canManage, null, 'Задача')} />
            <EmptyNote>Задача удалена или недоступна для вашей учётной записи.</EmptyNote>
          </>
        ) : (
          <>
            <PageHeader
              crumbs={crumbsFor(!canManage, data.site, data.task.title)}
              title={data.task.title}
              badge={<StatusBadge status={data.task.status} />}
              inlineActions
              actions={
                canManage && (
                  <RowActions
                    subject={data.task.title}
                    onEdit={data.task.status !== 'accepted' ? () => editor.openEdit(data.task) : undefined}
                    onRemove={() => editor.remove(data.task, () => navigate(`/sites/${data.task.site_id}`))}
                  />
                )
              }
            />
            <div className={classes.layout}>
              <div className={classes.areaNext}>
                <NextStepPanel task={data.task} history={data.history} profile={profile} onChanged={reload} />
              </div>
              <div className={classes.areaMeta}>
                <TaskMeta task={data.task} site={data.site} names={data.names} />
              </div>
              <Paper
                withBorder
                p={{ base: 'md', sm: 'lg' }}
                component="section"
                aria-labelledby="task-desc-heading"
                className={classes.areaMain}
              >
                  <Title order={2} id="task-desc-heading" size="h3" mb="sm">
                    Описание
                  </Title>
                  <Text className={classes.description} c={data.task.description ? 'var(--mantine-color-text)' : 'dimmed'}>
                    {data.task.description || 'Описание не добавлено.'}
                  </Text>
                </Paper>
                <section aria-labelledby="task-history-heading" className={classes.areaMain}>
                  <Title order={2} id="task-history-heading" size="h3" mb="sm">
                    История статусов
                  </Title>
                  <HistoryTimeline rows={data.history} names={data.names} />
                </section>
            </div>
            {editor.modal}
          </>
        )
      }
    </AsyncView>
  );
}

export function TaskPage() {
  const taskId = parseId(useParams().id);
  if (taskId === null) {
    return (
      <>
        <PageHeader title="Некорректная ссылка" crumbs={[{ label: 'Объекты', to: '/sites' }]} />
        <EmptyNote>Проверьте адрес страницы или вернитесь к списку.</EmptyNote>
      </>
    );
  }
  return <TaskView key={taskId} taskId={taskId} />;
}
