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

  return (
    <AppLayout
      sidebar={
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      }
      mobileHeader={
        <header className="lg:hidden h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 shadow-sm flex-none">
          <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-white">{getPageTitle()}</h1>
          <div className="w-10" />
        </header>
      }
    >
      {renderPage()}
      <Tour />
      <Toaster />
    </AppLayout>
  );
}

export default App;
