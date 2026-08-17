/* SQLite Local Sync Queue Operations Manager */

const path = require('path');
const { run, all, get } = require('../db/database');

const SyncQueueManager = {
    // Add item to local sync queue on Raspberry Pi
    async enqueue(operation, entity, entityId, payload) {
        try {
            const res = await run(
                `INSERT INTO sync_queue (operation, entity, entity_id, payload, status, retry_count)
                 VALUES (?, ?, ?, ?, 'pending', 0)`,
                [operation, entity, String(entityId), JSON.stringify(payload)]
            );
            console.log(`[SyncQueue] Enqueued ${operation} for ${entity}:${entityId} (Queue ID: ${res.id})`);
            return res.id;
        } catch (err) {
            console.error('[SyncQueue] Failed to enqueue sync item:', err);
        }
    },

    // Get all pending sync items
    async getPendingItems(limit = 50) {
        try {
            const items = await all(
                `SELECT * FROM sync_queue WHERE status = 'pending' AND retry_count < 5 ORDER BY id ASC LIMIT ?`,
                [limit]
            );
            return items.map(item => ({
                ...item,
                payload: JSON.parse(item.payload || '{}')
            }));
        } catch (err) {
            console.error('[SyncQueue] Error fetching pending items:', err);
            return [];
        }
    },

    // Update item status & retry count
    async updateStatus(id, status, incrementRetry = false) {
        try {
            if (incrementRetry) {
                await run(
                    `UPDATE sync_queue SET status = ?, retry_count = retry_count + 1 WHERE id = ?`,
                    [status, id]
                );
            } else {
                await run(
                    `UPDATE sync_queue SET status = ? WHERE id = ?`,
                    [status, id]
                );
            }
        } catch (err) {
            console.error('[SyncQueue] Error updating status:', err);
        }
    },

    // Remove completed items
    async removeCompleted() {
        try {
            await run(`DELETE FROM sync_queue WHERE status = 'completed'`);
        } catch (err) {
            console.error('[SyncQueue] Error clearing completed items:', err);
        }
    }
};

module.exports = SyncQueueManager;
