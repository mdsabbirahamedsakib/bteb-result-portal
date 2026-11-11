/**
 * BTEB Portal - Centralized Real-Time Visitor Tracking Engine (visitor.js v2)
 *
 * 1. Global Centralized Sync (Default for GitHub Pages / Static Hosting):
 *    - Tracks genuine human visitors across all devices (Phone, Laptop, etc.)
 *      into a shared global atomic counter backend + IndexedDB durable mirror.
 *    - Deduplicates repeat refreshes, navigation, Incognito & storage clears
 *      using atomic IP/Identity + Date locks (no duplicate counting).
 *    - Strict Anti-Bot & Prerender filter: blocks bots, crawlers, WebDriver,
 *      headless browsers & hidden preloads (zero fake/random counts).
 *    - Strictly silent on public pages (Admin-Only display inside admin.html).
 * 2. Optional PHP + MySQL Backend Mode (cPanel / Apache / VPS):
 *    - When enabled in Admin Panel, tracks visits via `api/visitor_logs.php`.
 */

const BTEBVisitor = (function () {
    'use strict';

    const KEYS = {
        API_CONFIG: 'bteb_visitor_api_config',
        STATE_MIRROR: 'bteb_visitor_v2_state',
        CLIENT_ID: 'bteb_visitor_v2_cid',
        SESSION_LOCK: 'bteb_visitor_v2_sess_lock',
        IP_CACHE: 'bteb_visitor_v2_ip_cache',
        CLOUD_SNAPSHOT: 'bteb_visitor_v2_cloud_snap'
    };

    const IDB_NAME = 'bteb_visitor_db';
    const IDB_VERSION = 1;
    const STORE_STATE = 'state';
    const STORE_LOGS = 'logs';

    const CLOUD_API_BASE = 'https://countapi.mileshilliard.com/api/v1';
    const CLOUD_NAMESPACE = 'bteb_sakib_portal_v2_94f1';
    const CLOUD_START_DATE = '2026-11-11';
    const IP_ENDPOINTS = [
        'https://api64.ipify.org?format=json',
        'https://api.ipify.org?format=json'
    ];

    const MAX_STORED_LOGS = 500;
    const MAX_STORED_DAYS = 90;

    const BOT_UA_REGEX = /bot|crawl|spider|slurp|mediapartners|adsbot|bingpreview|duckduckbot|yandex|baiduspider|sogou|exabot|facebot|facebookexternalhit|ia_archiver|twitterbot|whatsapp|telegrambot|discordbot|linkedinbot|pinterest|applebot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|perplexitybot|ccbot|headlesschrome|phantomjs|slimerjs|playwright|puppeteer|selenium|webdriver|cypress|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|postmanruntime|insomnia/i;

    let idbPromise = null;
    let inFlightVisitPromise = null;
    let cachedMemoryState = null;
    let cachedCloudSnapshot = null;
    let memoryClientId = null;
    let syncChannel = null;

    if (typeof BroadcastChannel !== 'undefined') {
        try {
            syncChannel = new BroadcastChannel('bteb_visitor_sync_channel_v2');
            syncChannel.onmessage = function (ev) {
                if (ev && ev.data && ev.data.type === 'VISITOR_UPDATED') {
                    dispatchUpdatedEvent(ev.data.stats || getStats());
                }
            };
        } catch (e) {}
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', function (e) {
            if (e && (e.key === KEYS.CLOUD_SNAPSHOT || e.key === KEYS.STATE_MIRROR)) {
                dispatchUpdatedEvent(getStats());
            }
        });
    }

    function pad2(num) {
        return num < 10 ? ('0' + num) : String(num);
    }

    function getDhakaParts(dateObj) {
        var d = dateObj || new Date();
        try {
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                var fmt = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Dhaka',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                var parts = fmt.formatToParts(d);
                var map = {};
                for (var i = 0; i < parts.length; i++) {
                    map[parts[i].type] = parts[i].value;
                }
                if (map.year && map.month && map.day) {
                    var hr = map.hour === '24' ? '00' : (map.hour || '00');
                    return {
                        date: map.year + '-' + map.month + '-' + map.day,
                        timestamp: map.year + '-' + map.month + '-' + map.day + ' ' + hr + ':' + (map.minute || '00') + ':' + (map.second || '00')
                    };
                }
            }
        } catch (e) {}

        // Manual UTC+6 fallback
        var utcMs = d.getTime() + (d.getTimezoneOffset() * 60000);
        var bd = new Date(utcMs + (6 * 3600000));
        var dateStr = bd.getFullYear() + '-' + pad2(bd.getMonth() + 1) + '-' + pad2(bd.getDate());
        return {
            date: dateStr,
            timestamp: dateStr + ' ' + pad2(bd.getHours()) + ':' + pad2(bd.getMinutes()) + ':' + pad2(bd.getSeconds())
        };
    }

    function getLocalDateStr(dateObj) {
        return getDhakaParts(dateObj).date;
    }

    function getLocalTimestampStr(dateObj) {
        return getDhakaParts(dateObj).timestamp;
    }

    function addDaysToDateStr(dateStr, deltaDays) {
        var parts = String(dateStr || '').split('-');
        if (parts.length !== 3) return dateStr;
        var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + deltaDays));
        return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
    }

    function safeReadJson(storeApi, key, fallback) {
        try {
            if (!storeApi) return fallback;
            var raw = storeApi.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function safeWriteJson(storeApi, key, value) {
        try {
            if (!storeApi) return false;
            storeApi.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    function getLocalStoreSafe() {
        try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
    }

    function getSessionStoreSafe() {
        try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (e) { return null; }
    }

    function dispatchUpdatedEvent(stats) {
        if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
        try {
            window.dispatchEvent(new CustomEvent('bteb-visitor-updated', { detail: stats }));
        } catch (e) {}
    }

    function notifySubscribers(stats) {
        dispatchUpdatedEvent(stats);
        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: 'VISITOR_UPDATED', stats: stats });
            } catch (e) {}
        }
    }

    // ─── IndexedDB Layer (Durable Local Persistence) ───
    function openVisitorDB() {
        if (idbPromise) return idbPromise;
        if (typeof indexedDB === 'undefined') {
            return Promise.resolve(null);
        }
        idbPromise = new Promise(function (resolve) {
            try {
                var req = indexedDB.open(IDB_NAME, IDB_VERSION);
                req.onupgradeneeded = function (ev) {
                    var db = ev.target.result;
                    if (!db.objectStoreNames.contains(STORE_STATE)) {
                        db.createObjectStore(STORE_STATE);
                    }
                    if (!db.objectStoreNames.contains(STORE_LOGS)) {
                        var logStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
                        logStore.createIndex('visit_date', 'visit_date', { unique: false });
                    }
                };
                req.onsuccess = function (ev) {
                    resolve(ev.target.result);
                };
                req.onerror = function () {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
        return idbPromise;
    }

    function idbGetState(key, fallback) {
        return openVisitorDB().then(function (db) {
            if (!db) return fallback;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(STORE_STATE, 'readonly');
                    var req = tx.objectStore(STORE_STATE).get(key);
                    req.onsuccess = function () {
                        resolve(typeof req.result === 'undefined' ? fallback : req.result);
                    };
                    req.onerror = function () { resolve(fallback); };
                } catch (e) {
                    resolve(fallback);
                }
            });
        });
    }

    function idbSetState(key, value) {
        return openVisitorDB().then(function (db) {
            if (!db) return false;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(STORE_STATE, 'readwrite');
                    tx.objectStore(STORE_STATE).put(value, key);
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror = function () { resolve(false); };
                } catch (e) {
                    resolve(false);
                }
            });
        });
    }

    function idbGetAllLogs() {
        return openVisitorDB().then(function (db) {
            if (!db) return [];
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(STORE_LOGS, 'readonly');
                    var req = tx.objectStore(STORE_LOGS).getAll();
                    req.onsuccess = function () {
                        var rows = Array.isArray(req.result) ? req.result : [];
                        rows.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
                        resolve(rows);
                    };
                    req.onerror = function () { resolve([]); };
                } catch (e) {
                    resolve([]);
                }
            });
        });
    }

    function idbAppendLog(entry) {
        return openVisitorDB().then(function (db) {
            if (!db) return null;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(STORE_LOGS, 'readwrite');
                    var req = tx.objectStore(STORE_LOGS).add({
                        ip_address: entry.ip_address,
                        visit_date: entry.visit_date,
                        visited_at: entry.visited_at,
                        page: entry.page || 'index.html'
                    });
                    req.onsuccess = function () {
                        resolve(Object.assign({}, entry, { id: req.result }));
                    };
                    req.onerror = function () { resolve(null); };
                } catch (e) {
                    resolve(null);
                }
            });
        });
    }

    function idbClearAll() {
        return openVisitorDB().then(function (db) {
            if (!db) return false;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction([STORE_STATE, STORE_LOGS], 'readwrite');
                    tx.objectStore(STORE_STATE).clear();
                    tx.objectStore(STORE_LOGS).clear();
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror = function () { resolve(false); };
                } catch (e) {
                    resolve(false);
                }
            });
        });
    }

    // ─── Local State Helpers (Synced with IndexedDB + localStorage mirror) ───
    function createEmptyLocalState() {
        return {
            nextId: 1,
            totalVisits: 0,
            uniqueClients: [],
            dailyStats: {},
            logs: [],
            recordedLocks: {}, // key: `${epoch}:${date}` -> true
            dailyCloudCache: {} // key: `${prefix}:${date}` -> { value, fetchedAt }
        };
    }

    function normalizeLocalState(raw) {
        var s = raw && typeof raw === 'object' ? raw : {};
        return {
            nextId: typeof s.nextId === 'number' ? s.nextId : 1,
            totalVisits: typeof s.totalVisits === 'number' ? s.totalVisits : 0,
            uniqueClients: Array.isArray(s.uniqueClients) ? s.uniqueClients : [],
            dailyStats: s.dailyStats && typeof s.dailyStats === 'object' ? s.dailyStats : {},
            logs: Array.isArray(s.logs) ? s.logs : [],
            recordedLocks: s.recordedLocks && typeof s.recordedLocks === 'object' ? s.recordedLocks : {},
            dailyCloudCache: s.dailyCloudCache && typeof s.dailyCloudCache === 'object' ? s.dailyCloudCache : {}
        };
    }

    function readLocalStateSync() {
        if (cachedMemoryState) return cachedMemoryState;
        var ls = getLocalStoreSafe();
        var mirror = safeReadJson(ls, KEYS.STATE_MIRROR, null);
        cachedMemoryState = normalizeLocalState(mirror || createEmptyLocalState());
        return cachedMemoryState;
    }

    async function readLocalStateAsync() {
        var idbState = await idbGetState('visitor_state', null);
        var ls = getLocalStoreSafe();
        var mirror = safeReadJson(ls, KEYS.STATE_MIRROR, null);
        var base = normalizeLocalState(idbState || mirror || createEmptyLocalState());
        var idbLogs = await idbGetAllLogs();
        if (idbLogs.length > 0) {
            base.logs = idbLogs.slice(0, MAX_STORED_LOGS);
        }
        cachedMemoryState = base;
        return base;
    }

    async function writeLocalStateAsync(state) {
        var clean = normalizeLocalState(state);
        if (clean.logs.length > MAX_STORED_LOGS) {
            clean.logs = clean.logs.slice(0, MAX_STORED_LOGS);
        }
        var dayKeys = Object.keys(clean.dailyStats).sort();
        if (dayKeys.length > MAX_STORED_DAYS) {
            for (var i = 0; i < dayKeys.length - MAX_STORED_DAYS; i++) {
                delete clean.dailyStats[dayKeys[i]];
            }
        }
        cachedMemoryState = clean;
        safeWriteJson(getLocalStoreSafe(), KEYS.STATE_MIRROR, clean);
        await idbSetState('visitor_state', clean);
    }

    async function getOrCreateClientIdAsync() {
        if (memoryClientId) return memoryClientId;

        var idbCid = await idbGetState('client_id', null);
        if (idbCid && /^[A-Za-z0-9_.:-]{4,45}$/.test(idbCid)) {
            memoryClientId = idbCid;
            safeWriteJson(getLocalStoreSafe(), KEYS.CLIENT_ID, idbCid);
            return idbCid;
        }

        var lsCid = safeReadJson(getLocalStoreSafe(), KEYS.CLIENT_ID, null);
        if (typeof lsCid === 'string' && /^[A-Za-z0-9_.:-]{4,45}$/.test(lsCid)) {
            memoryClientId = lsCid;
            await idbSetState('client_id', lsCid);
            return lsCid;
        }

        var randPart = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var buf = new Uint8Array(6);
            crypto.getRandomValues(buf);
            randPart = Array.prototype.map.call(buf, function (b) {
                return ('0' + b.toString(16)).slice(-2);
            }).join('').toUpperCase();
        } else {
            randPart = String(Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
        }

        var clientId = 'Visitor-' + randPart;
        memoryClientId = clientId;
        safeWriteJson(getLocalStoreSafe(), KEYS.CLIENT_ID, clientId);
        await idbSetState('client_id', clientId);
        return clientId;
    }

    // ─── Anti-Bot & Automated Crawler Detection ───
    function hasChromeDriverArtifacts() {
        if (typeof document === 'undefined') return false;
        try {
            var docKeys = Object.keys(document);
            for (var i = 0; i < docKeys.length; i++) {
                if (/^\$cdc_/.test(docKeys[i])) return true;
            }
        } catch (e) {}
        return false;
    }

    function isBotOrAutomated() {
        if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') {
            return true;
        }
        var ua = navigator.userAgent || '';
        if (!ua || BOT_UA_REGEX.test(ua)) {
            return true;
        }
        if (navigator.webdriver === true) {
            return true;
        }
        if (
            window.__nightmare ||
            window._phantom ||
            window.callPhantom ||
            window.Cypress ||
            window.__playwright__binding__ ||
            window.__pwInitScripts ||
            window.domAutomation ||
            window.domAutomationController ||
            hasChromeDriverArtifacts()
        ) {
            return true;
        }
        if (typeof screen !== 'undefined' && (screen.width <= 0 || screen.height <= 0)) {
            return true;
        }
        return false;
    }

    function waitForGenuineForegroundVisit(pageName) {
        if (isBotOrAutomated()) {
            return Promise.resolve(false);
        }
        // Admin panel views never inflate public website visitor count
        if (typeof window !== 'undefined' && /\/admin\.html$/i.test((window.location && window.location.pathname) || '')) {
            return Promise.resolve(false);
        }
        if (String(pageName || '').toLowerCase() === 'admin.html') {
            return Promise.resolve(false);
        }

        return new Promise(function (resolve) {
            var settled = false;
            var settleTimer = null;
            var interactionEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'input'];

            function cleanup() {
                if (settleTimer) clearTimeout(settleTimer);
                document.removeEventListener('visibilitychange', onVisibilityOrPrerender);
                document.removeEventListener('prerenderingchange', onVisibilityOrPrerender);
                for (var i = 0; i < interactionEvents.length; i++) {
                    window.removeEventListener(interactionEvents[i], onHumanInteraction);
                }
            }

            function finish(ok) {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(Boolean(ok && !isBotOrAutomated()));
            }

            function isPageVisibleNow() {
                return !document.prerendering && document.visibilityState === 'visible';
            }

            function startVisibleConfirmWindow() {
                if (settled || !isPageVisibleNow()) return;
                if (settleTimer) return;
                // Wait brief human view settle (450ms) or immediate interaction
                settleTimer = setTimeout(function () {
                    finish(isPageVisibleNow());
                }, 450);
            }

            function onHumanInteraction() {
                if (isPageVisibleNow()) {
                    finish(true);
                }
            }

            function onVisibilityOrPrerender() {
                if (isPageVisibleNow()) {
                    startVisibleConfirmWindow();
                } else if (settleTimer) {
                    clearTimeout(settleTimer);
                    settleTimer = null;
                }
            }

            for (var i = 0; i < interactionEvents.length; i++) {
                window.addEventListener(interactionEvents[i], onHumanInteraction, { passive: true, once: true });
            }
            document.addEventListener('visibilitychange', onVisibilityOrPrerender);
            document.addEventListener('prerenderingchange', onVisibilityOrPrerender);

            if (isPageVisibleNow()) {
                startVisibleConfirmWindow();
            }
        });
    }

    // ─── Public IP & Cryptographic Hash Helpers ───
    async function resolvePublicIp() {
        var ss = getSessionStoreSafe();
        var cached = safeReadJson(ss, KEYS.IP_CACHE, null);
        if (cached && typeof cached.ip === 'string' && cached.ip) {
            return cached.ip;
        }
        if (typeof fetch === 'undefined') return '';

        for (var i = 0; i < IP_ENDPOINTS.length; i++) {
            try {
                var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 2500) : null;
                var res = await fetch(IP_ENDPOINTS[i], {
                    cache: 'no-store',
                    signal: ctrl ? ctrl.signal : undefined
                });
                if (timer) clearTimeout(timer);
                if (res && res.ok) {
                    var data = await res.json();
                    var ip = data && typeof data.ip === 'string' ? data.ip.trim() : '';
                    if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) {
                        safeWriteJson(ss, KEYS.IP_CACHE, { ip: ip, ts: Date.now() });
                        return ip;
                    }
                }
            } catch (e) {}
        }
        return '';
    }

    async function hashIdentityHex(rawText) {
        var str = 'bteb_sakib_salt_v2:' + String(rawText || '');
        try {
            if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
                var bytes = new TextEncoder().encode(str);
                var digest = await crypto.subtle.digest('SHA-256', bytes);
                var arr = Array.from(new Uint8Array(digest));
                return arr.slice(0, 8).map(function (b) {
                    return ('0' + b.toString(16)).slice(-2);
                }).join('');
            }
        } catch (e) {}

        // Deterministic 64-bit FNV-1a + DJB2 fallback when crypto.subtle is unavailable
        var h1 = 2166136261;
        var h2 = 5381;
        for (var i = 0; i < str.length; i++) {
            var ch = str.charCodeAt(i);
            h1 ^= ch;
            h1 = Math.imul(h1, 16777619);
            h2 = ((h2 << 5) + h2 + ch) | 0;
        }
        return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
    }

    // ─── Centralized Global Cloud Counter Backend ───
    async function cloudFetchJson(path, timeoutMs) {
        if (typeof fetch === 'undefined') {
            throw new Error('fetch unavailable');
        }
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 4500) : null;
        try {
            var res = await fetch(CLOUD_API_BASE + path, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
            if (timer) clearTimeout(timer);
            return res;
        } catch (err) {
            if (timer) clearTimeout(timer);
            throw err;
        }
    }

    async function cloudGetCount(key) {
        var res = await cloudFetchJson('/get/' + encodeURIComponent(key), 4500);
        if (res.status === 404) return 0;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        return data && typeof data.value === 'number' ? Math.max(0, Math.floor(data.value)) : 0;
    }

    async function cloudHitCount(key) {
        var res = await cloudFetchJson('/hit/' + encodeURIComponent(key), 4500);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        return data && typeof data.value === 'number' ? Math.max(0, Math.floor(data.value)) : 1;
    }

    async function getCloudEpoch() {
        return await cloudGetCount(CLOUD_NAMESPACE + '_epoch');
    }

    function getCloudPrefix(epoch) {
        return epoch > 0 ? (CLOUD_NAMESPACE + '_e' + epoch) : CLOUD_NAMESPACE;
    }

    function readCloudSnapshotSync() {
        if (cachedCloudSnapshot) return cachedCloudSnapshot;
        var snap = safeReadJson(getLocalStoreSafe(), KEYS.CLOUD_SNAPSHOT, null);
        return snap && typeof snap === 'object' ? snap : null;
    }

    function saveCloudSnapshot(stats) {
        if (!stats) return;
        cachedCloudSnapshot = Object.assign({}, stats, { updatedAt: Date.now() });
        safeWriteJson(getLocalStoreSafe(), KEYS.CLOUD_SNAPSHOT, cachedCloudSnapshot);
        idbSetState('cloud_snapshot', cachedCloudSnapshot);
    }

    // ─── API Configuration (Optional PHP/MySQL Override) ───
    function getApiConfig() {
        var cfg = safeReadJson(getLocalStoreSafe(), KEYS.API_CONFIG, {});
        return {
            enabled: cfg.enabled === true,
            endpoint: typeof cfg.endpoint === 'string' && cfg.endpoint.trim()
                ? cfg.endpoint.trim()
                : 'api/visitor_logs.php',
            adminKey: typeof cfg.adminKey === 'string' ? cfg.adminKey : ''
        };
    }

    function saveApiConfig(config) {
        var clean = {
            enabled: Boolean(config && config.enabled),
            endpoint: (config && config.endpoint ? String(config.endpoint).trim() : '') || 'api/visitor_logs.php',
            adminKey: config && config.adminKey ? String(config.adminKey).trim() : ''
        };
        safeWriteJson(getLocalStoreSafe(), KEYS.API_CONFIG, clean);
        dispatchUpdatedEvent(getStats());
        return clean;
    }

    function buildLocalFallbackStats(state) {
        var s = normalizeLocalState(state || readLocalStateSync());
        var snap = readCloudSnapshotSync();
        if (snap && typeof snap.uniqueVisitors === 'number') {
            return {
                totalVisits: Math.max(0, snap.totalVisits || 0),
                todayVisits: Math.max(0, snap.todayVisits || 0),
                uniqueVisitors: Math.max(0, snap.uniqueVisitors || 0),
                todayUnique: Math.max(0, snap.todayUnique || 0),
                mode: snap.mode || 'cloud',
                cloudSynced: true
            };
        }
        var today = getLocalDateStr();
        var todayBucket = s.dailyStats[today];
        return {
            totalVisits: s.totalVisits || 0,
            todayVisits: todayBucket && typeof todayBucket.visits === 'number' ? todayBucket.visits : 0,
            uniqueVisitors: Array.isArray(s.uniqueClients) ? s.uniqueClients.length : 0,
            todayUnique: todayBucket && Array.isArray(todayBucket.clients) ? todayBucket.clients.length : 0,
            mode: 'offline'
        };
    }

    async function appendLocalIndexedVisit(identityLabel, today, timestamp, pageName, epoch) {
        var state = await readLocalStateAsync();
        var lockKey = String(epoch) + ':' + today;
        if (!state.dailyStats[today]) {
            state.dailyStats[today] = { visits: 0, clients: [] };
        }
        var alreadyLocalToday = state.recordedLocks[lockKey] === true ||
            state.dailyStats[today].clients.indexOf(identityLabel) !== -1;

        var savedRow = null;
        if (!alreadyLocalToday) {
            savedRow = await idbAppendLog({
                ip_address: identityLabel,
                visit_date: today,
                visited_at: timestamp,
                page: pageName || 'index.html'
            });
            var entry = savedRow || {
                id: state.nextId++,
                ip_address: identityLabel,
                visit_date: today,
                visited_at: timestamp,
                page: pageName || 'index.html'
            };
            state.totalVisits += 1;
            if (state.uniqueClients.indexOf(identityLabel) === -1) {
                state.uniqueClients.push(identityLabel);
            }
            state.dailyStats[today].visits += 1;
            state.dailyStats[today].clients.push(identityLabel);
            state.logs.unshift(entry);
        }

        state.recordedLocks[lockKey] = true;
        await writeLocalStateAsync(state);
        return { entry: savedRow, state: state };
    }

    async function markSessionLock(epoch, today) {
        safeWriteJson(getSessionStoreSafe(), KEYS.SESSION_LOCK, { epoch: epoch, date: today });
    }

    function hasSessionLock(epoch, today) {
        var lock = safeReadJson(getSessionStoreSafe(), KEYS.SESSION_LOCK, null);
        return Boolean(lock && lock.epoch === epoch && lock.date === today);
    }

    async function recordCloudVisit(pageName, resolvedIp, clientId, today) {
        var epoch = await getCloudEpoch();
        var lockKey = String(epoch) + ':' + today;
        var state = await readLocalStateAsync();

        if (hasSessionLock(epoch, today) || state.recordedLocks[lockKey] === true) {
            return { recorded: false, duplicate: true, mode: 'cloud', epoch: epoch };
        }

        var prefix = getCloudPrefix(epoch);
        var identitySource = resolvedIp ? ('ip:' + resolvedIp) : ('cid:' + clientId);
        var idHash = await hashIdentityHex(identitySource);

        // Atomic global lock per (epoch, date, ip-or-client hash).
        // Server guarantees value === 1 strictly for the very first visit on this date.
        var dailyHit = await cloudHitCount(prefix + '_d_' + today + '_' + idHash);
        var isNewToday = (dailyHit === 1);

        if (isNewToday) {
            await Promise.all([
                cloudHitCount(prefix + '_visits_total'),
                cloudHitCount(prefix + '_day_' + today)
            ]);

            var uniqueHit = await cloudHitCount(prefix + '_u_' + idHash);
            if (uniqueHit === 1) {
                await cloudHitCount(prefix + '_unique_total');
            }
        }

        await markSessionLock(epoch, today);
        var displayAddr = resolvedIp || clientId;
        await appendLocalIndexedVisit(displayAddr, today, getLocalTimestampStr(), pageName, epoch);

        return {
            recorded: isNewToday,
            duplicate: !isNewToday,
            mode: 'cloud',
            epoch: epoch
        };
    }

    /**
     * Silently tracks genuine foreground human visits without rendering any public counter UI.
     */
    async function trackPageVisit(pageName, options) {
        var opts = options || {};
        if (inFlightVisitPromise && !opts.force) {
            return inFlightVisitPromise;
        }

        inFlightVisitPromise = (async function () {
            var isGenuine = opts.skipHumanCheck ? !isBotOrAutomated() : await waitForGenuineForegroundVisit(pageName);
            if (!isGenuine) {
                return { skipped: true, botBlocked: true };
            }

            var cleanPage = String(pageName || 'index.html').slice(0, 60);
            var today = getLocalDateStr();
            var clientId = await getOrCreateClientIdAsync();
            var apiCfg = getApiConfig();

            // 1. Optional PHP + MySQL backend mode
            if (apiCfg.enabled && apiCfg.endpoint && typeof fetch !== 'undefined') {
                try {
                    var phpRes = await fetch(apiCfg.endpoint + '?action=record', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'record', page: cleanPage }),
                        cache: 'no-store'
                    });
                    if (phpRes.ok) {
                        var phpData = await phpRes.json();
                        if (phpData && phpData.ok) {
                            await appendLocalIndexedVisit(clientId, today, getLocalTimestampStr(), cleanPage, 0);
                            return { recorded: Boolean(phpData.recorded), duplicate: Boolean(phpData.duplicate), mode: 'mysql' };
                        }
                    }
                } catch (e) {}
            }

            // 2. Default Global Cloud Sync mode (cross-device: Phone + Laptop + all browsers)
            var resolvedIp = await resolvePublicIp();
            try {
                var cloudRes = await recordCloudVisit(cleanPage, resolvedIp, clientId, today);
                notifySubscribers(readCloudSnapshotSync() || getStats());
                return cloudRes;
            } catch (e) {
                // Retry once on transient network hiccup before falling back offline
                try {
                    var retryRes = await recordCloudVisit(cleanPage, resolvedIp, clientId, today);
                    notifySubscribers(readCloudSnapshotSync() || getStats());
                    return retryRes;
                } catch (e2) {}
            }

            // 3. Offline fallback: record strictly once per day in IndexedDB
            await appendLocalIndexedVisit(resolvedIp || clientId, today, getLocalTimestampStr(), cleanPage, 0);
            return { recorded: true, duplicate: false, mode: 'offline' };
        })();

        try {
            return await inFlightVisitPromise;
        } finally {
            inFlightVisitPromise = null;
        }
    }

    function recordVisit(pageName, options) {
        return trackPageVisit(pageName, options);
    }

    // Public footer counter intentionally removed (Admin-only display requirement).
    function renderFooterCounter(containerId) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(containerId || 'visitorFooterCounter');
        if (el) {
            el.innerHTML = '';
            if (el.parentNode) el.parentNode.removeChild(el);
        }
    }

    function initFooterCounter(pageName, containerId) {
        renderFooterCounter(containerId);
        return trackPageVisit(pageName || 'index.html');
    }

    // ─── Admin-Only Analytics & Query APIs ───
    function getStats() {
        return buildLocalFallbackStats(readLocalStateSync());
    }

    async function fetchCloudStatsSnapshot() {
        var epoch = await getCloudEpoch();
        var prefix = getCloudPrefix(epoch);
        var today = getLocalDateStr();

        var vals = await Promise.all([
            cloudGetCount(prefix + '_visits_total'),
            cloudGetCount(prefix + '_unique_total'),
            cloudGetCount(prefix + '_day_' + today)
        ]);

        var stats = {
            totalVisits: vals[0],
            uniqueVisitors: vals[1],
            todayVisits: vals[2],
            todayUnique: vals[2],
            mode: 'cloud',
            epoch: epoch,
            cloudSynced: true
        };
        saveCloudSnapshot(stats);
        return stats;
    }

    async function fetchCloudDailySummary(epoch, today, limit, forceRefresh) {
        var maxDays = typeof limit === 'number' && limit > 0 ? Math.min(30, limit) : 30;
        var prefix = getCloudPrefix(epoch);
        var state = await readLocalStateAsync();
        var cache = state.dailyCloudCache || {};

        var minDate = addDaysToDateStr(today, -(maxDays - 1));
        if (today >= CLOUD_START_DATE && minDate < CLOUD_START_DATE) {
            minDate = CLOUD_START_DATE;
        }

        var datesToCheck = [];
        var cur = today;
        for (var i = 0; i < maxDays; i++) {
            if (cur < minDate) break;
            datesToCheck.push(cur);
            cur = addDaysToDateStr(cur, -1);
        }

        var results = {};
        var pendingDates = [];
        var nowMs = Date.now();
        var yesterday = addDaysToDateStr(today, -1);

        for (var d = 0; d < datesToCheck.length; d++) {
            var dateKey = datesToCheck[d];
            var cacheKey = prefix + ':' + dateKey;
            var cached = cache[cacheKey];
            var isRecent = (dateKey === today || dateKey === yesterday);
            var cacheFresh = cached && typeof cached.value === 'number' && !isRecent && (nowMs - (cached.fetchedAt || 0) < 6 * 3600000);
            if (!forceRefresh && cacheFresh) {
                results[dateKey] = cached.value;
            } else {
                pendingDates.push(dateKey);
            }
        }

        // Batch fetches (5 concurrent) to keep UI responsive without burst load
        var BATCH_SIZE = 5;
        var cacheDirty = false;
        for (var b = 0; b < pendingDates.length; b += BATCH_SIZE) {
            var slice = pendingDates.slice(b, b + BATCH_SIZE);
            var batchCounts = await Promise.all(slice.map(function (dt) {
                return cloudGetCount(prefix + '_day_' + dt);
            }));
            for (var s = 0; s < slice.length; s++) {
                var dtStr = slice[s];
                var cnt = batchCounts[s];
                results[dtStr] = cnt;
                cache[prefix + ':' + dtStr] = { value: cnt, fetchedAt: nowMs };
                cacheDirty = true;
            }
        }

        if (cacheDirty) {
            state.dailyCloudCache = cache;
            await writeLocalStateAsync(state);
        }

        var summary = [];
        for (var r = 0; r < datesToCheck.length; r++) {
            var keyDate = datesToCheck[r];
            var totalForDay = results[keyDate] || 0;
            if (totalForDay > 0) {
                summary.push({
                    visit_date: keyDate,
                    total_visitors: totalForDay
                });
            }
        }
        return summary;
    }

    async function getStatsAsync() {
        var apiCfg = getApiConfig();
        if (apiCfg.enabled && apiCfg.endpoint && typeof fetch !== 'undefined') {
            try {
                var headers = {};
                if (apiCfg.adminKey) headers['X-Admin-Key'] = apiCfg.adminKey;
                var res = await fetch(apiCfg.endpoint + '?action=stats', { headers: headers, cache: 'no-store' });
                if (res.ok) {
                    var data = await res.json();
                    if (data && data.ok && data.stats) {
                        data.stats.mode = 'mysql';
                        return data.stats;
                    }
                }
            } catch (e) {}
        }

        try {
            return await fetchCloudStatsSnapshot();
        } catch (e) {
            var fallback = buildLocalFallbackStats(await readLocalStateAsync());
            fallback.cloudOffline = true;
            return fallback;
        }
    }

    function filterLocalLogs(logs, filter) {
        var f = filter || {};
        var today = getLocalDateStr();
        var dateMode = f.dateMode || 'all';
        var specificDate = f.specificDate || '';
        var query = f.query ? String(f.query).trim().toLowerCase() : '';
        var limit = typeof f.limit === 'number' && f.limit > 0 ? f.limit : 200;

        var out = [];
        for (var i = 0; i < logs.length; i++) {
            var row = logs[i];
            if (dateMode === 'today' && row.visit_date !== today) continue;
            if (dateMode === 'custom' && specificDate && row.visit_date !== specificDate) continue;

            if (query) {
                var haystack = (
                    String(row.id) + ' ' +
                    String(row.ip_address || '') + ' ' +
                    String(row.visit_date || '') + ' ' +
                    String(row.visited_at || '') + ' ' +
                    String(row.page || '')
                ).toLowerCase();
                if (haystack.indexOf(query) === -1) continue;
            }

            out.push(row);
            if (out.length >= limit) break;
        }
        return out;
    }

    function getDailySummary(limit) {
        var maxDays = typeof limit === 'number' && limit > 0 ? limit : 30;
        var state = readLocalStateSync();
        var byDate = {};

        var dailyKeys = Object.keys(state.dailyStats || {});
        for (var i = 0; i < dailyKeys.length; i++) {
            var d = dailyKeys[i];
            var bucket = state.dailyStats[d];
            var cnt = bucket && typeof bucket.visits === 'number'
                ? bucket.visits
                : (bucket && Array.isArray(bucket.clients) ? bucket.clients.length : 0);
            if (cnt > 0) byDate[d] = cnt;
        }

        return Object.keys(byDate)
            .sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); })
            .slice(0, maxDays)
            .map(function (dateKey) {
                return {
                    visit_date: dateKey,
                    total_visitors: byDate[dateKey]
                };
            });
    }

    function getLogs(filter) {
        return filterLocalLogs(readLocalStateSync().logs, filter);
    }

    async function getLogsAsync(filter) {
        var apiCfg = getApiConfig();
        var localState = await readLocalStateAsync();
        var filteredLocalLogs = filterLocalLogs(localState.logs, filter);

        // 1. Optional PHP/MySQL mode
        if (apiCfg.enabled && apiCfg.endpoint && typeof fetch !== 'undefined') {
            try {
                var params = new URLSearchParams();
                params.set('action', 'logs');
                params.set('limit', String((filter && filter.limit) || 200));
                if (filter && filter.dateMode === 'today') {
                    params.set('date', 'today');
                } else if (filter && filter.dateMode === 'custom' && filter.specificDate) {
                    params.set('date', filter.specificDate);
                }
                if (filter && filter.query) {
                    params.set('q', String(filter.query).trim());
                }

                var headers = {};
                if (apiCfg.adminKey) headers['X-Admin-Key'] = apiCfg.adminKey;

                var res = await fetch(apiCfg.endpoint + '?' + params.toString(), {
                    headers: headers,
                    cache: 'no-store'
                });
                var data = await res.json();
                if (res.ok && data && data.ok) {
                    if (data.stats) data.stats.mode = 'mysql';
                    return {
                        mode: 'mysql',
                        stats: data.stats || buildLocalFallbackStats(localState),
                        dailySummary: Array.isArray(data.dailySummary) ? data.dailySummary : [],
                        logs: Array.isArray(data.logs) ? data.logs : []
                    };
                }
                // PHP configured but returned auth/config error -> still try Cloud Sync with notice
                try {
                    var fallbackCloudStats = await fetchCloudStatsSnapshot();
                    var fallbackCloudDaily = await fetchCloudDailySummary(fallbackCloudStats.epoch, getLocalDateStr(), 30, Boolean(filter && filter.forceRefresh));
                    return {
                        mode: 'cloud',
                        backendError: (data && data.message) || ('HTTP ' + res.status),
                        stats: fallbackCloudStats,
                        dailySummary: fallbackCloudDaily,
                        logs: filteredLocalLogs
                    };
                } catch (ce) {}
            } catch (e) {}
        }

        // 2. Centralized Global Cloud Sync mode
        try {
            var cloudStats = await fetchCloudStatsSnapshot();
            var cloudDaily = await fetchCloudDailySummary(
                cloudStats.epoch,
                getLocalDateStr(),
                30,
                Boolean(filter && filter.forceRefresh)
            );
            return {
                mode: 'cloud',
                stats: cloudStats,
                dailySummary: cloudDaily,
                logs: filteredLocalLogs
            };
        } catch (e) {
            return {
                mode: 'offline',
                backendError: 'ক্লাউড সার্ভারে সংযোগ করা যায়নি — অফলাইন IndexedDB ব্যাকআপ দেখানো হচ্ছে।',
                stats: buildLocalFallbackStats(localState),
                dailySummary: getDailySummary(30),
                logs: filteredLocalLogs
            };
        }
    }

    async function clearLocalLogs() {
        cachedMemoryState = createEmptyLocalState();
        cachedCloudSnapshot = null;
        try {
            var ls = getLocalStoreSafe();
            if (ls) {
                ls.removeItem(KEYS.STATE_MIRROR);
                ls.removeItem(KEYS.CLOUD_SNAPSHOT);
            }
            var ss = getSessionStoreSafe();
            if (ss) {
                ss.removeItem(KEYS.SESSION_LOCK);
            }
        } catch (e) {}
        await idbClearAll();
        var zeroStats = { totalVisits: 0, todayVisits: 0, uniqueVisitors: 0, todayUnique: 0, mode: 'cloud' };
        notifySubscribers(zeroStats);
        return zeroStats;
    }

    async function clearLogsAsync() {
        await clearLocalLogs();
        var zeroStats = { totalVisits: 0, todayVisits: 0, uniqueVisitors: 0, todayUnique: 0, mode: 'cloud' };

        var apiCfg = getApiConfig();
        if (apiCfg.enabled && apiCfg.endpoint && typeof fetch !== 'undefined') {
            try {
                var headers = { 'Content-Type': 'application/json' };
                if (apiCfg.adminKey) headers['X-Admin-Key'] = apiCfg.adminKey;
                var res = await fetch(apiCfg.endpoint + '?action=clear', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ action: 'clear' })
                });
                var data = await res.json();
                if (!res.ok || !data || !data.ok) {
                    return { ok: false, mode: 'mysql', message: (data && data.message) || 'Backend clear failed', stats: zeroStats };
                }
                return { ok: true, mode: 'mysql', stats: data.stats || zeroStats };
            } catch (e) {}
        }

        // Bump global cloud epoch so counters & IP locks reset cleanly across all devices
        try {
            var newEpoch = await cloudHitCount(CLOUD_NAMESPACE + '_epoch');
            zeroStats.epoch = newEpoch;
            saveCloudSnapshot(zeroStats);
            notifySubscribers(zeroStats);
            return { ok: true, mode: 'cloud', epoch: newEpoch, stats: zeroStats };
        } catch (e) {
            return { ok: true, mode: 'offline', stats: zeroStats };
        }
    }

    // ─── Export Utilities (SQL & CSV) ───
    function csvEscapeCell(val) {
        var s = String(val === null || typeof val === 'undefined' ? '' : val);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function sqlEscapeString(val) {
        return "'" + String(val === null || typeof val === 'undefined' ? '' : val)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n') + "'";
    }

    function triggerDownload(filename, content, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportLogsAsCSV(logsOverride) {
        var rows = Array.isArray(logsOverride) ? logsOverride : readLocalStateSync().logs;
        var lines = ['id,ip_address,visit_date,visited_at,page'];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            lines.push([
                csvEscapeCell(r.id),
                csvEscapeCell(r.ip_address),
                csvEscapeCell(r.visit_date),
                csvEscapeCell(r.visited_at),
                csvEscapeCell(r.page || 'index.html')
            ].join(','));
        }
        triggerDownload('visitor_logs_' + getLocalDateStr() + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
    }

    function exportLogsAsSQL(logsOverride) {
        var rows = Array.isArray(logsOverride) ? logsOverride : readLocalStateSync().logs;
        var lines = [
            '-- BTEB Portal Visitor Logs Export (' + getLocalTimestampStr() + ')',
            'CREATE TABLE IF NOT EXISTS visitor_logs (',
            '    id INT AUTO_INCREMENT PRIMARY KEY,',
            '    ip_address VARCHAR(45) NOT NULL,',
            '    visit_date DATE NOT NULL,',
            '    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            ');',
            ''
        ];

        for (var i = rows.length - 1; i >= 0; i--) {
            var r = rows[i];
            var idVal = Number(r.id);
            var safeId = Number.isFinite(idVal) && idVal > 0 ? Math.floor(idVal) : 'NULL';
            lines.push(
                'INSERT INTO visitor_logs (id, ip_address, visit_date, visited_at) VALUES (' +
                safeId + ', ' +
                sqlEscapeString(r.ip_address || '') + ', ' +
                sqlEscapeString(r.visit_date || getLocalDateStr()) + ', ' +
                sqlEscapeString(r.visited_at || getLocalTimestampStr()) +
                ');'
            );
        }

        triggerDownload('visitor_logs_' + getLocalDateStr() + '.sql', lines.join('\n'), 'application/sql;charset=utf-8;');
    }

    return {
        trackPageVisit: trackPageVisit,
        recordVisit: recordVisit,
        getStats: getStats,
        getStatsAsync: getStatsAsync,
        getDailySummary: getDailySummary,
        getLogs: getLogs,
        getLogsAsync: getLogsAsync,
        clearLocalLogs: clearLocalLogs,
        clearLogsAsync: clearLogsAsync,
        getApiConfig: getApiConfig,
        saveApiConfig: saveApiConfig,
        exportLogsAsCSV: exportLogsAsCSV,
        exportLogsAsSQL: exportLogsAsSQL,
        renderFooterCounter: renderFooterCounter,
        initFooterCounter: initFooterCounter,
        isBotOrAutomated: isBotOrAutomated,
        getLocalDateStr: getLocalDateStr
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBVisitor;
}
