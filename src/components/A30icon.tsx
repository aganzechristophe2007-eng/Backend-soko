type Props = { className?: string };

// Icône "étincelles" : grande étoile à quatre branches + petite étoile.
export default function A30Icon({ className = "h-6 w-6" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 6C10.5 10.5 13.5 13.5 18 14C13.5 14.5 10.5 17.5 10 22C9.5 17.5 6.5 14.5 2 14C6.5 13.5 9.5 10.5 10 6Z" />
      <path d="M19 2C19.2 3.8 20.2 4.8 22 5C20.2 5.2 19.2 6.2 19 8C18.8 6.2 17.8 5.2 16 5C17.8 4.8 18.8 3.8 19 2Z" />
    </svg>
  );
}