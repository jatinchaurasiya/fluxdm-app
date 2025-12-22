import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function Tour() {
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('fluxdm_tour_completed');

        if (!hasSeenTour) {
            const tourDriver = driver({
                showProgress: true,
                animate: true,
                allowClose: true,
                doneBtnText: 'Finish',
                nextBtnText: 'Next',
                prevBtnText: 'Back',
                onDestroyed: () => {
                    localStorage.setItem('fluxdm_tour_completed', 'true');
                },
                steps: [
                    {
                        popover: {
                            title: 'Welcome to FluxDM ⚡',
                            description: 'Let’s get your automated growth engine running in 60 seconds.'
                        }
                    },
                    {
                        element: '#nav-connect-social',
                        popover: {
                            title: 'Step 1: Connect Instagram',
                            description: 'Start here. Connect your professional Instagram account to enable the automation features.'
                        }
                    },
                    {
                        element: '#dashboard-stats-grid',
                        popover: {
                            title: 'Track Your Growth',
                            description: 'See your DMs sent, leads captured, and conversion rates in real-time.'
                        }
                    },
                    {
                        element: '#nav-automations',
                        popover: {
                            title: 'Build Your Logic',
                            description: 'Create "If This, Then That" rules. Set up auto-replies for comments and stories here.'
                        }
                    },
                    {
                        element: '#nav-scheduler',
                        popover: {
                            title: 'Auto-Publishing',
                            description: 'Upload Reels and Posts, then attach automation rules to them instantly.'
                        }
                    },
                    {
                        element: '#nav-settings',
                        popover: {
                            title: 'Safety & Preferences',
                            description: 'Configure anti-ban delays, export your leads, and manage your subscription.'
                        }
                    }
                ]
            });

            // Wait 1 second before starting to ensure UI is loaded
            setTimeout(() => {
                tourDriver.drive();
            }, 1000);
        }
    }, []);

    return null;
}
