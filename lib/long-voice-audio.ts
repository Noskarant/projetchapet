export const LONG_VOICE_CHUNK_SECONDS = 45;

type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
  dataSizeOffset: number;
};

function ascii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}

function readWavInfo(buffer: ArrayBuffer): WavInfo | null {
  if (buffer.byteLength < 44) return null;
  const view = new DataView(buffer);
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE") return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;
  let dataSizeOffset = 0;

  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    if (payloadOffset + size > view.byteLength) break;

    if (id === "fmt " && size >= 16) {
      const format = view.getUint16(payloadOffset, true);
      if (format !== 1) return null;
      channels = view.getUint16(payloadOffset + 2, true);
      sampleRate = view.getUint32(payloadOffset + 4, true);
      bitsPerSample = view.getUint16(payloadOffset + 14, true);
    }
    if (id === "data") {
      dataOffset = payloadOffset;
      dataLength = size;
      dataSizeOffset = offset + 4;
      break;
    }
    offset = payloadOffset + size + (size % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataOffset || !dataLength) return null;
  return { sampleRate, channels, bitsPerSample, dataOffset, dataLength, dataSizeOffset };
}

export async function splitPcmWav(blob: Blob, maxSeconds = LONG_VOICE_CHUNK_SECONDS): Promise<Blob[]> {
  const buffer = await blob.arrayBuffer();
  const info = readWavInfo(buffer);
  if (!info || maxSeconds <= 0) return [blob];

  const bytesPerFrame = info.channels * (info.bitsPerSample / 8);
  if (!Number.isFinite(bytesPerFrame) || bytesPerFrame <= 0) return [blob];

  const maxDataBytes = Math.max(
    bytesPerFrame,
    Math.floor(info.sampleRate * maxSeconds) * bytesPerFrame,
  );
  if (info.dataLength <= maxDataBytes) return [blob];

  const chunks: Blob[] = [];
  let dataCursor = 0;
  while (dataCursor < info.dataLength) {
    const remaining = info.dataLength - dataCursor;
    const rawLength = Math.min(maxDataBytes, remaining);
    const chunkLength = rawLength - (rawLength % bytesPerFrame);
    if (chunkLength <= 0) break;

    const output = new Uint8Array(info.dataOffset + chunkLength);
    output.set(new Uint8Array(buffer, 0, info.dataOffset), 0);
    output.set(new Uint8Array(buffer, info.dataOffset + dataCursor, chunkLength), info.dataOffset);

    const outputView = new DataView(output.buffer);
    outputView.setUint32(4, output.byteLength - 8, true);
    outputView.setUint32(info.dataSizeOffset, chunkLength, true);

    chunks.push(new Blob([output], { type: "audio/wav" }));
    dataCursor += chunkLength;
  }

  return chunks.length ? chunks : [blob];
}

export function mergeTranscriptParts(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
