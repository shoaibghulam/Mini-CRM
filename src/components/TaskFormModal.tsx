import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { ProfileRow, SiteRow, TaskRow } from '@/lib/database.types';
import type { TaskInput } from '@/api/tasks';
import { requiredText } from '@/domain/validation';
import { LIMITS } from '@/domain/limits';

export interface TaskFormOptions {
  readonly assignees: readonly ProfileRow[];
  readonly sites: readonly SiteRow[];
}

interface TaskFormModalProps {
  readonly opened: boolean;
  /** null = create a new task. */
  readonly task: TaskRow | null;
  readonly defaultSiteId: number | null;
  readonly options: TaskFormOptions;
  readonly onClose: () => void;
  readonly onSubmit: (input: TaskInput) => Promise<boolean>;
}

interface FormValues {
  title: string;
  description: string;
  siteId: string;
  assigneeId: string;
}

function initialValues(task: TaskRow | null, defaultSiteId: number | null): FormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    siteId: String(task?.site_id ?? defaultSiteId ?? ''),
    assigneeId: task?.assignee_id ?? '',
  };
}

/** Status and author are not in the form: the DB sets/guards them (column grants + triggers). */
export function TaskFormModal({ opened, task, defaultSiteId, options, onClose, onSubmit }: TaskFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    initialValues: initialValues(null, defaultSiteId),
    validate: {
      title: requiredText('Укажите название задачи'),
      siteId: requiredText('Выберите объект'),
      assigneeId: requiredText('Выберите исполнителя'),
    },
  });

  useEffect(() => {
    if (opened) form.setValues(initialValues(task, defaultSiteId));
    // Reset only when the modal opens for a (possibly different) task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, task, defaultSiteId]);

  // Mirrors the DB rule: no reassignment while the task is under review.
  const reassignLocked = task?.status === 'under_review';

  const submit = form.onSubmit(async (values) => {
    setSubmitting(true);
    const ok = await onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      site_id: Number(values.siteId),
      assignee_id: values.assigneeId,
    });
    setSubmitting(false);
    if (ok) onClose();
  });

  const assigneeData = options.assignees.map((p) => ({ value: p.id, label: p.full_name }));
  const siteData = options.sites.map((s) => ({ value: String(s.id), label: s.name }));

  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            placeholder="Что нужно сделать"
            required
            maxLength={LIMITS.taskTitle}
            data-autofocus
            {...form.getInputProps('title')}
          />
          <Textarea
            label="Описание"
            description="Объём работ, место, материалы, сроки"
            autosize
            minRows={3}
            maxRows={12}
            maxLength={LIMITS.taskDescription}
            {...form.getInputProps('description')}
          />
          <Select label="Объект" required data={siteData} allowDeselect={false} {...form.getInputProps('siteId')} />
          <Select
            label="Исполнитель"
            required
            searchable
            data={assigneeData}
            allowDeselect={false}
            disabled={reassignLocked}
            description={reassignLocked ? 'Нельзя сменить исполнителя, пока задача на проверке' : undefined}
            nothingFoundMessage="Нет пользователей с ролью «Исполнитель»"
            {...form.getInputProps('assigneeId')}
          />
          {assigneeData.length === 0 && (
            <Alert color="ember" variant="light">Нет ни одного исполнителя — задачу назначить некому.</Alert>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={submitting}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
