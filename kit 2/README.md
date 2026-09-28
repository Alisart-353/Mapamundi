# 🌍 Mapamundi Premium — Kit de venta y control de accesos

Este kit convierte tu juego en un **producto que vendes por Instagram con control total**:

- **Landing page** móvil (pensada para el enlace de tu bio de Instagram) que recoge solicitudes con correo.
- **Servidor de control** (un solo archivo Node.js, sin dependencias) donde **tú apruebas, revocas y ves todo** desde un panel privado.
- **App mejorada** con control de acceso integrado: nadie entra sin tu aprobación, y puedes **bloquear un acceso ya entregado** con un clic.

```
kit/
├── app/index.html        ← Tu juego MEJORADO (con control de acceso integrado)
├── landing/index.html    ← Landing de venta para Instagram
├── server/server.js      ← API de accesos + panel de administración (Node 18+, cero dependencias)
├── server/admin.html     ← Tu panel de control (lo sirve server.js en /admin)
└── data.json             ← Se crea solo al arrancar (base de datos de accesos)
```

---

## 🚀 Puesta en marcha (5 minutos, todo gratis)

### Opción recomendada: todo en un solo servicio (Render.com gratis)

1. Sube la carpeta `kit/` a un repositorio de GitHub (o usa "Deploy from GitHub" arrastrando los archivos).
2. En [render.com](https://render.com) → **New → Web Service** → conecta tu repo.
   - **Start command:** `node server.js` · **Runtime:** Node 18+ · **Plan:** Free
   - **Variable de entorno:** `ADMIN_PASSWORD` = la contraseña que quieras para tu panel.
3. Listo: obtendrás una URL como `https://mapamundi.onrender.com` donde:
   - `/` → la landing de venta
   - `/app` → el juego (solo con acceso aprobado)
   - `/admin` → **tu panel de control**

### Opción local (para probar hoy mismo)

```bash
cd server
ADMIN_PASSWORD=mi-clave-secreta node server.js
# abre http://localhost:3000  (landing) · http://localhost:3000/admin (panel)
```

### Alternativa: app en Netlify + servidor aparte

Si prefieres seguir usando Netlify para la app/landing:
1. Sube `landing/index.html` y `app/index.html` a Netlify (carpetas separadas).
2. Despliega `server.js` en Render (pasos de arriba).
3. En el juego, edita una línea al inicio del archivo: `window.MG_CONFIG={api:'https://TU-SERVIDOR.onrender.com',...}`
4. En la landing, igual: `var API_URL='https://TU-SERVIDOR.onrender.com'`

> **Nota:** el plan gratuito de Render "duerme" tras 15 min de inactividad; el primer arranque tarda ~30 s. Evítalo con el plan de $7/mes o con un ping programado.

---

## 🎮 Cómo funciona el sistema de accesos

1. **Un padre llega desde Instagram** → tu landing → deja su correo → queda **PENDIENTE**.
2. **Tú entras a `/admin`** → ves la solicitud → confirmas el pago (por ejemplo, por transferencia o pago móvil que coordinas por DM) → **Aprobar** (elige días: 30, 90, 365…).
3. El panel genera una **clave única** tipo `K7QM-2XRV-9BPD-3FHT`.
4. La familia abre la app → pone su correo → **la app encuentra su aprobación y se abre sola** (o pegan la clave si se la enviaste). También pueden escribirla a mano.
5. **Control total:** en el panel puedes **Revocar** (la app se bloquea en su próximo chequeo, máximo unas horas o al reiniciar), **ampliar días**, o reactivar.

### Lo que ve el panel

- Tarjetas con pendientes / accesos activos / total.
- Lista con nombre, correo, fecha, clave (clic para copiar), vencimiento y última vez que jugaron.
- Filtros: Pendientes · Activos · Todos. Acciones: Aprobar (con días), Rechazar, Revocar, +Días, Borrar. Se actualiza solo cada 15 s.

---

## 🔐 Seguridad — auditoría de tu app original y de este sistema

**Lo que ya estaba bien en tu app (verificado en el código):**
- Sin claves de API expuestas ni llamadas a servidores externos: todo corre local.
- El chat de Mapin es local (reglas), no envía datos de niños a ningún servicio.
- El nombre del explorador se muestra con `textContent` (a prueba de inyección HTML).
- Sin `eval` en el código de la aplicación.

**Lo que corregí/reforzé:**
- **Antes: cualquiera con el archivo podía jugar gratis.** Ahora el juego arranca bloqueado y exige verificación de acceso contra tu servidor (con "margen sin conexión" de hasta 24 h para no fastidiar a un cliente honesto si se va el internet).
- **Chequeo periódico** cada 6 h: si revocas un acceso, se bloquea solo.
- **Contraseña del panel** guardada con hash + salt, comparación en tiempo constante, cookie de sesión firmada (HMAC-SHA256) con expiración de 7 días.
- **Anti abuso:** límite de solicitudes por IP (5/hora) y de verificaciones (30/hora); la clave nunca se puede deducir.
- Cabeceras de seguridad (`X-Frame-Options`, `nosniff`, sin caché de datos sensibles).

**Límite honesto que debes conocer:** si alguien DESCOMPRIME el archivo HTML puede ver el código del bloqueo (es la naturaleza de cualquier app estática). Para venta masiva o protección fuerte, sirve el juego **solo a través de `server.js` en `/app`** (ya lo hace este kit): el archivo solo se entrega tras validar cookie de sesión. Aun así, para un producto infantil barato vendido por DM, este nivel disuade al 99% de comparticiones caseras. Consejo: cobre barato por tandas y renueva claves cada temporada — el control real está en tu panel.

---

## 📣 Cómo usarlo con Instagram

1. Pon en tu **bio**: la URL de tu landing + "🎮 Geografía para niños 8-10 · Acceso por invitación".
2. Publica videos cortos jugando (el mapa, el avión, las medallas) — funciona muy bien en Reels.
3. Cuando alguien escriba por DM: manda el link de la landing → te llega la solicitud → cobras → **Apruebas en el panel** → la familia recibe la clave y te manda captura jugando (contenido gratis para ti).
4. Sube el precio por tandas: "Cupo de la temporada agotado" — en el panel lo verás venir porque cuentas los activos.

**Personaliza antes de publicar** (está marcado en los archivos):
- `landing/index.html`: cambia `@tu.usuario` (aparece 2 veces) por tu Instagram real, y el precio en la FAQ si quieres mencionarlo ahí.
- `server.js`: define `ADMIN_PASSWORD` al arrancar.

---

## 🛠️ Mejoras aplicadas a tu juego

- Control de acceso por correo/clave integrado (lo de arriba).
- Página de bloqueo con la identidad de la marca (no una pantalla rota): el que no pagó ve "Activa tu Mapamundi" con botón para pedir acceso.
- Verificación silenciosa: quien ya pagó no vuelve a escribir nada en 24 h + re-chequeos en segundo plano.
- El resto del juego quedó intacto: progreso, medallas y perfil se guardan igual que antes.
