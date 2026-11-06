import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconLock, IconMail } from '@tabler/icons-react';
import type { UserRole } from '@/lib/database.types';
import { useAuth } from '@/auth/authContext';
import { describeError } from '@/domain/errors';
import { requiredText } from '@/domain/validation';
import { BrandMark } from '@/components/layout/BrandMark';
import { ColorSchemeToggle } from '@/components/layout/ColorSchemeToggle';
import classes from './LoginPage.module.css';

interface LoginValues {
  email: string;
  password: string;
}

/** Back to the page that sent us here, else the role's home screen. */
function redirectTarget(state: unknown, role: UserRole): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login') return from;
  return role === 'assignee' ? '/my-tasks' : '/sites';
}

export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<LoginValues>({
    initialValues: { email: '', password: '' },
    validate: { email: requiredText('Введите email'), password: requiredText('Введите пароль') },
  });

  if (state.status === 'ready') return <Navigate to={redirectTarget(location.state, state.profile.role)} replace />;
  // Signed in but the profile could not be loaded (e.g. no profiles row): say so instead of a silent form.
  const shownError = error ?? (state.status === 'error' ? state.message : null);

  const submit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Box component="main" className={classes.page}>
      <div className={classes.toggle}>
        <ColorSchemeToggle />
      </div>
      <Stack gap="lg" w="100%" maw={400}>
        <BrandMark />
        <Paper withBorder shadow="sm" p={{ base: 'lg', sm: 'xl' }} className={classes.card}>
          <form onSubmit={submit} noValidate>
            <Stack gap="md">
              <div>
                <Title order={1} size="h2">
                  Вход в систему
                </Title>
                <Text c="dimmed" size="sm" mt={4}>
                  Учётные записи выдаёт администратор — регистрация закрыта.
                </Text>
              </div>
              <TextInput
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="name@company.ru"
                required
                autoFocus
                leftSection={<IconMail size={18} aria-hidden="true" />}
                {...form.getInputProps('email')}
              />
              <PasswordInput
                label="Пароль"
                autoComplete="current-password"
                required
                leftSection={<IconLock size={18} aria-hidden="true" />}
                {...form.getInputProps('password')}
              />
              {shownError && (
                <Alert color="red" variant="light" title="Не удалось войти" role="alert" icon={<IconAlertCircle aria-hidden="true" />}>
                  {shownError}
                </Alert>
              )}
              <Button type="submit" size="md" loading={submitting || state.status === 'loading'} fullWidth>
                Войти
              </Button>
            </Stack>
          </form>
        </Paper>
        <Text size="xs" c="dimmed" ta="center">
          Мини-CRM для строительных объектов: задачи, проверка работ, история статусов.
        </Text>
      </Stack>
    </Box>
  );
}
