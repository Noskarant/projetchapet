"use client";

import { useEffect } from "react";

const EXACT_REPLACEMENTS = new Map<string, string>([
  ["Projet Chapet", "MANUFEO"],
  ["CHAPET SAS", "Votre entreprise"],
  ["CHAPET Père & Fils", "Votre entreprise"],
  ["Philippe Chapet", "Mon compte"],
  ["Saint-Étienne · Loire", "Profil entreprise"],
  ["Mode démonstration", "Compte utilisateur"],
  ["Prototype connecté", "Synchronisation"],
  ["projetchapet", "MANUFEO"],
]);

function normalizeBrandText(value: string) {
  let next = value.replace(/FORGEO/g, "MANUFEO");
  for (const [from, to] of EXACT_REPLACEMENTS) {
    if (next === from) next = to;
  }
  next = next.replace(/\s*·\s*Données d’exemple/g, "");
  return next;
}

function normalizeTree(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(parent.tagName)) {
      const value = node.nodeValue || "";
      if (!value.includes("@")) {
        const next = normalizeBrandText(value);
        if (next !== value) node.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }

  if (root instanceof Element) {
    for (const attribute of ["aria-label", "title"]) {
      const value = root.getAttribute(attribute);
      if (value) root.setAttribute(attribute, normalizeBrandText(value));
    }
  }
  root.querySelectorAll?.("[aria-label], [title]").forEach((element) => {
    for (const attribute of ["aria-label", "title"]) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, normalizeBrandText(value));
    }
  });
}

export default function ManufeoBrandingBridge() {
  useEffect(() => {
    let frame = 0;
    const normalize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => normalizeTree(document.body));
    };

    normalize();
    const observer = new MutationObserver(normalize);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
