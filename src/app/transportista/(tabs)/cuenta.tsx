import { useAuth } from '@/auth/useAuth';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';

export default function TransportistaCuentaScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Transportista"
      onLogout={() => void logout()}
      logoutLoading={isLoading}
    />
  );
}
