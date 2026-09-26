import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send, Image as ImageIcon, Mic, Square, Phone, Video, Play, Pause } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { useCallContext } from '../context/CallContext';

const API_BASE = import.meta.env.VITE_API_URL as string;

type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';

interface Sender {
  id: string;
  name: string;
  avatar: string | null;
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
}

interface Conversation {
  partner: Sender;
  lastMessage: Message | null;
  unreadCount: number;
  online: boolean;
}

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
  const { startCall } = useCallContext();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Sender | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/messages/conversations`, { credentials: 'include' });
    if (!res.ok) return;
    const { data } = await res.json();
    setConversations(data);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(async (partner: Sender) => {
    setSelectedPartner(partner);
    const res = await fetch(`${API_BASE}/api/messages/${partner.id}`, { credentials: 'include' });
    if (res.ok) {
      const { data } = await res.json();
      setMessages(data);
    }
    getSocket().emit('conversation:open', { with: partner.id });
    fetch(`${API_BASE}/api/messages/${partner.id}/read`, { method: 'POST', credentials: 'include' }).then(() =>
      setConversations((prev) => prev.map((c) => (c.partner.id === partner.id ? { ...c, unreadCount: 0 } : c)))
    );
  }, []);

  const closeConversation = useCallback(() => {
    getSocket().emit('conversation:close');
    setSelectedPartner(null);
    setMessages([]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();

    const onNew = (message: Message) => {
      setSelectedPartner((current) => {
        if (current && (message.senderId === current.id || message.receiverId === current.id)) {
          setMessages((prev) => [...prev, message]);
          fetch(`${API_BASE}/api/messages/${current.id}/read`, { method: 'POST', credentials: 'include' });
        }
        return current;
      });
      loadConversations();
    };

    const onSent = (message: Message) => {
      setSelectedPartner((current) => {
        if (current && message.receiverId === current.id) setMessages((prev) => [...prev, message]);
        return current;
      });
    };

    const onRead = () => {
      setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
    };

    socket.on('message:new', onNew);
    socket.on('message:sent', onSent);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:sent', onSent);
      socket.off('message:read', onRead);
    };
  }, [loadConversations]);

  const handleSendText = async () => {
    const content = text.trim();
    if (!content || !selectedPartner || sending) return;
    setSending(true);
    setText('');
    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ receiverId: selectedPartner.id, content }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setMessages((prev) => [...prev, data]);
      }
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (file: Blob, type: MessageType, duration?: number) => {
    if (!selectedPartner || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('file', file, type === 'IMAGE' ? 'image.jpg' : 'audio.webm');
      form.append('receiverId', selectedPartner.id);
      form.append('type', type);
      if (duration) form.append('duration', String(duration));

      const res = await fetch(`${API_BASE}/api/messages/media`, { method: 'POST', credentials: 'include', body: form });
      if (res.ok) {
        const { data } = await res.json();
        setMessages((prev) => [...prev, data]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendMedia(file, 'IMAGE');
    e.target.value = '';
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
      const duration = Math.round((Date.now() - startedAt) / 1000);
      stream.getTracks().forEach((t) => t.stop());
      sendMedia(blob, 'AUDIO', duration);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
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
                <span className={`block text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-neutral-400'}`}>{formatTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-800 bg-neutral-900 px-3 py-3 flex items-center space-x-2">
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
          <button onClick={recording ? stopRecording : startRecording} aria-label={recording ? "Arrêter l'enregistrement" : 'Message vocal'} className={`p-2.5 rounded-full transition ${recording ? 'bg-red-600' : 'bg-orange-600 hover:bg-orange-700'}`}>
            {recording ? <Square className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
          </button>
        )}
      </div>
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