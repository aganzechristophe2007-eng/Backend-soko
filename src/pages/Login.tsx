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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-[#FFF8F3] to-white text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white md:items-center md:justify-center">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center md:mb-6 md:flex-none">
        <img src="/logo-cbf-soko.png" alt="CBF SOKO" className="h-16 w-auto sm:h-20" />
        <p className="mt-3 text-base font-semibold text-[#667085]">Votre marketplace en ligne</p>
      </div>

      <AuthSheet onClose={handleClose} onSuccess={handleSuccess} showBackdrop={false} />
    </div>
  );
}
