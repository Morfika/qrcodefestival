# Control de ingreso de boletas

Aplicación web para validar QR e impedir el segundo ingreso de una misma boleta. La validación y el registro se hacen en Supabase; el navegador no recibe la lista de códigos QR. Si no hay conexión, el ingreso queda pendiente en la pestaña y no se autoriza hasta confirmar con el servidor.

## Datos usados

La lista de invitaciones se importa desde `data/control_boletas.csv`. Actualmente contiene 780 códigos (390 por grupo). No es la misma lista que `output/codigos_boletas.csv`, que se generó para el PDF anterior. Importa la lista que corresponda a las boletas que realmente se van a presentar en la entrada.

Los archivos `data/` y `output/` están excluidos de Git para no publicar los códigos ni el inventario de boletas. No pongas claves privadas de Supabase en el frontend ni publiques el CSV de códigos.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. En el SQL Editor del proyecto, ejecuta `supabase/schema.sql`.
3. Desactiva el registro público en **Authentication → Settings → Allow new users to sign up**. La aplicación no tiene formulario de creación de cuentas.
4. Para usar **un solo usuario y contraseña**, crea una única cuenta desde **Authentication → Users → Add user**. Escribe ahí el correo que usarás como usuario y define una contraseña segura. Luego autoriza esa cuenta en el SQL Editor, reemplazando el correo de ejemplo por el mismo correo:

   ```sql
   insert into public.operadores_autorizados (usuario_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com'
   on conflict (usuario_id) do nothing;
   ```

   En el login de la web, escribe ese correo en **Correo electrónico** y la contraseña que definiste en Supabase. No hay que crear más usuarios. Las funciones también verifican que la cuenta esté autorizada antes de permitir escanear o consultar los conteos. No escribas la contraseña en este archivo ni en el código de la aplicación.
5. Importa los QR desde el equipo que tiene `data/control_boletas.csv`. En PowerShell, define la URL y ejecuta el importador:

   ```powershell
   $env:SUPABASE_URL = "https://krgwwoqsymisyjjorlrz.supabase.co"
   & "$env:LOCALAPPDATA\Python\bin\python.exe" .\scripts\importar_boletas.py
   ```

   El script pedirá la **clave secreta** en la terminal sin mostrarla mientras la escribes. Pega una clave secreta recién generada en Supabase; no la pongas en `.env`, en el código ni en un comando. La importación se puede repetir sin duplicar códigos.

6. La URL del proyecto y la clave pública `publishable` se guardan localmente en `.env` (ya está configurado en esta copia del proyecto). No uses aquí una clave secreta.

## Ejecutar y compilar

Requiere Node.js 20.19+ o 22.12+.

```powershell
npm install
npm run dev -- --host 0.0.0.0
```

Para generar los archivos de publicación:

```powershell
npm run build
```

Publica el contenido de `dist/` detrás de HTTPS y restringe el acceso al personal autorizado. Para usar la cámara, el navegador requiere HTTPS o `localhost`; también se puede pegar el contenido QR en el campo manual. El lector está optimizado para QR, intenta el enfoque automático continuo y usa lectura nativa del navegador cuando está disponible, además de ZXing en modo de mayor precisión. Antes de registrar cualquier ingreso, muestra el código para aprobación manual; en dispositivos compatibles, el teléfono vibra al detectarlo. En teléfonos compatibles aparecen controles para cambiar entre cámaras, ajustar el zoom y encender la linterna. La disponibilidad de esas funciones depende del navegador y del hardware. Un enlace no publicado no sustituye el inicio de sesión.

## Duplicados y conexión inestable

La tabla `ingresos` tiene una restricción única por boleta. La función SQL registra cada ingreso de forma atómica; si dos dispositivos escanean la misma invitación al mismo tiempo, solo uno la registra y el otro recibe el estado de ingreso ya registrado. Cada intento conserva su identificador al reintentar, para no duplicar un ingreso que sí se guardó pero cuya respuesta no alcanzó al navegador.

La aplicación no da por válido un QR sin confirmación del servidor. Si se pierde la conexión, conserva el intento en `sessionStorage` de esa pestaña y ofrece reintentarlo cuando vuelva internet. No almacena de antemano el listado de códigos en el navegador.
