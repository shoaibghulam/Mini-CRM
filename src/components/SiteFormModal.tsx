import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { SiteRow } from '@/lib/database.types';
import type { SiteInput } from '@/api/sites';
import { requiredText } from '@/domain/validation';
import { LIMITS } from '@/domain/limits';

interface SiteFormModalProps {
  readonly opened: boolean;
  /** null = create a new site. */
  readonly site: SiteRow | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: SiteInput) => Promise<boolean>;
}

export function SiteFormModal({ opened, site, onClose, onSubmit }: SiteFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<SiteInput>({
    initialValues: { name: '', address: '' },
    validate: { name: requiredText('Укажите название') },
  });

  useEffect(() => {
    if (opened) form.setValues({ name: site?.name ?? '', address: site?.address ?? '' });
    // Reset only when the modal opens for a (possibly different) site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, site]);

  const submit = form.onSubmit(async (values) => {
    setSubmitting(true);
    const ok = await onSubmit({ name: values.name.trim(), address: values.address.trim() });
    setSubmitting(false);
    if (ok) onClose();
  });

  return (
    <Modal opened={opened} onClose={onClose} title={site ? 'Редактировать объект' : 'Новый объект'}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            placeholder="ЖК «Северный», корпус 2"
            required
            maxLength={LIMITS.siteName}
            data-autofocus
            {...form.getInputProps('name')}
          />
          <TextInput
            label="Адрес"
            placeholder="Город, улица, дом"
            maxLength={LIMITS.siteAddress}
            {...form.getInputProps('address')}
          />
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
