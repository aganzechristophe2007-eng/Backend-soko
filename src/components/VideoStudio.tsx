import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, SwitchCamera, Timer, Upload, VideoOff, Volume2, VolumeX, Check } from 'lucide-react';

/**
 * Studio vidéo façon TikTok : caméra plein écran 9:16, barre de progression en haut, boutons latéraux
 * (retourner la caméra, minuteur 3 s, durée 60 s / 15 s), gros bouton d'enregistrement au centre,
 * import depuis la galerie, puis aperçu en boucle avec « Refaire » / « Utiliser cette vidéo ».
 *
 * L'enregistrement se fait dans le navigateur (MediaRecorder). Si la caméra est refusée ou indisponible,
 * on propose l'import d'un fichier ou l'appareil photo natif du téléphone.
 * Le fichier produit est un vrai File (video/webm ou video/mp4), accepté tel quel par le serveur.
 */

interface Props {
  /** Vidéo déjà acceptée (URL locale), affichée en aperçu. */
  videoPreview: string | null;
  onVideo: (file: File) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}

const MAX_FILE_BYTES = 80 * 1024 * 1024; // même limite que le serveur
const ALLOWED_IMPORT = ['video/mp4', 'video/webm', 'video/quicktime'];
const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

const pickMime = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
};

const fmt = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type CamState = 'starting' | 'ready' | 'denied' | 'unavailable';

const railBtn = 'flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:bg-black/70 focus-visible:outline-none';

export default function VideoStudio({ videoPreview, onVideo, onRemove, onError }: Props) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const reviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const maxRef = useRef(60);
  const elapsedRef = useRef(0);

  const [cam, setCam] = useState<CamState>('starting');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [maxSeconds, setMaxSeconds] = useState(60);
  const [useCountdown, setUseCountdown] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(true);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [retry, setRetry] = useState(0);

  const shownUrl = pending?.url ?? videoPreview;
  const inLive = !shownUrl;

  useEffect(() => { maxRef.current = maxSeconds; }, [maxSeconds]);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Caméra : démarre en mode « live », s'arrête dès qu'on passe à l'aperçu ou qu'on quitte l'écran.
  useEffect(() => {
    if (!inLive) return;
    let cancelled = false;
    setCam('starting');

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCam('unavailable'); return; }
      const video = { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } };
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        } catch (e: any) {
          if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e;
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); // pas de micro : vidéo seule
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          await liveRef.current.play().catch(() => undefined);
        }
        setCam('ready');
      } catch (e: any) {
        if (!cancelled) setCam(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };
    start();

    return () => {
      cancelled = true;
      clearTimers();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null;
        try { recorderRef.current.stop(); } catch { /* déjà arrêté */ }
      }
      setRecording(false);
      setCountdown(null);
      stopStream();
    };
  }, [inLive, facing, retry]);

  // Libère l'URL locale d'une vidéo non retenue.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  const finishRecording = (mime: string) => {
    const seconds = elapsedRef.current;
    if (seconds < 1) { onError('Vidéo trop courte : enregistrez au moins 1 seconde.'); return; }
    const type = mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'; // sans les codecs : le serveur compare le type exact
    const blob = new Blob(chunksRef.current, { type });
    if (blob.size > MAX_FILE_BYTES) { onError('La vidéo dépasse 80 Mo. Enregistrez une vidéo plus courte.'); return; }
    const file = new File([blob], `video-${Date.now()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
    setPending({ file, url: URL.createObjectURL(file) });
  };

  const beginRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      onError("L'enregistrement n'est pas pris en charge par ce navigateur. Utilisez « Importer ».");
      return;
    }
    const mime = pickMime();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    } catch {
      onError("Impossible de démarrer l'enregistrement. Utilisez « Importer ».");
      return;
    }
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => finishRecording(recorder.mimeType || mime);
    recorderRef.current = recorder;
    recorder.start(250);
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    setElapsed(0);
    setRecording(true);
    timerRef.current = setInterval(() => {
      const s = (Date.now() - startedAtRef.current) / 1000;
      elapsedRef.current = Math.min(s, maxRef.current);
      setElapsed(elapsedRef.current);
      if (s >= maxRef.current) stopRecording();
    }, 100);
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const onRecordPress = () => {
    if (cam !== 'ready') return;
    if (recording) { stopRecording(); return; }
    if (countdown !== null) { // annule le compte à rebours
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(null);
      return;
    }
    if (!useCountdown) { beginRecording(); return; }
    let n = 3;
    setCountdown(n);
    countdownRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCountdown(null);
        beginRecording();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMPORT.includes(file.type)) { onError('Format non pris en charge : choisissez une vidéo MP4, MOV ou WEBM.'); return; }
    if (file.size > MAX_FILE_BYTES) { onError('Cette vidéo dépasse 80 Mo. Choisissez-en une plus légère.'); return; }
    setPending({ file, url: URL.createObjectURL(file) });
  }, [onError]);

  const discardPending = () => setPending(null);
  const acceptPending = () => {
    if (!pending) return;
    const file = pending.file;
    onVideo(file);
    setPending(null);
  };

  const progress = Math.min(100, (elapsed / maxSeconds) * 100);

  const importInput = (id: string, capture?: boolean) => (
    <input
      id={id}
      type="file"
      accept="video/mp4,video/webm,video/quicktime"
      {...(capture ? { capture: 'environment' as const } : {})}
      onChange={handleImport}
      className="hidden"
    />
  );

  /* ------------------------------ Aperçu (vidéo enregistrée, importée ou déjà ajoutée) ------------------------------ */
  if (!inLive && shownUrl) {
    return (
      <div className="relative h-full w-full bg-black">
        <video
          ref={reviewRef}
          src={shownUrl}
          autoPlay
          loop
          playsInline
          muted={muted}
          onClick={() => { const v = reviewRef.current; if (v) (v.paused ? v.play() : v.pause()); }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute right-3 top-4 flex flex-col items-center gap-1">
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Activer le son' : 'Couper le son'} className={railBtn}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <span className="text-[10px] font-semibold text-white">Son</span>
        </div>

        {pending ? (
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-between gap-3 px-4">
            <button type="button" onClick={discardPending} className="flex h-12 items-center gap-2 rounded-full bg-black/60 px-5 text-sm font-bold text-white hover:bg-black/80">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Refaire
            </button>
            <button type="button" onClick={acceptPending} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#FF6B00] px-5 text-sm font-bold text-white hover:bg-[#E85F00]">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> Utiliser cette vidéo
            </button>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-6 flex items-center justify-between gap-3 px-4">
            <span className="flex h-12 items-center gap-2 rounded-full bg-black/60 px-4 text-sm font-bold text-white">
              <Check className="h-4 w-4 text-[#FF6B00]" strokeWidth={3} aria-hidden="true" /> Vidéo ajoutée
            </span>
            <button type="button" onClick={onRemove} className="flex h-12 items-center gap-2 rounded-full bg-black/60 px-5 text-sm font-bold text-white hover:bg-black/80">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Remplacer
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ Caméra en direct ------------------------------ */
  const camProblem = cam === 'denied' || cam === 'unavailable';

  return (
    <div className="relative h-full w-full bg-[#111111]">
      <video
        ref={liveRef}
        muted
        playsInline
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${cam === 'ready' ? '' : 'invisible'}`}
      />

      {/* Barre de progression */}
      <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-white/30" role="progressbar" aria-valuemin={0} aria-valuemax={maxSeconds} aria-valuenow={Math.round(elapsed)} aria-label="Durée enregistrée">
        <div className="h-full rounded-full bg-[#FF6B00]" style={{ width: `${progress}%` }} />
      </div>

      {cam === 'starting' && (
        <div className="absolute inset-0 flex items-center justify-center text-white" role="status">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Ouverture de la caméra" />
        </div>
      )}

      {camProblem && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center text-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10"><VideoOff className="h-8 w-8" aria-hidden="true" /></span>
          <div>
            <p className="text-base font-bold">{cam === 'denied' ? 'Accès à la caméra refusé' : 'Caméra indisponible'}</p>
            <p className="mt-1 text-sm text-white/80">
              {cam === 'denied'
                ? "Autorisez la caméra et le micro dans les réglages de votre navigateur, puis réessayez. Vous pouvez aussi importer une vidéo."
                : "Aucune caméra utilisable n'a été trouvée. Importez une vidéo depuis votre appareil."}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <label htmlFor="studio-import" className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#FF6B00] text-sm font-bold text-white hover:bg-[#E85F00]">
              <Upload className="h-4 w-4" aria-hidden="true" /> Importer une vidéo
            </label>
            <label htmlFor="studio-native" className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white hover:bg-white/25">
              Filmer avec l'appareil du téléphone
            </label>
            {cam === 'denied' && (
              <button type="button" onClick={() => setRetry((n) => n + 1)} className="h-11 rounded-full text-sm font-bold text-white/90 hover:bg-white/10">Réessayer</button>
            )}
          </div>
        </div>
      )}

      {countdown !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="assertive">
          <span className="text-8xl font-extrabold text-white">{countdown}</span>
        </div>
      )}

      {/* Boutons latéraux */}
      {cam === 'ready' && !recording && (
        <div className="absolute right-3 top-8 flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Retourner la caméra" className={railBtn}>
              <SwitchCamera className="h-5 w-5" />
            </button>
            <span className="text-[10px] font-semibold text-white">Retourner</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => setUseCountdown((v) => !v)} aria-pressed={useCountdown} aria-label="Minuteur de 3 secondes" className={`${railBtn} ${useCountdown ? '!bg-[#FF6B00]' : ''}`}>
              <Timer className="h-5 w-5" />
            </button>
            <span className="text-[10px] font-semibold text-white">Minuteur</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => setMaxSeconds((s) => (s === 60 ? 15 : 60))} aria-label={`Durée maximale : ${maxSeconds} secondes`} className={`${railBtn} text-xs font-extrabold`}>
              {maxSeconds}s
            </button>
            <span className="text-[10px] font-semibold text-white">Durée</span>
          </div>
        </div>
      )}

      {/* Commandes du bas */}
      {!camProblem && (
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3">
          {recording && <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white" aria-live="off">{fmt(elapsed)} / {fmt(maxSeconds)}</span>}
          <div className="flex w-full items-center justify-between px-8">
            <label
              htmlFor="studio-import"
              className={`flex w-16 cursor-pointer flex-col items-center gap-1 ${recording ? 'invisible' : ''}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30"><Upload className="h-5 w-5" aria-hidden="true" /></span>
              <span className="text-[10px] font-semibold text-white">Importer</span>
            </label>

            <button
              type="button"
              onClick={onRecordPress}
              disabled={cam !== 'ready'}
              aria-label={recording ? "Arrêter l'enregistrement" : countdown !== null ? 'Annuler le minuteur' : "Démarrer l'enregistrement"}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-white/40 transition-transform active:scale-95 focus-visible:outline-none focus-visible:bg-white/60 disabled:opacity-40"
            >
              <span className={`block bg-[#FF6B00] transition-all ${recording ? 'h-8 w-8 rounded-lg' : 'h-14 w-14 rounded-full'}`} />
            </button>

            <span className="w-16" aria-hidden="true" />
          </div>
        </div>
      )}

      {importInput('studio-import')}
      {importInput('studio-native', true)}
    </div>
  );
}
