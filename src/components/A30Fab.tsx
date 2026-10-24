import { useLocation, useNavigate } from "react-router-dom";
import A30icon from "./A30icon";

// Pages où le bouton ne s'affiche pas
const HIDDEN_ON = ["/login", "/register", "/a30-ia", "/messages", "/create-product"];

export default function A30Fab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <button
      onClick={() => navigate("/a30-ia")}
      aria-label="Ouvrir A30 IA"
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF6B00] text-white shadow-lg shadow-black/15 transition hover:bg-[#E85F00] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 lg:bottom-6 lg:right-6 lg:h-14 lg:w-14"
    >
      <A30icon className="h-7 w-7" />
      <span className="absolute -right-1 -top-1 rounded-full bg-[#10B981] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white">
        IA
      </span>
    </button>
  );
}