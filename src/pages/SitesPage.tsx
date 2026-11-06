import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconBuildingCommunity, IconPlus } from '@tabler/icons-react';
import type { SiteRow } from '@/lib/database.types';
import { createSite, deleteSite, fetchSites, updateSite, type SiteInput } from '@/api/sites';
import { fetchTaskStatusRows } from '@/api/taskStats';
import { useProfile } from '@/auth/authContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { AsyncView, EmptyNote } from '@/components/AsyncView';
import { PageHeader } from '@/components/PageHeader';
import { SiteFormModal } from '@/components/SiteFormModal';
import { SiteList } from '@/components/SiteList';
import { countsBySite, type StatusCounts } from '@/domain/taskGroups';
import { attempt } from '@/lib/notify';
import { confirmRemoval } from '@/lib/confirm';
import { pluralRu } from '@/lib/format';

interface SitesData {
  readonly sites: readonly SiteRow[];
  readonly counts: ReadonlyMap<number, StatusCounts>;
}

/** RLS decides what comes back: all sites for managers, only sites with own tasks for assignees. */
async function loadSites(): Promise<SitesData> {
  const [sites, rows] = await Promise.all([fetchSites(), fetchTaskStatusRows()]);
  return { sites, counts: countsBySite(rows) };
}

function describeCount(n: number): string {
  return `${n} ${pluralRu(n, ['объект', 'объекта', 'объектов'])}`;
}

export function SitesPage() {
  const profile = useProfile();
  const canManage = profile.role === 'manager';
  const [state, reload] = useAsyncData(loadSites);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [formOpened, setFormOpened] = useState(false);

  const openForm = (site: SiteRow | null) => {
    setEditing(site);
    setFormOpened(true);
  };

  const save = async (input: SiteInput): Promise<boolean> => {
    const ok = editing
      ? await attempt(() => updateSite(editing.id, input), 'Объект сохранён')
      : await attempt(() => createSite(input), 'Объект создан');
    if (ok) reload();
    return ok;
  };

  const remove = (site: SiteRow) =>
    confirmRemoval('Удалить объект?', `«${site.name}» будет удалён. Объект с задачами удалить нельзя.`, () => {
      void attempt(() => deleteSite(site.id), 'Объект удалён').then((ok) => ok && reload());
    });

  const createButton = canManage ? (
    <Button leftSection={<IconPlus size={18} aria-hidden="true" />} onClick={() => openForm(null)}>
      Новый объект
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Объекты"
        description={
          state.status === 'success'
            ? describeCount(state.data.sites.length)
            : canManage
              ? 'Все строительные объекты'
              : 'Объекты, где у вас есть задачи'
        }
        actions={state.status === 'success' && state.data.sites.length === 0 ? null : createButton}
      />
      <AsyncView state={state} onRetry={reload}>
        {({ sites, counts }) =>
          sites.length === 0 ? (
            <EmptyNote
              title={canManage ? 'Объектов пока нет' : 'Нет объектов с вашими задачами'}
              icon={<IconBuildingCommunity size={28} stroke={1.5} aria-hidden="true" />}
              action={createButton}
            >
              {canManage
                ? 'Создайте первый объект, затем добавьте в него задачи для исполнителей.'
                : 'Объект появится здесь, когда постановщик назначит вам задачу.'}
            </EmptyNote>
          ) : (
            <SiteList
              sites={sites}
              counts={counts}
              ownTasksOnly={!canManage}
              onEdit={canManage ? openForm : undefined}
              onRemove={canManage ? remove : undefined}
            />
          )
        }
      </AsyncView>
      {canManage && (
        <SiteFormModal opened={formOpened} site={editing} onClose={() => setFormOpened(false)} onSubmit={save} />
      )}
    </>
  );
}
