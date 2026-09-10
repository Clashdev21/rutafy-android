import { useAuth } from '@/auth/useAuth';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';

export default function ControlCuentaScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Administrador"
      onLogout={() => void logout()}
      logoutLoading={isLoading}
    />
  );
}
