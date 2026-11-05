'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { calibrationKeys } from '@/entities/calibration';
import { apiSend } from '@/shared/api';
import { Button } from '@/shared/ui';

/** Администратор принимает уведомление о дрейфе к сведению — оно исчезает из баннера, запись остаётся. */
export function AcknowledgeDriftButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: () => apiSend('POST', `/calibration/drift/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: calibrationKeys.overview }),
  });
  return (
    <Button variant="ghost" busy={ack.isPending} onClick={() => ack.mutate()}>
      {ack.isError ? 'Не удалось — повторить' : 'Принять к сведению'}
    </Button>
  );
}
