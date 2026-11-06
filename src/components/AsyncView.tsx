import type { ReactNode } from 'react';
import { Button, EmptyState, Paper, VisuallyHidden } from '@mantine/core';
import { IconAlertTriangle, IconInbox, IconRefresh } from '@tabler/icons-react';
import type { AsyncData } from '@/hooks/useAsyncData';
import { ListSkeleton } from '@/components/Skeletons';

interface AsyncViewProps<T> {
  readonly state: AsyncData<T>;
  readonly onRetry: () => void;
  /** Placeholder shaped like the content; defaults to a list. */
  readonly skeleton?: ReactNode;
  readonly children: (data: T) => ReactNode;
}

/** Loading / error / success switch shared by every screen. */
export function AsyncView<T>({ state, onRetry, skeleton, children }: AsyncViewProps<T>) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite">
        <VisuallyHidden>Загрузка…</VisuallyHidden>
        {skeleton ?? <ListSkeleton />}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <Paper withBorder p="xl" role="alert">
        <EmptyState
          variant="light"
          color="red"
          icon={<IconAlertTriangle size={28} stroke={1.75} aria-hidden="true" />}
          title="Не удалось загрузить данные"
          description={state.message}
        >
          <EmptyState.Actions>
            <Button variant="default" leftSection={<IconRefresh size={18} aria-hidden="true" />} onClick={onRetry}>
              Повторить
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      </Paper>
    );
  }
  return <>{children(state.data)}</>;
}

interface EmptyNoteProps {
  readonly title?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

/** Empty / not-found state: says what is (not) here and, when possible, what to do next. */
export function EmptyNote({ title, icon, action, children }: EmptyNoteProps) {
  return (
    <Paper withBorder p="xl">
      <EmptyState
        withIndicatorBackground
        icon={icon ?? <IconInbox size={28} stroke={1.5} aria-hidden="true" />}
        title={title}
        description={children}
      >
        {action && <EmptyState.Actions>{action}</EmptyState.Actions>}
      </EmptyState>
    </Paper>
  );
}
