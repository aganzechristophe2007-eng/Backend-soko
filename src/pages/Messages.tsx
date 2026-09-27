import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send, Image as ImageIcon, Mic, Trash2, Phone, Video, Play, Pause } from 'lucide-react';
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
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:sent', onSent);
      socket.off('message:read', onRead);
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
      <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
        <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
          <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-base">Messages</h1>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6">
          {conversations.length === 0 ? (
            <div className="text-center py-16 border border-neutral-800 rounded-xl bg-neutral-900 text-neutral-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune discussion en cours.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.partner.id}
                  onClick={() => openConversation(conv.partner)}
                  className="p-4 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-orange-600/50 transition cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-600 flex items-center justify-center font-bold text-sm">
                        {conv.partner.name.charAt(0)}
                      </div>
                      {conv.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-neutral-900" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-sm truncate">{conv.partner.name}</h2>
                      <p className="text-xs text-neutral-400 truncate max-w-[220px]">
                        {conv.lastMessage?.type === 'TEXT' ? conv.lastMessage.content
                          : conv.lastMessage?.type === 'IMAGE' ? 'Photo'
                          : conv.lastMessage?.type === 'AUDIO' ? 'Message vocal'
                          : conv.lastMessage?.type === 'VIDEO' ? 'Vidéo'
                          : conv.lastMessage?.type === 'ORDER_REQUEST' ? 'Demande de livraison'
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1 shrink-0">
                    {conv.lastMessage && <span className="text-xs text-neutral-500">{formatTime(conv.lastMessage.createdAt)}</span>}
                    {conv.unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-orange-600 text-white rounded-full w-5 h-5 flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <button onClick={closeConversation} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-orange-600/20 text-orange-600 flex items-center justify-center font-bold text-sm shrink-0">
            {selectedPartner.name.charAt(0)}
          </div>
          <h1 className="font-bold text-base truncate">{selectedPartner.name}</h1>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button onClick={() => startCall(selectedPartner.id, 'AUDIO')} aria-label="Appel audio" className="p-2 rounded-lg hover:bg-neutral-800 transition text-neutral-300 hover:text-orange-600">
            <Phone className="w-5 h-5" />
          </button>
          <button onClick={() => startCall(selectedPartner.id, 'VIDEO')} aria-label="Appel vidéo" className="p-2 rounded-lg hover:bg-neutral-800 transition text-neutral-300 hover:text-orange-600">
            <Video className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) => {
          const mine = m.senderId !== selectedPartner.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 ${mine ? 'bg-orange-600 text-white' : 'bg-neutral-800 text-neutral-100'}`}>
                {m.type === 'TEXT' && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                {m.type === 'IMAGE' && m.mediaUrl && <img src={m.mediaUrl} alt="Image envoyée" className="rounded-lg max-w-full max-h-64 object-cover" />}
                {m.type === 'AUDIO' && m.mediaUrl && <AudioBubble url={m.mediaUrl} duration={m.mediaDuration} mine={mine} />}
                {m.type === 'VIDEO' && m.mediaUrl && <video src={m.mediaUrl} controls playsInline className="rounded-lg max-w-full max-h-64" />}
                {m.type === 'ORDER_REQUEST' && (
                  <OrderRequestBubble message={m} mine={mine} onRespond={respondToOrder} />
                )}
                <span className={`block text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                  {formatTime(m.createdAt)}
                  {m.status === 'sending' && ' · Envoi…'}
                </span>
                {m.status === 'failed' && (
                  <button
                    onClick={() => (m.type === 'TEXT' ? retryMessage(m) : retryMedia(m))}
                    className="block text-[10px] mt-1 text-red-300 underline"
                  >
                    Échec — toucher pour réessayer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-800 bg-neutral-900 px-3 py-3 flex items-center space-x-2">
        {recording ? (
          <>
            <button
              onClick={() => stopRecording(true)}
              aria-label="Annuler l'enregistrement"
              className="p-2.5 rounded-full hover:bg-neutral-800 transition text-red-500 shrink-0"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center space-x-2 bg-neutral-800 rounded-full px-4 py-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-xs font-mono text-neutral-300 shrink-0">{formatDuration(recordingSeconds)}</span>
              <div className="flex-1 flex items-center justify-center space-x-[2px] h-6 overflow-hidden">
                {audioLevels.map((lvl, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-orange-500 shrink-0"
                    style={{ height: `${4 + lvl * 20}px` }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => stopRecording(false)}
              aria-label="Envoyer le message vocal"
              className="p-2.5 rounded-full bg-orange-600 hover:bg-orange-700 transition shrink-0"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </>
        ) : (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            <button onClick={() => fileInputRef.current?.click()} aria-label="Envoyer une image" className="p-2.5 rounded-full hover:bg-neutral-800 transition text-neutral-300">
              <ImageIcon className="w-5 h-5" />
            </button>

            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Écrire un message..."
              className="flex-1 bg-neutral-800 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-600"
            />

            {text.trim() ? (
              <button onClick={handleSendText} disabled={sending} aria-label="Envoyer" className="p-2.5 rounded-full bg-orange-600 hover:bg-orange-700 transition disabled:opacity-50">
                <Send className="w-5 h-5 text-white" />
              </button>
            ) : (
              <button onClick={startRecording} aria-label="Message vocal" className="p-2.5 rounded-full bg-orange-600 hover:bg-orange-700 transition">
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
      <p className="text-sm">{message.content}</p>
      {productTitle && <p className="text-xs font-semibold opacity-80">« {productTitle} »</p>}

      {order?.status === 'AWAITING_SELLER_CONFIRMATION' && countdown && (
        <p className="text-[11px] font-mono opacity-80">⏱ {countdown} restant</p>
      )}
      {order?.status === 'CONFIRMED' && <p className="text-xs font-bold text-emerald-300">Disponibilité confirmée ✅</p>}
      {order?.status === 'EXPIRED' && <p className="text-xs font-bold text-red-300">Signalé indisponible</p>}

      {!mine && order?.status === 'AWAITING_SELLER_CONFIRMATION' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onRespond(order.id, 'confirm')}
            className="flex-1 rounded-lg bg-white/20 px-2 py-1.5 text-xs font-bold hover:bg-white/30 transition"
          >
            Confirmer
          </button>
          <button
            onClick={() => onRespond(order.id, 'deny')}
            className="flex-1 rounded-lg bg-black/30 px-2 py-1.5 text-xs font-bold hover:bg-black/40 transition"
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
      <button onClick={toggle} aria-label={playing ? 'Mettre en pause' : 'Écouter'} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${mine ? 'bg-white/20' : 'bg-neutral-700'}`}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <span className="text-xs">{formatDuration(duration)}</span>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}