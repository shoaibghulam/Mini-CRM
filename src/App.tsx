import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Center, Loader, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { cssVariablesResolver, theme } from '@/theme/theme';
import { AuthProvider } from '@/auth/AuthProvider';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';

// Route-level code splitting: each screen loads on first visit.
const SitesPage = lazy(() => import('@/pages/SitesPage').then((m) => ({ default: m.SitesPage })));
const SitePage = lazy(() => import('@/pages/SitePage').then((m) => ({ default: m.SitePage })));
const TaskPage = lazy(() => import('@/pages/TaskPage').then((m) => ({ default: m.TaskPage })));
const MyTasksPage = lazy(() => import('@/pages/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));

function PageFallback() {
  return (
    <Center py="xl" aria-busy="true" aria-label="Загрузка">
      <Loader size="sm" />
    </Center>
  );
}

export function App() {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <ModalsProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route path="/sites" element={<Suspense fallback={<PageFallback />}><SitesPage /></Suspense>} />
                  <Route path="/sites/:id" element={<Suspense fallback={<PageFallback />}><SitePage /></Suspense>} />
                  <Route path="/tasks/:id" element={<Suspense fallback={<PageFallback />}><TaskPage /></Suspense>} />
                  <Route path="/my-tasks" element={<Suspense fallback={<PageFallback />}><MyTasksPage /></Suspense>} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/sites" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
