type SpeechResultEvent = {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browser = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export function voiceInputSupported() {
  return recognitionCtor() !== null;
}

let followUp = false;
let active: Recognition | null = null;
let speechGeneration = 0;
let speechAbort: AbortController | null = null;
let audioCtx: AudioContext | null = null;
let keepAlive: OscillatorNode | null = null;
let player: HTMLAudioElement | null = null;
let playerUrl: string | null = null;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function sharedAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function audioPlayer() {
  if (!player) player = new Audio();
  player.setAttribute("playsinline", "true");
  player.volume = 1;
  player.muted = false;
  return player;
}

export function primeSpeech() {
  const ctx = sharedAudioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
  if (ctx && !keepAlive) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAlive = osc;
    } catch {
      keepAlive = null;
    }
  }
  const el = audioPlayer();
  if (!el.src) el.src = SILENT_WAV;
  void el.play().catch(() => {});
}

function stopKeepAlive() {
  if (!keepAlive) return;
  try {
    keepAlive.stop();
  } catch {
    // The oscillator was already stopped.
  }
  keepAlive = null;
}

function stopPlayer() {
  if (!player) return;
  player.pause();
  player.onended = null;
  player.onerror = null;
}

export function voiceFollowUpEnabled() {
  return followUp;
}

export function enableVoiceFollowUp() {
  followUp = true;
}

export function stopListening() {
  active?.abort();
  active = null;
}

export function stopSpeaking() {
  speechGeneration += 1;
  speechAbort?.abort();
  speechAbort = null;
  window.speechSynthesis?.cancel();
  stopPlayer();
  stopKeepAlive();
}

function playCloudAudio(bytes: ArrayBuffer, mime: string, token: number): Promise<boolean> {
  const el = audioPlayer();
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = URL.createObjectURL(new Blob([bytes], { type: mime || "audio/wav" }));
  el.src = playerUrl;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok && token === speechGeneration);
    };
    el.onended = () => finish(true);
    el.onerror = () => finish(false);
    el.play()
      .then(() => stopKeepAlive())
      .catch(() => finish(false));
  });
}

export function speak(text: string): Promise<boolean> {
  const spoken = text.trim();
  if (typeof window === "undefined" || !spoken) return Promise.resolve(false);
  stopListening();
  stopSpeaking();
  primeSpeech();
  const token = speechGeneration;
  const controller = new AbortController();
  speechAbort = controller;

  return fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: spoken }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (token !== speechGeneration || !response.ok) return false;
      const mime = response.headers.get("content-type") || "audio/wav";
      return playCloudAudio(await response.arrayBuffer(), mime, token);
    })
    .catch(() => false);
}

export function listen(
  handlers: {
    onPartial?: (text: string) => void;
    onFinal: (text: string) => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
  },
  options?: { quiet?: boolean }
) {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Voice input is not available in this browser.");
    handlers.onEnd?.();
    return () => {};
  }

  stopListening();
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  active = recognition;

  recognition.onresult = (event) => {
    const rows = Array.from(event.results);
    const text = rows.map((row) => row[0].transcript).join(" ").trim();
    const last = rows[rows.length - 1];
    if (last?.isFinal) handlers.onFinal(text);
    else handlers.onPartial?.(text);
  };
  recognition.onerror = (event) => {
    const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
    if (blocked && !options?.quiet) {
      handlers.onError?.("Allow the microphone to talk to Fo.");
    } else if (!blocked && event.error !== "aborted" && event.error !== "no-speech") {
      handlers.onError?.("Could not hear that. Try again.");
    }
    if (active === recognition) active = null;
  };
  recognition.onend = () => {
    if (active === recognition) active = null;
    handlers.onEnd?.();
  };
  try {
    recognition.start();
  } catch {
    if (active === recognition) active = null;
    handlers.onError?.("Allow the microphone to talk to Fo.");
    handlers.onEnd?.();
  }
  return () => {
    if (active === recognition) recognition.stop();
  };
}
