import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import A30Icon from "../components/A30icon";

const API = ((import.meta as any).env?.VITE_API_URL ?? "").replace(/\/$/, "");

// Couleurs de la plateforme : orange, vert, blanc (à ajuster ici si besoin)
const ORANGE_BTN = "bg-orange-500 text-white hover:bg-orange-600";
const GREEN_BADGE = "bg-green-600 text-white";

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Conv = { id: string; title: string; updatedAt: string };
type Usage = { hourLeft: number; dayLeft: number };

// Si ton app envoie le token autrement (autre nom de clé), adapte cette fonction.
function authHeaders(): Record<string, string> {
  try {
    const t =
      localStorage.getItem("token") ??
      localStorage.getItem("accessToken") ??
      localStorage.getItem("authToken");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // VITE_API_URL vaut déjà "/api" sur ton projet : on ajoute seulement "/ai".
  const res = await fetch(`${API}/ai${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? data.message ?? "Erreur"), { data });
  }
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
    <div className="flex h-full w-full flex-col bg-orange-50 p-3">
      <button
        onClick={newConv}
        className={`mb-3 flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${ORANGE_BTN}`}
      >
        <A30Icon className="h-4 w-4" />
        Nouvelle conversation
      </button>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {convs.length === 0 && <p className="p-2 text-sm text-gray-600">Aucune conversation.</p>}
        {convs.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              c.id === convId ? "bg-green-100 text-green-900" : "hover:bg-orange-100"
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
        <header className="flex items-center gap-2 bg-orange-500 px-3 py-3 text-white">
          <button onClick={() => navigate(-1)} className="rounded px-2 py-1 text-sm hover:bg-orange-600">
            Retour
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded px-2 py-1 text-sm hover:bg-orange-600 md:hidden"
          >
            Historique
          </button>
          <h1 className="flex flex-1 items-center gap-2 text-base font-bold">
            <A30Icon className="h-5 w-5" />
            A30 IA
          </h1>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Choisir le modèle"
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
          <p className="bg-green-50 px-4 py-1 text-xs text-green-800">
            Restant : {usage.hourLeft} message(s) cette heure, {usage.dayLeft} aujourd'hui
          </p>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <span className={`flex h-16 w-16 items-center justify-center rounded-full ${GREEN_BADGE}`}>
                <A30Icon className="h-9 w-9" />
              </span>
              <p className="max-w-xs text-gray-700">
                Pose ta question à A30 IA : produits, vente, livraison, paiement.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <span
                  className={`mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${GREEN_BADGE}`}
                >
                  <A30Icon className="h-4 w-4" />
                </span>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user" ? "bg-green-600 text-white" : "bg-orange-50 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <A30Icon className="h-4 w-4 animate-pulse" />
              A30 IA écrit...
            </div>
          )}
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
            placeholder="Écris ton message"
            className="max-h-32 flex-1 resize-none rounded-xl bg-orange-50 px-3 py-2 text-sm outline-none focus:bg-orange-100"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim() || !model}
            className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:bg-gray-300 disabled:text-gray-500 ${ORANGE_BTN}`}
          >
            Envoyer
          </button>
        </div>
      </main>
    </div>
  );
}