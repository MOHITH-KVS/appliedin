// AppliedIn — IndexedDB wrapper
// FIX BUG 1: replaces chrome.storage.local (5MB limit) with IndexedDB (unlimited).
// All reads/writes go through this module. API is callback-based to match
// the existing chrome.storage.local call signatures — no other files need
// to change their logic, just swap the storage calls.

const AppliedInDB = (function () {
  const DB_NAME = 'appliedin';
  const STORE   = 'applications';
  const VERSION = 1;

  let _db = null;

  function openDB(callback) {
    if (_db) { callback(null, _db); return; }

    const req = indexedDB.open(DB_NAME, VERSION);

    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath = auto-increment id; index on date for fast period queries
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = function (e) {
      _db = e.target.result;
      callback(null, _db);
    };

    req.onerror = function (e) {
      callback(e.target.error, null);
    };
  }

  // ── Get all applications (newest first) ──
  function getAll(callback) {
    openDB(function (err, db) {
      if (err) { callback([]); return; }
      const tx    = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req   = store.getAll();
      req.onsuccess = function () {
        // Sort newest first — same order the old array had
        const sorted = (req.result || []).sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
        callback(sorted);
      };
      req.onerror = function () { callback([]); };
    });
  }

  // ── Add one application ──
  function add(jobData, callback) {
    openDB(function (err, db) {
      if (err) { callback && callback(false); return; }
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      // Remove id if present so autoIncrement works cleanly
      const record = Object.assign({}, jobData);
      delete record.id;
      const req = store.add(record);
      req.onsuccess = function () { callback && callback(true, req.result); };
      req.onerror   = function () { callback && callback(false); };
    });
  }

  // ── Update one application by id ──
  function update(id, changes, callback) {
    openDB(function (err, db) {
      if (err) { callback && callback(false); return; }
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = function () {
        const record = Object.assign({}, getReq.result, changes);
        const putReq = store.put(record);
        putReq.onsuccess = function () { callback && callback(true); };
        putReq.onerror   = function () { callback && callback(false); };
      };
      getReq.onerror = function () { callback && callback(false); };
    });
  }

  // ── Delete one application by id ──
  function remove(id, callback) {
    openDB(function (err, db) {
      if (err) { callback && callback(false); return; }
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req   = store.delete(id);
      req.onsuccess = function () { callback && callback(true); };
      req.onerror   = function () { callback && callback(false); };
    });
  }

  // ── Check duplicate (same company+role within 24h) ──
  function isDuplicate(company, role, callback) {
    getAll(function (apps) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const found  = apps.some(app =>
        app.company.toLowerCase() === company.toLowerCase() &&
        app.role.toLowerCase()    === role.toLowerCase()    &&
        new Date(app.date).getTime() > cutoff
      );
      callback(found);
    });
  }

  // ── One-time migration from chrome.storage.local → IndexedDB ──
  // Runs silently on first popup open. Old data is moved across and
  // then removed from chrome.storage.local so it doesn't get doubled.
  function migrateFromLocalStorage(onDone) {
    chrome.storage.local.get(['applications', 'appliedin_migrated'], function (result) {
      if (result.appliedin_migrated) { onDone(); return; }

      const old = result.applications;
      if (!old || old.length === 0) {
        chrome.storage.local.set({ appliedin_migrated: true }, onDone);
        return;
      }

      openDB(function (err, db) {
        if (err) { onDone(); return; }

        const tx    = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);

        old.forEach(function (app) {
          const record = Object.assign({}, app);
          delete record.id;
          store.add(record);
        });

        tx.oncomplete = function () {
          // Mark migrated and remove old data
          chrome.storage.local.set({ appliedin_migrated: true }, function () {
            chrome.storage.local.remove('applications', onDone);
          });
        };
        tx.onerror = function () { onDone(); };
      });
    });
  }

  return { getAll, add, update, remove, isDuplicate, migrateFromLocalStorage };
})();
