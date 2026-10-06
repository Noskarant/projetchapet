import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCustomerCivility } from '../lib/customer-civility';
import { microphoneErrorMessage } from '../lib/microphone-error';

test('les civilités historiques et celles des couples restent reconnues', () => {
  for (const label of ['M.', 'Monsieur']) assert.equal(normalizeCustomerCivility(label), 'M.');
  for (const label of ['Mme', 'Madame']) assert.equal(normalizeCustomerCivility(label), 'Mme');
  for (const label of ['M. et Mme', 'Monsieur et Madame', 'Madame et Monsieur']) {
    assert.equal(normalizeCustomerCivility(label), 'M. et Mme');
  }
});

test('les erreurs micro sont distinguées sans exposer le message technique', () => {
  const absent = microphoneErrorMessage(new DOMException('Requested device not found', 'NotFoundError'), 'Windows NT 10.0');
  assert.match(absent!, /Aucun microphone détecté/);
  assert.match(absent!, /Son → Entrée/);
  assert.doesNotMatch(absent!, /Requested|refusé/);
  assert.match(microphoneErrorMessage({ name: 'NotAllowedError' }, 'Windows')!, /confidentialité Windows/);
  assert.match(microphoneErrorMessage({ name: 'NotReadableError' })!, /applications qui pourraient/);
  assert.doesNotMatch(microphoneErrorMessage({ name: 'NotFoundError' }, 'iPhone')!, /Windows/);
  assert.match(microphoneErrorMessage('audio-capture')!, /micro n’est pas accessible/);
  assert.match(microphoneErrorMessage('network')!, /connexion/);
  assert.equal(microphoneErrorMessage(new Error('sensitive internal message')), null);
});
