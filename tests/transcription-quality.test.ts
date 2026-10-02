import test from "node:test";
import assert from "node:assert/strict";
import { mergeTranscriptionPayloads, transcriptionQuality } from "../lib/transcription-quality";

test("les passages incertains imposent la relecture sans réécrire les chiffres", () => {
  const part = { text: "4,50 mètres carrés à 77,10 euros", segments: [{ text: "4,50 mètres carrés", avg_logprob: -0.8, no_speech_prob: 0.6 }] };
  assert.equal(transcriptionQuality(part).needsReview, true);
  assert.equal(part.text, "4,50 mètres carrés à 77,10 euros");
  assert.equal(transcriptionQuality({ segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01 }] }).needsReview, false);
});

test("une fin fiable n’efface pas les alertes du début de la dictée", () => {
  const result = mergeTranscriptionPayloads([
    { duration: 45, lowConfidenceSegments: 2, segments: [{ start: 0, end: 3, text: "incertain" }] },
    { duration: 15, lowConfidenceSegments: 0, segments: [{ start: 1, end: 4, text: "fiable" }] },
  ]);
  assert.equal(result.needsReview, true);
  assert.equal(result.lowConfidenceSegments, 2);
  assert.equal(result.duration, 60);
  assert.equal(result.segments[1].start, 46);
});
