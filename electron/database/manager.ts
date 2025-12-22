import db from './db';

/**
 * Performs a factory reset by clearing all data tables
 * EXCEPT for user_config (to keep the user logged in).
 */
export function factoryReset() {
    const tablesToClear = [
        'message_queue',
        'leads',
        'automation_flows',
        'scheduled_posts',
        'logs',
        'conversation_state' // Ensure this exists in schema or ignore if not
    ];

    const transaction = db.transaction(() => {
        for (const table of tablesToClear) {
            try {
                // Check if table exists before deleting to avoid errors if schema changed
                const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                if (tableExists) {
                    db.prepare(`DELETE FROM ${table}`).run();
                }
            } catch (error: any) {
                console.warn(`⚠️ Could not clear table ${table}:`, error.message);
            }
        }
    });

    transaction();
}
