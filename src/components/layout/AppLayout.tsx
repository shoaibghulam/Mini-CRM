import { useEffect } from 'react';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router-dom';
import { AppShell, Avatar, Badge, Burger, Button, Container, Group, NavLink, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLogout } from '@tabler/icons-react';
import { useAuth, useProfile } from '@/auth/authContext';
import { ROLE_LABELS } from '@/domain/status';
import { notifyError } from '@/lib/notify';
import { BrandMark } from './BrandMark';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { UserMenu, initialsOf } from './UserMenu';
import { navItemsFor } from './NavItems';
import classes from './Layout.module.css';

const HEADER_HEIGHT = 56;

export function AppLayout() {
  const { signOut } = useAuth();
  const profile = useProfile();
  const { pathname } = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const items = navItemsFor(profile.role);
  const handleSignOut = () => {
    signOut().catch(notifyError);
  };

  useEffect(close, [pathname, close]);

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 280, breakpoint: 'sm', collapsed: { desktop: true, mobile: !opened } }}
      padding={0}
    >
      <a href="#main" className="skip-link">
        Перейти к содержимому
      </a>
      <AppShell.Header className={classes.header}>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="xs" wrap="nowrap">
              <Burger
                opened={opened}
                onClick={toggle}
                hiddenFrom="sm"
                size="sm"
                aria-label={opened ? 'Закрыть меню' : 'Открыть меню'}
                aria-expanded={opened}
                aria-controls="app-mobile-nav"
              />
              <BrandMark to={items[0]?.to ?? '/sites'} />
              <Group component="nav" aria-label="Основная навигация" gap={0} ml="lg" visibleFrom="sm">
                {items.map((item) => (
                  <RouterNavLink key={item.to} to={item.to} className={classes.navLink ?? ''}>
                    <item.icon size={18} stroke={1.75} aria-hidden="true" />
                    {item.label}
                  </RouterNavLink>
                ))}
              </Group>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <ColorSchemeToggle />
              <Group visibleFrom="sm">
                <UserMenu profile={profile} onSignOut={handleSignOut} />
              </Group>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Navbar p="md" id="app-mobile-nav" aria-label="Меню" inert={!opened}>
        <Stack justify="space-between" h="100%">
          <nav aria-label="Основная навигация (мобильная)">
            {items.map((item) => (
              <NavLink
                key={item.to}
                component={RouterNavLink}
                to={item.to}
                label={item.label}
                active={pathname.startsWith(item.to)}
                leftSection={<item.icon size={20} stroke={1.75} aria-hidden="true" />}
                h={48}
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
              />
            ))}
          </nav>
          <Stack gap="sm" className={classes.drawerUser}>
            <Group gap="sm" wrap="nowrap">
              <Avatar color="teal" radius="xl" aria-hidden="true">
                {initialsOf(profile.full_name)}
              </Avatar>
              <div>
                <Text fw={600} size="sm">
                  {profile.full_name}
                </Text>
                <Badge size="sm" variant="light">
                  {ROLE_LABELS[profile.role]}
                </Badge>
              </div>
            </Group>
            <Button variant="default" leftSection={<IconLogout size={18} aria-hidden="true" />} onClick={handleSignOut}>
              Выйти
            </Button>
          </Stack>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main id="main" className={classes.main} tabIndex={-1}>
        <Container size="lg" py={{ base: 'md', sm: 'xl' }} px={{ base: 'md', sm: 'lg' }}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
