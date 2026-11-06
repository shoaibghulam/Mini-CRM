import { STATUS_LABELS, STATUS_ORDER } from '@/domain/status';
import { totalOf, type StatusCounts } from '@/domain/taskGroups';
import classes from './Status.module.css';

/** Proportional bar of task statuses. Decorative: the numbers are also shown as text next to it. */
export function StatusBar({ counts }: { counts: StatusCounts }) {
  const total = totalOf(counts);
  if (total === 0) return null;
  return (
    <div className={classes.bar} aria-hidden="true">
      {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
        <span
          key={s}
          className={classes.segment}
          data-status={s}
          style={{ flexGrow: counts[s] }}
          title={`${STATUS_LABELS[s]}: ${counts[s]}`}
        />
      ))}
    </div>
  );
}
