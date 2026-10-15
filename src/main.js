import { BrowserQRCodeReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
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
  const scanHints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const scanner = new BrowserQRCodeReader(scanHints, {
    delayBetweenScanAttempts: 150,
    delayBetweenScanSuccess: 250,
  });
  let cameraControls = null;
  let cameraSessionId = 0;
  let nativeDetector = null;
  let torchEnabled = false;
  let selectedCameraId = '';
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
            <div id="camera-tools" class="camera-tools" hidden>
              <label id="camera-picker-wrap" hidden>
                Cámara
                <select id="camera-picker" aria-label="Seleccionar cámara"></select>
              </label>
              <label id="zoom-wrap" class="zoom-control" hidden>
                Zoom <input id="camera-zoom" type="range" min="1" max="1" step="0.1" value="1" />
              </label>
              <button id="torch-toggle" class="button button-quiet" type="button" hidden>Encender linterna</button>
            </div>
            <button id="start-camera" class="button button-primary" type="button">Activar cámara</button>
            <p id="camera-hint" class="hint">Enfoca el QR completo y mantén el teléfono quieto. La cámara requiere HTTPS.</p>
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
      <dialog id="approval-dialog" class="approval-dialog" aria-labelledby="approval-title" aria-describedby="approval-instructions">
        <div class="approval-content">
          <span class="approval-icon" aria-hidden="true">⌗</span>
          <p class="eyebrow">Código detectado</p>
          <h2 id="approval-title">¿Autorizar este ingreso?</h2>
          <p id="approval-instructions" class="muted">Confirma que el código corresponde a la persona que ingresa.</p>
          <code id="approval-code" class="approval-code"></code>
          <button id="approve-entry" class="button button-primary approval-button" type="button">Aprobar ingreso</button>
          <button id="cancel-approval" class="button button-quiet cancel-approval" type="button">Cancelar</button>
        </div>
      </dialog>
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
  const cameraTools = document.querySelector('#camera-tools');
  const cameraPickerWrap = document.querySelector('#camera-picker-wrap');
  const cameraPicker = document.querySelector('#camera-picker');
  const zoomWrap = document.querySelector('#zoom-wrap');
  const cameraZoom = document.querySelector('#camera-zoom');
  const torchToggle = document.querySelector('#torch-toggle');
  const cameraHint = document.querySelector('#camera-hint');
  const retryButton = document.querySelector('#retry');
  const approvalDialog = document.querySelector('#approval-dialog');
  const approvalCode = document.querySelector('#approval-code');
  const approveEntryButton = document.querySelector('#approve-entry');
  let approvalCandidate = '';
  let resumeCameraAfterCancel = false;

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

  function requestApproval(rawCode) {
    const code = rawCode.trim();
    if (!code || pending || approvalCandidate) return;
    resumeCameraAfterCancel = Boolean(cameraControls);
    approvalCandidate = code;
    approvalCode.textContent = code;
    stopCamera();
    approvalDialog.showModal();
    try {
      navigator.vibrate?.([180, 80, 180]);
    } catch (error) {
      console.warn('El dispositivo no permitió vibrar.', error);
    }
    approveEntryButton.focus();
  }

  function cancelApproval() {
    if (!approvalCandidate) return;
    approvalCandidate = '';
    approvalDialog.close();
    if (resumeCameraAfterCancel && !pending) startCamera();
    resumeCameraAfterCancel = false;
  }

  async function approveEntry() {
    if (!approvalCandidate || pending) return;
    const code = approvalCandidate;
    approvalCandidate = '';
    resumeCameraAfterCancel = false;
    approvalDialog.close();
    try {
      navigator.vibrate?.(60);
    } catch (error) {
      console.warn('El dispositivo no permitió vibrar.', error);
    }
    await handleCode(code);
  }

  async function startCamera() {
    startCameraButton.disabled = true;
    startCameraButton.textContent = 'Solicitando cámara…';
    cameraHint.textContent = 'Enfoca el QR completo y mantén el teléfono quieto. La cámara requiere HTTPS.';
    try {
      const videoConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 },
      };
      if (selectedCameraId) videoConstraints.deviceId = { exact: selectedCameraId };
      else videoConstraints.facingMode = { ideal: 'environment' };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      } catch (error) {
        if (error.name !== 'OverconstrainedError' && error.name !== 'NotFoundError') throw error;
        selectedCameraId = '';
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
      }

      const sessionId = ++cameraSessionId;
      let detectedBeforeReady = '';
      cameraControls = await scanner.decodeFromStream(stream, video, (result) => {
        if (!result || pending || approvalCandidate) return;
        if (cameraControls) requestApproval(result.getText());
        else detectedBeforeReady = result.getText();
      });
      const track = stream.getVideoTracks()[0];
      await configureCamera(track);
      await populateCameraPicker(track);
      configureCameraTools(track);
      startNativeScan(sessionId);
      videoPlaceholder.hidden = true;
      startCameraButton.textContent = 'Cámara activa · detener';
      startCameraButton.disabled = false;
      if (detectedBeforeReady && !pending) requestApproval(detectedBeforeReady);
    } catch (error) {
      stopCamera();
      startCameraButton.disabled = false;
      startCameraButton.textContent = 'Activar cámara';
      showMessage('invalid', 'No se pudo abrir la cámara', 'Permite el acceso a la cámara y vuelve a intentarlo.', error.message);
    }
  }

  async function configureCamera(track) {
    if (!track?.applyConstraints) return;
    const capabilities = getCameraCapabilities(track);
    const advanced = [];
    for (const [name, preferred] of [
      ['focusMode', 'continuous'],
      ['exposureMode', 'continuous'],
      ['whiteBalanceMode', 'continuous'],
    ]) {
      if (Array.isArray(capabilities[name]) && capabilities[name].includes(preferred)) {
        advanced.push({ [name]: preferred });
      }
    }
    if (!advanced.length) return;
    try {
      await track.applyConstraints({ advanced });
    } catch (error) {
      console.warn('No se pudieron activar los ajustes automáticos de cámara.', error);
    }
  }

  async function populateCameraPicker(activeTrack) {
    if (!navigator.mediaDevices.enumerateDevices) return;
    let devices;
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (error) {
      console.warn('No se pudieron listar las cámaras disponibles.', error);
      cameraPickerWrap.hidden = true;
      return;
    }
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    cameraPicker.replaceChildren();
    for (const [index, camera] of cameras.entries()) {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Cámara ${index + 1}`;
      cameraPicker.append(option);
    }
    const activeDeviceId = getCameraSettings(activeTrack).deviceId;
    if (activeDeviceId && cameras.some((camera) => camera.deviceId === activeDeviceId)) {
      selectedCameraId = activeDeviceId;
      cameraPicker.value = activeDeviceId;
    }
    cameraPickerWrap.hidden = cameras.length < 2;
  }

  function configureCameraTools(track) {
    const capabilities = getCameraCapabilities(track);
    const zoom = capabilities.zoom;
    if (zoom && zoom.max > zoom.min) {
      const currentZoom = getCameraSettings(track).zoom;
      cameraZoom.min = String(zoom.min);
      cameraZoom.max = String(zoom.max);
      cameraZoom.step = String(Math.max((zoom.max - zoom.min) / 100, 0.1));
      cameraZoom.value = String(Math.min(Math.max(currentZoom || zoom.min, zoom.min), zoom.max));
      zoomWrap.hidden = false;
    } else {
      zoomWrap.hidden = true;
    }

    torchEnabled = false;
    torchToggle.hidden = typeof cameraControls?.switchTorch !== 'function';
    torchToggle.textContent = 'Encender linterna';
    cameraTools.hidden = cameraPickerWrap.hidden && zoomWrap.hidden && torchToggle.hidden;
  }

  function getCameraCapabilities(track) {
    try {
      return track.getCapabilities?.() || {};
    } catch (error) {
      console.warn('El navegador no permite consultar los ajustes de cámara.', error);
      return {};
    }
  }

  function getCameraSettings(track) {
    try {
      return track.getSettings?.() || {};
    } catch (error) {
      console.warn('El navegador no permite consultar la configuración de cámara.', error);
      return {};
    }
  }

  function startNativeScan(sessionId) {
    if (typeof window.BarcodeDetector !== 'function') return;
    try {
      nativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (error) {
      console.warn('El lector QR nativo no está disponible; continúa el lector alternativo.', error);
      return;
    }

    let scanning = false;
    let lastScan = 0;
    const scanFrame = async (timestamp) => {
      if (sessionId !== cameraSessionId || !cameraControls || !nativeDetector) return;
      if (!scanning && timestamp - lastScan >= 120 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        scanning = true;
        lastScan = timestamp;
        try {
          const [result] = await nativeDetector.detect(video);
          if (result?.rawValue && sessionId === cameraSessionId && !pending && !approvalCandidate) {
            requestApproval(result.rawValue);
            return;
          }
        } catch (error) {
          console.warn('El lector QR nativo dejó de estar disponible; continúa el lector alternativo.', error);
          nativeDetector = null;
          return;
        } finally {
          scanning = false;
        }
      }
      if (sessionId === cameraSessionId && nativeDetector) requestAnimationFrame(scanFrame);
    };
    requestAnimationFrame(scanFrame);
  }

  async function applyZoom() {
    const track = video.srcObject?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: Number(cameraZoom.value) }] });
    } catch (error) {
      cameraHint.textContent = `No se pudo ajustar el zoom: ${error.message}`;
    }
  }

  async function toggleTorch() {
    if (!cameraControls?.switchTorch) return;
    try {
      await cameraControls.switchTorch(!torchEnabled);
      torchEnabled = !torchEnabled;
      torchToggle.textContent = torchEnabled ? 'Apagar linterna' : 'Encender linterna';
    } catch (error) {
      cameraHint.textContent = `No se pudo cambiar la linterna: ${error.message}`;
    }
  }

  function stopCamera() {
    cameraSessionId += 1;
    nativeDetector = null;
    if (cameraControls) {
      cameraControls.stop();
      cameraControls = null;
    }
    if (video) {
      video.srcObject?.getTracks().forEach((track) => track.stop());
      videoPlaceholder.hidden = false;
      cameraTools.hidden = true;
      startCameraButton.textContent = 'Activar cámara';
    }
  }

  cameraPicker.addEventListener('change', () => {
    selectedCameraId = cameraPicker.value;
    stopCamera();
    startCamera();
  });
  cameraZoom.addEventListener('input', applyZoom);
  torchToggle.addEventListener('click', toggleTorch);
  approveEntryButton.addEventListener('click', approveEntry);
  document.querySelector('#cancel-approval').addEventListener('click', cancelApproval);
  approvalDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelApproval();
  });

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
    requestApproval(input.value);
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
