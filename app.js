const POOL = buildPool(NOMES_REAIS, NOMES_INVENTADOS);

function buildPool(real, fake) {
  const pool = [];
  for (const n of real.F) pool.push([n, 0, 1]);
  for (const n of real.M) pool.push([n, 1, 1]);
  for (const n of fake.F) pool.push([n, 0, 0]);
  for (const n of fake.M) pool.push([n, 1, 0]);
  return pool;
}

let deck = [];
let current = null;
let answered = false;
let score = 0, total = 0, streak = 0, best = 0;

const card = document.getElementById("card");
const nameDisplay = document.getElementById("nameDisplay");
const genderTag = document.getElementById("genderTag");
const promptLine = document.getElementById("promptLine");
const stampOverlay = document.getElementById("stampOverlay");
const stampMark = document.getElementById("stampMark");
const verdictLine = document.getElementById("verdictLine");
const btnReal = document.getElementById("btnReal");
const btnFake = document.getElementById("btnFake");
const nextBtn = document.getElementById("nextBtn");
const scoreVal = document.getElementById("scoreVal");
const streakVal = document.getElementById("streakVal");
const bestVal = document.getElementById("bestVal");

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillDeck() {
  deck = shuffle(POOL);
}

function nextRound() {
  if (deck.length === 0) refillDeck();
  current = deck.pop();
  answered = false;
  const [name, genderCode] = current;
  nameDisplay.textContent = name;
  genderTag.textContent = genderCode === 0 ? "Feminino" : "Masculino";
  promptLine.textContent = "Este nome consta no registo oficial de Portugal?";
  stampOverlay.classList.remove("show");
  stampMark.className = "stamp-mark";
  stampMark.textContent = "";
  verdictLine.className = "verdict-line";
  verdictLine.textContent = "";
  card.classList.remove("shake");
  btnReal.disabled = false;
  btnFake.disabled = false;
  nextBtn.classList.remove("show");
}

function updateScoreboard() {
  scoreVal.textContent = score + "/" + total;
  streakVal.textContent = streak;
  bestVal.textContent = best;
}

function answer(guessReal) {
  if (answered) return;
  answered = true;
  const [, , isReal] = current;
  const actuallyReal = isReal === 1;
  const correct = guessReal === actuallyReal;

  total += 1;
  if (correct) {
    score += 1;
    streak += 1;
    if (streak > best) best = streak;
  } else {
    streak = 0;
  }
  updateScoreboard();

  btnReal.disabled = true;
  btnFake.disabled = true;

  stampMark.classList.add(actuallyReal ? "real" : "fake");
  stampMark.textContent = actuallyReal ? "Verdadeiro" : "Falso";
  verdictLine.classList.add(correct ? "correct" : "wrong");
  verdictLine.textContent = correct ? "Acertaste!" : "Enganaste-te.";
  stampOverlay.classList.add("show");

  if (correct) {
    burstConfetti();
  } else {
    card.classList.add("shake");
  }

  nextBtn.classList.add("show");
  nextBtn.focus();
}

btnReal.addEventListener("click", () => answer(true));
btnFake.addEventListener("click", () => answer(false));
nextBtn.addEventListener("click", nextRound);

document.addEventListener("keydown", (e) => {
  if (answered && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    nextRound();
    return;
  }
  if (!answered && e.key === "ArrowLeft") answer(true);
  if (!answered && e.key === "ArrowRight") answer(false);
});

/* ---- confetti burst ---- */
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
  const count = 60;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
      maxLife: 70 + Math.random() * 20
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
    p.vy += 0.12;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.vr;
    p.life += 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  });
  particles = particles.filter((p) => p.life < p.maxLife);
  if (particles.length > 0) {
    requestAnimationFrame(tickConfetti);
  } else {
    confettiRunning = false;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

refillDeck();
nextRound();
updateScoreboard();
