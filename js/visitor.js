/**
 * BTEB Portal - Hybrid Visitor Analytics & Logs Engine (visitor.js)
 *
 * Works seamlessly in TWO modes without modifying any core result logic:
 * 1. Static Mode (Default for GitHub Pages / Cloudflare Pages / Netlify / Offline):
 *    Tracks visitor logs locally using the exact `visitor_logs` schema
 *    (id, ip_address, visit_date, visited_at) with cross-tab realtime sync.
 * 2. Optional MySQL + PHP Backend Mode (for cPanel / Apache / VPS):
 *    When enabled in Admin Panel, sends visits to `api/visitor_logs.php`
 *    and queries MySQL `visitor_logs` rows with real visitor IP addresses.
 */

const BTEBVisitor = (function () {
    'use strict';

    const KEYS = {
        STORE: 'bteb_visitor_logs_data',
        CLIENT_ID: 'bteb_visitor_client_id',
        API_CONFIG: 'bteb_visitor_api_config'
    };

    const MAX_STORED_LOGS = 500;
    const MAX_STORED_DAYS = 90;
    const MAX_UNIQUE_TRACKED = 2000;

    let memoryFallbackStore = null;
    let memoryClientId = null;
    let lastPageRecordTime = 0;
    let syncChannel = null;

    if (typeof BroadcastChannel !== 'undefined') {
        try {
            syncChannel = new BroadcastChannel('bteb_visitor_sync_channel');
            syncChannel.onmessage = function (ev) {
                if (ev && ev.data && ev.data.type === 'VISITOR_UPDATED') {
                    dispatchUpdatedEvent(ev.data.stats || getStats());
                }
            };
        } catch (e) {}
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', function (e) {
            if (e && e.key === KEYS.STORE) {
                dispatchUpdatedEvent(getStats());
            }
        });
    }

    function pad2(num) {
        return num < 10 ? ('0' + num) : String(num);
    }

    function getLocalDateStr(dateObj) {
        var d = dateObj || new Date();
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function getLocalTimestampStr(dateObj) {
        var d = dateObj || new Date();
        return getLocalDateStr(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function safeReadJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function safeWriteJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
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

    function getOrCreateClientId() {
        if (memoryClientId) return memoryClientId;
        try {
            var existing = localStorage.getItem(KEYS.CLIENT_ID);
            if (existing && /^[A-Za-z0-9_.:-]{4,45}$/.test(existing)) {
                memoryClientId = existing;
                return existing;
            }
        } catch (e) {}

        var randPart = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var buf = new Uint8Array(4);
            crypto.getRandomValues(buf);
            randPart = Array.prototype.map.call(buf, function (b) {
                return ('0' + b.toString(16)).slice(-2);
            }).join('').toUpperCase();
        } else {
            randPart = Math.random().toString(36).slice(2, 10).toUpperCase();
        }

        var clientId = 'Visitor-' + randPart;
        memoryClientId = clientId;
        try {
            localStorage.setItem(KEYS.CLIENT_ID, clientId);
        } catch (e) {}
        return clientId;
    }

    function createEmptyStore() {
        return {
            nextId: 1,
            totalVisits: 0,
            uniqueClients: [],
            dailyStats: {},
            logs: []
        };
    }

    function readStore() {
        var store = safeReadJson(KEYS.STORE, null);
        if (!store) {
            if (!memoryFallbackStore) {
                memoryFallbackStore = createEmptyStore();
            }
            return memoryFallbackStore;
        }
        if (typeof store.nextId !== 'number') store.nextId = 1;
        if (typeof store.totalVisits !== 'number') store.totalVisits = 0;
        if (!Array.isArray(store.uniqueClients)) store.uniqueClients = [];
        if (!store.dailyStats || typeof store.dailyStats !== 'object') store.dailyStats = {};
        if (!Array.isArray(store.logs)) store.logs = [];
        return store;
    }

    function writeStore(store) {
        // Trim logs and daily history so localStorage stays compact
        if (store.logs.length > MAX_STORED_LOGS) {
            store.logs = store.logs.slice(0, MAX_STORED_LOGS);
        }
        var dayKeys = Object.keys(store.dailyStats).sort();
        if (dayKeys.length > MAX_STORED_DAYS) {
            var removeCount = dayKeys.length - MAX_STORED_DAYS;
            for (var i = 0; i < removeCount; i++) {
                delete store.dailyStats[dayKeys[i]];
            }
        }
        if (store.uniqueClients.length > MAX_UNIQUE_TRACKED) {
            store.uniqueClients = store.uniqueClients.slice(-MAX_UNIQUE_TRACKED);
        }

        memoryFallbackStore = store;
        safeWriteJson(KEYS.STORE, store);
    }

    function getApiConfig() {
        var cfg = safeReadJson(KEYS.API_CONFIG, {});
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
        safeWriteJson(KEYS.API_CONFIG, clean);
        dispatchUpdatedEvent(getStats());
        return clean;
    }

    function buildLocalStats(store) {
        var today = getLocalDateStr();
        var todayBucket = store.dailyStats[today];
        return {
            totalVisits: store.totalVisits || 0,
            totalPageViews: store.totalPageViews || store.totalVisits || 0,
            todayVisits: todayBucket && typeof todayBucket.visits === 'number' ? todayBucket.visits : 0,
            uniqueVisitors: Array.isArray(store.uniqueClients) ? store.uniqueClients.length : 0,
            todayUnique: todayBucket && Array.isArray(todayBucket.clients) ? todayBucket.clients.length : 0,
            mode: 'static'
        };
    }

    function recordLocalVisit(pageName) {
        var now = new Date();
        var today = getLocalDateStr(now);
        var timestamp = getLocalTimestampStr(now);
        var clientId = getOrCreateClientId();
        var store = readStore();

        if (!store.dailyStats[today]) {
            store.dailyStats[today] = { visits: 0, clients: [] };
        }
        if (typeof store.totalPageViews !== 'number') {
            store.totalPageViews = store.totalVisits || 0;
        }
        store.totalPageViews += 1;

        // Prevent duplicate log rows for the same visitor on the same date
        var alreadyVisitedToday = store.dailyStats[today].clients.indexOf(clientId) !== -1;
        if (alreadyVisitedToday) {
            writeStore(store);
            var existingStats = buildLocalStats(store);
            return { entry: null, duplicate: true, stats: existingStats };
        }

        var entry = {
            id: store.nextId++,
            ip_address: clientId,
            visit_date: today,
            visited_at: timestamp,
            page: pageName || 'index.html'
        };

        store.totalVisits += 1;
        if (store.uniqueClients.indexOf(clientId) === -1) {
            store.uniqueClients.push(clientId);
        }

        store.dailyStats[today].visits += 1;
        store.dailyStats[today].clients.push(clientId);

        store.logs.unshift(entry);
        writeStore(store);

        var stats = buildLocalStats(store);
        notifySubscribers(stats);
        return { entry: entry, duplicate: false, stats: stats };
    }

    /**
     * Record a page visit locally and (if configured) on the optional PHP/MySQL backend.
     */
    async function recordVisit(pageName, options) {
        var opts = options || {};
        var nowMs = Date.now();
        if (!opts.force && (nowMs - lastPageRecordTime) < 2000) {
            return { skipped: true, stats: getStats() };
        }
        lastPageRecordTime = nowMs;

        var cleanPage = String(pageName || 'index.html').slice(0, 60);
        var localResult = recordLocalVisit(cleanPage);
        var apiCfg = getApiConfig();

        if (!apiCfg.enabled || !apiCfg.endpoint || typeof fetch === 'undefined') {
            return localResult;
        }

        try {
            var res = await fetch(apiCfg.endpoint + '?action=record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'record', page: cleanPage })
            });
            if (res.ok) {
                var data = await res.json();
                if (data && data.ok && data.stats) {
                    data.stats.mode = 'mysql';
                    notifySubscribers(data.stats);
                    return { entry: localResult.entry, stats: data.stats };
                }
            }
        } catch (e) {}

        return localResult;
    }

    function getStats() {
        return buildLocalStats(readStore());
    }

    async function getStatsAsync() {
        var apiCfg = getApiConfig();
        if (!apiCfg.enabled || !apiCfg.endpoint || typeof fetch === 'undefined') {
            return getStats();
        }

        try {
            var res = await fetch(apiCfg.endpoint + '?action=stats', { cache: 'no-store' });
            if (res.ok) {
                var data = await res.json();
                if (data && data.ok && data.stats) {
                    data.stats.mode = 'mysql';
                    return data.stats;
                }
            }
        } catch (e) {}

        var localStats = getStats();
        localStats.backendError = true;
        return localStats;
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
        var store = readStore();
        var byDate = {};

        var dailyKeys = Object.keys(store.dailyStats || {});
        for (var i = 0; i < dailyKeys.length; i++) {
            var d = dailyKeys[i];
            var bucket = store.dailyStats[d];
            var cnt = bucket && typeof bucket.visits === 'number'
                ? bucket.visits
                : (bucket && Array.isArray(bucket.clients) ? bucket.clients.length : 0);
            if (cnt > 0) byDate[d] = cnt;
        }

        // Also reconcile from logs if any entry exists without a bucket count
        var logCounts = {};
        for (var j = 0; j < store.logs.length; j++) {
            var ld = store.logs[j].visit_date;
            if (ld) logCounts[ld] = (logCounts[ld] || 0) + 1;
        }
        var logDateKeys = Object.keys(logCounts);
        for (var k = 0; k < logDateKeys.length; k++) {
            var dateStr = logDateKeys[k];
            if (!byDate[dateStr]) {
                byDate[dateStr] = logCounts[dateStr];
            }
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
        return filterLocalLogs(readStore().logs, filter);
    }

    async function getLogsAsync(filter) {
        var apiCfg = getApiConfig();
        var localStats = getStats();
        var localDaily = getDailySummary(30);
        if (!apiCfg.enabled || !apiCfg.endpoint || typeof fetch === 'undefined') {
            return {
                mode: 'static',
                stats: localStats,
                dailySummary: localDaily,
                logs: getLogs(filter)
            };
        }

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
            if (apiCfg.adminKey) {
                headers['X-Admin-Key'] = apiCfg.adminKey;
            }

            var res = await fetch(apiCfg.endpoint + '?' + params.toString(), {
                headers: headers,
                cache: 'no-store'
            });
            var data = await res.json();
            if (res.ok && data && data.ok) {
                if (data.stats) data.stats.mode = 'mysql';
                return {
                    mode: 'mysql',
                    stats: data.stats || localStats,
                    dailySummary: Array.isArray(data.dailySummary) ? data.dailySummary : [],
                    logs: Array.isArray(data.logs) ? data.logs : []
                };
            }
            return {
                mode: 'static',
                backendError: (data && data.message) || ('HTTP ' + res.status),
                stats: localStats,
                dailySummary: localDaily,
                logs: getLogs(filter)
            };
        } catch (e) {
            return {
                mode: 'static',
                backendError: 'ব্যাকএন্ড সার্ভারের সাথে সংযোগ করা যায়নি (Static মোড দেখানো হচ্ছে)।',
                stats: localStats,
                dailySummary: localDaily,
                logs: getLogs(filter)
            };
        }
    }

    function clearLocalLogs() {
        var fresh = createEmptyStore();
        writeStore(fresh);
        var stats = buildLocalStats(fresh);
        notifySubscribers(stats);
        return stats;
    }

    async function clearLogsAsync() {
        var localStats = clearLocalLogs();
        var apiCfg = getApiConfig();
        if (!apiCfg.enabled || !apiCfg.endpoint || typeof fetch === 'undefined') {
            return { ok: true, mode: 'static', stats: localStats };
        }

        try {
            var headers = { 'Content-Type': 'application/json' };
            if (apiCfg.adminKey) headers['X-Admin-Key'] = apiCfg.adminKey;
            var res = await fetch(apiCfg.endpoint + '?action=clear', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ action: 'clear' })
            });
            var data = await res.json();
            if (res.ok && data && data.ok) {
                return { ok: true, mode: 'mysql', stats: data.stats || localStats };
            }
            return { ok: false, mode: 'static', message: (data && data.message) || 'Backend clear failed', stats: localStats };
        } catch (e) {
            return { ok: true, mode: 'static', stats: localStats };
        }
    }

    function csvEscapeCell(val) {
        var s = String(val === null || typeof val === 'undefined' ? '' : val);
        if (/^[=+\-@\t\r]/.test(s)) {
            s = "'" + s;
        }
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
        var rows = Array.isArray(logsOverride) ? logsOverride : readStore().logs;
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
        var rows = Array.isArray(logsOverride) ? logsOverride : readStore().logs;
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

    function renderFooterCounter(containerId, statsOverride) {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(containerId || 'visitorFooterCounter');
        if (!el) return;

        var s = statsOverride || getStats();
        var total = Number(s.totalVisits || 0).toLocaleString();
        var today = Number(s.todayVisits || 0).toLocaleString();
        var uniqueTotal = Number(s.uniqueVisitors || 0).toLocaleString();

        el.innerHTML =
            '<span class="visitor-pill" title="সর্বমোট ভিজিট সংখ্যা">' +
                '<span class="visitor-live-dot" aria-hidden="true"></span>' +
                '👁️ মোট ভিজিটর: <strong id="footerTotalVisitors">' + total + '</strong>' +
            '</span>' +
            '<span class="visitor-pill" title="আজকের মোট ভিজিট সংখ্যা">' +
                '📅 আজকের ভিজিটর: <strong id="footerTodayVisitors">' + today + '</strong>' +
            '</span>' +
            '<span class="visitor-pill" title="স্বতন্ত্র ভিজিটর সংখ্যা">' +
                '👤 ইউনিক ভিজিটর: <strong id="footerUniqueVisitors">' + uniqueTotal + '</strong>' +
            '</span>';
    }

    /**
     * One-step footer initializer for public pages (index.html, materials.html)
     */
    function initFooterCounter(pageName, containerId) {
        var targetId = containerId || 'visitorFooterCounter';
        renderFooterCounter(targetId, getStats());

        if (typeof window !== 'undefined' && !window._btebVisitorFooterListenerAdded) {
            window._btebVisitorFooterListenerAdded = true;
            window.addEventListener('bteb-visitor-updated', function (ev) {
                renderFooterCounter(targetId, (ev && ev.detail) || getStats());
            });
        }

        recordVisit(pageName || 'index.html').then(function (result) {
            if (result && result.stats) {
                renderFooterCounter(targetId, result.stats);
            }
        });
    }

    return {
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
        initFooterCounter: initFooterCounter
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBVisitor;
}
