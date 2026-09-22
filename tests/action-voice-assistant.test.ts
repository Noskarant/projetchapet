import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("la production authentifiée utilise le nouvel assistant vocal unifié", () => {
  const responsive = fs.readFileSync(path.join(process.cwd(), "app/responsive-app.tsx"), "utf8");
  assert.match(responsive, /import ActionVoiceAssistant from "\.\/action-voice-assistant"/);
  assert.equal(responsive.includes("!AUTH_BYPASS && <ActionVoiceAssistant />"), true);
  assert.equal(responsive.includes("AUTH_BYPASS && ("), true);
  assert.equal(responsive.includes("<AiChain />"), true);
});

test("le mobile conserve l’ancien assistant uniquement pour le patrimoine E2E", () => {
  const mobile = fs.readFileSync(path.join(process.cwd(), "app/mobile-prototype-gate.tsx"), "utf8");
  assert.equal(mobile.includes("{AUTH_BYPASS && <MobileAiAssistantV6 />}"), true);
});

test("l’assistant explique et impose le contrôle humain", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.tsx"), "utf8");
  assert.equal(source.includes("Rien n’est exécuté avant votre validation."), true);
  assert.equal(source.includes("Je confirme les actions sensibles"), true);
  assert.equal(source.includes("Valider et exécuter"), true);
  assert.equal(source.includes("Plusieurs actions"), true);
});

test("l’écoute vocale pilote une expérience immersive reliée au niveau sonore réel", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.tsx"), "utf8");
  const experience = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.css"), "utf8");

  assert.equal(source.includes("const [voiceLevel, setVoiceLevel] = useState(0)"), true);
  assert.equal(source.includes("const peak = audioPeak(chunk)"), true);
  assert.equal(source.includes("const [voiceActivity, setVoiceActivity] = useState(0)"), true);
  assert.equal(source.includes("const delta = Math.abs(normalized - previousVoiceLevelRef.current)"), true);
  assert.equal(source.includes("setVoiceLevel((current) => Math.max(normalized, current * 0.48))"), true);
  assert.equal(source.includes("setVoiceActivity((current) => Math.max(activity, current * 0.42))"), true);
  assert.equal(source.includes("level={voiceLevel}"), true);
  assert.equal(source.includes("activity={voiceActivity}"), true);
  assert.equal(source.includes("reactive={Boolean(pcmRef.current)}"), true);
  assert.equal(source.includes("onFinish={() => void stopRecording()}"), true);
  assert.equal(experience.includes("data-testid=\"voice-listening-visualizer\""), true);
  assert.equal(experience.includes('aria-label="J’ai fini de parler"'), true);
  assert.equal(experience.includes("Appuyez lorsque vous avez terminé"), true);
  assert.equal(css.includes(".ava-voice-immersive"), true);
  assert.equal(css.includes("width:118vmax"), true);
  assert.equal(css.includes("@media(prefers-reduced-motion:reduce)"), true);
});

test("chaque type vocal démarre depuis un aperçu animé de la boule", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.tsx"), "utf8");
  const experience = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.css"), "utf8");

  for (const id of ["command", "quote", "invoice", "customer", "agenda"]) {
    assert.equal(source.includes(`id: "${id}"`), true);
  }
  assert.equal(source.includes("<VoicePreviewButton onStart={() => void startRecording()} />"), true);
  assert.equal(source.includes("<VoiceStartingVisualizer onClose={close} />"), true);
  assert.equal(experience.includes('data-testid="voice-preview-button"'), true);
  assert.equal(experience.includes("Appuyez pour parler"), true);
  assert.equal(css.includes(".ava-voice-preview-stage"), true);
  assert.equal(css.includes(".ava-construction-shell"), true);
  assert.equal(css.includes(".ava-orbit-ring"), true);
});

test("la même boule reste à l’écran pendant le traitement et affiche un message de patience si nécessaire", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.tsx"), "utf8");
  const experience = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.tsx"), "utf8");
  const css = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.css"), "utf8");

  assert.equal(source.includes('stage === "transcribing" || stage === "analysing"'), true);
  assert.equal(source.includes("<VoiceProcessingVisualizer onClose={close} />"), true);
  assert.equal(experience.includes("data-testid=\"voice-processing-visualizer\""), true);
  assert.equal(experience.includes("window.setTimeout(() => setLongWait(true), 6500)"), true);
  assert.equal(experience.includes("Encore un peu de patience, MANUFEO finalise…"), true);
  assert.equal(experience.includes("MANUFEO construit votre demande…"), true);
  assert.equal(css.includes(".ava-voice-processing .ava-voice-orb"), true);
  assert.equal(css.includes(".ava-voice-bloom-a"), true);
  assert.equal(css.includes(".ava-voice-speck-three"), true);
});

test("le mode plusieurs actions demande explicitement les informations utiles", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.tsx"), "utf8");
  const experience = fs.readFileSync(path.join(process.cwd(), "app/action-voice-experience.tsx"), "utf8");

  assert.equal(source.includes('target === "command" && <CommandPrecisionGuide />'), true);
  assert.equal(source.includes("tél. 06…"), true);
  assert.equal(experience.includes("Pour plusieurs actions, soyez précis"), true);
  assert.equal(experience.includes("téléphone, e-mail, adresse et SIRET"), true);
  assert.equal(experience.includes("prestations, quantités, unités, prix HT et TVA"), true);
  assert.equal(experience.includes("date, heure et lieu"), true);
  assert.equal(experience.includes("Ne l’inventez pas"), true);
});

test("l’exécuteur ne transforme jamais automatiquement devis facture ou commande en envoi", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/action-execution-server.ts"), "utf8");
  assert.equal(source.includes('p_status: "draft"'), true);
  assert.equal(source.includes('status: "draft"'), true);
  assert.equal(source.includes("Aucun e-mail n’a été envoyé"), true);
  assert.equal(source.includes("record_invoice_payment"), true);
});

test("le planificateur bloque les dépendances IA invalides et les doublons clients", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/actions/plan/route.ts"), "utf8");
  assert.equal(source.includes("Le plan IA contient une dépendance client invalide."), true);
  assert.equal(source.includes("dependency.intent_type !== \"create_customer\""), true);
  assert.equal(source.includes("Un client avec le SIRET"), true);
  assert.equal(source.includes(".contains(\"emails\", [email])"), true);
});

test("l’agenda vocal reste mobile tant que le desktop n’a pas son exécuteur agenda", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "app/action-voice-assistant.css"), "utf8");
  assert.equal(css.includes("@media(min-width:821px){.ava-choices>button:last-child{display:none}}"), true);
});
