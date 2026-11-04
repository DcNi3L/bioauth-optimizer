'use client';

import { scoreDatasetSchema } from '@bioauth/contracts';
import { useMutation } from '@tanstack/react-query';

import { apiUpload } from '@/shared/api';

export function useUploadScores() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload('/score-datasets', form, scoreDatasetSchema);
    },
  });
}
