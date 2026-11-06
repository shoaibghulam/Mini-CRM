import { Link } from 'react-router-dom';
import { IconCrane } from '@tabler/icons-react';
import classes from './Layout.module.css';

interface BrandMarkProps {
  /** When set, the mark is a link (header). On the login page it is plain text. */
  readonly to?: string;
}

export function BrandMark({ to }: BrandMarkProps) {
  const content = (
    <>
      <span className={classes.brandIcon} aria-hidden="true">
        <IconCrane size={20} stroke={1.75} />
      </span>
      <span className={classes.brandText}>
        Объекты <span className={classes.brandAmp}>и</span> задачи
      </span>
    </>
  );
  if (!to) return <span className={classes.brand}>{content}</span>;
  return (
    <Link to={to} className={classes.brand} aria-label="Объекты и задачи — на главную">
      {content}
    </Link>
  );
}
