import { ReactNode } from 'react';

interface AppLayoutProps {
    sidebar: ReactNode;
    children: ReactNode;
    mobileHeader?: ReactNode;
}

export default function AppLayout({ sidebar, children, mobileHeader }: AppLayoutProps) {
    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-50 dark:bg-black flex">
            {/* Sidebar is passed as a prop and should handle its own responsive sizing/hiding 
                or be wrapped here if it was a dumb component. 
                Our Sidebar component handles 'lg:static' so it fits in the flex flow on desktop. 
            */}
            {sidebar}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {mobileHeader}

                {/* Scrollable Content Container */}
                <main className="h-full overflow-y-auto p-6 scroll-smooth">
                    <div className="max-w-7xl mx-auto h-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
