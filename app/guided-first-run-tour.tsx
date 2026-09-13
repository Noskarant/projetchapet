"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
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
  { id: "dashboard", eyebrow: "VUE D’ENSEMBLE", title: "Commencez ici chaque matin.", text: "Le tableau de bord résume l’activité, les devis à suivre et les encaissements.", hint: "MANUFEO doit vous montrer rapidement ce qui demande votre attention, sans vous obliger à ouvrir dix écrans.", labels: ["Tableau de bord"], activateLabels: ["Tableau de bord"] },
  { id: "clients", eyebrow: "CLIENTS", title: "Créez le client une fois, réutilisez-le partout.", text: "Coordonnées, documents et historique restent reliés au même dossier client.", hint: "Vous pouvez le saisir normalement, ou laisser le mode vocal préparer la fiche pour vous.", labels: ["Clients"], activateLabels: ["Clients"] },
  { id: "voice", eyebrow: "LE RÉFLEXE MANUFEO", title: "Parlez. MANUFEO prépare. Vous validez.", text: "Le mode vocal peut préparer un client, un devis ou une facture à partir d’une phrase naturelle, puis vous montre ce qu’il a compris avant de préremplir le formulaire.", hint: "Exemple : « Cabinet Giraud, protection 180 € HT, 85 m² de ratissage à 12 €, peinture à 18 €, TVA 10 %. » → transcription → lignes structurées → vérification → préremplissage.", labels: ["Mode IA"], selectors: [".pc-ai-launcher", "[aria-label='Ouvrir le mode IA']"] },
  { id: "quotes", eyebrow: "DEVIS", title: "Le devis reste entièrement sous votre contrôle.", text: "Saisie manuelle ou préremplissage IA : vous relisez les prestations, quantités, prix et TVA avant d’enregistrer ou d’envoyer.", hint: "L’IA accélère la saisie ; elle ne doit jamais transformer une approximation en document envoyé sans votre accord.", labels: ["Devis"], activateLabels: ["Devis"] },
  { id: "invoices", eyebrow: "FACTURES", title: "Transformez et suivez vos factures.", text: "Retrouvez leur statut, les paiements et la préparation à la facturation électronique.", hint: "La transmission électronique reste une action explicite et contrôlée par l’utilisateur.", labels: ["Factures"], activateLabels: ["Factures"] },
  { id: "operations", eyebrow: "CHANTIERS & ÉQUIPE", title: "Le terrain et le bureau restent synchronisés.", text: "Photos, notes chantier, équipe, rôles et opérations sont regroupés dans l’espace opérationnel.", hint: "L’objectif : moins de ressaisie entre le chantier, le téléphone et le bureau.", labels: ["Équipe & opérations", "Chantiers", "Équipe"] },
  { id: "copilot", eyebrow: "COPILOTE MÉTIER", title: "Racontez le chantier quand vous n’avez pas encore le devis en tête.", text: "Le copilote analyse votre description, propose les prestations et quantités, estime main-d’œuvre, coûts et marge, puis signale hypothèses, oublis possibles et questions à vérifier.", hint: "Vocal IA = « je sais quoi saisir, remplis-le ». Copilote = « voilà mon chantier en vrac, aide-moi à construire une proposition cohérente et rentable ». Le brouillon reste à valider.", labels: ["Copilote chantier", "Copilote", "Assistant IA"], selectors: ["[aria-label*='Copilote']", "[title*='Copilote']"] },
  { id: "settings", eyebrow: "PARAMÈTRES", title: "MANUFEO s’adapte à votre entreprise.", text: "Identité, coordonnées, préférences et données métier peuvent évoluer avec votre activité.", hint: "À terme, vos propres prix, temps habituels et marges doivent alimenter les propositions du copilote, plutôt que des valeurs génériques.", labels: ["Paramètres"], activateLabels: ["Paramètres"] },
];

const MOBILE_STEPS: TourStep[] = [
  { id: "home", eyebrow: "ACCUEIL", title: "Votre activité dans la poche.", text: "L’accueil mobile garde les informations essentielles visibles sans surcharger l’écran.", hint: "La barre du bas est votre navigation principale.", labels: ["Accueil"], activateLabels: ["Accueil"] },
  { id: "voice", eyebrow: "LE RÉFLEXE MANUFEO", title: "Sur le chantier, commencez par parler.", text: "Touchez le micro : MANUFEO peut préparer un client, un devis ou une facture à partir de votre dictée, puis vous demande de vérifier ce qu’il a compris.", hint: "Exemple : « Mme Dupont, 30 m² de peinture salon, deux couches, protection du sol… » → vous parlez → MANUFEO structure → vous vérifiez → le formulaire est prérempli.", labels: ["Dicter avec l’IA"], selectors: [".pc-mobile-ai-fab", "[aria-label='Dicter avec l’IA']"] },
  { id: "clients", eyebrow: "CLIENTS", title: "Retrouvez un client en quelques secondes.", text: "Ses coordonnées et ses documents restent synchronisés avec la version bureau.", hint: "La fiche peut aussi être préparée à la voix pour éviter la ressaisie sur téléphone.", labels: ["Clients"], activateLabels: ["Clients"] },
  { id: "quotes", eyebrow: "DEVIS", title: "Créez un devis directement sur le terrain.", text: "Vous pouvez saisir ou dicter, puis relire chaque information avant de valider.", hint: "Le contrôle humain reste la dernière étape avant l’enregistrement ou l’envoi.", labels: ["Devis"], activateLabels: ["Devis"] },
  { id: "invoices", eyebrow: "FACTURES", title: "Suivez les factures sans revenir au bureau.", text: "Statuts et encaissements restent disponibles depuis le mobile.", hint: "L’objectif est de traiter les tâches administratives là où vous êtes, sans les repousser au soir.", labels: ["Factures"], activateLabels: ["Factures"] },
  { id: "menu", eyebrow: "PLUS D’OUTILS", title: "Le menu range les fonctions moins fréquentes.", text: "Chantiers, équipe et réglages restent accessibles sans surcharger l’écran principal.", hint: "Les actions quotidiennes restent devant ; le reste est accessible en quelques secondes.", labels: ["Menu"], selectors: ["[aria-label*='menu' i]", "[aria-label*='Menu']"] },
  { id: "projects", eyebrow: "CHANTIERS", title: "Gardez le chantier connecté.", text: "Notes, photos et suivi opérationnel sont disponibles depuis le menu.", hint: "Le but est que les informations prises sur place deviennent immédiatement exploitables au bureau.", labels: ["Chantiers", "Chantier"], activateLabels: ["Chantiers"], openMenuFirst: true },
  { id: "copilot", eyebrow: "COPILOTE MÉTIER", title: "Décrivez un chantier, même encore imprécis.", text: "Le copilote peut transformer votre description en proposition de prestations, estimer coûts, heures et marge, puis attirer votre attention sur les oublis et informations manquantes.", hint: "Contrairement au vocal de saisie, il vous aide à réfléchir au chantier avant de préparer le devis. Vous décidez toujours du résultat final.", labels: ["Copilote chantier", "Copilote"], selectors: ["[aria-label*='Copilote']", "[title*='Copilote']"], openMenuFirst: true },
  { id: "settings", eyebrow: "PARAMÈTRES", title: "MANUFEO apprend votre façon de travailler.", text: "Identité, coordonnées et préférences restent modifiables après l’onboarding.", hint: "L’évolution prévue est de baser les recommandations sur vos propres prix, temps et marges historiques.", labels: ["Paramètres"], activateLabels: ["Paramètres"], openMenuFirst: true },
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
  const estimatedHeight = 300;
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
      if (step.openMenuFirst && !findTarget(step)) clickable(findMenuButton())?.click();
      menuTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (step.activateLabels?.length) clickable(findByText(step.activateLabels))?.click();
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
    const hidden = new Map<HTMLElement, string>();
    const suppressLegacyTutorial = () => {
      document.querySelectorAll<HTMLElement>(".fro-backdrop[aria-label='Découvrir MANUFEO']").forEach((legacy) => {
        if (!hidden.has(legacy)) hidden.set(legacy, legacy.style.display);
        legacy.style.display = "none";
      });
    };
    suppressLegacyTutorial();
    const observer = new MutationObserver(suppressLegacyTutorial);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      hidden.forEach((display, legacy) => { legacy.style.display = display; });
    };
  }, [active]);

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
  const topShade: CSSProperties = targetRect ? { left: 0, top: 0, width: "100%", height: targetRect.top } : { inset: 0 };
  const leftShade: CSSProperties | undefined = targetRect ? { left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height } : undefined;
  const rightShade: CSSProperties | undefined = targetRect ? { left: targetRect.right, top: targetRect.top, right: 0, height: targetRect.height } : undefined;
  const bottomShade: CSSProperties | undefined = targetRect ? { left: 0, top: targetRect.bottom, right: 0, bottom: 0 } : undefined;

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
