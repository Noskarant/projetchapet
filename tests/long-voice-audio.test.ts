import assert from "node:assert/strict";
import test from "node:test";
import { encodeMonoWav } from "../app/mobile-audio";
import {
  LONG_VOICE_CHUNK_SECONDS,
  mergeTranscriptParts,
  splitPcmWav,
  trimPcmWavSilence,
} from "../lib/long-voice-audio";

function wavDataLength(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => new DataView(buffer).getUint32(40, true));
}

test("découpe une dictée WAV de plus de deux minutes sans perdre d'audio", async () => {
  const sampleRate = 8_000;
  const durationSeconds = 121;
  const samples = new Float32Array(sampleRate * durationSeconds);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin(index / 40) * 0.2;
  }

  const source = encodeMonoWav(samples, sampleRate);
  const chunks = await splitPcmWav(source, LONG_VOICE_CHUNK_SECONDS);

  assert.equal(chunks.length, 3);
  const lengths = await Promise.all(chunks.map(wavDataLength));
  assert.equal(lengths.reduce((sum, length) => sum + length, 0), samples.length * 2);
  assert.ok(chunks.every((chunk) => chunk.size < source.size));
});

test("retire le silence de début et de fin sans couper les paroles", async () => {
  const rate = 8000;
  const samples = new Float32Array(rate * 8);
  samples.fill(0.1, rate * 3, rate * 5);
  const blob = await trimPcmWavSilence(encodeMonoWav(samples, rate));
  assert.ok(blob);
  assert.equal(await wavDataLength(blob), rate * 2.5 * 2);
});

test("refuse un WAV silencieux et conserve le format des enregistrements compressés", async () => {
  assert.equal(await trimPcmWavSilence(encodeMonoWav(new Float32Array(8000), 8000)), null);
  const mp4 = new Blob(["compressed"], { type: "audio/mp4" });
  assert.equal(await trimPcmWavSilence(mp4), mp4);
  assert.equal((await splitPcmWav(mp4))[0].type, "audio/mp4");
});

test("laisse une dictée courte dans un seul segment", async () => {
  const sampleRate = 8_000;
  const samples = new Float32Array(sampleRate * 12);
  const source = encodeMonoWav(samples, sampleRate);
  const chunks = await splitPcmWav(source);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].size, source.size);
});

test("recolle proprement les transcriptions successives", () => {
  assert.equal(
    mergeTranscriptParts(["  Client Martin... ", " non finalement Martine.  ", "  Peinture 45 m². "]),
    "Client Martin... non finalement Martine. Peinture 45 m².",
  );
});
