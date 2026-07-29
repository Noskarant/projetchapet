"use client";

import { useEffect } from "react";

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function AiRecordingHotfix() {
  useEffect(() => {
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let chunks: Blob[] = [];
    let activeButton: HTMLButtonElement | null = null;
    let busy = false;

    const resetButton = () => {
      if (!activeButton) return;
      activeButton.disabled = false;
      activeButton.classList.remove("recording");
      activeButton.innerHTML = "<span aria-hidden='true'>🎙</span> Parler";
      activeButton = null;
    };

    const notify = (message: string) => {
      const toast = document.createElement("div");
      toast.className = "pc-ai-toast";
      toast.textContent = message;
      document.body.appendChild(toast);
      window.setTimeout(() => toast.remove(), 4800);
    };

    const stopTracks = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const transcribe = async (blob: Blob) => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        ".pc-ai-panel .pc-ai-capture textarea",
      );
      if (!textarea) throw new Error("La zone de dictée est introuvable.");

      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append(
        "file",
        new File([blob], `dictee.${extension}`, {
          type: blob.type || "audio/webm",
        }),
      );

      if (activeButton) {
        activeButton.disabled = true;
        activeButton.textContent = "Transcription en cours…";
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "La transcription a échoué.");
      }

      const text = String(result.text || "").trim();
      if (!text) throw new Error("Aucun texte n’a été reconnu.");
      const current = textarea.value.trim();
      setTextareaValue(textarea, current ? `${current} ${text}` : text);
      notify("Dictée ajoutée. Relisez puis lancez l’analyse.");
    };

    const finishRecording = async () => {
      if (!recorder || recorder.state === "inactive") return;
      recorder.stop();
    };

    const startRecording = async (button: HTMLButtonElement) => {
      if (busy) return;
      busy = true;
      activeButton = button;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Le microphone n’est pas disponible sur cet appareil.");
        }

        const MediaRecorderConstructor = window.MediaRecorder;
        if (!MediaRecorderConstructor) {
          throw new Error("L’enregistrement audio n’est pas supporté par ce navigateur.");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const candidates = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ];
        const supported =
          typeof MediaRecorderConstructor.isTypeSupported === "function"
            ? candidates.find((type) =>
                MediaRecorderConstructor.isTypeSupported(type),
              )
            : undefined;

        recorder = supported
          ? new MediaRecorderConstructor(stream, { mimeType: supported })
          : new MediaRecorderConstructor(stream);
        chunks = [];

        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });

        recorder.addEventListener("error", () => {
          stopTracks();
          resetButton();
          busy = false;
          notify("L’enregistrement audio a été interrompu.");
        });

        recorder.addEventListener("stop", () => {
          const blob = new Blob(chunks, {
            type: recorder?.mimeType || "audio/webm",
          });
          stopTracks();
          void transcribe(blob)
            .catch((error) =>
              notify(
                error instanceof Error
                  ? error.message
                  : "La transcription a échoué.",
              ),
            )
            .finally(() => {
              recorder = null;
              chunks = [];
              busy = false;
              resetButton();
            });
        });

        recorder.start(300);
        button.classList.add("recording");
        button.innerHTML = "<span aria-hidden='true'>■</span> Arrêter";
        busy = false;
      } catch (error) {
        stopTracks();
        recorder = null;
        chunks = [];
        busy = false;
        resetButton();
        notify(
          error instanceof Error
            ? `Microphone inaccessible : ${error.message}`
            : "Microphone inaccessible.",
        );
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(".pc-ai-record");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (recorder?.state === "recording") {
        void finishRecording();
      } else {
        void startRecording(button);
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      if (recorder?.state === "recording") recorder.stop();
      stopTracks();
    };
  }, []);

  return null;
}
