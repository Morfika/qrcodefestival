import { BrowserMultiFormatReader } from '@zxing/browser';
import { createClient } from '@supabase/supabase-js';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.querySelector('#app');

if (!supabaseUrl || !supabaseAnonKey) {
  app.innerHTML = `
    <main class="setup-message">
      <section class="panel">
        <div class="brand-mark" aria-hidden="true">FD</div>
        <p class="eyebrow">Festival de Danzas</p>
        <h1>Falta configurar Supabase</h1>
        <p>Crea un archivo <code>.env</code> a partir de <code>.env.example</code> y agrega la URL del proyecto y la clave pública (anon).</p>
      </section>
    </main>`;
} else {
  startApp();
}

function startApp() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const scanner = new BrowserMultiFormatReader();
  let cameraControls = null;
  let pending = readPending();

  app.innerHTML = `
    <main class="page-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Festival de Danzas, inicio">
          <span class="brand-mark" aria-hidden="true">FD</span>
          <span><strong>Festival de Danzas</strong><small>Control de ingreso</small></span>
        </a>
        <div id="connection" class="connection"><span class="connection-dot"></span><span>Comprobando red…</span></div>
      </header>

      <section id="login-view" class="login-layout" hidden>
        <div class="intro">
          <p class="eyebrow">21 de octubre · Soacha</p>
          <h1>Validación de<br />invitaciones</h1>
          <p>Inicia sesión con la cuenta autorizada para registrar ingresos.</p>
          <div class="security-note"><span aria-hidden="true">●</span> El acceso requiere conexión y cuenta autorizada.</div>
        </div>
        <form id="login-form" class="panel login-card">
          <h2>Iniciar sesión</h2>
          <p class="muted">Usa el correo y contraseña entregados por el administrador.</p>
          <label for="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autocomplete="username" required />
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          <button class="button button-primary" type="submit">Entrar</button>
          <p id="login-error" class="form-error" role="alert"></p>
        </form>
      </section>

      <section id="scanner-view" class="scanner-layout" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Punto de acceso</p>
            <h1>Escanear invitación</h1>
            <p class="muted">Cada código se valida contra el registro central antes de autorizar el ingreso.</p>
          </div>
          <button id="logout" class="button button-quiet" type="button">Cerrar sesión</button>
        </div>

        <div class="stats panel">
          <div><span class="stat-label">Boletas registradas</span><strong id="total-count">—</strong></div>
          <div><span class="stat-label">Ingresos registrados</span><strong id="admitted-count">—</strong></div>
          <div><span class="stat-label">Pendiente en este equipo</span><strong id="pending-state">Ninguno</strong></div>
        </div>
        <p id="stats-error" class="stats-error" role="status" hidden></p>

        <div class="work-area">
          <section class="panel scanner-card">
            <div class="card-heading">
              <div><span class="step">01</span><h2>Leer QR</h2></div>
              <span class="live-badge"><span></span> Cámara</span>
            </div>
            <div class="video-frame">
              <video id="video" muted playsinline></video>
              <div class="video-placeholder" id="video-placeholder">
                <span class="camera-icon" aria-hidden="true">⌗</span>
                <span>Activa la cámara para escanear</span>
              </div>
              <div class="scan-frame" aria-hidden="true"><i></i></div>
            </div>
            <button id="start-camera" class="button button-primary" type="button">Activar cámara</button>
            <p class="hint">La cámara requiere permiso del navegador y una conexión HTTPS (o localhost).</p>
            <div class="divider"><span>o escribe el código manualmente</span></div>
            <form id="manual-form" class="manual-form">
              <label class="visually-hidden" for="manual-code">Código de invitación</label>
              <input id="manual-code" type="text" autocomplete="off" placeholder="Pega el texto del QR" />
              <button class="button button-secondary" type="submit">Verificar</button>
            </form>
          </section>

          <section class="panel result-card" aria-live="polite" aria-atomic="true">
            <div class="card-heading">
              <div><span class="step">02</span><h2>Resultado</h2></div>
            </div>
            <div id="result" class="result-empty">
              <span class="result-icon" aria-hidden="true">✓</span>
              <h3>Listo para verificar</h3>
              <p>El resultado aparecerá aquí después de leer el código.</p>
            </div>
            <button id="retry" class="button button-primary retry-button" type="button" hidden>Reintentar registro</button>
            <div class="rule-note"><strong>Importante</strong><span>Si la conexión falla, el ingreso no se autoriza. Vuelve a intentar cuando se restablezca.</span></div>
          </section>
        </div>
      </section>
      <footer>Institución Educativa Integrado de Soacha <span>·</span> Control de acceso</footer>
    </main>`;

  const loginView = document.querySelector('#login-view');
  const scannerView = document.querySelector('#scanner-view');
  const loginForm = document.querySelector('#login-form');
  const loginError = document.querySelector('#login-error');
  const resultBox = document.querySelector('#result');
  const video = document.querySelector('#video');
  const videoPlaceholder = document.querySelector('#video-placeholder');
  const startCameraButton = document.querySelector('#start-camera');
  const retryButton = document.querySelector('#retry');

  function readPending() {
    try {
      const raw = sessionStorage.getItem('pending-entry');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePending(value) {
    pending = value;
    if (value) sessionStorage.setItem('pending-entry', JSON.stringify(value));
    else sessionStorage.removeItem('pending-entry');
    document.querySelector('#pending-state').textContent = value ? 'Por reintentar' : 'Ninguno';
    retryButton.hidden = !value;
  }

  function setConnection() {
    const online = navigator.onLine;
    const connection = document.querySelector('#connection');
    connection.classList.toggle('is-offline', !online);
    connection.innerHTML = `<span class="connection-dot"></span><span>${online ? 'Red disponible' : 'Sin conexión'}</span>`;
    if (online && pending) submitPending();
  }

  function showMessage(status, title, body, details = '') {
    resultBox.className = `result-content status-${status}`;
    resultBox.innerHTML = `
      <div class="status-icon" aria-hidden="true">${status === 'accepted' ? '✓' : status === 'duplicate' ? '!' : status === 'invalid' ? '×' : '…'}</div>
      <p class="status-label">${status === 'accepted' ? 'Ingreso autorizado' : status === 'duplicate' ? 'Ingreso ya registrado' : status === 'invalid' ? 'Código no válido' : 'No se pudo confirmar'}</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      ${details ? `<div class="ticket-detail">${escapeHtml(details)}</div>` : ''}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  async function updateStats() {
    const { data, error } = await supabase.rpc('resumen_ingresos');
    const statsError = document.querySelector('#stats-error');
    if (error) {
      statsError.textContent = error.code === '42501'
        ? 'Esta cuenta no está autorizada. Solicita acceso al administrador.'
        : 'No se pudieron actualizar los conteos. Comprueba la conexión.';
      statsError.hidden = false;
      return;
    }
    statsError.hidden = true;
    document.querySelector('#total-count').textContent = data.total_boletas;
    document.querySelector('#admitted-count').textContent = data.ingresos_registrados;
  }

  async function submitPending() {
    if (!pending) return;
    if (!navigator.onLine) {
      showMessage('waiting', 'Sin conexión', 'El código se conserva en esta pestaña. Reconéctate y vuelve a intentar.');
      retryButton.hidden = false;
      return;
    }

    retryButton.disabled = true;
    showMessage('waiting', 'Verificando…', 'Consultando el registro central de invitaciones.');
    const intent = pending;
    const { data, error } = await supabase.rpc('registrar_ingreso', {
      p_contenido_qr: intent.code,
      p_request_id: intent.requestId,
    });
    retryButton.disabled = false;

    if (error) {
      showMessage('waiting', 'No se pudo confirmar', 'No se autorizó el ingreso. Comprueba la conexión e inténtalo de nuevo.', error.message);
      retryButton.hidden = false;
      return;
    }
    savePending(null);

    if (data.status === 'invalid') {
      showMessage('invalid', 'Invitación no encontrada', 'Este QR no corresponde a una boleta válida.');
    } else if (data.status === 'already_registered') {
      showMessage(
        'duplicate',
        `Boleta ${data.numero}`,
        `Esta invitación ya registró ingreso a las ${formatTime(data.checked_in_at)}.`,
        `Grupo ${data.grupo} · Boleta ${data.numero}`,
      );
    } else {
      showMessage(
        'accepted',
        `Boleta ${data.numero}`,
        `Ingreso registrado a las ${formatTime(data.checked_in_at)}.`,
        `Grupo ${data.grupo} · Boleta ${data.numero}`,
      );
    }
    await updateStats();
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      .format(new Date(value));
  }

  async function handleCode(rawCode) {
    const code = rawCode.trim();
    if (!code || pending) return;
    stopCamera();
    savePending({ code, requestId: crypto.randomUUID() });
    await submitPending();
  }

  async function startCamera() {
    startCameraButton.disabled = true;
    startCameraButton.textContent = 'Solicitando cámara…';
    try {
      cameraControls = await scanner.decodeFromVideoDevice(undefined, video, (result) => {
        if (result && !pending) handleCode(result.getText());
      });
      videoPlaceholder.hidden = true;
      startCameraButton.textContent = 'Cámara activa · detener';
      startCameraButton.disabled = false;
    } catch (error) {
      startCameraButton.disabled = false;
      startCameraButton.textContent = 'Activar cámara';
      showMessage('invalid', 'No se pudo abrir la cámara', 'Permite el acceso a la cámara y vuelve a intentarlo.', error.message);
    }
  }

  function stopCamera() {
    if (cameraControls) {
      cameraControls.stop();
      cameraControls = null;
    }
    if (video) {
      video.srcObject?.getTracks().forEach((track) => track.stop());
      videoPlaceholder.hidden = false;
      startCameraButton.textContent = 'Activar cámara';
    }
  }

  async function showSession(session) {
    const signedIn = Boolean(session);
    loginView.hidden = signedIn;
    scannerView.hidden = !signedIn;
    if (signedIn) {
      await updateStats();
      if (pending) submitPending();
    } else {
      stopCamera();
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const form = new FormData(loginForm);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (error) loginError.textContent = 'No se pudo iniciar sesión. Revisa el correo, la contraseña y la conexión.';
  });

  document.querySelector('#logout').addEventListener('click', async () => {
    stopCamera();
    await supabase.auth.signOut();
  });
  document.querySelector('#manual-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.querySelector('#manual-code');
    handleCode(input.value);
    input.value = '';
  });
  startCameraButton.addEventListener('click', () => {
    if (cameraControls) stopCamera();
    else startCamera();
  });
  retryButton.addEventListener('click', submitPending);
  window.addEventListener('online', setConnection);
  window.addEventListener('offline', setConnection);
  window.addEventListener('pagehide', stopCamera);
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => showSession(session), 0);
  });

  setConnection();
  supabase.auth.getSession().then(({ data: { session } }) => showSession(session));
}
