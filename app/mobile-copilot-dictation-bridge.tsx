"use client";

import { useEffect } from "react";

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  button: HTMLButtonElement;
  originalHtml: string;
  autoStopTimer: number | null;
};

const AUDIO_TYPES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
}

function filenameFor(type: string) {
  if (type.includes("mp4")) return "dictee-copilote.m4a";
  if (type.includes("ogg")) return "dictee-copilote.ogg";
  if (type.includes("webm")) return "dictee-copilote.webm";
  return "dictee-copilote.audio";
}

function setButtonState(button: HTMLButtonElement, label: string, busy: boolean, recording = false) {
  button.textContent = label;
  button.disabled = busy && !recording;
  button.classList.toggle("recording", recording);
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-busy", busy ? "true" : "false");
}

function restoreButton(session: Pick<RecordingSession, "button" | "originalHtml">) {
  session.button.innerHTML = session.originalHtml;
  session.button.disabled = false;
  session.button.classList.remove("recording");
  session.button.removeAttribute("aria-busy");
  session.button.removeAttribute("aria-label");
}

function updateControlledTextarea(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

export default function MobileCopilotDictationBridge() {
  useEffect(() => {
    let session: RecordingSession | null = null;
    let transcribing = false;
    let transcriptionController: AbortController | null = null;

    const discardSession = () => {
      const current = session;
      session = null;
      if (!current) return;
      if (current.autoStopTimer) window.clearTimeout(current.autoStopTimer);
      current.recorder.ondataavailable = null;
      current.recorder.onstop = null;
      current.recorder.onerror = null;
      try {
        if (current.recorder.state !== "inactive") current.recorder.stop();
      } catch {}
      stopStream(current.stream);
      restoreButton(current);
    };

    const transcribe = async (current: RecordingSession, blob: Blob) => {
      transcribing = true;
      setButtonState(current.button, "Transcription…", true);
      transcriptionController?.abort();
      const controller = new AbortController();
      transcriptionController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 55_000);

      try {
        if (blob.size < 200) throw new Error("Enregistrement trop court. Réessayez en parlant au moins une seconde.");
        const form = new FormData();
        const type = blob.type || current.recorder.mimeType || "audio/mp4";
        form.append("file", new File([blob], filenameFor(type), { type }));
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as { text?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "La transcription vocale a échoué. Réessayez.");
        const text = String(result.text || "").trim();
        if (!text) throw new Error("Aucun texte reconnu. Parlez plus près du téléphone puis réessayez.");

        restoreButton(current);
        const textarea = document.querySelector<HTMLTextAreaElement>("#mcp-description");
        if (!textarea) return;
        const next = `${textarea.value.trim()} ${text}`.trim();
        updateControlledTextarea(textarea, next);
        textarea.focus();
      } catch (error) {
        const message = error instanceof DOMException && error.name === "AbortError"
          ? "Transcription trop longue — réessayez."
          : error instanceof Error
            ? error.message
            : "Transcription impossible — réessayez.";
        setButtonState(current.button, message, false);
        window.setTimeout(() => {
          if (document.contains(current.button)) restoreButton(current);
        }, 2600);
      } finally {
        window.clearTimeout(timeout);
        if (transcriptionController === controller) transcriptionController = null;
        transcribing = false;
      }
    };

    const stopRecording = () => {
      const current = session;
      if (!current || current.recorder.state === "inactive") return;
      if (current.autoStopTimer) window.clearTimeout(current.autoStopTimer);
      setButtonState(current.button, "Transcription…", true);
      current.recorder.stop();
    };

    const startRecording = async (button: HTMLButtonElement) => {
      if (session || transcribing) return;
      const originalHtml = button.innerHTML;

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setButtonState(button, "Micro non disponible sur ce navigateur", false);
        window.setTimeout(() => {
          if (document.contains(button)) restoreButton({ button, originalHtml });
        }, 2600);
        return;
      }

      setButtonState(button, "Autorisation du micro…", true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        const mimeType = preferredMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const chunks: Blob[] = [];
        const current: RecordingSession = {
          recorder,
          stream,
          chunks,
          button,
          originalHtml,
          autoStopTimer: null,
        };
        session = current;

        recorder.ondataavailable = (event) => {
          if (event.data?.size) chunks.push(event.data);
        };
        recorder.onerror = () => {
          if (session === current) session = null;
          recorder.onstop = null;
          if (current.autoStopTimer) window.clearTimeout(current.autoStopTimer);
          stopStream(stream);
          setButtonState(button, "Enregistrement interrompu — réessayer", false);
          window.setTimeout(() => {
            if (document.contains(button)) restoreButton(current);
          }, 2600);
        };
        recorder.onstop = () => {
          if (session === current) session = null;
          if (current.autoStopTimer) window.clearTimeout(current.autoStopTimer);
          stopStream(stream);
          const type = recorder.mimeType || mimeType || chunks[0]?.type || "audio/mp4";
          const blob = new Blob(chunks, { type });
          void transcribe(current, blob);
        };

        recorder.start(250);
        setButtonState(button, "Arrêter la dictée", false, true);
        current.autoStopTimer = window.setTimeout(() => {
          if (session === current && recorder.state !== "inactive") stopRecording();
        }, 120_000);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        const message = name === "NotAllowedError" || name === "SecurityError"
          ? "Micro refusé — autorisez-le dans Safari puis réessayez"
          : "Impossible d’ouvrir le micro — réessayez";
        setButtonState(button, message, false);
        window.setTimeout(() => {
          if (document.contains(button)) restoreButton({ button, originalHtml });
        }, 3000);
      }
    };

    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(".mcp-dictation");
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        if (session?.button === button && session.recorder.state !== "inactive") stopRecording();
        else if (!transcribing) void startRecording(button);
        return;
      }

      if (target?.closest(".mcp-header button[aria-label='Fermer le copilote']")) {
        transcriptionController?.abort();
        discardSession();
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      transcriptionController?.abort();
      discardSession();
    };
  }, []);

  return null;
}
