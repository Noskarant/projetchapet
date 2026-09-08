import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeoPublicEntry from "../app/forgeo-public-entry";

const baseProps = {
  companyName: "",
  email: "",
  password: "",
  authBusy: false,
  authMessage: "",
  onNavigate: () => undefined,
  onCompanyNameChange: () => undefined,
  onEmailChange: () => undefined,
  onPasswordChange: () => undefined,
  onSubmit: () => undefined,
};

test("la landing FORGEO parle métier et contrôle sans promesse inventée", () => {
  const html = renderToStaticMarkup(createElement(ForgeoPublicEntry, { ...baseProps, view: "landing" }));
  assert.match(html, /Le bureau de votre entreprise, sans y passer vos soirées/);
  assert.match(html, /Pas de chiffre inventé/);
  assert.match(html, /Données isolées par entreprise/);
  assert.match(html, /reste clairement « À préciser »/);
  assert.match(html, /Créer mon espace/);
  assert.doesNotMatch(html, /21 000|4\.9\/5|N°1|conforme à la facturation électronique/i);
});

test("la création de compte reste courte et orientée entreprise", () => {
  const html = renderToStaticMarkup(createElement(ForgeoPublicEntry, { ...baseProps, view: "signup" }));
  assert.match(html, /Créez votre espace FORGEO/);
  assert.match(html, /Nom de l’entreprise/);
  assert.match(html, /Adresse e-mail/);
  assert.match(html, /Mot de passe/);
  assert.match(html, /Créer mon espace entreprise/);
  assert.match(html, /Données isolées/);
});

test("la connexion ne redemande pas le nom de l’entreprise", () => {
  const html = renderToStaticMarkup(createElement(ForgeoPublicEntry, { ...baseProps, view: "login" }));
  assert.match(html, /Bon retour sur FORGEO/);
  assert.match(html, /Se connecter/);
  assert.doesNotMatch(html, /Nom de l’entreprise/);
});
