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
