"use client";

import { useEffect } from "react";

type AiTarget = "quote" | "invoice" | "customer" | "agenda";

const VOICE_BAR_WEIGHTS = [0.62, 0.88, 1, 0.82, 0.58];

function activeAiTarget(): AiTarget {
  const label = document.querySelector(".rm-bottom-nav button.active")?.textContent || "";
  if (label.includes("Factures")) return "invoice";
  if (label.includes("Clients")) return "customer";
  if (label.includes("Agenda")) return "agenda";
  return "quote";
}

function replaceDockContent() {
  const main = document.querySelector<HTMLButtonElement>(".rm-create-main");
  if (main && main.dataset.mobilePriority !== "true") {
    main.dataset.mobilePriority = "true";
    main.setAttribute("aria-label", "Créer avec l’IA");
    main.innerHTML = "<span>Créer avec IA</span><small>Dictée vocale</small>";
  }

  const originalManual = document.querySelector<HTMLButtonElement>(".rm-create-ai");
  if (originalManual) {
    originalManual.classList.remove("rm-create-ai");
    originalManual.classList.add("rm-create-manual");
    originalManual.dataset.mobilePriority = "true";
    originalManual.setAttribute("aria-label", "Créer manuellement");
    originalManual.innerHTML = "<span>Créer<br>manuellement</span>";
  }

  const manual = document.querySelector<HTMLButtonElement>(".rm-create-manual");
  if (manual && manual.dataset.mobilePriority !== "true") {
    manual.dataset.mobilePriority = "true";
    manual.setAttribute("aria-label", "Créer manuellement");
    manual.innerHTML = "<span>Créer<br>manuellement</span>";
  }
}

function hideTechnicalProviderName() {
  const safeLabel = "Analyse terminée · à vérifier";
  document.querySelectorAll<HTMLElement>(".mai-success small").forEach((node) => {
    if (node.textContent !== safeLabel) node.textContent = safeLabel;
  });
}

function closeDetailAfterOpeningEditor(button: HTMLButtonElement) {
  const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
  if (!sheet) return;
  const back = sheet.querySelector<HTMLButtonElement>("header > button:first-child");
  window.setTimeout(() => back?.click(), 0);
}

function voicePreparationLabel(capture: HTMLElement) {
  const target = capture.querySelector<HTMLElement>(".mai-target-label")?.textContent || "";
  if (/FACTURE/i.test(target)) return "votre facture";
  if (/CLIENT/i.test(target)) return "la fiche client";
  if (/ÉVÉNEMENT|EVENEMENT/i.test(target)) return "votre rendez-vous";
  return "votre devis";
}

function voiceMagicMarkup() {
  return [
    '<span class="forgeo-voice-visual" aria-hidden="true">',
    '<span class="forgeo-voice-halo"></span>',
    '<span class="forgeo-voice-orb"><span class="forgeo-voice-core"></span><span class="forgeo-voice-wave">',
    "<i></i><i></i><i></i><i></i><i></i>",
    "</span></span></span>",
    '<strong class="forgeo-voice-title"></strong>',
    '<small class="forgeo-voice-detail"></small>',
  ].join("");
}

function ensureVoiceMagic() {
  const capture = document.querySelector<HTMLElement>(".mai-capture");
  if (!capture) return;

  const heading = capture.querySelector("h3")?.textContent || "";
  const recording = Boolean(capture.querySelector(".mai-mic.recording"));
  const activating = /Activation du micro/i.test(heading);
  const processing = /Transcription|Préparation/i.test(heading);
  const active = recording || activating || processing;

  capture.classList.toggle("forgeo-voice-active", active);

  let magic = capture.querySelector<HTMLButtonElement>(".forgeo-voice-magic");
  if (!active) {
    magic?.remove();
    return;
  }

  if (!magic) {
    magic = document.createElement("button");
    magic.type = "button";
    magic.className = "forgeo-voice-magic";
    magic.innerHTML = voiceMagicMarkup();
    magic.addEventListener("click", () => {
      const stopButton = capture.querySelector<HTMLButtonElement>(".mai-mic.recording");
      stopButton?.click();
    });
    capture.appendChild(magic);
  }

  const title = magic.querySelector<HTMLElement>(".forgeo-voice-title");
  const detail = magic.querySelector<HTMLElement>(".forgeo-voice-detail");

  if (recording) {
    magic.dataset.state = "recording";
    magic.disabled = false;
    magic.setAttribute("aria-label", "Arrêter la dictée");
    if (title) title.textContent = "Je vous écoute…";
    if (detail) detail.textContent = "Parlez naturellement · touchez pour terminer";
    return;
  }

  magic.dataset.state = activating ? "activating" : "processing";
  magic.disabled = true;
  magic.setAttribute("aria-label", activating ? "Activation du microphone" : "Préparation en cours");
  if (title) {
    title.textContent = activating
      ? "Ouverture du micro…"
      : `FORGEO prépare ${voicePreparationLabel(capture)}…`;
  }
  if (detail) {
    detail.textContent = activating
      ? "Un instant, je me prépare à vous écouter"
      : "Votre demande est structurée directement dans le brouillon";
  }
}

function hideTranscriptFallbacks() {
  document.querySelectorAll<HTMLElement>(".mai-message").forEach((node) => {
    const text = node.textContent || "";
    if (/Vous pouvez écrire la demande ci-dessous/i.test(text)) {
      node.textContent = "Aucun texte reconnu. Réessayez en parlant plus près du téléphone.";
    }
  });
}

function openPreparedDraftDirectly() {
  const review = document.querySelector<HTMLElement>(".mai-review");
  if (!review) return;
  const primary = review.querySelector<HTMLButtonElement>(".mai-primary");
  if (!primary || !/Ouvrir le formulaire prérempli/i.test(primary.textContent || "")) return;
  if (primary.dataset.forgeoAutoOpen === "true") return;

  primary.dataset.forgeoAutoOpen = "true";
  review.classList.add("forgeo-auto-opening");
  window.requestAnimationFrame(() => {
    if (primary.isConnected) primary.click();
  });
}

function resetVoiceVisual() {
  document.querySelectorAll<HTMLElement>(".forgeo-voice-wave i").forEach((bar) => {
    bar.style.removeProperty("height");
  });
  document.querySelectorAll<HTMLElement>(".forgeo-voice-core").forEach((core) => {
    core.style.removeProperty("transform");
  });
  document.querySelectorAll<HTMLElement>(".forgeo-voice-halo").forEach((halo) => {
    halo.style.removeProperty("opacity");
    halo.style.removeProperty("transform");
  });
}

function applyVoiceLevel(level: number) {
  const magic = document.querySelector<HTMLElement>('.forgeo-voice-magic[data-state="recording"]');
  if (!magic) return;

  magic.querySelectorAll<HTMLElement>(".forgeo-voice-wave i").forEach((bar, index) => {
    const weight = VOICE_BAR_WEIGHTS[index] ?? 0.7;
    const height = 8 + level * 38 * weight;
    bar.style.height = `${height.toFixed(1)}px`;
  });

  const core = magic.querySelector<HTMLElement>(".forgeo-voice-core");
  if (core) core.style.transform = `scale(${(1 + level * 0.14).toFixed(3)})`;

  const halo = magic.querySelector<HTMLElement>(".forgeo-voice-halo");
  if (halo) {
    halo.style.opacity = `${(0.34 + level * 0.5).toFixed(3)}`;
    halo.style.transform = `scale(${(1 + level * 0.22).toFixed(3)})`;
  }
}

function voiceLevelFromSamples(samples: Float32Array) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples) sum += value * value;
  const rms = Math.sqrt(sum / samples.length);
  return Math.max(0, Math.min(1, (rms - 0.008) / 0.11));
}

export default function MobilePriorityPolish() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const numberFormatDescriptor = Object.getOwnPropertyDescriptor(
      Intl.NumberFormat.prototype,
      "format",
    );
    const originalFormatGetter = numberFormatDescriptor?.get;

    if (numberFormatDescriptor && originalFormatGetter) {
      Object.defineProperty(Intl.NumberFormat.prototype, "format", {
        configurable: numberFormatDescriptor.configurable,
        enumerable: numberFormatDescriptor.enumerable,
        get: function getSafeFrenchNumberFormat(this: Intl.NumberFormat) {
          const originalFormatter = originalFormatGetter.call(this) as (
            value: number | bigint,
          ) => string;
          return (value: number | bigint) =>
            originalFormatter(value)
              .replace(/[\u00a0\u202f]/g, " ")
              .replace(/\s+€/g, " €");
        },
      });
    }

    const scope = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || scope.webkitAudioContext;
    const audioPrototype = AudioContextClass?.prototype;
    const originalCreateScriptProcessor = audioPrototype?.createScriptProcessor;
    let patchedCreateScriptProcessor: typeof AudioContext.prototype.createScriptProcessor | null = null;

    if (audioPrototype && originalCreateScriptProcessor) {
      patchedCreateScriptProcessor = function patchedProcessor(
        this: AudioContext,
        bufferSize?: number,
        numberOfInputChannels?: number,
        numberOfOutputChannels?: number,
      ) {
        const processor = originalCreateScriptProcessor.call(
          this,
          bufferSize,
          numberOfInputChannels,
          numberOfOutputChannels,
        );
        let smoothedLevel = 0;
        processor.addEventListener("audioprocess", (event) => {
          if (!document.querySelector('.forgeo-voice-magic[data-state="recording"]')) return;
          const audioEvent = event as AudioProcessingEvent;
          const samples = audioEvent.inputBuffer.getChannelData(0);
          const rawLevel = voiceLevelFromSamples(samples);
          smoothedLevel = rawLevel > smoothedLevel
            ? rawLevel * 0.72 + smoothedLevel * 0.28
            : rawLevel * 0.2 + smoothedLevel * 0.8;
          applyVoiceLevel(smoothedLevel);
        });
        return processor;
      };
      audioPrototype.createScriptProcessor = patchedCreateScriptProcessor;
    }

    const refresh = () => {
      replaceDockContent();
      hideTechnicalProviderName();
      ensureVoiceMagic();
      hideTranscriptFallbacks();
      openPreparedDraftDirectly();
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    refresh();

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button) return;

      if (button.matches(".rm-create-main")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.dispatchEvent(
          new CustomEvent("projetchapet:open-ai", {
            detail: { target: activeAiTarget() },
          }),
        );
        return;
      }

      if (button.matches(".rm-create-manual")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        document.querySelector<HTMLButtonElement>(".rm-header-plus")?.click();
        return;
      }

      const detailSheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (!detailSheet) return;

      const normalizedLabel = (button.textContent || "")
        .trim()
        .toLocaleLowerCase("fr-FR");
      const isHeaderEdit =
        button.closest("header") === detailSheet.querySelector("header") &&
        button === detailSheet.querySelector("header > button:last-child");
      const opensEditor =
        isHeaderEdit ||
        normalizedLabel.includes("tout modifier") ||
        normalizedLabel === "modifier" ||
        normalizedLabel.includes("modifier le") ||
        normalizedLabel.includes("dupliquer");

      if (opensEditor) closeDetailAfterOpeningEditor(button);
    };

    document.addEventListener("click", onClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      resetVoiceVisual();
      if (
        audioPrototype &&
        originalCreateScriptProcessor &&
        patchedCreateScriptProcessor &&
        audioPrototype.createScriptProcessor === patchedCreateScriptProcessor
      ) {
        audioPrototype.createScriptProcessor = originalCreateScriptProcessor;
      }
      if (numberFormatDescriptor) {
        Object.defineProperty(
          Intl.NumberFormat.prototype,
          "format",
          numberFormatDescriptor,
        );
      }
    };
  }, []);

  return null;
}
