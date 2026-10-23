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
    <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col items-center justify-between py-10 px-6">
      {callType === 'VIDEO' && remoteStream && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}
      {callType === 'VIDEO' && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-6 right-6 w-28 h-40 object-cover rounded-lg border-2 border-orange-600 z-10"
        />
      )}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="relative z-10 text-center text-neutral-100">
        <p className="text-sm text-neutral-400 mb-1">
          {callState === 'ringing' ? 'Appel entrant' : callState === 'calling' ? 'Appel en cours…' : 'En communication'}
        </p>
        <h2 className="text-xl font-bold">{callType === 'VIDEO' ? 'Appel vidéo' : 'Appel audio'}</h2>
      </div>

      <div className="relative z-10 flex items-center space-x-6">
        {callState === 'ringing' ? (
          <>
            <button onClick={declineCall} aria-label="Refuser l'appel" className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <button onClick={acceptCall} aria-label="Accepter l'appel" className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center">
              <Phone className="w-7 h-7 text-white" />
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'} className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center">
              {muted ? <MicOff className="w-6 h-6 text-neutral-100" /> : <Mic className="w-6 h-6 text-neutral-100" />}
            </button>
            {callType === 'VIDEO' && (
              <button onClick={toggleVideo} aria-label={videoOff ? 'Réactiver la caméra' : 'Couper la caméra'} className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center">
                {videoOff ? <VideoOff className="w-6 h-6 text-neutral-100" /> : <Video className="w-6 h-6 text-neutral-100" />}
              </button>
            )}
            <button onClick={hangUp} aria-label="Raccrocher" className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}