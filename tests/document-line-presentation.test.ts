import assert from 'node:assert/strict';
import test from 'node:test';
import { documentLinePresentation } from '../lib/document-line-presentation';

test('les postes de Philippe affichent la pièce avant la prestation, sans répéter la localisation', () => {
  for (const location of ['Chambre étage sud', 'Petite chambre', 'Cuisine', 'Salle de bain', 'Salle d’eau', 'Placard rez-de-chaussée']) {
    assert.deepEqual(documentLinePresentation({
      label: `${location} - Peinture plafond`,
      description: `${location} - Plafond : Préparation et mise en peinture mat à deux couches`,
    }), { title: location, description: 'Plafond : Préparation et mise en peinture mat à deux couches' });
  }
});

test('une description absente ou partielle conserve toute la prestation et ses précisions', () => {
  assert.deepEqual(documentLinePresentation({ label: 'Chambre 2 – Remplacement de papier peint' }), {
    title: 'Chambre 2', description: 'Remplacement de papier peint',
  });
  assert.deepEqual(documentLinePresentation({ label: 'Cuisine - Fourniture et pose de carrelage', description: 'Pose sur le mur, teinte au choix.' }), {
    title: 'Cuisine', description: 'Fourniture et pose de carrelage\nPose sur le mur, teinte au choix.',
  });
  assert.deepEqual(documentLinePresentation({ label: 'Chambre étage sud', description: 'Plafond : peinture à deux couches' }), {
    title: 'Chambre étage sud', description: 'Plafond : peinture à deux couches',
  });
  assert.deepEqual(documentLinePresentation({ label: 'Placard, rez-de-chaussée, mur et petit plafond', description: 'Préparation et peinture à deux couches' }), {
    title: 'Placard, rez-de-chaussée', description: 'Mur et petit plafond\nPréparation et peinture à deux couches',
  });
  assert.deepEqual(documentLinePresentation({ label: 'Cuisine - Peinture plafond 2 couches', description: 'Peinture plafond 3 couches' }), {
    title: 'Cuisine', description: 'Peinture plafond 2 couches\nPeinture plafond 3 couches',
  });
  assert.deepEqual(documentLinePresentation({ label: 'Cuisine - Peinture plafond', description: 'Plafond sans peinture' }), {
    title: 'Cuisine', description: 'Peinture plafond\nPlafond sans peinture',
  });
});

test('la pièce peut être explicitement portée par la description', () => {
  assert.deepEqual(documentLinePresentation({ label: 'Peinture plafond', description: 'Cuisine : Préparation et peinture du plafond, finition mate.' }), {
    title: 'Cuisine', description: 'Préparation et peinture du plafond, finition mate.',
  });
});

test('les postes généraux ne gagnent pas de localisation et les répétitions exactes disparaissent', () => {
  assert.deepEqual(documentLinePresentation({ label: 'Ouverture de chantier', description: 'Ouverture de chantier' }), {
    title: 'Ouverture de chantier', description: '',
  });
  for (const label of ['RSE (1 %)', 'Franchise à déduire', 'Protection de chantier particulière']) {
    const description = 'Protection sur l’ensemble de la maison';
    assert.deepEqual(documentLinePresentation({ label, description }), { title: label, description });
  }
  assert.deepEqual(documentLinePresentation({ label: 'Ouverture de chantier', description: 'Cuisine - Accès par la cour' }), {
    title: 'Ouverture de chantier', description: 'Cuisine - Accès par la cour',
  });
});

test('les pièces contradictoires et les lignes multi-pièces restent lisibles sans attribution devinée', () => {
  for (const line of [
    { label: 'Chambre - Peinture plafond', description: 'Cuisine - Peinture plafond' },
    { label: 'Chambre et cuisine - Peinture', description: 'Protection de tous les supports' },
    { label: 'Peinture plafond chambre', description: 'Préparation de la cuisine' },
  ]) assert.deepEqual(documentLinePresentation(line), { title: line.label, description: line.description });
});

test('la présentation ne modifie jamais les lignes sauvegardées ni leurs données financières', () => {
  const line = Object.freeze({ id: '1', label: 'Cuisine - Peinture plafond', description: 'Cuisine - Préparation et peinture plafond', quantity: 42.08, unit: 'm²', unitPrice: 22.5, taxRate: 10 });
  const before = JSON.stringify(line);
  documentLinePresentation(line);
  assert.equal(JSON.stringify(line), before);
  assert.deepEqual(documentLinePresentation({ label: 'RSE (1 %)', description: 'Calcul automatique : 1 % du montant HT des autres postes.\nGestion environnementale' }), {
    title: 'RSE (1 %)', description: 'Gestion environnementale',
  });
});
