import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Camera,
  Video,
  Tag,
  Loader2,
  X,
  Plus,
  Scale,
  Layers,
  AlertCircle,
  MapPin,
  DollarSign,
  Package,
  Check,
  Sparkles,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
}

// URL du backend (Render en prod, VITE_API_URL en local via .env)
const API_URL = import.meta.env.VITE_API_URL as string;

// Suggestion renvoyée par l'assistant IA (POST /api/products/analyze)
interface AiSuggestion {
  title: string;
  description: string;
  categoryId: string | null;
  priceUSD: number | null;
  weightKg: number | null;
  state: string | null;
}
const VALID_STATES = ['NEUF', 'OCCASION_BON_ETAT', 'OCCASION_MOYEN'];

// Réduit une photo (800 px max, JPEG) avant de l'envoyer à l'IA : moins de données mobiles consommées
const resizeForAnalysis = async (file: File, maxSize = 800): Promise<Blob> => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    return blob || file;
  } catch {
    return file;
  }
};

// Étapes du tunnel de publication (correspond aux maquettes : Médias > Détails > Stock/Lieu > Publier)
const STEPS = ['media', 'details', 'stock', 'publish'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  media: 'Médias',
  details: 'Détails',
  stock: 'Stock/Lieu',
  publish: 'Publier',
};

export default function CreateProduct() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState('');

  const [step, setStep] = useState<Step>('media');
  const stepIndex = STEPS.indexOf(step);

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  // Article publié : rempli après une création réussie, avec le code renvoyé par le backend (stocké en base)
  const [createdProduct, setCreatedProduct] = useState<{ id?: string; sku?: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priceUSD: '',
    priceCDF: '',
    quantity: '1',
    weight: '',
    state: 'NEUF',
    type: 'SALE',
    location: '',
    categoryId: ''
  });

  // Nettoyage des objets en mémoire (revokeObjectURL) pour éviter les fuites RAM.
  // Corrigé pour ne révoquer qu'au démontage réel du composant : avec [photoPreviews, videoPreview]
  // en dépendances, chaque nouvelle photo ajoutée révoquait la précédente avant même d'être affichée.
  const photoPreviewsRef = useRef<string[]>([]);
  const videoPreviewRef = useRef<string | null>(null);
  useEffect(() => { photoPreviewsRef.current = photoPreviews; }, [photoPreviews]);
  useEffect(() => { videoPreviewRef.current = videoPreview; }, [videoPreview]);
  useEffect(() => {
    return () => {
      photoPreviewsRef.current.forEach(url => URL.revokeObjectURL(url));
      if (videoPreviewRef.current) URL.revokeObjectURL(videoPreviewRef.current);
    };
  }, []);

  // Chargement dynamique des catégories avec les cookies de session inclus
  useEffect(() => {
    fetch(`${API_URL}/categories`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.categories) {
          setCategories(data.categories);
        }
      })
      .catch(err => console.error('Erreur lors du chargement des catégories:', err));
  }, []);

  const handlePhotoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    // Validation sécurisée : Vérification stricte des types MIME autorisés
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const invalidFile = filesArray.find(file => !validImageTypes.includes(file.type));

    if (invalidFile) {
      setError('Format non supporté. Veuillez uniquement sélectionner des images JPG, PNG ou WEBP.');
      return;
    }

    if (photoFiles.length + filesArray.length > 7) {
      setError('Vous ne pouvez pas dépasser un total de 7 photos.');
      return;
    }

    setError('');
    const newFiles = [...photoFiles, ...filesArray];
    setPhotoFiles(newFiles);

    const newPreviews = filesArray.map(file => URL.createObjectURL(file));
    setPhotoPreviews([...photoPreviews, ...newPreviews]);
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]); // Libération de la mémoire de l'image supprimée
    setPhotoFiles(photoFiles.filter((_, i) => i !== index));
    setPhotoPreviews(photoPreviews.filter((_, i) => i !== index));
  };

  const handleVideoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validation du type vidéo
      if (!file.type.startsWith('video/')) {
        setError('Le fichier sélectionné doit être une vidéo valide.');
        return;
      }

      setError('');
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // La quantité maximale dépend du type de vente (détail = 4 max, gros = 8 douzaines = 96 max)
    if (name === 'quantity') {
      const max = formData.type === 'GROS' ? 96 : 4;
      const clamped = Math.max(1, Math.min(Number(value) || 1, max));
      setFormData(prev => ({ ...prev, quantity: String(clamped) }));
      return;
    }

    setFormData({ ...formData, [name]: value });
  };

  // Changement de type de vente : recalcule aussi la quantité si elle dépasse le nouveau maximum
  const handleSaleTypeChange = (type: string) => {
    const max = type === 'GROS' ? 96 : 4;
    setFormData(prev => ({
      ...prev,
      type,
      quantity: String(Math.min(Number(prev.quantity) || 1, max))
    }));
  };

  // Assistant IA : propose titre, description, catégorie, état (et prix/poids si vides) à partir des photos
  const handleAiFill = async () => {
    if (aiLoading || photoFiles.length === 0) return;
    setAiLoading(true);
    setError('');
    setAiNotice('');

    try {
      const data = new FormData();
      const resized = await Promise.all(photoFiles.slice(0, 3).map(file => resizeForAnalysis(file)));
      resized.forEach((blob, i) => data.append('images', blob, `photo-${i}.jpg`));

      const response = await fetch(`${API_URL}/products/analyze`, {
        method: 'POST',
        credentials: 'include',
        body: data,
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('Réponse invalide du serveur. Remplissez les champs manuellement.');
      }

      if (response.status === 401) {
        throw new Error('Session expirée ou non autorisée. Veuillez vous reconnecter.');
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || "L'assistant IA est indisponible. Remplissez les champs manuellement.");
      }

      const s: AiSuggestion = result.suggestion;
      setFormData(prev => ({
        ...prev,
        title: s.title || prev.title,
        description: s.description || prev.description,
        categoryId: s.categoryId || prev.categoryId,
        state: s.state && VALID_STATES.includes(s.state) ? s.state : prev.state,
        // Le prix et le poids ne sont jamais écrasés s'ils sont déjà remplis
        priceUSD: prev.priceUSD || (s.priceUSD != null ? String(s.priceUSD) : ''),
        weight: prev.weight || (s.weightKg != null ? String(s.weightKg) : ''),
      }));
      setAiNotice('Fiche pré-remplie par l’IA. Vérifiez le titre, la catégorie et surtout le prix et le poids, qui ne sont que des estimations.');
    } catch (err: any) {
      setError(err.message || "L'assistant IA est indisponible. Remplissez les champs manuellement.");
    } finally {
      setAiLoading(false);
    }
  };

  // Étape 1 -> 2
  const handleValidateMedia = () => {
    if (photoFiles.length < 3) {
      setError('Sélectionnez au moins 3 photos pour continuer (maximum 7).');
      return;
    }
    setError('');
    setStep('details');
  };

  // Étape 2 -> 3
  const handleValidateDetails = () => {
    if (!formData.title.trim()) {
      setError('Le titre du produit est requis.');
      return;
    }
    if (!formData.categoryId) {
      setError('Veuillez sélectionner une catégorie valide.');
      return;
    }
    setError('');
    setStep('stock');
  };

  // Étape 3 -> 4
  const handleValidateStock = () => {
    if (!formData.weight || Number(formData.weight) <= 0) {
      setError('Le poids de l’article est requis et doit être supérieur à 0.');
      return;
    }
    setError('');
    setStep('publish');
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      navigate('/');
      return;
    }
    setError('');
    setStep(STEPS[stepIndex - 1]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Anti double-clic

    if (photoFiles.length < 3) {
      setError('Il faut entre 3 et 7 photos obligatoires.');
      setStep('media');
      return;
    }

    if (!formData.categoryId) {
      setError('Veuillez sélectionner une catégorie valide.');
      setStep('details');
      return;
    }

    if (!formData.weight || Number(formData.weight) <= 0) {
      setError('Le poids de l’article est requis et doit être supérieur à 0.');
      setStep('stock');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = new FormData();
      photoFiles.forEach(file => data.append('images', file));
      if (videoFile) data.append('video', videoFile);

      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, value);
      });

      const response = await fetch(`${API_URL}/products`, {
        method: 'POST',
        credentials: 'include',
        body: data,
      });

      let result;
      try {
        result = await response.json();
      } catch (jsonErr) {
        throw new Error('Réponse serveur invalide (Erreur interne ou payload trop volumineux).');
      }

      if (response.status === 401) {
        throw new Error('Session expirée ou non autorisée. Veuillez vous reconnecter.');
      }

      if (!response.ok) {
        if (result.code === 'WEIGHT_MISMATCH') setStep('stock');
        throw new Error(result.error || result.message || 'Erreur serveur lors de la création.');
      }

      // Le produit créé (et son code, déjà stocké en base via son id/sku) est renvoyé par le backend.
      const created = result.product || result.data || result;
      setCreatedProduct({ id: created?.id, sku: created?.sku });
    } catch (err: any) {
      setError(err.message || 'Une erreur réseau est survenue. Vérifiez que le serveur backend est démarré.');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategoryName = categories.find(c => c.id === formData.categoryId)?.name;

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black border-b border-neutral-600 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => (createdProduct ? navigate('/') : handleBack())}
            className="p-2 rounded-full hover:bg-white/10 hover:text-white text-neutral-300 transition flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-base text-white truncate">Publier un article</h1>
            <p className="text-xs text-neutral-300">
              {createdProduct ? 'Publication terminée' : `Étape ${stepIndex + 1} sur ${STEPS.length} — ${STEP_LABELS[step]}`}
            </p>
          </div>
        </div>

        {/* Stepper */}
        {!createdProduct && (
        <div className="max-w-xl mx-auto flex items-center mt-3">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                    i < stepIndex
                      ? 'bg-[#c2410c] text-white'
                      : i === stepIndex
                      ? 'bg-white text-black'
                      : 'bg-black border border-neutral-600 text-neutral-400'
                  }`}
                >
                  {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-[10px] whitespace-nowrap ${i === stepIndex ? 'text-white font-semibold' : 'text-neutral-400'}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1.5 mb-4 ${i < stepIndex ? 'bg-[#c2410c]' : 'bg-neutral-600'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-5 p-3.5 rounded-lg bg-black border border-[#c2410c] text-white text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#c2410c]" />
            <span>{error}</span>
          </div>
        )}

        {createdProduct ? (
          <div className="space-y-5">
            <div className="bg-black border border-neutral-600 rounded-lg p-5 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#c2410c] flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Article publié avec succès</h2>
                <p className="text-xs text-neutral-300 mt-1">Code QR sécurisé généré et enregistré en base.</p>
              </div>

              <div className="bg-white rounded-lg p-4 inline-block">
                <QRCodeSVG
                  value={createdProduct.sku || createdProduct.id || formData.title}
                  size={176}
                  level="M"
                />
              </div>

              {(createdProduct.sku || createdProduct.id) && (
                <p className="text-xs text-neutral-300">
                  Code : <span className="text-white font-mono">{createdProduct.sku || createdProduct.id}</span>
                </p>
              )}
            </div>

            <div className="bg-black border border-neutral-600 rounded-lg p-4">
              <h2 className="font-bold text-white mb-3">Photos publiées ({photoPreviews.length})</h2>
              <div className="grid grid-cols-3 gap-2.5">
                {photoPreviews.map((url, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-black border border-neutral-600">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-3.5 bg-[#c2410c] hover:bg-[#a8380a] text-white rounded-xl font-bold text-sm transition"
            >
              Retour à l'accueil
            </button>
          </div>
        ) : (
        <>
        {/* ÉTAPE 1 : MÉDIAS */}
        {step === 'media' && (
          <div className="space-y-5">
            <div className="bg-black border border-neutral-600 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-black border border-neutral-600 flex items-center justify-center text-[#c2410c] flex-shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Photos de l'article</h2>
                  <p className="text-xs text-neutral-300">3 photos minimum, 7 maximum (JPG, PNG, WEBP).</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {photoPreviews.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-black border border-neutral-600">
                    <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black text-white hover:bg-[#c2410c] transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {photoFiles.length < 7 && (
                  <label className="aspect-square rounded-lg bg-black border border-neutral-600 hover:border-white transition flex flex-col items-center justify-center text-neutral-300 hover:text-white cursor-pointer">
                    <Plus className="w-6 h-6 mb-1 text-[#c2410c]" />
                    <span className="text-xs font-semibold">Ajouter</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      multiple
                      onChange={handlePhotoSelection}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="bg-black border border-neutral-600 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-black border border-neutral-600 flex items-center justify-center text-[#c2410c] flex-shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Vidéo d'accueil (optionnel)</h2>
                  <p className="text-xs text-neutral-300">Mise en avant dynamique dans les Reels.</p>
                </div>
              </div>

              {videoPreview ? (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video src={videoPreview} controls className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(videoPreview);
                      setVideoFile(null);
                      setVideoPreview(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black text-white hover:bg-[#c2410c] transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="w-full py-3.5 rounded-lg bg-black border border-neutral-600 hover:border-white transition text-sm font-semibold flex items-center justify-center gap-2 text-white cursor-pointer">
                  <Video className="w-4 h-4 text-[#c2410c]" />
                  <span>Sélectionner une vidéo</span>
                  <input type="file" accept="video/mp4, video/webm, video/quicktime" onChange={handleVideoSelection} className="hidden" />
                </label>
              )}
            </div>

            <button
              type="button"
              disabled={photoFiles.length < 3}
              onClick={handleValidateMedia}
              className="w-full py-3.5 bg-[#c2410c] hover:bg-[#a8380a] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition"
            >
              Continuer ({photoFiles.length}/7 photos)
            </button>
          </div>
        )}

        {/* ÉTAPE 2 : DÉTAILS */}
        {step === 'details' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {photoPreviews.map((url, idx) => (
                <img key={idx} src={url} alt="Miniature" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              ))}
              <button
                type="button"
                onClick={() => setStep('media')}
                className="text-xs font-semibold text-[#c2410c] hover:underline px-2 flex-shrink-0"
              >
                Modifier
              </button>
            </div>

            <div className="bg-black border border-neutral-600 rounded-lg p-4 space-y-4">
              <h2 className="font-bold text-white">Détails du produit</h2>

              <button
                type="button"
                onClick={handleAiFill}
                disabled={aiLoading || photoFiles.length === 0}
                className="w-full py-3 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold transition flex items-center justify-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyse des photos en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#c2410c]" />
                    <span>Remplir automatiquement avec l’IA</span>
                  </>
                )}
              </button>
              {aiNotice && (
                <p className="text-xs text-white bg-black border border-[#c2410c] rounded-lg p-3">{aiNotice}</p>
              )}

              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">Nom du produit</label>
                <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                  <Tag className="w-4 h-4 mr-2.5 text-[#c2410c] flex-shrink-0" />
                  <input
                    type="text"
                    name="title"
                    required
                    maxLength={100}
                    placeholder="Ex: Appareil professionnel..."
                    value={formData.title}
                    onChange={handleChange}
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-neutral-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">Catégorie</label>
                <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                  <Layers className="w-4 h-4 mr-2.5 text-[#c2410c] flex-shrink-0" />
                  <select
                    name="categoryId"
                    required
                    value={formData.categoryId}
                    onChange={handleChange}
                    className="bg-transparent border-none outline-none w-full text-sm text-white cursor-pointer"
                  >
                    <option value="" className="bg-black border border-neutral-600 text-neutral-300">Sélectionnez une catégorie</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-black border border-neutral-600 text-white">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">Description</label>
                <textarea
                  name="description"
                  rows={4}
                  maxLength={2000}
                  placeholder="Description détaillée..."
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full rounded-lg bg-black border border-neutral-600 focus:border-[#c2410c] p-3.5 text-sm text-white placeholder:text-neutral-300 resize-none outline-none transition-colors"
                />
              </div>
            </div>

            <div className="bg-black border border-neutral-600 rounded-lg p-4 space-y-3">
              <h2 className="font-bold text-white">Options de vente</h2>
              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">Type de vente</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'DETAIL', label: 'Vente au détail' },
                    { value: 'GROS', label: 'Vente en gros' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSaleTypeChange(opt.value)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                        formData.type === opt.value
                          ? 'bg-[#c2410c] text-white'
                          : 'bg-black border border-neutral-600 text-neutral-300 hover:border-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  {formData.type === 'GROS'
                    ? 'Vente en gros : jusqu’à 96 unités (8 douzaines).'
                    : 'Vente au détail : 4 unités maximum.'}
                </p>
              </div>
            </div>

            <div className="bg-black border border-neutral-600 rounded-lg p-4 space-y-3">
              <h2 className="font-bold text-white">Prix et devises</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-300 mb-1.5">Prix (USD)</label>
                  <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                    <DollarSign className="w-4 h-4 mr-2 text-[#c2410c] flex-shrink-0" />
                    <input
                      type="number"
                      name="priceUSD"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.priceUSD}
                      onChange={handleChange}
                      className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-neutral-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-300 mb-1.5">Prix (CDF)</label>
                  <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                    <span className="mr-2 text-xs font-bold text-[#c2410c] flex-shrink-0">Fc</span>
                    <input
                      type="number"
                      name="priceCDF"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.priceCDF}
                      onChange={handleChange}
                      className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-neutral-300"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleValidateDetails}
              className="w-full py-3.5 bg-[#c2410c] hover:bg-[#a8380a] text-white rounded-xl font-bold text-sm transition"
            >
              Continuer vers le stock
            </button>
          </div>
        )}

        {/* ÉTAPE 3 : STOCK & LIEU */}
        {step === 'stock' && (
          <div className="space-y-5">
            <div className="bg-black border border-neutral-600 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-black border border-neutral-600 flex items-center justify-center text-[#c2410c] flex-shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <h2 className="font-bold text-white">Stock et lieu</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-300 mb-1.5">
                    Quantité <span className="text-neutral-400">(max {formData.type === 'GROS' ? 96 : 4})</span>
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    max={formData.type === 'GROS' ? 96 : 4}
                    required
                    value={formData.quantity}
                    onChange={handleChange}
                    className="w-full rounded-lg bg-black border border-neutral-600 focus:border-[#c2410c] px-3.5 py-3 text-sm text-white outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-300 mb-1.5">Poids (kg) *</label>
                  <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                    <Scale className="w-4 h-4 mr-2.5 text-[#c2410c] flex-shrink-0" />
                    <input
                      type="number"
                      name="weight"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Ex: 1.5"
                      value={formData.weight}
                      onChange={handleChange}
                      className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-neutral-300"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-300 mt-1.5">Poids d'une unité, vérifié par l'IA à partir des photos.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">État du produit</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'NEUF', label: 'Neuf' },
                    { value: 'OCCASION_BON_ETAT', label: 'Occasion — bon état' },
                    { value: 'OCCASION_MOYEN', label: 'Occasion — état moyen' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, state: opt.value })}
                      className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                        formData.state === opt.value
                          ? 'bg-white text-black'
                          : 'bg-black border border-neutral-600 text-neutral-300 hover:border-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-300 mb-1.5">Localisation</label>
                <div className="flex items-center rounded-lg bg-black border border-neutral-600 focus-within:border-[#c2410c] px-3.5 py-3 transition-colors">
                  <MapPin className="w-4 h-4 mr-2.5 text-[#c2410c] flex-shrink-0" />
                  <input
                    type="text"
                    name="location"
                    maxLength={100}
                    placeholder="Ex: Bagira, Bukavu"
                    value={formData.location}
                    onChange={handleChange}
                    className="bg-transparent border-none outline-none w-full text-sm text-white placeholder:text-neutral-300"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleValidateStock}
              className="w-full py-3.5 bg-[#c2410c] hover:bg-[#a8380a] text-white rounded-xl font-bold text-sm transition"
            >
              Continuer vers la publication
            </button>
          </div>
        )}

        {/* ÉTAPE 4 : PUBLIER */}
        {step === 'publish' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-black border border-neutral-600 rounded-lg p-4 space-y-4">
              <h2 className="font-bold text-white">Résumé de l'article</h2>

              <div>
                <p className="font-semibold text-white truncate">{formData.title || 'Sans titre'}</p>
                <p className="text-xs text-neutral-300 truncate mb-2">{selectedCategoryName || 'Catégorie non définie'}</p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {photoPreviews.map((url, idx) => (
                    <img key={idx} src={url} alt={`Photo ${idx + 1}`} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-black border border-neutral-600 rounded-lg p-3">
                  <p className="text-xs text-neutral-300 mb-0.5">Prix</p>
                  <p className="font-bold text-[#c2410c]">
                    {formData.priceUSD ? `$${formData.priceUSD}` : '—'}
                    {formData.priceCDF ? ` / Fc ${formData.priceCDF}` : ''}
                  </p>
                </div>
                <div className="bg-black border border-neutral-600 rounded-lg p-3">
                  <p className="text-xs text-neutral-300 mb-0.5">Stock</p>
                  <p className="font-bold text-white">{formData.quantity} unité(s) · {formData.weight || '—'} kg</p>
                </div>
                <div className="bg-black border border-neutral-600 rounded-lg p-3">
                  <p className="text-xs text-neutral-300 mb-0.5">État</p>
                  <p className="font-bold text-white">{formData.state.replace(/_/g, ' ')}</p>
                </div>
                <div className="bg-black border border-neutral-600 rounded-lg p-3">
                  <p className="text-xs text-neutral-300 mb-0.5">Localisation</p>
                  <p className="font-bold text-white truncate">{formData.location || '—'}</p>
                </div>
              </div>

              {formData.description && (
                <div>
                  <p className="text-xs text-neutral-300 mb-1">Description</p>
                  <p className="text-sm text-neutral-300 line-clamp-3">{formData.description}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#c2410c] hover:bg-[#a8380a] disabled:opacity-50 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Vérification et publication...</span>
                </>
              ) : (
                <span>Publier l'article</span>
              )}
            </button>
          </form>
        )}
        </>
        )}
      </main>
    </div>
  );
}