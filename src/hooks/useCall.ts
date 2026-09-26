import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';

export type CallType = 'AUDIO' | 'VIDEO';
type CallState = 'idle' | 'calling' | 'ringing' | 'in-call';

interface IncomingCall {
  from: string;
  callType: CallType;
  offer: RTCSessionDescriptionInit;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Ajoute ici un serveur TURN pour fiabiliser les appels en 4G/CGNAT :
    // { urls: 'turn:TON_SERVEUR_TURN:3478', username: '...', credential: '...' },
  ],
};

export function useCall() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [callType, setCallType] = useState<CallType>('AUDIO');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const logCall = useCallback(async (receiverId: string, type: CallType, status: 'MISSED' | 'ANSWERED' | 'DECLINED') => {
    const duration = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ receiverId, type, status, duration }),
      });
    } catch {
      // historique non critique
    }
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setRemoteUserId(null);
    setCallState('idle');
    startedAtRef.current = null;
  }, []);

  const createPeerConnection = useCallback((to: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('call:ice-candidate', { to, candidate: e.candidate });
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pcRef.current = pc;
    return pc;
  }, []);

  const startCall = useCallback(
    async (to: string, type: CallType) => {
      setCallType(type);
      setRemoteUserId(to);
      setCallState('calling');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = createPeerConnection(to);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit('call:invite', { to, callType: type, offer });
    },
    [createPeerConnection]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const { from, callType: type, offer } = incomingCall;
    setCallType(type);
    setRemoteUserId(from);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
    localStreamRef.current = stream;
    setLocalStream(stream);
    const pc = createPeerConnection(from);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit('call:answer', { to: from, answer });
    setCallState('in-call');
    startedAtRef.current = Date.now();
    setIncomingCall(null);
  }, [incomingCall, createPeerConnection]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    getSocket().emit('call:decline', { to: incomingCall.from });
    logCall(incomingCall.from, incomingCall.callType, 'DECLINED');
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall, logCall]);

  const hangUp = useCallback(() => {
    if (remoteUserId) {
      getSocket().emit('call:end', { to: remoteUserId });
      logCall(remoteUserId, callType, startedAtRef.current ? 'ANSWERED' : 'MISSED');
    }
    cleanup();
  }, [remoteUserId, callType, logCall, cleanup]);

  useEffect(() => {
    const socket = getSocket();

    const onIncoming = ({ from, callType: type, offer }: IncomingCall) => {
      setIncomingCall({ from, callType: type, offer });
      setCallState('ringing');
    };
    const onAnswered = async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('in-call');
      startedAtRef.current = Date.now();
    };
    const onIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // candidat en retard, sans gravité
      }
    };
    const onDeclined = () => cleanup();
    const onCancelled = () => cleanup();
    const onEnded = () => cleanup();
    const onUnavailable = () => cleanup();

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:declined', onDeclined);
    socket.on('call:cancelled', onCancelled);
    socket.on('call:ended', onEnded);
    socket.on('call:unavailable', onUnavailable);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:declined', onDeclined);
      socket.off('call:cancelled', onCancelled);
      socket.off('call:ended', onEnded);
      socket.off('call:unavailable', onUnavailable);
    };
  }, [cleanup]);

  return { callState, incomingCall, callType, localStream, remoteStream, remoteUserId, startCall, acceptCall, declineCall, hangUp };
}