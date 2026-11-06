import { Link } from 'react-router-dom';
import { Tooltip, VisuallyHidden } from '@mantine/core';
import { IconBuildingCommunity, IconCalendar, IconChevronRight, IconUser } from '@tabler/icons-react';
import type { TaskRow } from '@/lib/database.types';
import { StatusBadge } from '@/components/StatusBadge';
import { RowActions } from '@/components/RowActions';
import { formatLongDateTime, formatRelative, nameOf } from '@/lib/format';
import classes from './RowList.module.css';

interface TaskListProps {
  readonly tasks: readonly TaskRow[];
  readonly names: ReadonlyMap<string, string>;
  /** When set, each row shows its site (used on My Tasks). */
  readonly siteNames?: ReadonlyMap<number, string>;
  /** Hide the assignee (My Tasks: it is always the current user). */
  readonly hideAssignee?: boolean;
  /** Hide the per-row badge when the list is already grouped by status. */
  readonly hideStatus?: boolean;
  /** Manager-only row actions. */
  readonly onEdit?: (task: TaskRow) => void;
  readonly onRemove?: (task: TaskRow) => void;
  readonly label: string;
}

function TaskMetaLine({ task, names, siteNames, hideAssignee }: Omit<TaskListProps, 'tasks' | 'label' | 'hideStatus'> & { task: TaskRow }) {
  return (
    <div className={classes.meta}>
      {siteNames && (
        <span className={classes.metaItem}>
          <IconBuildingCommunity size={15} aria-hidden="true" />
          <VisuallyHidden>Объект: </VisuallyHidden>{siteNames.get(task.site_id) ?? '—'}
        </span>
      )}
      {!hideAssignee && (
        <span className={classes.metaItem}>
          <IconUser size={15} aria-hidden="true" />
          <VisuallyHidden>Исполнитель: </VisuallyHidden>{nameOf(names, task.assignee_id)}
        </span>
      )}
      <Tooltip label={formatLongDateTime(task.created_at)}>
        <span className={`${classes.metaItem} tabular`}>
          <IconCalendar size={15} aria-hidden="true" />
          <time dateTime={task.created_at}>Создана {formatRelative(task.created_at)}</time>
        </span>
      </Tooltip>
    </div>
  );
}

export function TaskList({ tasks, label, onEdit, onRemove, hideStatus, ...meta }: TaskListProps) {
  const hasActions = Boolean(onEdit || onRemove);
  return (
    <ul className={classes.list} aria-label={label}>
      {tasks.map((task) => (
        <li key={task.id} className={classes.row}>
          <div className={classes.main}>
            <Link to={`/tasks/${task.id}`} className={classes.rowLink}>
              {task.title}
            </Link>
            <TaskMetaLine task={task} {...meta} />
          </div>
          {!hideStatus && (
            <div className={classes.aside}>
              <StatusBadge status={task.status} size="sm" />
            </div>
          )}
          <div className={classes.actions}>
            {hasActions ? (
              <RowActions
                subject={task.title}
                onEdit={onEdit && task.status !== 'accepted' ? () => onEdit(task) : undefined}
                onRemove={onRemove ? () => onRemove(task) : undefined}
              />
            ) : (
              <IconChevronRight size={18} className={classes.chevron} aria-hidden="true" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
