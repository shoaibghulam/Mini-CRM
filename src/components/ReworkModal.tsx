import { useState, type FormEvent } from 'react';
import { Button, Group, Modal, Text, Textarea } from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
import { isValidRequiredComment, normalizeComment } from '@/domain/validation';
import { LIMITS } from '@/domain/limits';

interface ReworkModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Resolves true when the status change succeeded. */
  readonly onSubmit: (comment: string) => Promise<boolean>;
}

const MAX = LIMITS.statusComment;

/** Rework needs a non-empty comment. The RPC enforces the same rule (and the 2000-char limit) in the DB. */
export function ReworkModal({ opened, onClose, onSubmit }: ReworkModalProps) {
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const valid = isValidRequiredComment(comment);
  const nearLimit = comment.length > MAX * 0.9;

  const close = () => {
    setComment('');
    setTouched(false);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const normalized = normalizeComment(comment);
    if (normalized === null) return;
    setSubmitting(true);
    const ok = await onSubmit(normalized);
    setSubmitting(false);
    if (ok) close();
  };

  return (
    <Modal opened={opened} onClose={close} title="Вернуть на доработку" size="lg">
      <form onSubmit={submit} noValidate>
        <Textarea
          label="Что нужно исправить"
          description="Исполнитель увидит этот комментарий в карточке задачи."
          placeholder="Например: не закреплён откос у окна в комнате 2"
          required
          autosize
          minRows={4}
          maxRows={10}
          maxLength={MAX}
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
          onBlur={() => setTouched(true)}
          error={touched && !valid ? 'Опишите, что нужно исправить' : undefined}
          data-autofocus
        />
        <Text size="xs" c={nearLimit ? 'ember' : 'dimmed'} ta="right" mt={4} className="tabular" aria-live="polite">
          {comment.length} / {MAX}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={close}>
            Отмена
          </Button>
          <Button
            type="submit"
            color="ember"
            leftSection={<IconArrowBackUp size={18} aria-hidden="true" />}
            loading={submitting}
          >
            Вернуть на доработку
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
