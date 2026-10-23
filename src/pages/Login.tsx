import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext'; // 👈 Import du contexte

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth(); // 👈 Récupération de la fonction login du contexte

  const handleSuccess = (user: any, token: string) => {
    // Enregistre l'utilisateur globalement dans toute l'application
    login(user);

    // Redirige vers la page demandée ou l'accueil
    const redirect = searchParams.get('redirect');
    navigate(redirect || '/', { replace: true });
  };

  const handleClose = () => {
    navigate('/');
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#F8F9FB] text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white md:items-center md:justify-center md:px-4 md:py-8">
      <div className="flex flex-col items-center justify-center px-6 pb-4 pt-8 text-center md:mb-5 md:pt-0">
        <img src="/logo-cbf-soko.png" alt="CBF SOKO" className="h-14 w-auto sm:h-16" />
        <p className="mt-2 text-sm font-medium text-[#667085]">Votre marketplace en ligne</p>
      </div>

      <AuthSheet onClose={handleClose} onSuccess={handleSuccess} showBackdrop={false} />
    </div>
  );
}
