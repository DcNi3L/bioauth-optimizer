-- make login-report: последние попытки входа по лицу — сходство с шаблоном, «живость», порог политики.
-- Только для диагностики на своей установке: показывает оценки, которые пользователю не сообщаются.
\echo 'Действующая политика'
SELECT p.version AS "версия",
       f->>'tauFace' AS "τ_face",
       f->>'tauPad' AS "τ_pad",
       f->>'calibrated' AS "откалиброван",
       left(coalesce(p.rationale, ''), 90) AS "обоснование"
FROM auth_policy p, jsonb_array_elements(p.steps) f
WHERE p.status = 'active' AND f->>'factor' = 'face';

\echo 'Последние 20 попыток по лицу'
SELECT to_char(a.created_at AT TIME ZONE current_setting('TimeZone'), 'DD.MM HH24:MI:SS') AS "время",
       u.login AS "логин",
       a.outcome AS "итог",
       coalesce(a.reject_reason, '') AS "причина",
       round(a.score::numeric, 4) AS "сходство",
       round((f->>'tauFace')::numeric, 4) AS "τ_face",
       round((a.score - (f->>'tauFace')::float)::numeric, 4) AS "запас",
       round(a.liveness::numeric, 3) AS "p_live",
       a.challenges_ok AS "команды",
       p.version AS "политика"
FROM auth_attempt a
LEFT JOIN app_user u ON u.id = a.user_id
LEFT JOIN auth_policy p ON p.id = a.policy_id
LEFT JOIN LATERAL (
  SELECT x FROM jsonb_array_elements(p.steps) x WHERE x->>'factor' = 'face' LIMIT 1
) s(f) ON true
WHERE a.factor = 'face'
ORDER BY a.created_at DESC
LIMIT 20;
