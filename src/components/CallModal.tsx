import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { useCallContext } from '../context/CallContext';

export default function CallModal() {
  const { callState, callType, localStream, remoteStream, acceptCall, declineCall, hangUp } = useCallContext();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (callType === 'VIDEO' && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (callType === 'AUDIO' && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, callType]);

  if (callState === 'idle') return null;

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  };
  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = videoOff));
    setVideoOff((v) => !v);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Appel" className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-neutral-950 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      {callType === 'VIDEO' && remoteStream && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}
      {callType === 'VIDEO' && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-6 right-6 w-28 h-40 object-cover rounded-2xl border-2 border-[#FF6B00] z-10 sm:w-36 sm:h-52"
        />
      )}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="relative z-10 flex flex-col items-center text-center text-neutral-100">
        <span className={`mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-neutral-800 text-neutral-100 ring-4 ${callState === 'ringing' ? 'ring-[#FF6B00] animate-pulse' : 'ring-neutral-700'}`}>{callType === 'VIDEO' ? <Video className="h-10 w-10" aria-hidden="true" /> : <Phone className="h-10 w-10" aria-hidden="true" />}</span>
        <p className="mb-1 text-sm font-medium text-neutral-300" aria-live="polite">
          {callState === 'ringing' ? 'Appel entrant' : callState === 'calling' ? 'Appel en cours…' : 'En communication'}
        </p>
        <h2 className="text-2xl font-bold">{callType === 'VIDEO' ? 'Appel vidéo' : 'Appel audio'}</h2>
      </div>

      <div className="relative z-10 flex items-center gap-6">
        {callState === 'ringing' ? (
          <>
            <button onClick={declineCall} aria-label="Refuser l'appel" className="h-16 w-16 rounded-full bg-[#F04438] transition active:scale-95 flex items-center justify-center">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <button onClick={acceptCall} aria-label="Accepter l'appel" className="h-16 w-16 rounded-full bg-[#10B981] transition active:scale-95 flex items-center justify-center">
              <Phone className="w-7 h-7 text-white" />
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'} className="h-14 w-14 rounded-full bg-neutral-800 transition hover:bg-neutral-700 active:scale-95 flex items-center justify-center">
              {muted ? <MicOff className="w-6 h-6 text-neutral-100" /> : <Mic className="w-6 h-6 text-neutral-100" />}
            </button>
            {callType === 'VIDEO' && (
              <button onClick={toggleVideo} aria-label={videoOff ? 'Réactiver la caméra' : 'Couper la caméra'} className="h-14 w-14 rounded-full bg-neutral-800 transition hover:bg-neutral-700 active:scale-95 flex items-center justify-center">
                {videoOff ? <VideoOff className="w-6 h-6 text-neutral-100" /> : <Video className="w-6 h-6 text-neutral-100" />}
              </button>
            )}
            <button onClick={hangUp} aria-label="Raccrocher" className="h-16 w-16 rounded-full bg-[#F04438] transition active:scale-95 flex items-center justify-center">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}