const path = require('path');

let sharedDb;
try {
    sharedDb = require('../../shared/db/database');
} catch (e) {
    sharedDb = {
        get: async () => null,
        all: async () => [],
        run: async () => ({ id: null, changes: 0 })
    };
}

function withTimeout(promise, ms = 2000, fallback = null) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
}

module.exports = {
    get: (sql, params = []) => withTimeout(
        typeof sharedDb.get === 'function' ? sharedDb.get(sql, params).catch(() => null) : Promise.resolve(null),
        2000,
        null
    ),
    all: (sql, params = []) => withTimeout(
        typeof sharedDb.all === 'function' ? sharedDb.all(sql, params).catch(() => []) : Promise.resolve([]),
        2000,
        []
    ),
    run: (sql, params = []) => withTimeout(
        typeof sharedDb.run === 'function' ? sharedDb.run(sql, params).catch(() => ({ id: null, changes: 0 })) : Promise.resolve({ id: null, changes: 0 }),
        2000,
        { id: null, changes: 0 }
    ),
    initDb: () => (typeof sharedDb.initDb === 'function' ? sharedDb.initDb() : Promise.resolve())
};
