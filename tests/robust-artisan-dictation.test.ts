import assert from "node:assert/strict";
import test from "node:test";
import { robustArtisanDictation } from "../lib/robust-artisan-dictation";

const complexScript = `Ouais allo... alors charge un devis pour M. Martin... ah non attends, Martin c'est le chantier de la semaine dernière, là c'est pour M. Martine avec un E à la fin !

Pour le salon, tu me mets 50 mètres carrés de peinture murale... euh non pardon, enlève 5 mètres pour la baie vitrée, donc 45 m² à 30 € du mètre. Au plafond, compte 45 m² à 25 €... ah non, passe à 28 € HT plutôt, préparation incluse.

Rajoute un pot de sous-couche à 110 €... enfin non, oublie la sous-couche il lui en reste au garage ! Par contre mets 2 fûts de finition mat à 90 € pièce.

Pour les 3 portes... attends c'est 3 ou 4 portes ? Oui 4 portes ! Forfait peinture à 200 €... non met 240 € pour les quatre. Et colle 5 heures de MO à 45 € de l'heure.

Ah et applique la TVA à 10 %, sauf sur les fûts de finition où tu me mets la TVA standard à 20 %. Voilà c'est bon, valide.`;

test("traite intégralement une longue dictée avec reprises, annulations et TVA par ligne", () => {
  const result = robustArtisanDictation(complexScript, ["M. Martin", "M. Martine"]);

  assert.equal(result.client.nom, "M. Martine");
  assert.equal(result.prestations.length, 5);

  assert.deepEqual(result.prestations[0], {
    designation: "Peinture murale du salon",
    quantite: 45,
    unite: "m2",
    prix_unitaire_ht: 30,
    taux_tva: 10,
  });
  assert.deepEqual(result.prestations[1], {
    designation: "Peinture du plafond, préparation incluse",
    quantite: 45,
    unite: "m2",
    prix_unitaire_ht: 28,
    taux_tva: 10,
  });
  assert.deepEqual(result.prestations[2], {
    designation: "Fût de finition mat",
    quantite: 2,
    unite: "unite",
    prix_unitaire_ht: 90,
    taux_tva: 20,
  });
  assert.deepEqual(result.prestations[3], {
    designation: "Forfait peinture de 4 portes",
    quantite: 1,
    unite: "forfait",
    prix_unitaire_ht: 240,
    taux_tva: 10,
  });
  assert.deepEqual(result.prestations[4], {
    designation: "Main-d’œuvre",
    quantite: 5,
    unite: "h",
    prix_unitaire_ht: 45,
    taux_tva: 10,
  });

  const serialized = JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(serialized, /sous-couche/);
  assert.doesNotMatch(serialized, /\b50\b/);
  assert.doesNotMatch(serialized, /\b25\b/);
  assert.doesNotMatch(serialized, /\b200\b/);
  assert.doesNotMatch(serialized, /3 portes/);
});

test("ne confond pas Martin et Martine lorsque les deux sont présents", () => {
  const result = robustArtisanDictation(
    "Prépare le devis pour M. Martin, non attends, finalement pour M. Martine avec un E à la fin. Peinture murale 12 m² à 30 € et plafond 12 m² à 25 €.",
    ["M. Martin", "M. Martine"],
  );
  assert.equal(result.client.nom, "M. Martine");
});
