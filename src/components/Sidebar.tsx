import { LayoutDashboard, GitBranch, Settings, Zap, X, Menu, Calendar as CalendarIcon, Clock, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
    currentPage: string;
    onNavigate: (page: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

import { AccountSwitcher } from './layout/AccountSwitcher';

export default function Sidebar({ currentPage, onNavigate, isOpen, onClose }: SidebarProps) {
    const { t } = useTranslation();

    const navItems: NavItem[] = [
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: <LayoutDashboard className="w-5 h-5" /> },
        { id: 'automations', label: t('sidebar.automations'), icon: <GitBranch className="w-5 h-5" /> },
        { id: 'calendar', label: t('sidebar.calendar'), icon: <CalendarIcon className="w-5 h-5" /> },
        { id: 'scheduler', label: t('sidebar.scheduler'), icon: <Clock className="w-5 h-5" /> },
        { id: 'connect-social', label: t('sidebar.connect_social'), icon: <Link className="w-5 h-5" /> },
        { id: 'settings', label: t('sidebar.settings'), icon: <Settings className="w-5 h-5" /> },
    ];

    const handleNavigate = (pageId: string) => {
        onNavigate(pageId);
        onClose(); // Close sidebar on mobile after navigation
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-50
                w-64 h-screen bg-white dark:bg-black
                border-r border-gray-200 dark:border-zinc-800 flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo / Brand */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-zinc-800 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-black dark:bg-white">
                            <Zap className="w-5 h-5 text-white dark:text-black" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">FluxDM</h1>
                        </div>
                    </div>
                    {/* Close button for mobile */}
                    <button
                        onClick={onClose}
                        aria-label="Close sidebar"
                        title="Close sidebar"
                        className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <AccountSwitcher onNavigate={handleNavigate} />

                {/* Navigation */}
                <nav className="flex-1 py-2 px-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = currentPage === item.id;
                        return (
                            <button
                                key={item.id}
                                id={`nav-${item.id}`}
                                onClick={() => handleNavigate(item.id)}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                                    transition-all duration-200
                                    ${isActive
                                        ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                                        : 'text-gray-500 hover:text-black hover:bg-gray-50 dark:hover:text-white dark:hover:bg-zinc-900'
                                    }
                                `}
                            >
                                <span className={isActive ? 'text-white dark:text-black' : 'text-gray-400 dark:text-zinc-500'}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-zinc-800">
                    <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-zinc-900">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{t('dashboard.footer.system_online')}</span>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

// Export the Menu button component for use in the header
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            aria-label="Open menu"
            title="Open menu"
            className="lg:hidden p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
        >
            <Menu className="w-5 h-5" />
        </button>
    );
}
