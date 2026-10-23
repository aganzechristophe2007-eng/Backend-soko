import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, Phone, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations rigoureuses côté client avant l'appel réseau
    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    if (formData.password.length < 8) {
      setError('Le mot de passe sécurisé doit comporter au moins 8 caractères.');
      return;
    }

    setLoading(true);

    try {
      // Connexion sécurisée vers le backend en production (Port 5000)
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.toLowerCase().trim(),
          phone: formData.phone ? formData.phone.trim() : null,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création du compte.');
      }

      // Redirection propre vers la page de connexion après succès
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Une erreur réseau est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111111] flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 selection:bg-[#FF6B00] selection:text-white">
      
      {/* Conteneur principal SaaS Centré */}
      <div className="max-w-md w-full mx-auto bg-white border border-[#EAECF0] rounded-3xl p-6 sm:p-8 shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
        
        {/* En-tête */}
        <div className="mb-6">
          <Link 
            to="/" 
            className="inline-flex items-center space-x-1.5 text-[#667085] hover:text-[#FF6B00] text-xs font-medium mb-4 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour à l'accueil</span>
          </Link>
          
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">Créer un compte</h1>
            <div className="flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Sécurisé</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[#667085] mt-1">Plateforme de grande envergure - Inscription officielle</p>
        </div>

        {/* Message d'erreur dynamique */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium animate-fadeIn">
            {error}
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-[#344054] uppercase tracking-wider mb-1.5">
              Nom complet
            </label>
            <div className="flex items-center rounded-xl border border-[#D0D5DD] bg-white px-3.5 py-2.5 text-[#111111] focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 transition">
              <User className="w-4 h-4 mr-2.5 text-[#98A2B3] flex-shrink-0" />
              <input 
                type="text" 
                name="name" 
                required
                placeholder="Ex: Jean Mukendi" 
                value={formData.name}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-[#111111] placeholder:text-[#98A2B3]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] uppercase tracking-wider mb-1.5">
              Adresse Email
            </label>
            <div className="flex items-center rounded-xl border border-[#D0D5DD] bg-white px-3.5 py-2.5 text-[#111111] focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 transition">
              <Mail className="w-4 h-4 mr-2.5 text-[#98A2B3] flex-shrink-0" />
              <input 
                type="email" 
                name="email" 
                required
                placeholder="nom@domaine.com" 
                value={formData.email}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-[#111111] placeholder:text-[#98A2B3]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] uppercase tracking-wider mb-1.5">
              Téléphone <span className="text-[#98A2B3] font-normal">(Optionnel)</span>
            </label>
            <div className="flex items-center rounded-xl border border-[#D0D5DD] bg-white px-3.5 py-2.5 text-[#111111] focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 transition">
              <Phone className="w-4 h-4 mr-2.5 text-[#98A2B3] flex-shrink-0" />
              <input 
                type="tel" 
                name="phone" 
                placeholder="+243..." 
                value={formData.phone}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-[#111111] placeholder:text-[#98A2B3]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] uppercase tracking-wider mb-1.5">
              Mot de passe
            </label>
            <div className="flex items-center rounded-xl border border-[#D0D5DD] bg-white px-3.5 py-2.5 text-[#111111] focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 transition">
              <Lock className="w-4 h-4 mr-2.5 text-[#98A2B3] flex-shrink-0" />
              <input 
                type="password" 
                name="password" 
                required
                placeholder="8 caractères minimum" 
                value={formData.password}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-[#111111] placeholder:text-[#98A2B3]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] uppercase tracking-wider mb-1.5">
              Confirmer le mot de passe
            </label>
            <div className="flex items-center rounded-xl border border-[#D0D5DD] bg-white px-3.5 py-2.5 text-[#111111] focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 transition">
              <Lock className="w-4 h-4 mr-2.5 text-[#98A2B3] flex-shrink-0" />
              <input 
                type="password" 
                name="confirmPassword" 
                required
                placeholder="Répétez le mot de passe" 
                value={formData.confirmPassword}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-[#111111] placeholder:text-[#98A2B3]"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-2 py-3.5 bg-[#FF6B00] hover:bg-[#E85F00] text-white rounded-full font-semibold text-sm transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Traitement sécurisé en cours...</span>
              </>
            ) : (
              <span>Créer mon compte</span>
            )}
          </button>
        </form>

        {/* Pied de page du formulaire */}
        <div className="mt-6 pt-5 border-t border-[#EAECF0] text-center">
          <p className="text-xs text-[#667085]">
            Déjà inscrit sur la plateforme ?{' '}
            <Link to="/login" className="text-[#FF6B00] hover:text-[#E85F00] font-semibold transition">
              Se connecter
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}