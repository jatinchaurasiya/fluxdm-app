import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FullScreenCalendar, CalendarData } from '@/components/ui/fullscreen-calendar';
import { format } from 'date-fns';

interface ScheduledPost {
    id: number;
    file_path: string; // JSON string or single path
    caption: string;
    publish_at: string; // ISO string
    status: 'PENDING' | 'PUBLISHED' | 'FAILED';
    flow_name?: string;
    automation_id?: string;
    media_type?: string;
}

export default function CalendarPage() {
    const { t } = useTranslation();
    const [posts, setPosts] = useState<ScheduledPost[]>([]);

    useEffect(() => {
        loadPosts();
    }, []);

    const loadPosts = async () => {
        try {
            // Load a wide range: Current Year -1 to Current Year +1 to ensure coverage
            const now = new Date();
            const start = new Date(now.getFullYear() - 1, 0, 1);
            const end = new Date(now.getFullYear() + 1, 11, 31);

            const startDate = start.toISOString();
            const endDate = end.toISOString();

            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-scheduled-posts', { startDate, endDate });
                if (res.success) {
                    setPosts(res.data);
                }
            } else {
                // Fallback / Mock for browser testing
                setPosts([
                    {
                        id: 1,
                        file_path: '["/tmp/test.jpg"]',
                        caption: 'Test Post 1',
                        publish_at: new Date().toISOString(),
                        status: 'PENDING',
                        media_type: 'IMAGE',
                        automation_id: '1'
                    }
                ]);
            }
        } catch (e) {
            console.error("Failed to load posts", e);
        }
    };

    // Transform posts to CalendarData[]
    const calendarData: CalendarData[] = [];

    // Group by day string first to consolidate events
    const postsByDay: Record<string, ScheduledPost[]> = {};
    posts.forEach(post => {
        // Use local date string to ensure grouping by visual day
        const dateKey = format(new Date(post.publish_at), 'yyyy-MM-dd');
        if (!postsByDay[dateKey]) postsByDay[dateKey] = [];
        postsByDay[dateKey].push(post);
    });

    // Map to CalendarData structure
    Object.keys(postsByDay).forEach(dateKey => {
        calendarData.push({
            day: new Date(dateKey), // formatting back to Date object (local time implies 00:00 usually, but date-fns handles comparisons well)
            events: postsByDay[dateKey].map(post => {
                let filePaths: string[] = [];
                try {
                    filePaths = JSON.parse(post.file_path);
                } catch {
                    if (post.file_path) filePaths = [post.file_path];
                }

                return {
                    id: post.id,
                    name: post.caption ? (post.caption.length > 30 ? post.caption.substring(0, 30) + '...' : post.caption) : (t('scheduler.types.IMAGE') || "Post"),
                    time: format(new Date(post.publish_at), 'h:mm a'),
                    datetime: post.publish_at,
                    status: post.status,
                    caption: post.caption,
                    automationId: post.automation_id,
                    mediaType: post.media_type || 'POST',
                    files: filePaths
                };
            })
        });
    });

    return (
        <div className="h-full w-full bg-background text-foreground">
            <FullScreenCalendar data={calendarData} onRefresh={loadPosts} />
        </div>
    );
}
