import { useCallback, useState } from 'react';
import { Button, Group, Stack, Title } from '@mantine/core';
import { IconClipboardList, IconMapPin, IconMoodEmpty, IconPlus } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';
import type { SiteRow, TaskRow } from '@/lib/database.types';
import { fetchSite, updateSite, type SiteInput } from '@/api/sites';
import { fetchTasksBySite } from '@/api/tasks';
import { fetchProfileNames } from '@/api/profiles';
import { useProfile } from '@/auth/authContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useTaskEditor } from '@/hooks/useTaskEditor';
import { AsyncView, EmptyNote } from '@/components/AsyncView';
import { DetailSkeleton } from '@/components/Skeletons';
import { PageHeader } from '@/components/PageHeader';
import { RowActions } from '@/components/RowActions';
import { SiteFormModal } from '@/components/SiteFormModal';
import { StatusFilter, type StatusFilterValue } from '@/components/StatusFilter';
import { TaskList } from '@/components/TaskList';
import { countByStatus } from '@/domain/taskGroups';
import { parseId } from '@/domain/validation';
import { attempt } from '@/lib/notify';

interface SiteData {
  readonly site: SiteRow | null;
  readonly tasks: readonly TaskRow[];
  readonly names: ReadonlyMap<string, string>;
}

async function loadSite(id: number): Promise<SiteData> {
  const [site, tasks] = await Promise.all([fetchSite(id), fetchTasksBySite(id)]);
  const names = await fetchProfileNames(tasks.map((t) => t.assignee_id));
  return { site, tasks, names };
}

const SITES_CRUMB = { label: 'Объекты', to: '/sites' };

interface SiteTasksProps {
  readonly data: SiteData & { site: SiteRow };
  readonly canManage: boolean;
  readonly editor: ReturnType<typeof useTaskEditor>;
  readonly reload: () => void;
}

function SiteTasks({ data, canManage, editor, reload }: SiteTasksProps) {
  const [filter, setFilter] = useState<StatusFilterValue>('all');
  const counts = countByStatus(data.tasks);
  // A filter whose status disappeared after a change falls back to "all".
  const active = filter !== 'all' && counts[filter] === 0 ? 'all' : filter;
  const visible = active === 'all' ? data.tasks : data.tasks.filter((t) => t.status === active);

  if (data.tasks.length === 0) {
    return (
      <EmptyNote
        title="На объекте пока нет задач"
        icon={<IconClipboardList size={28} stroke={1.5} aria-hidden="true" />}
        action={
          canManage ? (
            <Button leftSection={<IconPlus size={18} aria-hidden="true" />} onClick={editor.openCreate}>
              Новая задача
            </Button>
          ) : null
        }
      >
        {canManage ? 'Поставьте первую задачу и назначьте исполнителя.' : 'Здесь появятся ваши задачи по этому объекту.'}
      </EmptyNote>
    );
  }

  return (
    <Stack gap="md">
      <StatusFilter value={active} counts={counts} onChange={setFilter} />
      {visible.length === 0 ? (
        <EmptyNote icon={<IconMoodEmpty size={28} stroke={1.5} aria-hidden="true" />}>Нет задач с этим статусом.</EmptyNote>
      ) : (
        <TaskList
          tasks={visible}
          names={data.names}
          label="Задачи объекта"
          {...(canManage ? { onEdit: editor.openEdit, onRemove: (t: TaskRow) => editor.remove(t, reload) } : {})}
        />
      )}
    </Stack>
  );
}

function SiteView({ siteId }: { siteId: number }) {
  const profile = useProfile();
  const canManage = profile.role === 'manager';
  const loader = useCallback(() => loadSite(siteId), [siteId]);
  const [state, reload] = useAsyncData(loader);
  const editor = useTaskEditor(canManage, siteId, reload);
  const [siteFormOpened, setSiteFormOpened] = useState(false);

  const saveSite = async (input: SiteInput) => {
    const ok = await attempt(() => updateSite(siteId, input), 'Объект сохранён');
    if (ok) reload();
    return ok;
  };

  return (
    <AsyncView state={state} onRetry={reload} skeleton={<DetailSkeleton />}>
      {(data) =>
        data.site === null ? (
          <>
            <PageHeader title="Объект не найден" crumbs={[SITES_CRUMB]} />
            <EmptyNote>Объект удалён или недоступен для вашей учётной записи.</EmptyNote>
          </>
        ) : (
          <>
            <PageHeader
              crumbs={[SITES_CRUMB, { label: data.site.name }]}
              title={data.site.name}
              description={
                <Group gap={6} wrap="nowrap">
                  <IconMapPin size={16} aria-hidden="true" style={{ flex: 'none' }} />
                  {data.site.address || 'Адрес не указан'}
                </Group>
              }
              actions={
                canManage && (
                  <>
                    <Button leftSection={<IconPlus size={18} aria-hidden="true" />} onClick={editor.openCreate}>
                      Новая задача
                    </Button>
                    <RowActions subject={data.site.name} onEdit={() => setSiteFormOpened(true)} size="lg" />
                  </>
                )
              }
            />
            <section aria-labelledby="site-tasks-heading">
              <Title order={2} id="site-tasks-heading" mb="sm">
                Задачи
              </Title>
              <SiteTasks data={{ ...data, site: data.site }} canManage={canManage} editor={editor} reload={reload} />
            </section>
            {editor.modal}
            {canManage && (
              <SiteFormModal
                opened={siteFormOpened}
                site={data.site}
                onClose={() => setSiteFormOpened(false)}
                onSubmit={saveSite}
              />
            )}
          </>
        )
      }
    </AsyncView>
  );
}

export function SitePage() {
  const siteId = parseId(useParams().id);
  if (siteId === null) {
    return (
      <>
        <PageHeader title="Некорректная ссылка" crumbs={[SITES_CRUMB]} />
        <EmptyNote>Проверьте адрес страницы или вернитесь к списку объектов.</EmptyNote>
      </>
    );
  }
  return <SiteView key={siteId} siteId={siteId} />;
}
