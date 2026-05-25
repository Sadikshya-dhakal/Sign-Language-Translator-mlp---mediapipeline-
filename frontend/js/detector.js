/**
 * detector.js
 * SignSense — MediaPipe + MLP Sign Language Frontend
 */

const API_URL = 'http://localhost:5000';

// ── DOM refs ─────────────────────────────────────────
const video         = document.getElementById('video');
const overlayCanvas = document.getElementById('overlay-canvas');
const cameraFrame   = document.getElementById('camera-frame');
const camBadge      = document.getElementById('cam-badge');
const lmStatus      = document.getElementById('lm-status');
const btnStart      = document.getElementById('btn-start');
const btnStop       = document.getElementById('btn-stop');
const btnCapture    = document.getElementById('btn-capture');
const autoToggle    = document.getElementById('auto-mode');

const predLetter    = document.getElementById('pred-letter');
const confPct       = document.getElementById('conf-pct');
const confArc       = document.getElementById('conf-arc');
const accuracyVal   = document.getElementById('accuracy-val');
const accuracyBar   = document.getElementById('accuracy-bar');
const accuracySub   = document.getElementById('accuracy-sub');

const sentenceDisplay = document.getElementById('sentence-display');
const sentenceTape    = document.getElementById('sentence-tape');
const btnSpace        = document.getElementById('btn-space');
const btnDelete       = document.getElementById('btn-delete');
const btnClear        = document.getElementById('btn-clear');

const statTotal  = document.getElementById('stat-total');
const statHigh   = document.getElementById('stat-high');
const statAvg    = document.getElementById('stat-avg');
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const top3Box    = document.getElementById('top3-box');
const apiBanner  = document.getElementById('api-banner');

// ── State ─────────────────────────────────────────────
let stream       = null;
let isStreaming  = false;
let autoInterval = null;
let sentence     = [];
let predictions  = [];
let letterCounts = {};

// ── Canvas ────────────────────────────────────────────
const capCanvas = document.createElement('canvas');
const capCtx    = capCanvas.getContext('2d');
const overlayCtx= overlayCanvas.getContext('2d');
const ARC_LEN   = 150.8;

// ── Backend ping on load ──────────────────────────────
async function checkBackend() {
  try {
    const res  = await fetch(`${API_URL}/ping`);
    const data = await res.json();
    if (data.status === 'ok') {
      setBackendStatus(true);
      apiBanner.style.display = 'none';
    } else {
      setBackendStatus(false);
      apiBanner.style.display = 'flex';
    }
  } catch {
    setBackendStatus(false);
    apiBanner.style.display = 'flex';
  }
}
checkBackend();

// ── Camera ────────────────────────────────────────────
btnStart.addEventListener('click', startCamera);
btnStop.addEventListener('click', stopCamera);
btnCapture.addEventListener('click', captureAndPredict);

autoToggle.addEventListener('change', () => {
  if (autoToggle.checked && isStreaming) startAuto();
  else stopAuto();
});

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    isStreaming = true;
    cameraFrame.classList.add('active');
    camBadge.hidden = false;
    lmStatus.textContent = 'Camera active';
    btnStart.disabled   = true;
    btnStop.disabled    = false;
    btnCapture.disabled = false;
    if (autoToggle.checked) startAuto();
  } catch (err) {
    camBadge.hidden = false;
    lmStatus.textContent = 'Camera denied: ' + err.message;
  }
}

function stopCamera() {
  stream?.getTracks().forEach(t => t.stop());
  stream      = null;
  isStreaming = false;
  video.srcObject = null;
  stopAuto();
  cameraFrame.classList.remove('active');
  camBadge.hidden     = true;
  btnStart.disabled   = false;
  btnStop.disabled    = true;
  btnCapture.disabled = true;
  clearOverlay();
}

function startAuto() {
  stopAuto();
  autoInterval = setInterval(captureAndPredict, 1200);
  lmStatus.classList.add('detecting');
}

function stopAuto() {
  clearInterval(autoInterval);
  autoInterval = null;
  lmStatus?.classList.remove('detecting');
}

// ── Capture & Predict ─────────────────────────────────
async function captureAndPredict() {
  if (!isStreaming) return;

  capCanvas.width  = video.videoWidth  || 640;
  capCanvas.height = video.videoHeight || 480;
  capCtx.drawImage(video, 0, 0);

  const dataURL = capCanvas.toDataURL('image/jpeg', 0.85);
  lmStatus.textContent = 'Predicting…';

  try {
    const res = await fetch(`${API_URL}/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image: dataURL }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) {
      lmStatus.textContent = '✋ ' + data.error;
      setBackendStatus(true);
      apiBanner.style.display = 'none';
      return;
    }

    applyPrediction(data.letter, data.confidence / 100);
    if (data.top3)      renderTop3(data.top3);
    if (data.landmarks) drawLandmarks(data.landmarks);

    lmStatus.textContent    = `Detected: ${data.letter}`;
    apiBanner.style.display = 'none';
    setBackendStatus(true);

  } catch (err) {
    console.warn('Backend error:', err.message);
    setBackendStatus(false);
    apiBanner.style.display = 'flex';
    lmStatus.textContent    = 'Backend not reachable';
  }
}

// ── Apply prediction to UI ────────────────────────────
function applyPrediction(letter, confidenceRatio) {
  const pct = Math.round(confidenceRatio * 100);

  predLetter.textContent       = letter || '?';
  predLetter.style.color       = 'var(--accent)';
  predLetter.style.transform   = 'scale(1.3)';
  setTimeout(() => predLetter.style.transform = 'scale(1)', 130);

  const offset    = ARC_LEN - (ARC_LEN * pct / 100);
  confArc.style.strokeDashoffset = offset;
  const ringColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--accent-2)';
  confArc.style.stroke     = ringColor;
  confPct.textContent      = `${pct}%`;

  accuracyVal.textContent  = `${pct}%`;
  accuracyBar.style.width  = `${pct}%`;
  accuracyBar.style.background = ringColor;
  accuracySub.textContent  =
    pct >= 80 ? 'High confidence' :
    pct >= 50 ? 'Moderate — try adjusting hand position' :
                'Low confidence — ensure good lighting';

  predictions.push(pct);
  letterCounts[letter] = (letterCounts[letter] || 0) + 1;
  statTotal.textContent = predictions.length;
  statAvg.textContent   = Math.round(predictions.reduce((a,b) => a+b, 0) / predictions.length) + '%';
  const best = Object.entries(letterCounts).sort((a,b) => b[1]-a[1])[0];
  statHigh.textContent  = best ? best[0] : '—';

  if (letter && pct >= 60) addLetterToSentence(letter, pct);
}

// ── Top 3 ─────────────────────────────────────────────
function renderTop3(top3) {
  if (!top3Box) return;
  top3Box.innerHTML = top3.map((t, i) => `
    <div class="top3-item ${i === 0 ? 'top3-item--best' : ''}">
      <span class="top3-letter">${t.letter}</span>
      <div class="top3-bar-track">
        <div class="top3-bar-fill" style="width:${t.confidence}%;background:${
          i === 0 ? 'var(--accent)' : i === 1 ? 'var(--accent-dim)' : 'var(--text-dim)'
        }"></div>
      </div>
      <span class="top3-pct">${t.confidence}%</span>
    </div>
  `).join('');
}

// ── Sentence Builder ──────────────────────────────────
function addLetterToSentence(letter, conf) {
  sentence.push({ char: letter, conf });
  renderSentence();
}

function renderSentence() {
  if (sentence.length === 0) {
    sentenceDisplay.innerHTML = '<span class="sentence-placeholder">Start signing to build a sentence</span>';
    sentenceTape.innerHTML    = '';
    return;
  }
  sentenceDisplay.textContent = sentence.map(s => s.char).join('');
  sentenceTape.innerHTML = sentence.map(s =>
    s.char === ' '
      ? `<span class="s-chip space-chip" title="space">␣</span>`
      : `<span class="s-chip" title="${s.conf}% confidence">${s.char}</span>`
  ).join('');
  sentenceTape.scrollLeft = sentenceTape.scrollWidth;
}

btnSpace.addEventListener('click',  () => { sentence.push({ char: ' ', conf: 100 }); renderSentence(); });
btnDelete.addEventListener('click', () => { sentence.pop(); renderSentence(); });
btnClear.addEventListener('click',  () => { sentence = []; renderSentence(); });

// ── Landmark Overlay ──────────────────────────────────
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function drawLandmarks(lm) {
  overlayCanvas.width  = video.videoWidth  || 640;
  overlayCanvas.height = video.videoHeight || 480;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!lm || lm.length < 42) return;

  const W   = overlayCanvas.width;
  const H   = overlayCanvas.height;
  const pts = Array.from({ length: 21 }, (_, i) => ({
    x: lm[i * 3]     * W,
    y: lm[i * 3 + 1] * H
  }));

  overlayCtx.strokeStyle = 'rgba(0,212,255,0.5)';
  overlayCtx.lineWidth   = 2;
  for (const [a, b] of CONNECTIONS) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(pts[a].x, pts[a].y);
    overlayCtx.lineTo(pts[b].x, pts[b].y);
    overlayCtx.stroke();
  }

  pts.forEach((p, i) => {
    overlayCtx.beginPath();
    overlayCtx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
    overlayCtx.fillStyle = i === 0 ? '#00d4ff' : 'rgba(0,212,255,0.85)';
    overlayCtx.fill();
  });
}

function clearOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// ── Backend status ────────────────────────────────────
function setBackendStatus(online) {
  statusDot.className    = 'status-dot ' + (online ? 'online' : 'offline');
  statusText.textContent = online ? 'Backend connected' : 'Backend not connected';
}