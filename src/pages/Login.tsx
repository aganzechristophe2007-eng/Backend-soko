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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-neutral-950 text-white antialiased selection:bg-orange-500 selection:text-white md:items-center md:justify-center">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center md:mb-6 md:flex-none">
        <h1 className="text-4xl font-black tracking-wider text-white sm:text-5xl">CBFSOKO</h1>
        <p className="mt-2 text-base font-semibold text-orange-500">Votre marketplace en ligne</p>
      </div>

      <AuthSheet onClose={handleClose} onSuccess={handleSuccess} showBackdrop={false} />
    </div>
  );
}