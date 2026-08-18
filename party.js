const SESSION_KEY = "carimba_party_session";
const POLL_MS = 1300;
const AUTO_ADVANCE_MS = 4000;

let session = loadSession(); // { code, playerId }
let pollTimer = null;
let lastRoundNumber = null;
let advanceScheduled = false;

const views = {
  home: document.getElementById("view-home"),
  lobby: document.getElementById("view-lobby"),
  play: document.getElementById("view-play"),
  ended: document.getElementById("view-ended"),
};

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveSession(s) {
  session = s;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  session = null;
  sessionStorage.removeItem(SESSION_KEY);
}

function showView(name) {
  for (const key in views) {
    views[key].hidden = key !== name;
  }
}

async function api(path, options) {
  const res = await fetch(path, {
    method: options && options.method ? options.method : "GET",
    headers: Object.assign({ "Content-Type": "application/json" }, options && options.headers),
    body: options && options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || "Erro de servidor");
    err.code = data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- HOME ---------------- */
const createNameInput = document.getElementById("createNameInput");
const joinCodeInput = document.getElementById("joinCodeInput");
const joinNameInput = document.getElementById("joinNameInput");
const homeError = document.getElementById("homeError");

document.getElementById("createBtn").addEventListener("click", async () => {
  homeError.textContent = "";
  try {
    const data = await api("/api/room-create", { method: "POST", body: { name: createNameInput.value } });
    saveSession({ code: data.state.code, playerId: data.playerId });
    handleState(data.state);
    startPolling();
  } catch (e) {
    homeError.textContent = e.message;
  }
});

document.getElementById("joinBtn").addEventListener("click", async () => {
  homeError.textContent = "";
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length < 4) {
    homeError.textContent = "Introduz um código válido.";
    return;
  }
  try {
    const data = await api("/api/room-join", { method: "POST", body: { code, name: joinNameInput.value } });
    saveSession({ code: data.state.code, playerId: data.playerId });
    handleState(data.state);
    startPolling();
  } catch (e) {
    homeError.textContent = e.message;
  }
});

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

/* ---------------- LOBBY ---------------- */
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const playerCount = document.getElementById("playerCount");
const lobbyPlayerList = document.getElementById("lobbyPlayerList");
const startGameBtn = document.getElementById("startGameBtn");
const waitingLine = document.getElementById("waitingLine");

document.getElementById("copyCodeBtn").addEventListener("click", () => {
  if (!session) return;
  navigator.clipboard && navigator.clipboard.writeText(session.code).catch(() => {});
});

startGameBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/room-start", { method: "POST", body: { code: session.code, playerId: session.playerId } });
    handleState(data.state);
  } catch (e) {
    homeError.textContent = e.message;
  }
});

function renderLobby(state) {
  roomCodeDisplay.textContent = state.code;
  playerCount.textContent = state.players.length + "/" + state.maxPlayers;
  lobbyPlayerList.innerHTML = "";
  state.players.forEach((p) => {
    const li = document.createElement("li");
    li.innerHTML =
      (p.isHost ? '<span class="crown">👑</span>' : "") +
      escapeHtml(p.name) +
      (p.id === state.you.id ? ' <span class="tag">(tu)</span>' : "");
    lobbyPlayerList.appendChild(li);
  });
  if (state.you.isHost) {
    startGameBtn.hidden = false;
    waitingLine.hidden = true;
  } else {
    startGameBtn.hidden = true;
    waitingLine.hidden = false;
  }
}

/* ---------------- PLAY ---------------- */
const playCode = document.getElementById("playCode");
const answeredChip = document.getElementById("answeredChip");
const leaderboard = document.getElementById("leaderboard");
const card = document.getElementById("card");
const nameDisplay = document.getElementById("nameDisplay");
const genderTag = document.getElementById("genderTag");
const stampOverlay = document.getElementById("stampOverlay");
const stampMark = document.getElementById("stampMark");
const verdictLine = document.getElementById("verdictLine");
const btnReal = document.getElementById("btnReal");
const btnFake = document.getElementById("btnFake");
const playWaitingLine = document.getElementById("playWaitingLine");
const hostNextBtn = document.getElementById("hostNextBtn");
const hostEndBtn = document.getElementById("hostEndBtn");

btnReal.addEventListener("click", () => submitAnswer(true));
btnFake.addEventListener("click", () => submitAnswer(false));
hostNextBtn.addEventListener("click", () => goNext());
hostEndBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/room-end", { method: "POST", body: { code: session.code, playerId: session.playerId } });
    handleState(data.state);
  } catch (e) {}
});

async function submitAnswer(guessReal) {
  if (!session) return;
  btnReal.disabled = true;
  btnFake.disabled = true;
  try {
    const data = await api("/api/room-answer", {
      method: "POST",
      body: { code: session.code, playerId: session.playerId, guessReal },
    });
    handleState(data.state);
  } catch (e) {
    btnReal.disabled = false;
    btnFake.disabled = false;
  }
}

async function goNext() {
  try {
    const data = await api("/api/room-next", { method: "POST", body: { code: session.code, playerId: session.playerId } });
    handleState(data.state);
  } catch (e) {}
}

function renderPlay(state) {
  playCode.textContent = state.code;

  const sorted = state.players.slice().sort((a, b) => b.score - a.score);
  leaderboard.innerHTML = "";
  sorted.forEach((p) => {
    const li = document.createElement("li");
    if (p.id === state.you.id) li.classList.add("you");
    li.innerHTML =
      '<span class="lb-name">' + (p.isHost ? "👑 " : "") + escapeHtml(p.name) + "</span>" +
      '<span class="lb-score">' + p.score + "</span>";
    leaderboard.appendChild(li);
  });

  const round = state.round;
  if (!round) return;

  answeredChip.textContent = round.answeredCount + "/" + round.totalPlayers + " responderam";

  const isNewRound = round.number !== lastRoundNumber;
  if (isNewRound) {
    lastRoundNumber = round.number;
    advanceScheduled = false;
    card.classList.remove("shake");
    stampOverlay.classList.remove("show");
    stampMark.className = "stamp-mark";
    stampMark.textContent = "";
    verdictLine.className = "verdict-line";
    verdictLine.textContent = "";
  }

  nameDisplay.textContent = round.name;
  genderTag.textContent = round.gender === "F" ? "Feminino" : "Masculino";

  const alreadyAnswered = !!round.you;
  btnReal.disabled = alreadyAnswered || round.revealed;
  btnFake.disabled = alreadyAnswered || round.revealed;
  playWaitingLine.hidden = !(alreadyAnswered && !round.revealed);

  if (round.revealed && !stampOverlay.classList.contains("show")) {
    stampMark.classList.add(round.isReal ? "real" : "fake");
    stampMark.textContent = round.isReal ? "Verdadeiro" : "Falso";
    if (round.you) {
      verdictLine.classList.add(round.you.correct ? "correct" : "wrong");
      verdictLine.textContent = round.you.correct ? "Acertaste!" : "Enganaste-te.";
      if (round.you.correct) burstConfetti();
      else card.classList.add("shake");
    } else {
      verdictLine.textContent = "";
    }
    stampOverlay.classList.add("show");
  }

  const amHost = state.you.isHost;
  hostNextBtn.hidden = !(amHost && round.revealed);
  hostEndBtn.hidden = !amHost;

  if (amHost && round.revealed && !advanceScheduled) {
    advanceScheduled = true;
    setTimeout(() => {
      if (session) goNext();
    }, AUTO_ADVANCE_MS);
  }
}

/* ---------------- ENDED ---------------- */
const finalLeaderboard = document.getElementById("finalLeaderboard");
document.getElementById("restartBtn").addEventListener("click", () => {
  clearSession();
  stopPolling();
  showView("home");
});

function renderEnded(state) {
  const sorted = state.players.slice().sort((a, b) => b.score - a.score);
  finalLeaderboard.innerHTML = "";
  sorted.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML =
      '<span class="lb-name">' + (i + 1) + ". " + (p.isHost ? "👑 " : "") + escapeHtml(p.name) + "</span>" +
      '<span class="lb-score">' + p.score + "</span>";
    finalLeaderboard.appendChild(li);
  });
}

/* ---------------- polling / dispatch ---------------- */
function handleState(state) {
  if (state.status === "lobby") {
    showView("lobby");
    renderLobby(state);
  } else if (state.status === "playing") {
    showView("play");
    renderPlay(state);
  } else if (state.status === "ended") {
    stopPolling();
    showView("ended");
    renderEnded(state);
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!session) return;
    try {
      const data = await api("/api/room-state?code=" + encodeURIComponent(session.code), {
        headers: { "X-Player-Id": session.playerId },
      });
      handleState(data.state);
    } catch (e) {
      if (e.status === 404) {
        clearSession();
        stopPolling();
        homeError.textContent = "Essa sala já não existe.";
        showView("home");
      }
    }
  }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- confetti (shared visual language with solo mode) ---------------- */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");
const CONFETTI_COLORS = ["#FF3E7F", "#FFD23F", "#29E0D8", "#8C4DFF", "#2FD07F"];
let particles = [];
let confettiRunning = false;
function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
function burstConfetti() {
  if (reduceMotion) return;
  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * 0.4;
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x: originX, y: originY,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      life: 0, maxLife: 70 + Math.random() * 20,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(tickConfetti);
  }
}
function tickConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  particles.forEach((p) => {
    p.vy += 0.12; p.x += p.vx; p.y += p.vy; p.rotation += p.vr; p.life += 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  });
  particles = particles.filter((p) => p.life < p.maxLife);
  if (particles.length > 0) requestAnimationFrame(tickConfetti);
  else { confettiRunning = false; ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
}

/* ---------------- boot ---------------- */
(async function boot() {
  if (session && session.code && session.playerId) {
    try {
      const data = await api("/api/room-state?code=" + encodeURIComponent(session.code), {
        headers: { "X-Player-Id": session.playerId },
      });
      handleState(data.state);
      startPolling();
      return;
    } catch (e) {
      clearSession();
    }
  }
  showView("home");
})();
