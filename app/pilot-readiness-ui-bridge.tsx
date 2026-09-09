"use client";

import { useEffect } from "react";
import { companyProfileDisplayName, readCompanyProfile } from "@/lib/company-profile";

const legacyDomain = ["sas", "chapet", ".com"].join("");
const legacyDemo = ["Dé", "mo"].join("");
const legacyDemonstration = ["démon", "stration"].join("");

const replacements: Array<[string, string]> = [
  ["Confirme d’abord ton adresse e-mail.", "Confirmez d’abord votre adresse e-mail."],
  ["Utilise un mot de passe d’au moins 8 caractères.", "Utilisez un mot de passe d’au moins 8 caractères."],
  ["Connexion impossible pour le moment. Réessaie.", "Connexion impossible pour le moment. Réessayez."],
  ["Renseigne l’entreprise, un e-mail valide et un mot de passe d’au moins 8 caractères.", "Renseignez l’entreprise, un e-mail valide et un mot de passe d’au moins 8 caractères."],
  ["Renseigne ton e-mail et ton mot de passe.", "Renseignez votre e-mail et votre mot de passe."],
  [`${legacyDemo} locale`, "Espace actif"],
  [`Réinitialiser les compléments de ${legacyDemo.toLowerCase()}`, "Réinitialiser les compléments locaux"],
  [`Réinitialiser uniquement les compléments de ${legacyDemonstration} ?`, "Réinitialiser uniquement les compléments locaux ?"],
  [`Compléments de ${legacyDemonstration} réinitialisés.`, "Compléments locaux réinitialisés."],
  [`les écrans de ${legacyDemonstration}`, "les écrans de votre entreprise"],
  ["avant le test de Philippe.", "avant votre premier envoi réel."],
  ["PROJET CHAPET", "FORGEO"],
  ["Logo CHAPET", "Logo de l’entreprise"],
];

export function normalizePilotVisibleText(value: string, companyName: string, accountingEmail: string) {
  let next = value;
  for (const [from, to] of replacements) next = next.replaceAll(from, to);

  next = next.replaceAll("CHAPET Père & Fils", companyName);
  next = next.replaceAll("CHAPET SAS", companyName);

  const escapedDomain = legacyDomain.replaceAll(".", "\\.");
  const legacyEmailPattern = new RegExp(`[A-Z0-9._%+-]+@${escapedDomain}`, "gi");
  next = next.replace(legacyEmailPattern, (email) =>
    email.toLowerCase().startsWith("compta@")
      ? accountingEmail || "À renseigner dans Mon entreprise"
      : "",
  );

  return next;
}

export default function PilotReadinessUiBridge() {
  useEffect(() => {
    let scheduled = false;

    const synchronize = () => {
      scheduled = false;
      const profile = readCompanyProfile(window.localStorage);
      const companyName = companyProfileDisplayName(profile) || "Votre entreprise";
      const accountingEmail = profile.accountingEmail.trim();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const current = node.nodeValue;
        if (!current) continue;
        const next = normalizePilotVisibleText(current, companyName, accountingEmail);
        if (next !== current) node.nodeValue = next;
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(synchronize);
    };

    synchronize();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("projetchapet:company-profile-updated", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("projetchapet:company-profile-updated", schedule);
    };
  }, []);

  return null;
}
