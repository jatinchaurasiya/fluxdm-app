import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Scheduler from './pages/Scheduler';
import CalendarPage from './pages/Calendar';
import AutomationWizard from './pages/AutomationWizard';
import Automations from './pages/Automations';
import ConnectSocial from './pages/ConnectSocial';
import Sidebar, { MobileMenuButton } from './components/Sidebar';
import AppLayout from './components/layout/AppLayout';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { DevicePairingModal } from './components/sync/DevicePairingModal';
import { Toaster } from '@/components/ui/sonner';
import Tour from './components/onboarding/Tour';
import './App.css';
import { useTranslation } from 'react-i18next';

function App() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleNavigation = (e: CustomEvent) => {
      if (e.detail === 'wizard') {
        setCurrentPage('automations');
      } else {
        setCurrentPage(e.detail);
      }
    };

    window.addEventListener('navigate', handleNavigation as EventListener);
    return () => window.removeEventListener('navigate', handleNavigation as EventListener);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'automations':
        return <Automations onNavigate={setCurrentPage} />;
      case 'automation-wizard':
        return <AutomationWizard onNavigate={setCurrentPage} />;
      case 'scheduler':
        return <Scheduler />;
      case 'calendar':
        return <CalendarPage />;
      case 'connect-social':
        return <ConnectSocial />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'dashboard':
        return t('sidebar.dashboard');
      case 'automations':
        return t('sidebar.automations');
      case 'scheduler':
        return t('sidebar.scheduler');
      case 'calendar':
        return t('sidebar.calendar');
      case 'connect-social':
        return t('sidebar.connect_social');
      case 'settings':
        return t('sidebar.settings');
      default:
        return t('sidebar.dashboard');
    }
  };

  const [mobilePairingOpen, setMobilePairingOpen] = useState(false);

  return (
    <>
      <AppLayout
        sidebar={
          <Sidebar
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onOpenPairing={() => setMobilePairingOpen(true)}
          />
        }
        mobileHeader={
          <header className="lg:hidden h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shadow-sm flex-none">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />
            <h1 className="text-base font-semibold text-white">{getPageTitle()}</h1>
            <button
              onClick={() => setMobilePairingOpen(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-orange-400 font-medium"
            >
              Sync
            </button>
          </header>
        }
        bottomNav={
          <MobileBottomNav
            currentTab={currentPage}
            onSelectTab={setCurrentPage}
            onOpenPairing={() => setMobilePairingOpen(true)}
          />
        }
      >
        {renderPage()}
      </AppLayout>

      <Tour />
      <Toaster />

      <DevicePairingModal
        isOpen={mobilePairingOpen}
        onClose={() => setMobilePairingOpen(false)}
      />
    </>
  );
}

export default App;
