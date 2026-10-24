import React, { useEffect, useState } from 'react';
import { BellRing, UserX } from 'lucide-react';
import { api } from '../../lib/http';
import { getMediaUrl } from '../../lib/media';
import { disablePush, enablePush, getPushState, PushUiState } from '../../lib/push';
import type { Preferences, PreferencesPatch } from '../../lib/settingsApi';
import { ChoiceRow, errMsg, Field, GroupLabel, inputCls, Notice, Panel, PrimaryButton, SecondaryButton, SectionHeading, Spinner, ToggleRow } from './ui';

interface SectionProps {
  prefs: Preferences | null;
  save: (patch: PreferencesPatch) => Promise<boolean>;
}

const Divider = () => <div className="mx-4 h-px bg-[#EAECF0]" aria-hidden="true" />;

/* ------------------------------ Confidentialité ------------------------------ */
interface BlockedUser { id: string; name: string; avatar: string | null }

function BlockedUsers() {
  const [list, setList] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ data: BlockedUser[] }>('/settings/blocks')
      .then((res) => { if (!cancelled) setList(res.data); })
      .catch((e) => { if (!cancelled) setError(errMsg(e, 'Impossible de charger la liste.')); });
    return () => { cancelled = true; };
  }, []);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await api(`/settings/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setList((prev) => prev?.filter((u) => u.id !== id) ?? prev);
    } catch (e) {
      setError(errMsg(e, 'Déblocage impossible.'));
    } finally {
      setBusyId(null);
    }
  };

  if (list === null && !error) return <Spinner label="Chargement..." />;
  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {list && list.length === 0 && (
        <Panel className="flex items-center gap-3 p-4 text-sm text-[#667085]">
          <UserX className="h-5 w-5 flex-shrink-0" aria-hidden="true" /> Vous n'avez bloqué personne.
        </Panel>
      )}
      {list && list.length > 0 && (
        <Panel>
          {list.map((u, i) => (
            <React.Fragment key={u.id}>
              {i > 0 && <Divider />}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF1E7] text-sm font-bold text-[#FF6B00]">
                  {u.avatar ? <img src={getMediaUrl(u.avatar)} alt="" className="h-full w-full object-cover" /> : u.name.charAt(0)}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{u.name}</p>
                <SecondaryButton onClick={() => unblock(u.id)} busy={busyId === u.id} className="h-10 px-4">Débloquer</SecondaryButton>
              </div>
            </React.Fragment>
          ))}
        </Panel>
      )}
    </div>
  );
}

export function PrivacySection({ prefs, save }: SectionProps) {
  if (!prefs) return <Spinner label="Chargement de vos paramètres..." />;
  return (
    <div>
      <SectionHeading title="Confidentialité" description="Choisissez qui peut voir votre profil et vous écrire." />
      <Panel>
        <ChoiceRow
          title="Qui peut voir mon profil public"
          description="Votre page vendeur, vos annonces et votre note."
          value={prefs.privacy.profileVisibility}
          options={[{ id: 'everyone', label: 'Tout le monde' }, { id: 'members', label: 'Membres connectés' }]}
          onChange={(v) => save({ privacy: { profileVisibility: v } })}
        />
        <Divider />
        <ToggleRow
          title="Recevoir des messages de personnes inconnues"
          description="Désactivé : seules les personnes avec qui vous avez déjà échangé ou commandé peuvent vous écrire."
          checked={prefs.privacy.allowMessagesFromStrangers}
          onChange={(v) => save({ privacy: { allowMessagesFromStrangers: v } })}
        />
      </Panel>

      <GroupLabel>Utilisateurs bloqués</GroupLabel>
      <p className="mb-3 px-1 text-xs text-[#667085]">Une personne bloquée ne peut plus vous écrire, ni vous commander d'article, ni vous envoyer de notifications. Pour bloquer quelqu'un, ouvrez sa conversation.</p>
      <BlockedUsers />
    </div>
  );
}

/* ------------------------------ Notifications ------------------------------ */
function PushDeviceCard() {
  const [state, setState] = useState<PushUiState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPushState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (state === 'on') {
        await disablePush();
        setState(await getPushState());
        setMessage('Notifications push désactivées sur cet appareil.');
      } else {
        const result = await enablePush();
        if (result === 'on') {
          setState(await getPushState());
          setMessage('Notifications push activées sur cet appareil.');
        } else if (result === 'dismissed') {
          setMessage("Aucun choix fait : les notifications restent désactivées.");
        } else {
          setState(result);
        }
      }
    } catch (e) {
      setMessage(errMsg(e, 'Activation impossible pour le moment.'));
    } finally {
      setBusy(false);
    }
  };

  const text: Record<string, string> = {
    checking: 'Vérification en cours...',
    on: 'Cet appareil reçoit les alertes même site fermé.',
    off: "Votre navigateur vous demandera l'autorisation : touchez « Autoriser ».",
    unsupported: "Ce navigateur ne gère pas les notifications push. Sur iPhone, ajoutez d'abord CBF SOKO à l'écran d'accueil.",
    unavailable: "Les notifications push ne sont pas encore disponibles sur ce serveur. Vos notifications restent visibles dans l'application.",
    denied: "Les notifications sont bloquées pour ce site : autorisez-les dans les réglages de votre navigateur, puis revenez ici.",
  };

  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Notifications push sur cet appareil</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">{text[state]}</p>
          {message && <p role="status" className="mt-1.5 text-xs font-semibold text-[#C94F00]">{message}</p>}
          {(state === 'on' || state === 'off') && (
            <div className="mt-3">
              {state === 'on'
                ? <SecondaryButton onClick={toggle} busy={busy} className="h-10 px-4">Désactiver</SecondaryButton>
                : <PrimaryButton onClick={toggle} busy={busy} className="h-10 px-4">Activer</PrimaryButton>}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function NotificationsSection({ prefs, save }: SectionProps) {
  if (!prefs) return <Spinner label="Chargement de vos paramètres..." />;
  const n = prefs.notifications;
  const set = (key: keyof Preferences['notifications']) => (v: boolean) => save({ notifications: { [key]: v } });
  return (
    <div>
      <SectionHeading title="Notifications" description="Choisissez ce qui mérite de vous alerter." />
      <PushDeviceCard />

      <GroupLabel>Types de notifications</GroupLabel>
      <Panel>
        <ToggleRow title="Commandes" description="Nouvelle commande, confirmation, livraison, annulation." checked={n.orders} onChange={set('orders')} />
        <Divider />
        <ToggleRow title="Messages et appels manqués" checked={n.messages} onChange={set('messages')} />
        <Divider />
        <ToggleRow title="Nouveaux produits" description="Produits publiés par les vendeurs." checked={n.products} onChange={set('products')} />
        <Divider />
        <ToggleRow title="Nouvelles boutiques" description="Quand une boutique ouvre sur CBF SOKO." checked={n.shops} onChange={set('shops')} />
        <Divider />
        <ToggleRow title="Paiements et portefeuille" checked={n.payments} onChange={set('payments')} />
      </Panel>
    </div>
  );
}

/* ------------------------------ Boutique : mode vacances ------------------------------ */
export function VacationSection({ prefs, save }: SectionProps) {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (prefs) setNote(prefs.shop.vacationNote); }, [prefs?.shop.vacationNote]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prefs) return <Spinner label="Chargement de vos paramètres..." />;
  const saveNote = async () => {
    const ok = await save({ shop: { vacationNote: note.trim() } });
    setSaved(ok);
    if (ok) window.setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div>
      <SectionHeading title="Mode vacances" description="Vos annonces restent visibles, mais personne ne peut les commander pendant votre absence." />
      <Panel>
        <ToggleRow
          title="Activer le mode vacances"
          description="Les acheteurs voient que vous êtes absent et ne peuvent pas passer commande."
          checked={prefs.shop.vacationMode}
          onChange={(v) => save({ shop: { vacationMode: v } })}
        />
      </Panel>
      <GroupLabel>Message pour les acheteurs</GroupLabel>
      <Panel className="space-y-3 p-4">
        <Field label="Message (facultatif)" hint="Ex. : De retour le 5 novembre.">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="De retour le..." className={inputCls} />
        </Field>
        <PrimaryButton onClick={saveNote}>Enregistrer le message</PrimaryButton>
        {saved && <Notice tone="success">Message enregistré.</Notice>}
      </Panel>
    </div>
  );
}

/* ------------------------------ Adresse de livraison par défaut ------------------------------ */
export function DeliverySection({ prefs, save }: SectionProps) {
  const [form, setForm] = useState<Preferences['delivery'] | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { if (prefs && !form) setForm(prefs.delivery); }, [prefs, form]);

  if (!prefs || !form) return <Spinner label="Chargement de vos paramètres..." />;
  const set = (key: keyof Preferences['delivery']) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async () => {
    setState('saving');
    const ok = await save({ delivery: form });
    setState(ok ? 'saved' : 'error');
    if (ok) window.setTimeout(() => setState('idle'), 2500);
  };

  return (
    <div>
      <SectionHeading title="Adresse de livraison" description="Elle pré-remplit la fenêtre « Me faire livrer » pour commander plus vite." />
      <Panel className="space-y-3 p-4">
        <Field label="Nom de la personne qui reçoit"><input value={form.recipientName} onChange={set('recipientName')} maxLength={80} className={inputCls} /></Field>
        <Field label="Téléphone"><input value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={20} placeholder="0997654321" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ville"><input value={form.city} onChange={set('city')} maxLength={60} className={inputCls} /></Field>
          <Field label="Commune"><input value={form.commune} onChange={set('commune')} maxLength={60} className={inputCls} /></Field>
        </div>
        <Field label="Quartier"><input value={form.quarter} onChange={set('quarter')} maxLength={60} className={inputCls} /></Field>
        <Field label="Adresse précise" hint="Avenue, numéro."><input value={form.address} onChange={set('address')} maxLength={200} className={inputCls} /></Field>
        <Field label="Point de repère"><input value={form.landmark} onChange={set('landmark')} maxLength={120} placeholder="Près de l'église, en face de la pharmacie..." className={inputCls} /></Field>
        <PrimaryButton onClick={submit} busy={state === 'saving'}>Enregistrer l'adresse</PrimaryButton>
        {state === 'saved' && <Notice tone="success">Adresse enregistrée.</Notice>}
        {state === 'error' && <Notice tone="error">Enregistrement impossible. Vérifiez les champs et réessayez.</Notice>}
      </Panel>
    </div>
  );
}
