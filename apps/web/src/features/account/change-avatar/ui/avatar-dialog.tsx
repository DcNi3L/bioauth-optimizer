'use client';

import type { MeDto } from '@bioauth/contracts';
import { useMutation } from '@tanstack/react-query';
import { Camera, ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useRefreshViewer } from '@/entities/viewer';
import { apiSend } from '@/shared/api';
import { type TKey, useT } from '@/shared/i18n';
import { useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Avatar, Button, Dialog, Notice } from '@/shared/ui';

import { loadFile, squareDataUrl } from '../model/image';

type Mode = 'choose' | 'camera' | 'preview';

/** Фото профиля: загрузка файла или снимок с камеры, обрезка до квадрата в браузере, предпросмотр. */
export function AvatarDialog({ me, open, onClose }: { me: MeDto; open: boolean; onClose: () => void }) {
  const t = useT();
  const refresh = useRefreshViewer();
  const camera = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  const upload = useMutation({
    mutationFn: (image: string) => apiSend('PUT', '/identity/me/avatar', { image }),
    onSuccess: async () => {
      await refresh();
      close();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend('DELETE', '/identity/me/avatar'),
    onSuccess: async () => {
      await refresh();
      close();
    },
  });

  const { stop } = camera;
  function close() {
    stop();
    setMode('choose');
    setPreview(null);
    setFileError(false);
    upload.reset();
    onClose();
  }
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(false);
    try {
      const img = await loadFile(file);
      setPreview(squareDataUrl(img, img.naturalWidth, img.naturalHeight));
      setMode('preview');
    } catch {
      setFileError(true);
    }
  };
  const startCamera = async () => {
    setMode('camera');
    await camera.start();
  };
  const snap = () => {
    const v = camera.videoRef.current;
    if (!v?.videoWidth) return;
    // В окне видео отражено как в зеркале — снимок сохраняем так же, как пользователь себя видел.
    setPreview(squareDataUrl(v, v.videoWidth, v.videoHeight, 256, true));
    camera.stop();
    setMode('preview');
  };

  const cameraError: TKey | null =
    camera.state === 'denied'
      ? 'face.camera.denied'
      : camera.state === 'unavailable'
        ? 'face.camera.unavailable'
        : camera.state === 'insecure'
          ? 'face.camera.insecure'
          : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('profile.avatar.title')}
      description={t('profile.avatar.hint')}
      closeLabel={t('common.close')}
      footer={
        mode === 'preview' && preview ? (
          <>
            <Button variant="secondary" onClick={() => setMode('choose')}>
              <RotateCcw className="size-4" /> {t('profile.avatar.retake')}
            </Button>
            <Button busy={upload.isPending} onClick={() => upload.mutate(preview)}>
              {t('profile.avatar.use')}
            </Button>
          </>
        ) : me.avatarUrl ? (
          <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4" /> {t('profile.avatar.remove')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-5">
        {mode === 'camera' ? (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="relative aspect-square w-full max-w-72 overflow-hidden rounded-full bg-black">
              <video
                ref={camera.videoRef}
                muted
                playsInline
                aria-label={t('face.camera.label')}
                className="h-full w-full -scale-x-100 object-cover"
              />
              {camera.state === 'starting' && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                  {t('face.camera.starting')}
                </p>
              )}
            </div>
            {cameraError ? (
              <Notice tone="caution">{t(cameraError)}</Notice>
            ) : (
              <Button onClick={snap} disabled={camera.state !== 'ready'}>
                <Camera className="size-4" /> {t('profile.avatar.capture')}
              </Button>
            )}
          </div>
        ) : mode === 'preview' && preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр data: URL
          <img src={preview} alt="" className="size-48 rounded-full object-cover ring-4 ring-rule" />
        ) : (
          <>
            <Avatar src={me.avatarUrl} name={me.displayName} size={128} />
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-rule px-4 py-5 text-sm transition-colors hover:border-graphite hover:bg-hover"
              >
                <ImageUp className="size-6 text-frr" aria-hidden />
                {t('profile.avatar.upload')}
              </button>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-rule px-4 py-5 text-sm transition-colors hover:border-graphite hover:bg-hover"
              >
                <Camera className="size-6 text-optimum" aria-hidden />
                {t('profile.avatar.camera')}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t('profile.avatar.upload')}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </>
        )}
        {fileError && <Notice tone="error">{t('profile.avatar.badFile')}</Notice>}
        <ApiErrorNotice error={upload.error ?? remove.error} />
      </div>
    </Dialog>
  );
}
