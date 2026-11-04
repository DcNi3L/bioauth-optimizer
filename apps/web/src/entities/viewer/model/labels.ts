import type { Role } from '@bioauth/contracts';

export const ROLE_LABELS: Record<Role, string> = {
  subject: 'Субъект',
  admin: 'Администратор безопасности',
  researcher: 'Исследователь',
  auditor: 'Аудитор',
};

export const isStaff = (role: Role) => role !== 'subject';
