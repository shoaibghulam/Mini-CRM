import { Link } from 'react-router-dom';
import { Text } from '@mantine/core';
import { IconChevronRight, IconMapPin } from '@tabler/icons-react';
import type { SiteRow } from '@/lib/database.types';
import { STATUS_LABELS } from '@/domain/status';
import { EMPTY_COUNTS, totalOf, type StatusCounts } from '@/domain/taskGroups';
import { pluralRu } from '@/lib/format';
import { RowActions } from '@/components/RowActions';
import { StatusBar } from '@/components/StatusBar';
import classes from './RowList.module.css';

const TASK_FORMS = ['задача', 'задачи', 'задач'] as const;

interface SiteListProps {
  readonly sites: readonly SiteRow[];
  readonly counts: ReadonlyMap<number, StatusCounts>;
  /** Assignees see only their own tasks, so the counter says so. */
  readonly ownTasksOnly: boolean;
  readonly onEdit?: ((site: SiteRow) => void) | undefined;
  readonly onRemove?: ((site: SiteRow) => void) | undefined;
}

/** "5 задач · 2 на проверке" — the attention-worthy statuses are spelled out. */
function summaryText(counts: StatusCounts, ownTasksOnly: boolean): string {
  const total = totalOf(counts);
  if (total === 0) return ownTasksOnly ? 'Нет ваших задач' : 'Задач пока нет';
  const head = `${total} ${pluralRu(total, TASK_FORMS)}${ownTasksOnly ? ' ваших' : ''}`;
  const details = (['under_review', 'needs_rework'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${STATUS_LABELS[s].toLowerCase()}: ${counts[s]}`);
  return [head, ...details].join(' · ');
}

export function SiteList({ sites, counts, ownTasksOnly, onEdit, onRemove }: SiteListProps) {
  return (
    <ul className={classes.list} aria-label="Список объектов">
      {sites.map((site) => {
        const siteCounts = counts.get(site.id) ?? EMPTY_COUNTS;
        return (
          <li key={site.id} className={classes.row}>
            <div className={classes.main}>
              <Link to={`/sites/${site.id}`} className={classes.rowLink}>
                {site.name}
              </Link>
              <div className={classes.meta}>
                <span className={classes.metaItem}>
                  <IconMapPin size={15} aria-hidden="true" />
                  {site.address || 'Адрес не указан'}
                </span>
              </div>
            </div>
            <div className={classes.aside} style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: '11rem' }}>
              <Text size="sm" c="dimmed" className="tabular">
                {summaryText(siteCounts, ownTasksOnly)}
              </Text>
              <StatusBar counts={siteCounts} />
            </div>
            <div className={classes.actions}>
              {onEdit || onRemove ? (
                <RowActions
                  subject={site.name}
                  onEdit={onEdit ? () => onEdit(site) : undefined}
                  onRemove={onRemove ? () => onRemove(site) : undefined}
                />
              ) : (
                <IconChevronRight size={18} className={classes.chevron} aria-hidden="true" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
