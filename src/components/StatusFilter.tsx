import type { TaskStatus } from '@/lib/database.types';
import { STATUS_LABELS, STATUS_ORDER } from '@/domain/status';
import { totalOf, type StatusCounts } from '@/domain/taskGroups';
import classes from './Status.module.css';

export type StatusFilterValue = TaskStatus | 'all';

interface StatusFilterProps {
  readonly value: StatusFilterValue;
  readonly counts: StatusCounts;
  readonly onChange: (value: StatusFilterValue) => void;
}

/** Client-side filter. Toggle buttons (aria-pressed) so it works with keyboard and screen readers. */
export function StatusFilter({ value, counts, onChange }: StatusFilterProps) {
  const options: readonly { key: StatusFilterValue; label: string; count: number }[] = [
    { key: 'all', label: 'Все', count: totalOf(counts) },
    ...STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({ key: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];

  return (
    <div className={classes.chips} role="group" aria-label="Фильтр по статусу">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={classes.chip}
          data-status={option.key}
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.key !== 'all' && <span className={classes.dot} aria-hidden="true" />}
          {option.label}
          <span className={classes.count}>{option.count}</span>
        </button>
      ))}
    </div>
  );
}
