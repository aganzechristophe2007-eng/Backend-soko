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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 selection:bg-indigo-600 selection:text-white">
      
      {/* Conteneur principal SaaS Centré */}
      <div className="max-w-md w-full mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
        
        {/* En-tête */}
        <div className="mb-6">
          <Link 
            to="/" 
            className="inline-flex items-center space-x-1.5 text-slate-500 hover:text-slate-900 text-xs font-medium mb-4 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour à l'accueil</span>
          </Link>
          
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Créer un compte</h1>
            <div className="flex items-center space-x-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Sécurisé</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Plateforme de grande envergure - Inscription officielle</p>
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
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nom complet
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus-within:border-indigo-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-600/10 transition">
              <User className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" />
              <input 
                type="text" 
                name="name" 
                required
                placeholder="Ex: Jean Mukendi" 
                value={formData.name}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Adresse Email
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus-within:border-indigo-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-600/10 transition">
              <Mail className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" />
              <input 
                type="email" 
                name="email" 
                required
                placeholder="nom@domaine.com" 
                value={formData.email}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Téléphone <span className="text-slate-400 font-normal">(Optionnel)</span>
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus-within:border-indigo-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-600/10 transition">
              <Phone className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" />
              <input 
                type="tel" 
                name="phone" 
                placeholder="+243..." 
                value={formData.phone}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Mot de passe
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus-within:border-indigo-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-600/10 transition">
              <Lock className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" />
              <input 
                type="password" 
                name="password" 
                required
                placeholder="8 caractères minimum" 
                value={formData.password}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Confirmer le mot de passe
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 focus-within:border-indigo-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-600/10 transition">
              <Lock className="w-4 h-4 mr-2.5 text-slate-400 flex-shrink-0" />
              <input 
                type="password" 
                name="confirmPassword" 
                required
                placeholder="Répétez le mot de passe" 
                value={formData.confirmPassword}
                onChange={handleChange}
                className="bg-transparent border-none outline-none w-full text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-2 py-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-medium text-sm transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-slate-900/10"
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
        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Déjà inscrit sur la plateforme ?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold transition">
              Se connecter
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}