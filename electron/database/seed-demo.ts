
import db from './db';

export const seedDemoData = (isStressTest = false) => {
    console.log(`🌱 Seeding Demo Data (Stress Mode: ${isStressTest})...`);

    // 1. Clear Tables (Optional: keep existing accounts)
    db.prepare('DELETE FROM message_queue').run();
    db.prepare('DELETE FROM leads').run();
    // automated flows and scheduled posts can be kept or cleared depending on preference, 
    // for this seed we'll clear to ensure clean state
    db.prepare('DELETE FROM automation_flows').run();
    db.prepare('DELETE FROM scheduled_posts').run();
    db.prepare('DELETE FROM logs').run();

    const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const now = new Date();

    // 2. Insert Leads
    const leadCount = isStressTest ? 2000 : 50;
    const leadsStmt = db.prepare('INSERT INTO leads (username, source) VALUES (?, ?)');
    const insertLeads = db.transaction((count: number) => {
        for (let i = 0; i < count; i++) {
            leadsStmt.run(`user_${i}`, 'Instagram');
        }
    });
    insertLeads(leadCount);
    console.log(`✅ Inserted ${leadCount} Leads`);

    // 3. Insert Message Queue (History)
    // We want a curve: fewer messages 30 days ago, more messages recently.
    const historyCount = isStressTest ? 50000 : 500;
    const queueStmt = db.prepare(`
        INSERT INTO message_queue (recipient_id, status, execute_at, message_text, message_type) 
        VALUES (?, ?, ?, ?, ?)
    `);

    const insertHistory = db.transaction((count: number) => {
        for (let i = 0; i < count; i++) {
            // Random date within last 30 days
            const daysAgo = getRandomInt(0, 30);
            const date = new Date(now);
            date.setDate(date.getDate() - daysAgo);
            // Add some randomness to time
            date.setHours(getRandomInt(0, 23), getRandomInt(0, 59));

            queueStmt.run(
                `user_${getRandomInt(0, leadCount)}`,
                'SENT',
                date.toISOString(),
                'Thanks for your comment! Here is the link.',
                'TEXT'
            );
        }
    });
    insertHistory(historyCount);
    console.log(`✅ Inserted ${historyCount} Historical Messages`);

    // 4. Insert Pending Queue
    const pendingCount = isStressTest ? 5000 : 20;
    const insertPending = db.transaction((count: number) => {
        for (let i = 0; i < count; i++) {
            queueStmt.run(
                `user_pending_${i}`,
                'PENDING',
                new Date(now.getTime() + 1000000).toISOString(), // Future
                'Queued Reply...',
                'TEXT'
            );
        }
    });
    insertPending(pendingCount);
    console.log(`✅ Inserted ${pendingCount} Pending Messages`);

    // 5. Insert Automations
    const flows = [
        { name: 'Keyword: "PRICE"', trigger: 'PRICE', active: 1 },
        { name: 'Story Reaction', trigger: 'STORY_REPLY', active: 1 },
        { name: 'Keyword: "DM"', trigger: 'DM', active: 0 } // Paused
    ];
    const flowStmt = db.prepare('INSERT INTO automation_flows (id, name, trigger_keyword, is_active, trigger_type) VALUES (?, ?, ?, ?, ?)');
    flows.forEach((f, i) => {
        flowStmt.run(`flow_${i}`, f.name, f.trigger, f.active, f.trigger === 'STORY_REPLY' ? 'STORY_REPLY' : 'POST_COMMENT');
    });

    console.log('✅ Seeding Complete.');
};
