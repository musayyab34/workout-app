import type { Preferences } from "@/domain/schemas";
let context: AudioContext | null = null;
export async function armAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") await context.resume();
  } catch {
    /* Visual completion always remains available. */
  }
}
export async function playAlert(preferences: Preferences) {
  if (
    preferences.vibrationEnabled &&
    typeof navigator !== "undefined" &&
    "vibrate" in navigator
  ) {
    try {
      navigator.vibrate([120, 70, 120]);
    } catch {}
  }
  if (!preferences.soundEnabled) return;
  try {
    await armAudio();
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.13, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  } catch {}
}
