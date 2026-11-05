import type { DeviceDto } from '@bioauth/contracts';
import { HelpCircle, Laptop, Smartphone, Tablet } from 'lucide-react';

export function DeviceIcon({ type, className = 'size-5' }: { type: DeviceDto['type']; className?: string }) {
  const Icon = { desktop: Laptop, mobile: Smartphone, tablet: Tablet, unknown: HelpCircle }[type];
  return <Icon className={className} aria-hidden />;
}
