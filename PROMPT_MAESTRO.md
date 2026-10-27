# PROMPT MAESTRO — BARBER LINDEROS (Web + App Móvil)

> Copia y pega este documento completo como primer mensaje en VS Code (Claude Code /
> Cursor / Copilot Chat) para continuar el desarrollo. Contiene el contexto completo
> del proyecto, el estado actual, el sistema de diseño y las tareas concretas
> pendientes, tanto para la web como para la app móvil nueva.

---

## 0. CONTEXTO — NO EMPIEZAS DE CERO

BARBER LINDEROS es una plataforma SaaS de gestión de barbería con 3 roles
(admin, barbero, cliente). El MVP backend + web YA ESTÁ CONSTRUIDO Y FUNCIONANDO.
Este prompt es para **continuar**, no para reescribir desde cero.

Estructura actual del repo:

```
barber-linderos/
  backend/
    server.js                    Express + Socket.io + scheduler de recordatorios
    config/db.js                 Facade async: SQLite (dev) o Postgres (prod) via DB_DRIVER
    config/adapters/              sqlite.adapter.js, postgres.adapter.js
    controllers/                  auth, barbers, clients, services, reservations,
                                   inventory, notes, promotions, analytics, photos, config
    services/                     notifications.service.js, whatsapp.service.js,
                                   scheduler.service.js
    migrations/schema.postgres.sql
    db/seed.js
  frontend/
    index.html                   Landing premium
    login.html, register.html
    cliente/reservar.html         Wizard de reserva (4 pasos) + Socket.io tiempo real
    cliente/historial.html        Historial, fidelización, galería de fotos
    barbero/dashboard.html        Agenda, clientes, fotos, notas, materiales, stats
    admin/dashboard.html          Resumen, agenda global, barberos, clientes,
                                   servicios, inventario, marketing
    assets/css/style.css          Design system completo (ver sección 1)
    assets/js/api.js              Cliente API + sesión + botón WhatsApp
  docker-compose.yml              Postgres local
  README.md
```

**Ya implementado y probado end-to-end** (no lo repitas, constrúyelo encima):

1. Reservas en tiempo real con bloqueo automático de horarios (transacción atómica
   anti doble-booking) + Socket.io.
2. Auth JWT con 3 roles, permisos verificados en backend (no solo en el frontend).
3. Notificaciones reales: confirmación + recordatorios 24h/2h antes (email via
   `nodemailer`/SMTP, con modo "simulado" si no hay credenciales).
4. WhatsApp: botón click-to-chat (`wa.me`) + servicio backend listo para WhatsApp
   Cloud API real (activable con variables de entorno).
5. Fotos antes/después: subida (multer), galería en panel de barbero e historial
   de cliente.
6. Doble motor de base de datos: SQLite (dev) / Postgres (producción) via
   `DB_DRIVER`, con el mismo código de controllers para ambos.
7. Fidelización (puntos + niveles), inventario, notas internas, marketing/segmentación,
   analíticas del admin.

**Antes de escribir código nuevo**: lee `backend/README.md` (si existe) y corre el
proyecto localmente (`npm install && npm run seed && npm start` en `backend/`, y
sirve `frontend/` con cualquier servidor estático) para confirmar que todo funciona
en tu máquina antes de empezar a modificar.

---

## 1. SISTEMA DE DISEÑO (aplicar igual en web y mobile)

Producto: SaaS de reservas para barbería premium — audiencia mixta (dueño de
negocio, barberos, clientes finales), con enfoque "más rápido y más elegante que
WhatsApp + Excel + llamadas". Estilo elegido: **minimalismo premium oscuro**
(no genérico tipo agencia — ligado a la identidad de una barbería moderna).

### Paleta de color (ya usada en `assets/css/style.css`)

| Token           | Valor      | Uso                                   |
|-----------------|------------|----------------------------------------|
| `--bg`          | `#0a0a0b`  | Fondo base                             |
| `--bg-elevated` | `#131315`  | Inputs, superficies elevadas           |
| `--bg-card`     | `#17171a`  | Tarjetas                               |
| `--border`      | `#26262a`  | Bordes, separadores                    |
| `--text`        | `#f5f4f1`  | Texto principal                        |
| `--text-muted`  | `#9a9a9f`  | Texto secundario                       |
| `--gold`        | `#c9a227`  | Acento primario (CTA, marca)           |
| `--gold-bright` | `#e8c65a`  | Hover / énfasis                        |
| `--success`     | `#4caf6b`  | Estados positivos                      |
| `--danger`      | `#e05a5a`  | Estados destructivos/error             |

Regla de contraste (obligatoria): texto principal sobre `--bg`/`--bg-card` debe
mantener ratio ≥ 4.5:1 (AA). El texto `--text-muted` es solo para texto secundario,
nunca para contenido crítico o mensajes de error (esos van en `--danger` + ícono,
nunca solo color).

### Tipografía

- Display / headings: **Bricolage Grotesque** (700-800), `letter-spacing: -0.02em`.
- Body / UI: **Inter** (400-600).
- Escala: 12 / 14 / 16 / 18 / 24 / 32 / 48+ (clamp en hero).
- Mínimo 16px en body para no disparar auto-zoom en inputs mobile (iOS Safari).

### Espaciado y radios

- Escala de espaciado: 8/16/24/32/48/64/96px (estándar "spacious", no dashboard-denso).
- Radios: `--radius: 14px` (tarjetas), `--radius-sm: 8px` (inputs/botones pequeños),
  botones principales con `border-radius: 999px` (pill).

### Motion (aplicar igual en RN con `Animated`/`react-native-reanimated`)

- Micro-interacciones: 150-300ms, `ease-out` al entrar, `ease-in` al salir.
- Salida más rápida que entrada (~60-70% de la duración de entrada).
- Nunca animar `width`/`height`/`top`/`left` — solo `transform`/`opacity`.
- Respetar `prefers-reduced-motion` (web) / configuración de accesibilidad de
  reducir movimiento (iOS/Android).
- Botones y tarjetas táctiles: `scale(0.95–1.05)` al presionar, restaurar al soltar.

### Checklist de accesibilidad y touch (obligatorio en cada pantalla nueva)

- Contraste texto normal ≥ 4.5:1, texto grande ≥ 3:1.
- Objetivo táctil mínimo 44×44pt (iOS) / 48×48dp (Android) — expandir hit-area si
  el ícono visual es más chico.
- Separación mínima 8px entre elementos táctiles adyacentes.
- Todo ícono interactivo sin texto visible necesita `aria-label` (web) o
  `accessibilityLabel` (RN).
- Nunca solo color para transmitir estado (agregar ícono o texto también).
- Foco visible en web (no remover el outline sin reemplazo).
- Formularios: label visible (no solo placeholder), error debajo del campo,
  foco automático al primer campo con error tras submit fallido.

---

## 2. TAREAS PENDIENTES EN LA WEB (pulido, no fundacional)

1. **Auditoría UX final** contra el checklist de la sección 1 en las 7 páginas
   existentes (`index.html`, `login.html`, `register.html`, `cliente/reservar.html`,
   `cliente/historial.html`, `barbero/dashboard.html`, `admin/dashboard.html`):
   revisar contraste real (usar DevTools), tamaños táctiles en mobile (375px), y
   navegación por teclado en los wizards y modales.
2. **Empty states**: agregar estados vacíos ilustrados (no solo texto plano) para
   agenda sin citas, inventario vacío, sin fotos, sin promociones.
3. **Skeleton loaders**: reemplazar los "Cargando..." de texto plano por skeletons
   (shimmer) en las listas de `admin/dashboard.html` y `barbero/dashboard.html`.
4. **Modo oscuro/claro**: el diseño actual es dark-only por identidad de marca;
   si se pide modo claro, diseñar el par de tokens completo (no solo invertir).
5. **PWA**: agregar manifest.json + service worker básico para que el flujo de
   reserva del cliente sea instalable y funcione con indicador de "sin conexión".
6. **i18n**: si se planea expandir a otros países, extraer strings a un diccionario
   (hoy todo el texto está hardcodeado en español de Chile — precios en CLP).

---

## 3. APP MÓVIL NUEVA — REACT NATIVE (Expo)

### Por qué Expo + React Native

El backend ya es una API REST + Socket.io independiente del frontend (no acoplada
a HTML), así que un cliente React Native puede consumir exactamente los mismos
endpoints (`/api/auth`, `/api/reservations`, `/api/services`, `/api/barbers`, etc.)
sin tocar el backend. Expo permite iterar rápido en iOS/Android desde un solo
código base y usar `expo-notifications` para push nativo (mejor que solo email/WhatsApp
para recordatorios).

### Alcance de la app móvil (fase 1)

Roles cubiertos: **cliente** y **barbero** (el rol admin se queda en web — flujos de
gestión de negocio no son prioritarios en mobile). Estructura de navegación:

**Cliente** (bottom tabs, máx. 5 ítems — regla de la sección 1):
1. Inicio (próxima cita + accesos rápidos)
2. Reservar (mismo wizard de 4 pasos que la web: servicio → barbero → fecha/hora → confirmar)
3. Mis citas (próximas + cancelar/reagendar)
4. Fotos (galería antes/después, misma data que `cliente/historial.html`)
5. Perfil (fidelización, cerrar sesión)

**Barbero** (bottom tabs):
1. Agenda (hoy/próximas, completar/cancelar)
2. Clientes (lista + historial)
3. Fotos (subir antes/después — usa `expo-image-picker` + `FormData` al mismo
   endpoint `POST /api/photos`)
4. Notas
5. Perfil (materiales, stats, cerrar sesión)

### Stack técnico sugerido

- **Expo (managed workflow)** + TypeScript.
- **React Navigation** (bottom tabs + stack por rol).
- **socket.io-client** para las mismas salas (`barber:{id}:{date}`, `barberUser:{id}`,
  `admin`) que ya emite el backend — reutilizar la lógica de `cliente/reservar.html`
  como referencia.
- **expo-secure-store** para guardar el JWT (nunca `AsyncStorage` plano para el token).
- **expo-notifications** para push nativo de recordatorios (complementa, no
  reemplaza, el email/WhatsApp ya implementados — el backend puede agregar un
  tercer canal de notificación `channel = 'push'` en la tabla `notifications`,
  siguiendo el mismo patrón que `notifications.service.js`).
- **expo-image-picker** + `fetch` con `FormData` para subir fotos antes/después
  (mismo endpoint que ya usa el barbero en web).
- **NativeWind** (Tailwind para RN) o `StyleSheet` + un archivo `theme.ts` con
  exactamente los mismos tokens de color/tipografía de la sección 1 — no
  reinventar la paleta.

### Reglas de UX específicas de mobile (de la Skill UI/UX Pro Max — aplicar sí o sí)

- Bottom tab bar: iconos + label (nunca solo ícono), máx. 5 ítems, ítem activo
  claramente resaltado (color + peso).
- Respetar **safe areas** (notch, Dynamic Island, home indicator, barra de estado)
  en headers y tab bars fijos — usar `react-native-safe-area-context`.
- Gestos del sistema (swipe-back en iOS, back predictivo en Android) no deben
  quedar bloqueados por gestos custom de la app.
- Formularios: teclado correcto por tipo de campo (`keyboardType="email-address"`,
  `keyboardType="phone-pad"`), `autoComplete`/`textContentType` para autofill.
- Botones y tarjetas de servicio/barbero/horario: mínimo 44×44pt, con feedback de
  press (`activeOpacity` o `Pressable` con estado).
- Loading: skeleton o spinner con feedback dentro de 100ms del tap, nunca una
  pantalla congelada sin indicador.
- Deep linking: cada pantalla clave (reservar, cita específica, foto) debe ser
  alcanzable por URL (`barberlinderos://reservar`, etc.) para push notifications
  y compartir enlaces.

### Plan de implementación sugerido (orden)

1. `npx create-expo-app barber-linderos-mobile --template expo-template-blank-typescript`
2. Configurar `theme.ts` con los tokens de la sección 1 (colores, tipografía, espaciado).
3. Pantallas de auth (login/registro) contra `POST /api/auth/login` y `/register`
   — reusar la lógica de `frontend/login.html` como referencia de contrato de API.
4. Navegación por rol: después del login, decidir stack de tabs (cliente vs
   barbero) igual que `Auth.redirectForRole()` en `assets/js/api.js`.
5. Wizard de reserva (cliente): portar paso a paso la lógica de
   `cliente/reservar.html` (estado local: servicio → barbero → fecha → hora →
   confirmar), conectando disponibilidad en tiempo real vía `socket.io-client`
   uniéndose a `barber:{barberId}:{date}`.
6. Agenda de barbero + acciones (completar/cancelar) — portar lógica de
   `barbero/dashboard.html`.
7. Fotos antes/después (ambos roles) con `expo-image-picker`.
8. Push notifications (`expo-notifications`) + nuevo canal `push` en el backend
   (extensión menor de `notifications.service.js`, mismo patrón que email/WhatsApp).
9. Testing en simulador iOS + emulador Android antes de build de producción
   (`eas build`).

---

## 4. CÓMO VALIDAR ANTES DE HACER PUSH (checklist final)

- [ ] `npm run seed` + `npm start` en `backend/` sin errores, con `DB_DRIVER=sqlite`.
- [ ] Probar el mismo flujo con `DB_DRIVER=postgres` contra el Postgres de
      `docker-compose.yml` (la migración se validó con `pg-mem` en el sandbox de
      desarrollo, pero **falta una prueba de concurrencia real de doble-booking
      contra Postgres real** antes de producción — ver README.md).
- [ ] Los 3 flujos de rol (admin/barbero/cliente) probados manualmente en web.
- [ ] Si se agrega la app móvil: los mismos 3 flujos probados en iOS + Android.
- [ ] Contraste de color verificado con DevTools/Accessibility Inspector en las
      pantallas nuevas.
- [ ] Sin console.errors ni promesas sin capturar (revisar consola del navegador
      y logs del backend).

---

Fin del prompt maestro. Pega este archivo completo como contexto inicial y luego
pide la tarea puntual (ej. "arranca el paso 3 del plan de la app móvil").
