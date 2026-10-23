import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Plus, Trash2, X } from "lucide-react";
import A30Icon from "../components/A30icon";

const API = ((import.meta as any).env?.VITE_API_URL ?? "").replace(/\/$/, "");

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Conv = { id: string; title: string; updatedAt: string };
type Usage = { hourLeft: number; dayLeft: number };

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

// Regroupe l'historique comme ChatGPT / Claude : Aujourd'hui, Hier, 7 derniers jours...
function groupConvs(convs: Conv[]): { label: string; items: Conv[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const DAY = 86_400_000;
  const groups: Record<string, Conv[]> = {
    "Aujourd'hui": [],
    Hier: [],
    "7 derniers jours": [],
    "Plus ancien": [],
  };
  for (const c of convs) {
    const diff = today - startOfDay(new Date(c.updatedAt));
    if (diff <= 0) groups["Aujourd'hui"].push(c);
    else if (diff <= DAY) groups["Hier"].push(c);
    else if (diff <= 7 * DAY) groups["7 derniers jours"].push(c);
    else groups["Plus ancien"].push(c);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;

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
  const [open, setOpen] = useState(() => !isMobile()); // historique : ouvert sur PC, fermé sur mobile
  const [vh, setVh] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Hauteur réelle de l'écran visible : la barre de saisie reste collée au bas, même avec le clavier mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVh(vv.height);
      window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

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
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Champ de saisie qui grandit avec le texte (jusqu'à 8 lignes environ)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const closeOnMobile = () => {
    if (isMobile()) setOpen(false);
  };

  const openConv = async (id: string) => {
    setError("");
    closeOnMobile();
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
    closeOnMobile();
    taRef.current?.focus();
  };

  const removeConv = async (id: string) => {
    if (!window.confirm("Supprimer cette conversation ?")) return;
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
    const tmpId = `tmp-${Date.now()}`;
    setError("");
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { id: tmpId, role: "user", content: text }]);
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
      // On retire le message non enregistré et on rend le texte à l'utilisateur
      setMessages((m) => m.filter((x) => x.id !== tmpId));
      setInput(text);
      setError(e.message);
      if (e.data?.conversationId) setConvId(e.data.conversationId);
      if (e.data?.usage) setUsage(e.data.usage);
    } finally {
      setLoading(false);
    }
  };

  const groups = groupConvs(convs);

  return (
    <div
      className="fixed inset-x-0 top-0 flex overflow-hidden bg-white"
      style={{ height: vh ?? "100dvh" }}
    >
      {/* Fond sombre derrière l'historique (mobile) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Historique */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85%] flex-col bg-orange-50 shadow-xl transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:shadow-none ${
          open ? "translate-x-0 md:flex" : "-translate-x-full md:hidden"
        }`}
        aria-label="Historique des conversations"
      >
        <div className="flex items-center justify-between bg-orange-500 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
          <span className="flex items-center gap-2 font-bold">
            <A30Icon className="h-5 w-5" />
            Historique
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer l'historique"
            className="rounded-full p-1.5 hover:bg-orange-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newConv}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Nouvelle conversation
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-600">Aucune conversation pour le moment.</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold text-orange-700">{g.label}</p>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-lg text-sm ${
                    c.id === convId ? "bg-green-100 text-green-900" : "text-gray-800 hover:bg-orange-100"
                  }`}
                >
                  <button
                    onClick={() => openConv(c.id)}
                    className="min-w-0 flex-1 truncate px-3 py-2.5 text-left"
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => removeConv(c.id)}
                    aria-label={`Supprimer ${c.title}`}
                    className="mr-1 rounded-md p-2 text-gray-500 hover:bg-red-100 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Zone de discussion */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 bg-orange-500 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
          <button
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="rounded-full p-2 hover:bg-orange-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* L'icône A30 ouvre / ferme l'historique */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Afficher l'historique des conversations"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-orange-600 active:bg-orange-700"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-orange-600">
              <A30Icon className="h-5 w-5" />
            </span>
            <span className="text-base font-bold">A30 IA</span>
          </button>

          <div className="flex-1" />

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Choisir le modèle"
            className="max-w-[40%] truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-900 outline-none"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </header>

        {/* Messages : seule cette zone défile */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3 px-4 py-4">
            {messages.length === 0 && !loading && (
              <div className="my-auto flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white">
                  <A30Icon className="h-9 w-9" />
                </span>
                <h2 className="text-lg font-bold text-gray-900">Comment puis-je t'aider ?</h2>
                <p className="max-w-xs text-sm text-gray-600">
                  Pose ta question sur les produits, la vente, la livraison ou le paiement.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                    <A30Icon className="h-4 w-4" />
                  </span>
                )}
                <div
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-md bg-green-600 text-white"
                      : "rounded-bl-md bg-orange-50 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <A30Icon className="h-4 w-4" />
                </span>
                <div className="flex gap-1 rounded-2xl rounded-bl-md bg-orange-50 px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-orange-400" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Barre de saisie : toujours en bas de l'écran */}
        <footer className="shrink-0 border-t border-orange-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex items-end gap-2 rounded-3xl bg-orange-50 py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-orange-300">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Entrée envoie sur ordinateur ; sur téléphone, Entrée = nouvelle ligne
                  const desktop = window.matchMedia("(pointer: fine)").matches;
                  if (e.key === "Enter" && !e.shiftKey && desktop) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={2000}
                rows={1}
                placeholder="Écris ton message"
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-base text-gray-900 outline-none placeholder:text-gray-500"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim() || !model}
                aria-label="Envoyer"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600 disabled:bg-gray-300 disabled:text-gray-500"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
            {usage && (
              <p className="mt-1.5 text-center text-[11px] text-gray-500">
                {usage.hourLeft} message(s) restant(s) cette heure · {usage.dayLeft} aujourd'hui
              </p>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}