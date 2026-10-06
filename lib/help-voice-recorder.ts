import { microphoneErrorMessage } from './microphone-error';

export type HelpRecording = { stop: () => Promise<Blob>; cancel: () => void };

const mimeTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/** Short questions: finish after speech and 1.8 s of quiet; never listen indefinitely. */
export async function startHelpRecording({ signal, onLevel, onEnd, onError }: {
  signal: AbortSignal;
  onLevel: (level: number) => void;
  onEnd: (reason: 'silence' | 'limit' | 'empty') => void;
  onError: (error: Error) => void;
}): Promise<HelpRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Le micro n’est pas disponible sur ce navigateur. Vous pouvez écrire votre question.');
  }
  const scope = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Audio = scope.AudioContext || scope.webkitAudioContext;
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let interval: number | undefined;
  let cancelled = false;
  let stopped = false;
  let complete: ((value: Blob) => void) | null = null;
  let reject: ((error: Error) => void) | null = null;
  const chunks: Blob[] = [];
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;

  const release = () => {
    window.clearInterval(interval);
    source?.disconnect();
    analyser?.disconnect();
    source = null; analyser = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    context = null;
    signal.removeEventListener('abort', cancel);
  };
  const cancel = () => {
    cancelled = true;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    }
    release();
    reject?.(new DOMException('Enregistrement annulé.', 'AbortError'));
    reject = null; complete = null;
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Annulé.', 'AbortError');
    // Resume during the microphone tap, before Safari's permission prompt.
    if (Audio) {
      context = new Audio({ latencyHint: 'interactive' });
      await context.resume();
    }
    if (signal.aborted) throw new DOMException('Annulé.', 'AbortError');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (signal.aborted) throw new DOMException('Annulé.', 'AbortError');
    const mime = mimeTypes.find(type => MediaRecorder.isTypeSupported?.(type));
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    if (context) {
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser(); analyser.fftSize = 1024;
      source.connect(analyser);
    }
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      release();
      if (cancelled) return;
      const blob = new Blob(chunks, { type: recorder!.mimeType || chunks[0]?.type || 'audio/mp4' });
      if (complete) complete(blob);
      else onError(new Error('Le micro a été interrompu. Réessayez.'));
      complete = null; reject = null;
    };
    recorder.onerror = () => {
      const error = new Error('L’enregistrement a été interrompu. Réessayez.');
      reject?.(error); reject = null; complete = null;
      cancel(); onError(error);
    };
    recorder.start(250);
    const started = performance.now();
    let lastVoice = started, voiceTicks = 0, ended = false;
    const samples = new Float32Array(1024);
    interval = window.setInterval(() => {
      if (cancelled || stopped || ended) return;
      const now = performance.now();
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        onLevel(Math.min(1, rms * 12));
        if (rms >= .008) { lastVoice = now; voiceTicks += 1; }
      }
      const reason = now - started >= 60_000 ? 'limit'
        : analyser && voiceTicks >= 3 && now - lastVoice >= 1800 ? 'silence'
          : analyser && !voiceTicks && now - started >= 15_000 ? 'empty' : null;
      if (reason) { ended = true; window.clearInterval(interval); onEnd(reason); }
    }, 100);
    return {
      cancel,
      stop: () => new Promise<Blob>((resolve, rejectStop) => {
        if (cancelled || stopped || !recorder || recorder.state === 'inactive') {
          rejectStop(new Error('L’enregistrement est déjà terminé.')); return;
        }
        stopped = true; window.clearInterval(interval);
        complete = resolve; reject = rejectStop;
        try { recorder.stop(); } catch (error) { release(); rejectStop(error instanceof Error ? error : new Error('Enregistrement interrompu.')); }
      }),
    };
  } catch (error) {
    cancel();
    if (signal.aborted) throw error;
    throw new Error(microphoneErrorMessage(error, navigator.userAgent)
      ?? 'Impossible d’ouvrir le micro. Vérifiez son branchement et les réglages de votre navigateur, ou écrivez votre demande.');
  }
}
