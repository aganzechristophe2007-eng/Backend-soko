import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send, Image as ImageIcon, Mic, Trash2, Phone, Video, Play, Pause, Check, CheckCheck } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { useCallContext } from '../context/CallContext';

const API_BASE = import.meta.env.VITE_API_URL as string;

type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'ORDER_REQUEST';
type MessageStatus = 'sending' | 'sent' | 'failed';

interface Sender {
  id: string;
  name: string;
  avatar: string | null;
}

interface OrderSummary {
  id: string;
  status: 'PENDING' | 'AWAITING_SELLER_CONFIRMATION' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: string | null;
  totalUSD: number;
  totalCDF: number;
  items: { product: { id: string; title: string } }[];
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaDuration: number | null;
  isRead: boolean;
  createdAt: string;
  sender: Sender;
  order?: OrderSummary | null;
  // Champ local uniquement (jamais renvoyé par le serveur) : suit l'état d'un envoi optimiste.
  status?: MessageStatus;
}

interface Conversation {
  partner: Sender;
  lastMessage: Message | null;
  unreadCount: number;
  online: boolean;
}

const RECORDING_BAR_COUNT = 28;
const RECORDING_BASELINE = 0.08;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type TickState = 'sent' | 'delivered' | 'read';

// Envoyé (1 coche) : le destinataire n'est pas en ligne, donc pas encore livré.
// Livré (2 coches grises) : le destinataire est en ligne (peu importe la page où il se trouve),
// mais n'a pas encore ouvert cette conversation.
// Lu (2 coches bleues) : le destinataire a ouvert la conversation (isRead vient du serveur).
function getTickState(message: Message, partnerOnline: boolean): TickState {
  if (message.isRead) return 'read';
  return partnerOnline ? 'delivered' : 'sent';
}

export default function MessagingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { startCall } = useCallContext();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Sender | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(() => Array(RECORDING_BAR_COUNT).fill(RECORDING_BASELINE));
  // Présence en ligne, à l'échelle de toute l'app (le serveur diffuse "presence:update" à tout
  // le monde dès qu'un socket se connecte/déconnecte, quelle que soit la page où se trouve la
  // personne) — donc on n'a besoin de vérifier ça qu'une seule fois ici, pas par page.
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Conserve le blob d'un envoi média échoué pour permettre un vrai "réessayer" sans tout ré-enregistrer.
  const pendingBlobsRef = useRef<Map<string, { file: Blob; type: MessageType; duration?: number }>>(new Map());

  const loadConversations = useCallback(async () => {
    const res = await fetch(`${API_BASE}/messages/conversations`, { credentials: 'include' });
    if (!res.ok) return;
    const { data } = await res.json();
    setConversations(data);
    setOnlineIds((prev) => {
      const next = new Set(prev);
      for (const c of data as Conversation[]) {
        if (c.online) next.add(c.partner.id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(async (partner: Sender) => {
    setSelectedPartner(partner);
    const res = await fetch(`${API_BASE}/messages/${partner.id}`, { credentials: 'include' });
    if (res.ok) {
      const { data } = await res.json();
      setMessages(data);
    }
    getSocket().emit('conversation:open', { with: partner.id });
    fetch(`${API_BASE}/messages/${partner.id}/read`, { method: 'POST', credentials: 'include' }).then(() =>
      setConversations((prev) => prev.map((c) => (c.partner.id === partner.id ? { ...c, unreadCount: 0 } : c)))
    );
  }, []);

  const closeConversation = useCallback(() => {
    getSocket().emit('conversation:close');
    setSelectedPartner(null);
    setMessages([]);
  }, []);

  // Arrivée depuis la page profil vendeur (bouton "Envoyer un message") : ouvre directement
  // la conversation avec ce vendeur, sans repasser par la liste des conversations.
  useEffect(() => {
    const partner = (location.state as { partner?: Sender } | null)?.partner;
    if (partner) {
      openConversation(partner);
      window.history.replaceState({}, document.title); // évite de rouvrir au retour arrière
    }
  }, [location.state, openConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Demande la permission de notification une seule fois (silencieusement si déjà accordée
  // ou refusée) — permet d'afficher une notification système à l'arrivée d'un message.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onNew = (message: Message) => {
      let isOpenConversation = false;
      setSelectedPartner((current) => {
        if (current && (message.senderId === current.id || message.receiverId === current.id)) {
          isOpenConversation = true;
          setMessages((prev) => [...prev, message]);
          fetch(`${API_BASE}/messages/${current.id}/read`, { method: 'POST', credentials: 'include' });
        }
        return current;
      });

      // Notification système uniquement si la conversation concernée n'est pas déjà ouverte à
      // l'écran (comme WhatsApp : pas besoin de notifier ce qu'on est déjà en train de lire).
      if (!isOpenConversation && 'Notification' in window && Notification.permission === 'granted') {
        const preview =
          message.type === 'TEXT' ? message.content ?? ''
          : message.type === 'IMAGE' ? 'Photo'
          : message.type === 'AUDIO' ? 'Message vocal'
          : message.type === 'VIDEO' ? 'Vidéo'
          : 'Demande de livraison';
        try {
          new Notification(message.sender.name, { body: preview, icon: message.sender.avatar || undefined });
        } catch {
          // certains navigateurs mobiles n'autorisent pas `new Notification` hors service worker ; sans gravité
        }
      }

      // Met à jour la liste des conversations localement plutôt que de tout recharger depuis
      // le serveur à chaque message — nettement plus rapide, surtout sur connexion lente.
      setConversations((prev) => {
        const partner = message.sender;
        const idx = prev.findIndex((c) => c.partner.id === partner.id);
        if (idx === -1) {
          // Première fois qu'on reçoit un message de ce contact : on recharge pour avoir
          // toutes les infos de conversation correctement formées.
          loadConversations();
          return prev;
        }
        const updated: Conversation = {
          ...prev[idx],
          lastMessage: message,
          unreadCount: isOpenConversation ? 0 : prev[idx].unreadCount + 1,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    };

    const onSent = (message: Message) => {
      setSelectedPartner((current) => {
        if (current && message.receiverId === current.id) setMessages((prev) => [...prev, message]);
        return current;
      });
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.partner.id === message.receiverId);
        if (idx === -1) return prev;
        const updated: Conversation = { ...prev[idx], lastMessage: message };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    };

    const onRead = () => {
      setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
    };

    // Présence en ligne diffusée par le serveur à tout le monde, quelle que soit la page —
    // met à jour à la fois la liste des conversations (pastille verte) et les coches de
    // livraison des messages de la conversation ouverte, en direct.
    const onPresence = ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
      setConversations((prev) => prev.map((c) => (c.partner.id === userId ? { ...c, online } : c)));
    };

    // Après une reconnexion (coupure réseau brève), on rejoint la conversation ouverte pour
    // que le serveur continue à nous compter comme "en train de la lire" et à router les
    // messages correctement.
    const onReconnect = () => {
      setSelectedPartner((current) => {
        if (current) socket.emit('conversation:open', { with: current.id });
        return current;
      });
    };

    socket.on('message:new', onNew);
    socket.on('message:sent', onSent);
    socket.on('message:read', onRead);
    socket.on('presence:update', onPresence);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:sent', onSent);
      socket.off('message:read', onRead);
      socket.off('presence:update', onPresence);
      socket.io.off('reconnect', onReconnect);
    };
  }, [loadConversations]);

  // Nettoyage si le composant est démonté pendant un enregistrement en cours.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      audioContextRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Boutons "Confirmer" / "Indisponible" sur la bulle de demande de livraison automatique.
  const respondToOrder = useCallback(async (orderId: string, action: 'confirm' | 'deny') => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/${action}`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.order?.id === orderId
            ? { ...m, order: { ...m.order!, status: action === 'confirm' ? 'CONFIRMED' : 'EXPIRED' } }
            : m
        )
      );
    } catch (err) {
      console.error('Erreur réponse commande', err);
    }
  }, []);

  // Envoi optimiste : la bulle apparaît immédiatement (comme WhatsApp), avant même la réponse
  // du serveur, puis se met à jour en "envoyé" ou "échec".
  const sendText = async (content: string) => {
    if (!selectedPartner) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      senderId: 'me',
      receiverId: selectedPartner.id,
      type: 'TEXT',
      content,
      mediaUrl: null,
      mediaDuration: null,
      isRead: false,
      createdAt: new Date().toISOString(),
      sender: { id: 'me', name: '', avatar: null },
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ receiverId: selectedPartner.id, content }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, status: 'sent' } : m)));
      } else {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    }
  };

  const handleSendText = async () => {
    const content = text.trim();
    if (!content || !selectedPartner || sending) return;
    setSending(true);
    setText('');
    await sendText(content);
    setSending(false);
  };

  const retryMessage = (failed: Message) => {
    if (!failed.content) return;
    setMessages((prev) => prev.filter((m) => m.id !== failed.id));
    sendText(failed.content);
  };

  const sendMedia = async (file: Blob, type: MessageType, duration?: number) => {
    if (!selectedPartner || sending) return;
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    pendingBlobsRef.current.set(tempId, { file, type, duration });

    const optimisticMessage: Message = {
      id: tempId,
      senderId: 'me',
      receiverId: selectedPartner.id,
      type,
      content: null,
      mediaUrl: localUrl,
      mediaDuration: duration ?? null,
      isRead: false,
      createdAt: new Date().toISOString(),
      sender: { id: 'me', name: '', avatar: null },
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const form = new FormData();
      form.append('file', file, type === 'IMAGE' ? 'image.jpg' : 'audio.webm');
      form.append('receiverId', selectedPartner.id);
      form.append('type', type);
      if (duration) form.append('duration', String(duration));

      const res = await fetch(`${API_BASE}/messages/media`, { method: 'POST', credentials: 'include', body: form });
      if (res.ok) {
        const { data } = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, status: 'sent' } : m)));
        pendingBlobsRef.current.delete(tempId);
        URL.revokeObjectURL(localUrl);
      } else {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    } finally {
      setSending(false);
    }
  };

  const retryMedia = (failed: Message) => {
    const pending = pendingBlobsRef.current.get(failed.id);
    if (!pending) return;
    setMessages((prev) => prev.filter((m) => m.id !== failed.id));
    pendingBlobsRef.current.delete(failed.id);
    sendMedia(pending.file, pending.type, pending.duration);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendMedia(file, 'IMAGE');
    e.target.value = '';
  };

  // Enregistrement vocal façon WhatsApp : chrono + barres d'amplitude en direct, calculées
  // à partir du flux micro via Web Audio API (AnalyserNode), sans dépendre du MediaRecorder
  // pour l'affichage (ce qui garde l'animation fluide même sur téléphones modestes).
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;

      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = audioContext;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const level = Math.min(1, rms * 4); // amplifie le signal pour un mouvement bien visible
        setAudioLevels((prev) => [...prev.slice(1), Math.max(RECORDING_BASELINE, level)]);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
      audioChunksRef.current = [];
      const startedAt = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioContext.close().catch(() => {});
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

        if (!cancelledRef.current && audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          const duration = Math.round((Date.now() - startedAt) / 1000);
          sendMedia(blob, 'AUDIO', duration);
        }
        setAudioLevels(Array(RECORDING_BAR_COUNT).fill(RECORDING_BASELINE));
        setRecordingSeconds(0);
      };

      recorder.start(100); // segments de 100ms : arrêt plus réactif, moins de perte en cas de coupure
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Impossible d'accéder au micro", err);
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  if (!selectedPartner) {
    return (
      <div className="min-h-screen bg-white text-[#111111]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#EAECF0] bg-white px-4">
          <button onClick={() => navigate('/')} aria-label="Retour" className="flex h-10 w-10 items-center justify-center rounded-full text-[#344054] transition hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] lg:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Messages</h1>
        </header>

        <main className="mx-auto w-full max-w-2xl px-0 py-2 sm:px-4">
          {conversations.length === 0 ? (
            <div className="px-6 py-20 text-center text-[#667085]">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#111111] text-[#111111]">
                <MessageSquare className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold text-[#111111]">Vos messages</p>
              <p className="mt-1 text-sm">Aucune discussion en cours.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAECF0] sm:divide-y-0">
              {conversations.map((conv) => (
                <div
                  key={conv.partner.id}
                  onClick={() => openConversation(conv.partner)}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#F2F4F7] sm:rounded-xl"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-lg font-bold text-[#FF6B00]">
                        {conv.partner.name.charAt(0)}
                      </div>
                      {conv.online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#10B981]" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className={`truncate text-sm ${conv.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>{conv.partner.name}</h2>
                      <p className={`truncate text-sm ${conv.unreadCount > 0 ? 'font-semibold text-[#111111]' : 'text-[#667085]'}`}>
                        {conv.lastMessage?.type === 'TEXT' ? conv.lastMessage.content
                          : conv.lastMessage?.type === 'IMAGE' ? 'Photo'
                          : conv.lastMessage?.type === 'AUDIO' ? 'Message vocal'
                          : conv.lastMessage?.type === 'VIDEO' ? 'Vidéo'
                          : conv.lastMessage?.type === 'ORDER_REQUEST' ? 'Demande de livraison'
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {conv.lastMessage && <span className="text-xs text-[#667085]">{formatTime(conv.lastMessage.createdAt)}</span>}
                    {conv.unreadCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FF6B00] px-1 text-[10px] font-bold text-white">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  const isPartnerOnline = onlineIds.has(selectedPartner.id);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col bg-white text-[#111111] lg:border-x lg:border-[#EAECF0]">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-[#EAECF0] bg-white px-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={closeConversation} aria-label="Retour aux discussions" className="flex h-10 w-10 items-center justify-center rounded-full text-[#344054] transition hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1E7] text-sm font-bold text-[#FF6B00]">
              {selectedPartner.name.charAt(0)}
            </div>
            {isPartnerOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#10B981]" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight">{selectedPartner.name}</h1>
            <p className="text-xs leading-tight text-[#667085]">{isPartnerOnline ? 'En ligne' : 'Hors ligne'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button onClick={() => startCall(selectedPartner.id, 'AUDIO')} aria-label="Appel audio" className="flex h-10 w-10 items-center justify-center rounded-full text-[#344054] transition hover:bg-[#F2F4F7] hover:text-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
            <Phone className="w-5 h-5" />
          </button>
          <button onClick={() => startCall(selectedPartner.id, 'VIDEO')} aria-label="Appel vidéo" className="flex h-10 w-10 items-center justify-center rounded-full text-[#344054] transition hover:bg-[#F2F4F7] hover:text-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
            <Video className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.map((m) => {
          const mine = m.senderId !== selectedPartner.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-[#FF6B00] text-white' : 'rounded-bl-md bg-[#F2F4F7] text-[#111111]'}`}>
                {m.type === 'TEXT' && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                {m.type === 'IMAGE' && m.mediaUrl && <img src={m.mediaUrl} alt="Image envoyée" className="rounded-lg max-w-full max-h-64 object-cover" />}
                {m.type === 'AUDIO' && m.mediaUrl && <AudioBubble url={m.mediaUrl} duration={m.mediaDuration} mine={mine} />}
                {m.type === 'VIDEO' && m.mediaUrl && <video src={m.mediaUrl} controls playsInline className="rounded-lg max-w-full max-h-64" />}
                {m.type === 'ORDER_REQUEST' && (
                  <OrderRequestBubble message={m} mine={mine} onRespond={respondToOrder} />
                )}
                <span className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-white/80' : 'text-[#667085]'}`}>
                  <span>{formatTime(m.createdAt)}</span>
                  {m.status === 'sending' && <span>Envoi…</span>}
                  {mine && m.status !== 'sending' && m.status !== 'failed' && (() => {
                    const tick = getTickState(m, isPartnerOnline);
                    if (tick === 'sent') return <Check className="w-3.5 h-3.5 shrink-0" />;
                    if (tick === 'delivered') return <CheckCheck className="w-3.5 h-3.5 shrink-0" />;
                    return <CheckCheck className="w-3.5 h-3.5 shrink-0 text-white" strokeWidth={3} />;
                  })()}
                </span>
                {m.status === 'failed' && (
                  <button
                    onClick={() => (m.type === 'TEXT' ? retryMessage(m) : retryMedia(m))}
                    className="mt-1 block text-[11px] font-semibold text-white underline"
                  >
                    Échec — toucher pour réessayer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[#EAECF0] bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {recording ? (
          <>
            <button
              onClick={() => stopRecording(true)}
              aria-label="Annuler l'enregistrement"
              className="p-2.5 rounded-full hover:bg-[#F2F4F7] transition text-red-600 shrink-0"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center space-x-2 bg-[#F2F4F7] rounded-full px-4 py-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-xs font-mono text-[#344054] shrink-0">{formatDuration(recordingSeconds)}</span>
              <div className="flex-1 flex items-center justify-center space-x-[2px] h-6 overflow-hidden">
                {audioLevels.map((lvl, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-[#FF6B00] shrink-0"
                    style={{ height: `${4 + lvl * 20}px` }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => stopRecording(false)}
              aria-label="Envoyer le message vocal"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF6B00] hover:bg-[#E85F00] transition shrink-0"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </>
        ) : (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <button onClick={() => fileInputRef.current?.click()} aria-label="Envoyer une image" className="p-2.5 rounded-full hover:bg-[#F2F4F7] transition text-[#344054]">
              <ImageIcon className="w-5 h-5" />
            </button>

            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Écrire un message..."
              className="h-11 min-w-0 flex-1 rounded-full border border-transparent bg-[#F2F4F7] px-4 text-base outline-none transition focus:border-[#FF6B00] sm:text-sm"
            />

            {text.trim() ? (
              <button onClick={handleSendText} disabled={sending} aria-label="Envoyer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF6B00] hover:bg-[#E85F00] transition disabled:opacity-50">
                <Send className="w-5 h-5 text-white" />
              </button>
            ) : (
              <button onClick={startRecording} aria-label="Message vocal" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF6B00] hover:bg-[#E85F00] transition">
                <Mic className="w-5 h-5 text-white" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderRequestBubble({
  message,
  mine,
  onRespond,
}: {
  message: Message;
  mine: boolean;
  onRespond: (orderId: string, action: 'confirm' | 'deny') => void;
}) {
  const order = message.order;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!order || order.status !== 'AWAITING_SELLER_CONFIRMATION' || !order.expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [order]);

  const countdown = useMemo(() => {
    if (!order?.expiresAt) return null;
    const remaining = new Date(order.expiresAt).getTime() - now;
    if (remaining <= 0) return '00:00:00';
    const total = Math.floor(remaining / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [order?.expiresAt, now]);

  const productTitle = order?.items?.[0]?.product?.title;

  return (
    <div className="min-w-[220px] space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Demande de livraison</p>
      <p className="text-sm">{message.content}</p>
      {productTitle && (
        <p className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${mine ? 'bg-white text-[#111111]' : 'bg-white text-[#111111]'}`}>{productTitle}</p>
      )}

      {order?.status === 'AWAITING_SELLER_CONFIRMATION' && countdown && (
        <p className="font-mono text-xs font-semibold">{countdown} restant</p>
      )}
      {order?.status === 'CONFIRMED' && <p className={`text-xs font-bold ${mine ? 'text-white' : 'text-[#10B981]'}`}>Disponibilité confirmée</p>}
      {order?.status === 'EXPIRED' && <p className={`text-xs font-bold ${mine ? 'text-white' : 'text-red-600'}`}>Signalé indisponible</p>}

      {!mine && order?.status === 'AWAITING_SELLER_CONFIRMATION' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onRespond(order.id, 'confirm')}
            className="h-9 flex-1 rounded-lg bg-[#10B981] px-2 text-xs font-bold text-white transition hover:bg-[#0E9F6E]"
          >
            Confirmer
          </button>
          <button
            onClick={() => onRespond(order.id, 'deny')}
            className="h-9 flex-1 rounded-lg border border-[#D0D5DD] bg-white px-2 text-xs font-bold text-[#111111] transition hover:bg-[#F2F4F7]"
          >
            Indisponible
          </button>
        </div>
      )}
    </div>
  );
}

function AudioBubble({ url, duration, mine }: { url: string; duration: number | null; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying((p) => !p);
  };

  return (
    <div className="flex items-center space-x-2 min-w-[160px]">
      <button onClick={toggle} aria-label={playing ? 'Mettre en pause' : 'Écouter'} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${mine ? 'bg-white text-[#FF6B00]' : 'bg-[#FF6B00] text-white'}`}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <span className="text-xs">{formatDuration(duration)}</span>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}