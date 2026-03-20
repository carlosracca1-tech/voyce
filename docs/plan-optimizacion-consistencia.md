# Plan de optimización (consistencia) — sin nuevos archivos

Reglas de referencia: `.cursor/rules/` (00-system, 10-quality-bar, 20-next15-app-router, 40-neon-db, 90-response-format). No inventar archivos, endpoints ni schema; solo editar lógica en archivos existentes.

---

## 1) Plan en 5 puntos

- **Redirect con acceso:** En `app/page.tsx`, cuando `user?.subscription?.canAccess` sea true, llamar `router.replace("/dashboard")` y seguir mostrando el spinner hasta que navegue (evitar quedar en spinner infinito).
- **Auth en settings:** En `app/api/user/settings/route.ts`, GET y POST deben exigir `Authorization: Bearer <token>` y obtener `userId` del token. Frontend ya tiene el token en `localStorage`; se edita solo para enviar el header en las llamadas a settings.
- **Un solo decode de token:** Añadir `getUserIdFromToken(token)` en `lib/utils.ts` y usarla en `profile`, `conversations`, `stats` y `settings`; en `chat/route.ts` hacer que el fallback legacy use esa función (sin crear archivos nuevos).
- **UserData en un solo lugar:** Dejar la definición solo en `src/lib/voyce/types.ts`; en `app/page.tsx` y `app/profile/page.tsx` eliminar la interfaz local e importar `UserData` desde `@/lib/voyce/types` (añadir `trialEndsAt?` en types si hace falta para profile).
- **Intents en un solo lugar:** Mover `SOURCE_ALIASES`, `wantsTopMixed`, `parseSourcesFromText` y `parseHeadlineChoice` a `src/lib/voyce/intents.ts`; en `app/api/chat/route.ts` borrar esas definiciones e importar desde intents. Usar `wantsChangeSource` de intents (con `norm()`) en chat en lugar de la copia local.

No se toca schema DB (`user_settings` / `user_preferences` quedan como están — 40-neon-db).

---

## 2) Dónde está implementado hoy

| Tema | Ubicación actual |
|------|------------------|
| Redirect cuando canAccess | `app/page.tsx`: líneas 592–598 (devuelve spinner sin hacer replace). También 547–556 (useEffect) y 570–571 (handleLogin) ya hacen replace en otros caminos. |
| Settings sin auth | `app/api/user/settings/route.ts`: GET usa `searchParams.get("userId")` (líneas 36–37); POST usa `body.userId` (85–86). Llamadas: `src/hooks/useVoyceAuthAndSettings.ts` (GET con `?userId=`), `app/settings/page.tsx` (GET con `?userId=`, POST con `body.userId`). |
| Decode de token | `getUserIdFromToken`: `app/api/user/profile/route.ts` (4–10), `app/api/conversations/route.ts` (4–9), `app/api/user/stats/route.ts` (4–9). `tryGetUserIdFromBearer`: `app/api/chat/route.ts` (18–46). |
| Tipo UserData | Definido en `src/lib/voyce/types.ts`; duplicado en `app/page.tsx` (137–147) y `app/profile/page.tsx` (6–17; profile tiene `trialEndsAt?`). |
| Intents / fuentes | `src/lib/voyce/intents.ts`: `guessSourceFromTranscript`, `wantsTopWithoutSource`, `wantsChangeSource`, `wantsRefresh`, `extractPick`. `app/api/chat/route.ts`: `SOURCE_ALIASES` (50–57), `wantsTopMixed` (59–61), `wantsChangeSource` (63–65), `parseSourcesFromText` (67–73), `parseHeadlineChoice` (75–82). |

---

## 3) Archivos a editar (solo lógica, sin crear archivos)

| Archivo | Cambio |
|---------|--------|
| `app/page.tsx` | En el bloque `if (user?.subscription?.canAccess)` (592–598): llamar `router.replace("/dashboard")` y mantener el return del spinner. Opcional: quitar interfaz local `UserData` e importar desde `@/lib/voyce/types`. |
| `app/api/user/settings/route.ts` | GET: leer `Authorization`, extraer token, obtener `userId` con `getUserIdFromToken` (importada de `lib/utils`); 401 si no hay token o userId inválido. POST: igual; ignorar `body.userId` para autorización y usar solo el userId del token. |
| `lib/utils.ts` | Añadir función `getUserIdFromToken(token: string): number | null` (misma lógica que en profile: atob + decodeURIComponent(escape(...)) + JSON.parse, leer `payload.id`). |
| `app/api/user/profile/route.ts` | Eliminar función local `getUserIdFromToken`; importar desde `@/lib/utils` (o la ruta relativa que use el repo para `lib`). |
| `app/api/conversations/route.ts` | Igual: eliminar `getUserIdFromToken` local, importar desde `lib/utils`. |
| `app/api/user/stats/route.ts` | Igual: eliminar `getUserIdFromToken` local, importar desde `lib/utils`. |
| `app/api/chat/route.ts` | Importar `getUserIdFromToken` de `lib/utils`; en `tryGetUserIdFromBearer`, en el fallback “plain base64” usar `getUserIdFromToken(token)` en lugar de duplicar el decode. |
| `src/lib/voyce/types.ts` | Si hace falta para profile: añadir `trialEndsAt?: string` a `subscription` en `UserData`. |
| `app/profile/page.tsx` | Quitar interfaz local `UserData`; importar `UserData` desde `@/lib/voyce/types`. |
| `src/hooks/useVoyceAuthAndSettings.ts` | En el `fetch` a `/api/user/settings`: añadir header `Authorization: Bearer ${userData.token}` (y se puede dejar `?userId=` por compatibilidad opcional; el API ignorará query para auth y usará solo el token). |
| `app/settings/page.tsx` | En el GET: añadir `headers: { Authorization: \`Bearer ${user.token}\` }`. En el POST: igual, `Authorization: Bearer ${user.token}`. Mantener el body con `userId` si el API lo sigue aceptando para logging; el API usará solo el token para decidir el userId. |
| `src/lib/voyce/intents.ts` | Añadir y exportar: constante `SOURCE_ALIASES` (mover desde chat/route), `wantsTopMixed`, `parseSourcesFromText`, `parseHeadlineChoice`. Asegurar que `wantsChangeSource` exista y use `norm()` (ya está). |
| `app/api/chat/route.ts` | Eliminar `SOURCE_ALIASES`, `wantsTopMixed`, `wantsChangeSource`, `parseSourcesFromText`, `parseHeadlineChoice`; importar desde `@/lib/voyce/intents`. Mantener en chat solo `parseModeCommand`, `parseVoicePresetCommand` y el handler. |

Estructura frontend: no se agregan páginas ni rutas; solo se añaden headers donde ya se tiene el token y se ajusta la lógica en los archivos listados.

---

## 4) Checklist de validación

- **Comandos:**  
  `pnpm lint`  
  `pnpm typecheck` (o `tsc --noEmit` si está en package.json)  
  `pnpm build`

- **Verificar en UI/API:**  
  - Login con usuario con acceso → debe redirigir a `/dashboard` (no quedar en spinner).  
  - Sin token, GET/POST a `/api/user/settings` → 401.  
  - Con `Authorization: Bearer <token>` válido, GET/POST settings → 200 y datos del usuario del token.  
  - Dashboard y Settings siguen mostrando y guardando preferencias correctamente.  
  - Chat con comando de diario/top sigue resolviendo fuentes y número de titular igual que antes.

- **Comportamiento:**  
  - Respuesta JSON de rutas API mantiene la forma actual (p. ej. `{ ok, settings }` en settings).  
  - No se cambian nombres de tablas ni de env vars.
