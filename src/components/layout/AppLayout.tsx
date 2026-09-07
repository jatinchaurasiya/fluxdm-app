import { ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  mobileHeader?: ReactNode;
  bottomNav?: ReactNode;
}

export default function AppLayout({ sidebar, children, mobileHeader, bottomNav }: AppLayoutProps) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 dark:bg-black flex">
      {/* Sidebar */}
      {sidebar}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {mobileHeader}

        {/* Clean Single Scroll View */}
        <main className="flex-1 h-full overflow-hidden">
          {children}
        </main>

        {bottomNav}
      </div>
    </div>
  );
}
