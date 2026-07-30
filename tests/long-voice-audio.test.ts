import assert from "node:assert/strict";
import test from "node:test";
import { encodeMonoWav } from "../app/mobile-audio";
import {
  LONG_VOICE_CHUNK_SECONDS,
  mergeTranscriptParts,
  splitPcmWav,
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
