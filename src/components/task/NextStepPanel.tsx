import { useState } from 'react';
import { Blockquote, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowBackUp, IconCheck, IconInfoCircle, IconPlayerPlay, IconSend } from '@tabler/icons-react';
import type { ProfileRow, TaskRow, TaskStatus, TaskStatusHistoryRow } from '@/lib/database.types';
import { changeTaskStatus } from '@/api/tasks';
import { availableActions, type TaskAction } from '@/domain/availableActions';
import { latestReworkComment, waitingHint } from '@/domain/nextStep';
import { attempt } from '@/lib/notify';
import { ReworkModal } from '@/components/ReworkModal';
import classes from './Task.module.css';

const ACTION_ICONS: Readonly<Partial<Record<TaskStatus, typeof IconCheck>>> = {
  in_progress: IconPlayerPlay,
  under_review: IconSend,
  accepted: IconCheck,
  needs_rework: IconArrowBackUp,
};

interface NextStepPanelProps {
  readonly task: TaskRow;
  readonly history: readonly TaskStatusHistoryRow[];
  readonly profile: ProfileRow;
  readonly onChanged: () => void;
}

/**
 * The one place on the task card where the workflow moves forward.
 * Buttons come from availableActions (UI hint only); the RPC is what actually allows or rejects.
 */
export function NextStepPanel({ task, history, profile, onChanged }: NextStepPanelProps) {
  const [pending, setPending] = useState<TaskAction | null>(null);
  const [reworkOpened, setReworkOpened] = useState(false);
  const actions = availableActions(profile.role, profile.id, task);
  const reworkNote = latestReworkComment(task.status, history);
  const rework = actions.find((a) => a.commentRequired);

  const run = async (action: TaskAction, comment: string | null): Promise<boolean> => {
    setPending(action);
    const ok = await attempt(() => changeTaskStatus(task.id, action.to, comment), `Статус изменён: ${action.label}`);
    setPending(null);
    onChanged();
    return ok;
  };

  return (
    <Paper className={classes.nextStep} data-has-actions={actions.length > 0} p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="sm">
        <Text size="xs" fw={700} tt="uppercase" className={classes.eyebrow}>
          {actions.length > 0 ? 'Следующий шаг' : 'Статус'}
        </Text>
        {reworkNote && (
          <Blockquote color="ember" p="sm" icon={null} className={classes.reworkNote}>
            <Text size="sm" fw={600} mb={4}>
              Замечание постановщика
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {reworkNote}
            </Text>
          </Blockquote>
        )}
        {actions.length === 0 ? (
          <Group gap="xs" wrap="nowrap">
            <IconInfoCircle size={18} aria-hidden="true" style={{ flex: 'none' }} />
            <Text size="sm">{waitingHint(task.status, profile.role)}</Text>
          </Group>
        ) : (
          <Group gap="sm">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.to] ?? IconCheck;
              return (
                <Button
                  key={action.to}
                  size="md"
                  color={action.commentRequired ? 'ember' : 'teal'}
                  variant={action.commentRequired ? 'outline' : 'filled'}
                  leftSection={<Icon size={18} aria-hidden="true" />}
                  loading={pending === action}
                  disabled={pending !== null && pending !== action}
                  onClick={() => (action.commentRequired ? setReworkOpened(true) : void run(action, null))}
                >
                  {action.label}
                </Button>
              );
            })}
          </Group>
        )}
      </Stack>
      {rework && (
        <ReworkModal opened={reworkOpened} onClose={() => setReworkOpened(false)} onSubmit={(c) => run(rework, c)} />
      )}
    </Paper>
  );
}
