/** Rutas de onboarding accesibles sin sesión activa. */
export function isPublicOnboardingRoute(pathname: string): boolean {
  return (
    pathname === '/welcome' ||
    pathname === '/login' ||
    pathname.startsWith('/register')
  );
}
