type Segment = { start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number };

export function transcriptionQuality(data: Record<string, unknown>) {
  const segments: Segment[] = Array.isArray(data.segments) ? data.segments.slice(0, 500) : [];
  // Never silently replace numbers or delete an uncertain spoken sentence.
  const lowConfidenceSegments = segments.filter(segment =>
    (typeof segment.avg_logprob === "number" && segment.avg_logprob < -0.55)
    || (typeof segment.no_speech_prob === "number" && segment.no_speech_prob > 0.45),
  ).length;
  return { segments, lowConfidenceSegments, needsReview: lowConfidenceSegments > 0 };
}

export function mergeTranscriptionPayloads(parts: Record<string, unknown>[]) {
  let offset = 0;
  const segments: Segment[] = [];
  let lowConfidenceSegments = 0;
  for (const part of parts) {
    const quality = transcriptionQuality(part);
    lowConfidenceSegments += typeof part.lowConfidenceSegments === "number"
      ? part.lowConfidenceSegments : quality.lowConfidenceSegments;
    segments.push(...quality.segments.map(segment => ({ ...segment,
      start: typeof segment.start === "number" ? segment.start + offset : undefined,
      end: typeof segment.end === "number" ? segment.end + offset : undefined,
    })));
    offset += typeof part.duration === "number" ? part.duration : 0;
  }
  return { ...parts.at(-1), duration: offset, segments, lowConfidenceSegments,
    needsReview: lowConfidenceSegments > 0 || parts.some(part => part.needsReview === true) };
}
