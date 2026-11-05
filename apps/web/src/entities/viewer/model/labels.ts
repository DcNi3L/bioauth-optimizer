import type { Role } from '@bioauth/contracts';

export const ROLE_LABELS: Record<Role, string> = {
  subject: 'Субъект',
  admin: 'Администратор безопасности',
  researcher: 'Исследователь',
  auditor: 'Аудитор',
};

export const isStaff = (role: Role) => role !== 'subject';

export const roleLabel = (t: (k: `role.${Role}`) => string, role: Role) => t(`role.${role}`);
