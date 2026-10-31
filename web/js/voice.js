// Read-aloud and hands-free voice mode, with the browser's built-in speech engines (no keys needed).
import { state } from "./store.js";

export const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canSpeak = "speechSynthesis" in window;

export const voiceLang = () => state.settings.voiceLang || navigator.language || "en-IN";

// What is worth saying out loud: prose only. Code, file blocks and tags are summarised.
export function speakable(text) {
  let files = 0;
  const out = String(text || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, "")
    .replace(/```[^\n]*file=[^\n]*\n[\s\S]*?(```|$)/g, () => (files++, " "))
    .replace(/```[\s\S]*?(```|$)/g, " Here is some code. ")
    .replace(/<diji-[\s\S]*?>/g, " ")
    .replace(/[#*_`>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return (files ? `I wrote ${files} file${files > 1 ? "s" : ""} in your workspace. ` : "") + out.slice(0, 1800);
}

export function speak(text, { onend } = {}) {
  if (!canSpeak) return onend?.();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = voiceLang();
  u.rate = 1.03;
  const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.onend = u.onerror = () => onend?.();
  speechSynthesis.speak(u);
}

export const stopSpeaking = () => canSpeak && speechSynthesis.cancel();

// Listens once and resolves with the final transcript ("" if nothing was said).
export function listenOnce(onInterim) {
  return new Promise((resolve, reject) => {
    if (!Speech) return reject(new Error("This browser has no speech recognition. Try Chrome or Edge."));
    const rec = new Speech();
    rec.lang = voiceLang();
    rec.interimResults = true;
    rec.continuous = false;
    let final = "";
    rec.onresult = (e) => {
      const t = [...e.results].map((r) => r[0].transcript).join("");
      if (e.results[e.results.length - 1].isFinal) final = t;
      onInterim?.(t);
    };
    rec.onerror = (e) => (e.error === "no-speech" || e.error === "aborted" ? resolve("") : reject(new Error(e.error === "not-allowed" ? "Allow microphone access to talk to Diji." : `Voice input stopped: ${e.error}`)));
    rec.onend = () => resolve(final);
    listenOnce.current = rec;
    rec.start();
  });
}
listenOnce.stop = () => listenOnce.current?.abort();
