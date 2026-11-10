import type { Role } from '@bioauth/contracts';

export const isStaff = (role: Role) => role !== 'subject';

export const roleLabel = (t: (k: `role.${Role}`) => string, role: Role) => t(`role.${role}`);
