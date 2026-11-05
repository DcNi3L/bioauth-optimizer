import type { MeDto } from '@bioauth/contracts';
import {
  Activity,
  AppWindow,
  Braces,
  FileCode2,
  Gauge,
  KeyRound,
  LayoutGrid,
  ListChecks,
  LogIn,
  type LucideIcon,
  ScanFace,
  ScrollText,
  ShieldCheck,
  Sigma,
  UserRound,
  Users,
} from 'lucide-react';

import type { TKey } from '@/shared/i18n';

export interface NavItem {
  href: string;
  label: TKey;
  icon: LucideIcon;
  exact?: boolean;
  external?: boolean;
}
export interface NavGroup {
  title?: TKey;
  items: NavItem[];
}

const SWAGGER = process.env.NEXT_PUBLIC_SWAGGER_URL ?? 'http://localhost:4000/api/docs';

/** Навигация зависит от того, кто вошёл: гость, пользователь или сотрудник. */
export function navFor(me: MeDto | null | undefined): NavGroup[] {
  const staff = !!me && me.role !== 'subject';
  const account: NavItem[] = me
    ? [{ href: '/profile', label: 'nav.profile', icon: UserRound }]
    : [{ href: '/login', label: 'nav.login', icon: LogIn }];
  if (!me || (me.role === 'subject' && !me.face)) {
    account.push({ href: '/enroll', label: 'nav.enroll', icon: ScanFace });
  }
  const groups: NavGroup[] = [
    {
      items: [
        { href: '/', label: 'nav.overview', icon: LayoutGrid, exact: true },
        { href: '/algorithm', label: 'nav.algorithm', icon: Sigma },
      ],
    },
    { title: 'nav.account', items: account },
  ];
  if (staff) {
    groups.push({
      title: 'nav.admin',
      items: [
        { href: '/admin', label: 'nav.dashboard', icon: Gauge, exact: true },
        { href: '/admin/users', label: 'nav.users', icon: Users },
        { href: '/admin/logins', label: 'nav.logins', icon: Activity },
        { href: '/admin/policies', label: 'nav.policies', icon: ShieldCheck },
        { href: '/admin/attempts', label: 'nav.attempts', icon: ListChecks },
        { href: '/admin/clients', label: 'nav.clients', icon: AppWindow },
        { href: '/admin/audit', label: 'nav.audit', icon: ScrollText },
      ],
    });
  }
  groups.push({
    title: 'nav.developers',
    items: [
      { href: '/oauth/demo', label: 'nav.oidcDemo', icon: KeyRound },
      { href: '/.well-known/openid-configuration', label: 'nav.discovery', icon: Braces, external: true },
      { href: SWAGGER, label: 'nav.swagger', icon: FileCode2, external: true },
    ],
  });
  return groups;
}

export const isActive = (pathname: string, item: NavItem) =>
  !item.external &&
  (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

/** Текущий пункт для заголовка в верхней панели. */
export function currentItem(pathname: string, groups: NavGroup[]) {
  for (const g of groups) {
    const item = g.items.find((i) => isActive(pathname, i));
    if (item) return { group: g.title, item };
  }
  return null;
}
