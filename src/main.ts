import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "./style.css";

type PhaseKind = "inhale" | "hold" | "exhale" | "rest";
type Nostril = "both" | "left" | "right" | "none";
type Phase = { kind: PhaseKind; seconds: number; nostril: Nostril };
type Preset = { key: string; phases: Phase[] };

const PRESETS: Preset[] = [
  { key: "1", phases: [{ kind: "inhale", seconds: 4, nostril: "both" }, { kind: "exhale", seconds: 6, nostril: "both" }] },
  { key: "2", phases: [{ kind: "inhale", seconds: 4, nostril: "both" }, { kind: "hold", seconds: 4, nostril: "none" }, { kind: "exhale", seconds: 4, nostril: "both" }, { kind: "hold", seconds: 4, nostril: "none" }] },
  { key: "3", phases: [{ kind: "inhale", seconds: 4, nostril: "both" }, { kind: "hold", seconds: 7, nostril: "none" }, { kind: "exhale", seconds: 8, nostril: "both" }] },
  { key: "4", phases: [{ kind: "inhale", seconds: 5, nostril: "both" }, { kind: "exhale", seconds: 5, nostril: "both" }] },
  { key: "5", phases: [{ kind: "inhale", seconds: 4, nostril: "left" }, { kind: "exhale", seconds: 4, nostril: "right" }, { kind: "inhale", seconds: 4, nostril: "right" }, { kind: "exhale", seconds: 4, nostril: "left" }] }
];

const orb = document.querySelector<HTMLSpanElement>("#orb")!;
const countdown = document.querySelector<HTMLSpanElement>("#countdown")!;
const leftNostril = document.querySelector<HTMLSpanElement>("#left-nostril")!;
const rightNostril = document.querySelector<HTMLSpanElement>("#right-nostril")!;
const help = document.querySelector<HTMLElement>("#help")!;

let preset = PRESETS[0];
let phaseIndex = 0;
let phaseStartedAt = performance.now();
let paused = false;
let stopped = false;
let remainingWhenPaused = 0;
let audioEnabled = false;
let oscillator: OscillatorNode | undefined;
let audioContext: AudioContext | undefined;
let topmost = true;
const appWindow = getCurrentWindow();

function loadPreference<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(`spira.${key}`) ?? "") as T; } catch { return fallback; }
}
function savePreference(key: string, value: unknown) { localStorage.setItem(`spira.${key}`, JSON.stringify(value)); }

function currentPhase() { return preset.phases[phaseIndex]; }

function render(remaining: number) {
  const phase = currentPhase();
  orb.style.setProperty("--phase-duration", `${phase.seconds}s`);
  orb.dataset.phase = stopped ? "rest" : phase.kind;
  countdown.textContent = stopped ? "" : String(Math.max(1, Math.ceil(remaining)));
  leftNostril.classList.toggle("active", !stopped && (phase.nostril === "left" || phase.nostril === "both"));
  rightNostril.classList.toggle("active", !stopped && (phase.nostril === "right" || phase.nostril === "both"));
}

function setPhase(index: number) {
  phaseIndex = index % preset.phases.length;
  phaseStartedAt = performance.now();
  remainingWhenPaused = currentPhase().seconds;
  render(remainingWhenPaused);
  updateAudio();
}

function tick(now: number) {
  if (!paused && !stopped && !help.classList.contains("hidden")) {
    const elapsed = (now - phaseStartedAt) / 1000;
    const remaining = currentPhase().seconds - elapsed;
    if (remaining <= 0) setPhase(phaseIndex + 1);
    else render(remaining);
  }
  requestAnimationFrame(tick);
}

function selectPreset(key: string) {
  const next = PRESETS.find((item) => item.key === key);
  if (!next) return;
  preset = next;
  savePreference("preset", key);
  stopped = false;
  paused = false;
  setPhase(0);
}

function stop() {
  stopped = true;
  paused = false;
  stopAudio();
  render(0);
}

function togglePause() {
  if (stopped) return;
  paused = !paused;
  if (paused) {
    remainingWhenPaused = Math.max(1, currentPhase().seconds - (performance.now() - phaseStartedAt) / 1000);
    stopAudio();
    render(remainingWhenPaused);
  } else {
    phaseStartedAt = performance.now() - (currentPhase().seconds - remainingWhenPaused) * 1000;
    updateAudio();
  }
}

function audioFrequency() { return currentPhase().kind === "inhale" ? 220 : currentPhase().kind === "hold" ? 330 : 165; }
function stopAudio() { oscillator?.stop(); oscillator = undefined; }
function updateAudio() {
  stopAudio();
  if (!audioEnabled || paused || stopped) return;
  audioContext ??= new AudioContext();
  oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = audioFrequency();
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.025, audioContext.currentTime + 0.35);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
}

function toggleHelp() {
  const opening = help.classList.contains("hidden");
  help.classList.toggle("hidden");
  if (opening && !paused && !stopped) { remainingWhenPaused = Math.max(1, currentPhase().seconds - (performance.now() - phaseStartedAt) / 1000); stopAudio(); }
  if (!opening && !paused && !stopped) { phaseStartedAt = performance.now() - (currentPhase().seconds - remainingWhenPaused) * 1000; updateAudio(); }
}

document.addEventListener("keydown", async (event) => {
  if (event.key === "?" || event.key === "F1") { event.preventDefault(); toggleHelp(); return; }
  if (!help.classList.contains("hidden")) { if (event.key === "Escape") toggleHelp(); return; }
  if (event.ctrlKey && event.key.toLowerCase() === "t") {
    topmost = !topmost;
    await appWindow.setAlwaysOnTop(topmost);
    savePreference("topmost", topmost);
    return;
  }
  if (event.key === "p" || event.key === "P") togglePause();
  if (event.key === "s" || event.key === "S") { stopped = false; paused = false; setPhase(0); }
  if (event.key === "Escape") stop();
  if (event.key === "m" || event.key === "M") { audioEnabled = !audioEnabled; savePreference("audio", audioEnabled); updateAudio(); }
  if (event.key === "Home") await appWindow.setPosition(new PhysicalPosition(16, 16));
  selectPreset(event.key);
});

document.querySelector("#close-help")!.addEventListener("click", toggleHelp);
document.querySelector("#breath")!.addEventListener("click", togglePause);
void listen<string>("tray-action", ({ payload }) => {
  if (payload === "pause") togglePause();
  if (payload === "restart") { stopped = false; paused = false; setPhase(0); }
  if (payload === "audio") { audioEnabled = !audioEnabled; savePreference("audio", audioEnabled); updateAudio(); }
  if (payload === "topmost") {
    topmost = !topmost;
    void appWindow.setAlwaysOnTop(topmost);
    savePreference("topmost", topmost);
  }
});
void listen<string>("reminder-action", ({ payload }) => {
  if (payload === "start") { stopped = false; paused = false; setPhase(0); }
});
const savedPreset = loadPreference("preset", "1");
const savedAudio = loadPreference("audio", false);
const savedTopmost = loadPreference("topmost", true);
audioEnabled = savedAudio;
topmost = savedTopmost;
void appWindow.setAlwaysOnTop(topmost);
selectPreset(savedPreset);
render(currentPhase().seconds);
requestAnimationFrame(tick);
