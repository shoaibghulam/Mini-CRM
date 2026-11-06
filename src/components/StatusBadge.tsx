import type { TaskStatus } from '@/lib/database.types';
import { STATUS_LABELS } from '@/domain/status';
import classes from './Status.module.css';

interface StatusBadgeProps {
  readonly status: TaskStatus;
  readonly size?: 'sm' | 'md';
}

/** Text label + dot + colour, so colour is never the only signal. Colours: --status-* tokens. */
export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  return (
    <span className={classes.badge} data-size={size} data-status={status}>
      <span className={classes.dot} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
