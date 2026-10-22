import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = ((import.meta as any).env?.VITE_API_URL ?? "").replace(/\/$/, "");
const BRAND = "bg-blue-600 text-white hover:bg-blue-700";

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Conv = { id: string; title: string; updatedAt: string };
type Usage = { hourLeft: number; dayLeft: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/ai${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Erreur"), { data });
  return data as T;
}

export default function A30IA() {
  const navigate = useNavigate();
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshConvs = useCallback(async () => {
    try {
      const d = await api<{ conversations: Conv[] }>("/conversations");
      setConvs(d.conversations);
    } catch {
      /* silencieux */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ models: string[]; usage: Usage }>("/models");
        setModels(d.models);
        setModel(d.models[0] ?? "");
        setUsage(d.usage);
      } catch (e: any) {
        setError(e.message);
      }
    })();
    refreshConvs();
  }, [refreshConvs]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const openConv = async (id: string) => {
    setError("");
    setMenuOpen(false);
    try {
      const d = await api<{ id: string; model: string; messages: Msg[] }>(`/conversations/${id}`);
      setConvId(d.id);
      setMessages(d.messages);
      if (models.includes(d.model)) setModel(d.model);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const newConv = () => {
    setConvId(null);
    setMessages([]);
    setError("");
    setMenuOpen(false);
  };

  const removeConv = async (id: string) => {
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      if (id === convId) newConv();
      refreshConvs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !model) return;
    setError("");
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text }]);
    try {
      const d = await api<{ conversationId: string; message: Msg; usage: Usage }>("/chat", {
        method: "POST",
        body: JSON.stringify({ conversationId: convId, model, message: text }),
      });
      setConvId(d.conversationId);
      setMessages((m) => [...m, d.message]);
      setUsage(d.usage);
      refreshConvs();
    } catch (e: any) {
      setError(e.message);
      if (e.data?.conversationId) setConvId(e.data.conversationId);
      if (e.data?.usage) setUsage(e.data.usage);
    } finally {
      setLoading(false);
    }
  };

  const sidebar = (
    <div className="flex h-full w-full flex-col bg-gray-100 p-3">
      <button onClick={newConv} className={`mb-3 rounded-lg px-4 py-2 text-sm font-semibold ${BRAND}`}>
        Nouvelle conversation
      </button>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {convs.length === 0 && <p className="p-2 text-sm text-gray-600">Aucune conversation.</p>}
        {convs.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              c.id === convId ? "bg-blue-100 text-blue-900" : "hover:bg-gray-200"
            }`}
          >
            <button onClick={() => openConv(c.id)} className="flex-1 truncate text-left">
              {c.title}
            </button>
            <button
              onClick={() => removeConv(c.id)}
              aria-label="Supprimer la conversation"
              className="ml-2 rounded px-2 text-red-600 hover:bg-red-100"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-white">
      <aside className="hidden w-72 shrink-0 md:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="h-full w-4/5 max-w-xs">{sidebar}</div>
          <button
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-y-0 right-0 w-1/5 min-w-[3rem] bg-black/40"
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 bg-blue-600 px-3 py-3 text-white">
          <button onClick={() => navigate(-1)} className="rounded px-2 py-1 text-sm hover:bg-blue-700">
            Retour
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded px-2 py-1 text-sm hover:bg-blue-700 md:hidden"
          >
            Historique
          </button>
          <h1 className="flex-1 text-base font-bold">A30 IA</h1>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Choisir le modele"
            className="max-w-[45%] rounded-lg bg-white px-2 py-1 text-sm text-gray-900 outline-none"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </header>

        {usage && (
          <p className="bg-gray-100 px-4 py-1 text-xs text-gray-700">
            Restant : {usage.hourLeft} message(s) cette heure, {usage.dayLeft} aujourd'hui
          </p>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <p className="mt-10 text-center text-gray-600">
              Pose ta question a A30 IA : produits, vente, livraison, paiement.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <p className="text-sm text-gray-600">A30 IA ecrit...</p>}
          {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-2 bg-white p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={2000}
            rows={1}
            placeholder="Ecris ton message"
            className="max-h-32 flex-1 resize-none rounded-xl bg-gray-100 px-3 py-2 text-sm outline-none focus:bg-gray-200"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim() || !model}
            className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:bg-gray-300 disabled:text-gray-500 ${BRAND}`}
          >
            Envoyer
          </button>
        </div>
      </main>
    </div>
  );
}
