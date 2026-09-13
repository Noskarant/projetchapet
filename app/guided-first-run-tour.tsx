"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readCompanyProfile, writeCompanyProfile } from "@/lib/company-profile";
import { markTutorialComplete, resolveFirstRunStage } from "@/lib/first-run-onboarding";
import { supabase } from "@/lib/supabase";
import styles from "./guided-first-run-tour.module.css";

type TourRect = { top: number; left: number; width: number; height: number; right: number; bottom: number };
type TourStep = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  hint: string;
  labels?: string[];
  selectors?: string[];
  activateLabels?: string[];
  openMenuFirst?: boolean;
};

const DESKTOP_STEPS: TourStep[] = [
  { id: "dashboard", eyebrow: "VUE D’ENSEMBLE", title: "Commencez ici chaque matin.", text: "Le tableau de bord résume l’activité, les devis à suivre et les encaissements.", hint: "Le tutoriel vous montre les vrais boutons de MANUFEO : rien n’est simulé.", labels: ["Tableau de bord"], activateLabels: ["Tableau de bord"] },
  { id: "clients", eyebrow: "CLIENTS", title: "Centralisez vos clients.", text: "Créez une fiche une seule fois, puis réutilisez-la dans les devis, factures et chantiers.", hint: "Commencez généralement par le client avant de créer un document.", labels: ["Clients"], activateLabels: ["Clients"] },
  { id: "quotes", eyebrow: "DEVIS", title: "Créez vos devis manuellement ou avec l’IA.", text: "MANUFEO garde toujours une étape de vérification avant validation ou envoi.", hint: "La dictée IA accélère la saisie, mais vous gardez le contrôle final.", labels: ["Devis"], activateLabels: ["Devis"] },
  { id: "invoices", eyebrow: "FACTURES", title: "Transformez et suivez vos factures.", text: "Retrouvez leur statut, les paiements et la préparation à la facturation électronique.", hint: "SUPER PDP reste en sandbox tant que la société réelle n’est pas activée.", labels: ["Factures"], activateLabels: ["Factures"] },
  { id: "operations", eyebrow: "CHANTIERS & ÉQUIPE", title: "Le terrain et le bureau restent synchronisés.", text: "Photos, notes chantier, équipe, rôles et opérations sont regroupés dans l’espace opérationnel.", hint: "C’est ici que les nouvelles fonctions pilote sont regroupées.", labels: ["Équipe & opérations", "Chantiers", "Équipe"] },
  { id: "copilot", eyebrow: "COPILOTE IA", title: "Utilisez l’IA comme assistant, pas comme pilote automatique.", text: "Le copilote peut aider à structurer une demande ou un chantier sans envoyer d’action sensible tout seul.", hint: "Les actions réelles restent soumises à votre validation.", labels: ["Copilote chantier", "Copilote", "Assistant IA"], selectors: ["[aria-label*='Copilote']", "[title*='Copilote']"] },
  { id: "settings", eyebrow: "PARAMÈTRES", title: "Votre entreprise reste modifiable à tout moment.", text: "Retrouvez ici les informations société, préférences et réglages du compte.", hint: "Les données renseignées à l’inscription alimentent vos documents et e-mails.", labels: ["Paramètres"], activateLabels: ["Paramètres"] },
];

const MOBILE_STEPS: TourStep[] = [
  { id: "home", eyebrow: "ACCUEIL", title: "Votre activité dans la poche.", text: "L’accueil mobile garde les informations essentielles visibles sans surcharger l’écran.", hint: "La barre du bas est votre navigation principale.", labels: ["Accueil"], activateLabels: ["Accueil"] },
  { id: "clients", eyebrow: "CLIENTS", title: "Retrouvez un client en quelques secondes.", text: "Ses coordonnées et ses documents restent synchronisés avec la version bureau.", hint: "Touchez Clients dans la barre du bas.", labels: ["Clients"], activateLabels: ["Clients"] },
  { id: "quotes", eyebrow: "DEVIS", title: "Créez un devis directement sur le terrain.", text: "Vous pouvez saisir ou dicter, puis relire avant de valider.", hint: "Le bouton Devis reste toujours accessible dans la navigation basse.", labels: ["Devis"], activateLabels: ["Devis"] },
  { id: "invoices", eyebrow: "FACTURES", title: "Suivez les factures sans revenir au bureau.", text: "Statuts et encaissements restent disponibles depuis le mobile.", hint: "La navigation conserve des zones tactiles adaptées au doigt.", labels: ["Factures"], activateLabels: ["Factures"] },
  { id: "menu", eyebrow: "PLUS D’OUTILS", title: "Le menu range les fonctions moins fréquentes.", text: "Chantiers, équipe et réglages restent accessibles sans ajouter de boutons flottants sur l’écran principal.", hint: "On évite volontairement les éléments qui se superposent au contenu.", labels: ["Menu"], selectors: ["[aria-label*='menu' i]", "[aria-label*='Menu']"] },
  { id: "projects", eyebrow: "CHANTIERS", title: "Gardez le chantier connecté.", text: "Notes, photos et suivi opérationnel sont disponibles depuis le menu.", hint: "Le tutoriel ouvre le menu uniquement pour vous montrer l’emplacement.", labels: ["Chantiers", "Chantier"], activateLabels: ["Chantiers"], openMenuFirst: true },
  { id: "copilot", eyebrow: "COPILOTE", title: "Le copilote reste discret mais accessible.", text: "Son accès est intégré à l’interface pour ne jamais recouvrir les actions principales.", hint: "Il peut aussi rester disponible dans le menu en secours.", labels: ["Copilote chantier", "Copilote"], selectors: ["[aria-label*='Copilote']", "[title*='Copilote']"], openMenuFirst: true },
  { id: "settings", eyebrow: "PARAMÈTRES", title: "Réglez votre entreprise quand vous le souhaitez.", text: "Identité, coordonnées et préférences peuvent être ajustées après l’onboarding.", hint: "Vous pourrez revenir ici après le tutoriel.", labels: ["Paramètres"], activateLabels: ["Paramètres"], openMenuFirst: true },
];

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 4 && rect.height > 4 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
}

function findByText(labels: string[]) {
  const candidates = Array.from(document.querySelectorAll("button,a,[role='button'],nav li,aside li"));
  const normalized = labels.map(normalize);
  for (const wanted of normalized) {
    const exact = candidates.find((element) => visible(element) && normalize(element.textContent || "") === wanted);
    if (exact) return exact as HTMLElement;
  }
  for (const wanted of normalized) {
    const partial = candidates.find((element) => visible(element) && normalize(element.textContent || "").includes(wanted));
    if (partial) return partial as HTMLElement;
  }
  return null;
}

function findBySelectors(selectors: string[]) {
  for (const selector of selectors) {
    const candidate = Array.from(document.querySelectorAll(selector)).find(visible);
    if (candidate) return candidate as HTMLElement;
  }
  return null;
}

function findTarget(step: TourStep) {
  return findBySelectors(step.selectors || []) || findByText(step.labels || []);
}

function findMenuButton() {
  return findBySelectors(["[aria-label*='menu' i]", "[title*='menu' i]"]) || findByText(["Menu"]);
}

function clickable(element: HTMLElement | null) {
  if (!element) return null;
  return (element.closest("button,a,[role='button']") as HTMLElement | null) || element;
}

function toRect(element: HTMLElement | null): TourRect | null {
  if (!element || !visible(element)) return null;
  const raw = element.getBoundingClientRect();
  const pad = 7;
  const left = Math.max(8, raw.left - pad);
  const top = Math.max(8, raw.top - pad);
  const right = Math.min(window.innerWidth - 8, raw.right + pad);
  const bottom = Math.min(window.innerHeight - 8, raw.bottom + pad);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function cardPosition(rect: TourRect | null) {
  const margin = 16;
  const width = Math.min(360, window.innerWidth - 28);
  const estimatedHeight = 275;
  if (!rect) return { centered: true, left: 0, top: 0 };
  const roomBelow = window.innerHeight - rect.bottom;
  const roomAbove = rect.top;
  let top = roomBelow >= estimatedHeight + margin ? rect.bottom + margin : Math.max(margin, rect.top - estimatedHeight - margin);
  if (roomBelow < estimatedHeight + margin && roomAbove < estimatedHeight + margin) top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
  let left = rect.left;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
  left = Math.max(margin, left);
  return { centered: false, left, top };
}

export default function GuidedFirstRunTour() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [mobile, setMobile] = useState(false);
  const steps = useMemo(() => mobile ? MOBILE_STEPS : DESKTOP_STEPS, [mobile]);
  const step = steps[Math.min(index, steps.length - 1)];

  const refreshTarget = useCallback(() => {
    if (!active || !step) return;
    const target = findTarget(step);
    if (target) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    setTargetRect(toRect(target));
  }, [active, step]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let alive = true;
    const synchronize = async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      const next = resolveFirstRunStage(readCompanyProfile(window.localStorage));
      if (next === "tutorial") {
        setIndex(0);
        setActive(true);
      }
    };
    void synchronize();
    const onProfile = () => void synchronize();
    const onReplay = () => { setIndex(0); setActive(true); };
    window.addEventListener("projetchapet:company-profile-updated", onProfile);
    window.addEventListener("manufeo:replay-tour", onReplay);
    return () => {
      alive = false;
      window.removeEventListener("projetchapet:company-profile-updated", onProfile);
      window.removeEventListener("manufeo:replay-tour", onReplay);
    };
  }, []);

  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let menuTimer: number | undefined;
    let activateTimer: number | undefined;
    let settleTimer: number | undefined;

    const run = () => {
      if (step.openMenuFirst && !findTarget(step)) {
        clickable(findMenuButton())?.click();
      }
      menuTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (step.activateLabels?.length) {
          const target = findByText(step.activateLabels);
          clickable(target)?.click();
        }
        activateTimer = window.setTimeout(() => {
          if (!cancelled) refreshTarget();
        }, 240);
      }, step.openMenuFirst ? 180 : 40);
    };
    run();
    settleTimer = window.setTimeout(refreshTarget, 700);
    window.addEventListener("resize", refreshTarget);
    window.addEventListener("scroll", refreshTarget, true);
    return () => {
      cancelled = true;
      if (menuTimer) window.clearTimeout(menuTimer);
      if (activateTimer) window.clearTimeout(activateTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", refreshTarget);
      window.removeEventListener("scroll", refreshTarget, true);
    };
  }, [active, step, refreshTarget]);

  useEffect(() => {
    if (!active) return;
    const legacy = document.querySelector<HTMLElement>(".fro-backdrop[aria-label='Découvrir MANUFEO']");
    if (!legacy) return;
    const previous = legacy.style.display;
    legacy.style.display = "none";
    return () => { legacy.style.display = previous; };
  }, [active, index]);

  function finish() {
    const current = readCompanyProfile(window.localStorage);
    const saved = writeCompanyProfile(window.localStorage, markTutorialComplete(current));
    window.dispatchEvent(new CustomEvent("projetchapet:company-profile-updated", { detail: saved }));
    const legacySkip = document.querySelector<HTMLButtonElement>(".fro-backdrop[aria-label='Découvrir MANUFEO'] .fro-skip");
    legacySkip?.click();
    setActive(false);
  }

  if (!active || !step) return null;

  const card = cardPosition(targetRect);
  const progress = ((index + 1) / steps.length) * 100;
  const last = index === steps.length - 1;
  const topShade = targetRect ? { left: 0, top: 0, width: "100%", height: targetRect.top } : { inset: 0 };
  const leftShade = targetRect ? { left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height } : undefined;
  const rightShade = targetRect ? { left: targetRect.right, top: targetRect.top, right: 0, height: targetRect.height } : undefined;
  const bottomShade = targetRect ? { left: 0, top: targetRect.bottom, right: 0, bottom: 0 } : undefined;

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Visite guidée MANUFEO">
      <div className={styles.shade} style={topShade} />
      {targetRect && <>
        <div className={styles.shade} style={leftShade} />
        <div className={styles.shade} style={rightShade} />
        <div className={styles.shade} style={bottomShade} />
        <div className={styles.focus} style={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height }} />
      </>}
      <section className={`${styles.card} ${card.centered ? styles.cardCentered : ""}`} style={card.centered ? undefined : { left: card.left, top: card.top }}>
        <div className={styles.eyebrow}><span>{step.eyebrow}</span><span className={styles.counter}>{index + 1}/{steps.length}</span></div>
        <h2 className={styles.title}>{step.title}</h2>
        <p className={styles.text}>{step.text}</p>
        <div className={styles.hint}><span className={styles.hintIcon}>→</span><span>{step.hint}</span></div>
        <div className={styles.progress}><i style={{ width: `${progress}%` }} /></div>
        <div className={styles.actions}>
          <button type="button" className={styles.skip} onClick={finish}>Passer</button>
          <div className={styles.actionsRight}>
            {index > 0 && <button type="button" className={styles.buttonSecondary} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Précédent</button>}
            <button type="button" className={styles.button} onClick={() => last ? finish() : setIndex((value) => Math.min(steps.length - 1, value + 1))}>{last ? "Terminer" : "Suivant"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
