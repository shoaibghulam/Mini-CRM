import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert, Button, Center, Loader, Stack } from '@mantine/core';
import { useAuth } from '@/auth/authContext';
import { notifyError } from '@/lib/notify';

export function RequireAuth() {
  const { state, signOut } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <Center h="100dvh">
        <Loader aria-label="Загрузка профиля" />
      </Center>
    );
  }
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (state.status === 'error') {
    return (
      <Center h="100dvh" p="md" component="main">
        <Stack maw={420} w="100%">
          <Alert color="red" variant="light" title="Не удалось загрузить профиль" role="alert">
            {state.message}
          </Alert>
          <Button variant="default" onClick={() => signOut().catch(notifyError)}>
            Выйти
          </Button>
        </Stack>
      </Center>
    );
  }
  return <Outlet />;
}
