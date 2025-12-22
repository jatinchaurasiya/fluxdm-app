import db from './db';

/**
 * Aggressively wipes all business data and resets auto-increment counters.
 * Keeps user_config intact to preserve login session.
 */
export function forceWipeDatabase() {
    const transaction = db.transaction(() => {
        // 1. Delete all data
        db.prepare('DELETE FROM message_queue').run();
        db.prepare('DELETE FROM leads').run();
        db.prepare('DELETE FROM automation_flows').run();
        db.prepare('DELETE FROM scheduled_posts').run();
        db.prepare('DELETE FROM logs').run(); // Good practice to clear logs too
        db.prepare('DELETE FROM conversation_state').run(); // Clear state

        // 2. Reset Auto-Increment Counters
        db.prepare("DELETE FROM sqlite_sequence WHERE name='message_queue'").run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name='leads'").run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name='automation_flows'").run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name='scheduled_posts'").run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name='logs'").run();
    });

    transaction();
}
