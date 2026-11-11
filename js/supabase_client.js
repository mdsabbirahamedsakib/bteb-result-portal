/**
 * BTEB Result & Education Portal - Supabase Cloud Client (supabase_client.js)
 * ---------------------------------------------------------------------------
 * Provides real-time global student result lookup, batch PDF result syncing
 * (gpa1..gpa8, referred subjects, institute/EIIN), single-record CRUD, and
 * connection diagnostics via @supabase/supabase-js v2 with PostgREST fallback.
 */
const BTEBSupabase = (function () {
    'use strict';

    const RUNTIME_CONFIG_KEY = 'bteb_supabase_runtime_config';
    const DEFAULT_TABLE = 'bteb_results';
    const DEFAULT_BATCH_SIZE = 500;
    const DEFAULT_TIMEOUT_MS = 12000;

    let cachedClient = null;
    let cachedClientSig = '';

    function convertBanglaDigits(str) {
        var map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
        return String(str || '').replace(/[০-৯]/g, function (d) { return map[d] || d; });
    }

    function normalizeRoll(roll) {
        if (!roll && roll !== 0) return '';
        if (typeof BTEBParser !== 'undefined' && BTEBParser.cleanRollNumber) {
            return BTEBParser.cleanRollNumber(roll);
        }
        var s = convertBanglaDigits(roll).trim().replace(/^(?:roll\s*(?:no)?[.:\-\s]*|#\s*)/i, '').trim();
        var m = s.match(/\b\d{5,8}\b/);
        return m ? m[0] : s.replace(/[^\w]/g, '').trim();
    }

    function readRuntimeOverride() {
        try {
            if (typeof localStorage === 'undefined') return null;
            var raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function isValidCredentialPair(url, anonKey) {
        var u = String(url || '').trim();
        var k = String(anonKey || '').trim();
        if (!u || !k) return false;
        if (!/^https?:\/\/.+/i.test(u)) return false;
        if (/YOUR_PROJECT_ID/i.test(u) || /YOUR_SUPABASE_ANON_KEY/i.test(k)) return false;
        return k.length >= 16;
    }

    /**
     * Resolve effective Supabase configuration (runtime override takes precedence when valid,
     * otherwise falls back to js/supabase_config.js file settings).
     */
    function getConfig() {
        var base = (typeof window !== 'undefined' && window.BTEB_SUPABASE_CONFIG)
            ? window.BTEB_SUPABASE_CONFIG
            : {};
        var runtime = readRuntimeOverride();

        var url = (runtime && runtime.url) ? String(runtime.url).trim() : String(base.url || '').trim();
        var anonKey = (runtime && runtime.anonKey) ? String(runtime.anonKey).trim() : String(base.anonKey || '').trim();
        url = url.replace(/\/+$/, '');

        var tableName = (runtime && runtime.tableName) || base.tableName || DEFAULT_TABLE;
        var batchSize = parseInt((runtime && runtime.batchSize) || base.batchSize, 10) || DEFAULT_BATCH_SIZE;
        batchSize = Math.max(50, Math.min(1000, batchSize));
        var requestTimeoutMs = parseInt(base.requestTimeoutMs, 10) || DEFAULT_TIMEOUT_MS;

        return {
            url: url,
            anonKey: anonKey,
            tableName: String(tableName || DEFAULT_TABLE).trim(),
            batchSize: batchSize,
            requestTimeoutMs: requestTimeoutMs,
            hasRuntimeOverride: Boolean(runtime && runtime.url && runtime.anonKey)
        };
    }

    function isConfigured() {
        var cfg = getConfig();
        return isValidCredentialPair(cfg.url, cfg.anonKey);
    }

    function saveConfig(newCfg) {
        var current = getConfig();
        var url = String((newCfg && newCfg.url !== undefined ? newCfg.url : current.url) || '').trim().replace(/\/+$/, '');
        var anonKey = String((newCfg && newCfg.anonKey !== undefined ? newCfg.anonKey : current.anonKey) || '').trim();
        var tableName = String((newCfg && newCfg.tableName) || current.tableName || DEFAULT_TABLE).trim();

        var payload = {
            url: url,
            anonKey: anonKey,
            tableName: tableName,
            updatedAt: new Date().toISOString()
        };

        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(payload));
            }
        } catch (e) {}

        cachedClient = null;
        cachedClientSig = '';
        return getConfig();
    }

    function clearRuntimeConfig() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(RUNTIME_CONFIG_KEY);
            }
        } catch (e) {}
        cachedClient = null;
        cachedClientSig = '';
        return getConfig();
    }

    function getClient() {
        if (!isConfigured()) return null;
        var cfg = getConfig();
        var sig = cfg.url + '|' + cfg.anonKey;
        if (cachedClient && cachedClientSig === sig) {
            return cachedClient;
        }
        if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
            cachedClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            });
            cachedClientSig = sig;
            return cachedClient;
        }
        return null;
    }

    function withTimeout(promise, ms) {
        var limit = ms || DEFAULT_TIMEOUT_MS;
        return Promise.race([
            promise,
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error('Supabase request timed out (' + limit + 'ms)'));
                }, limit);
            })
        ]);
    }

    async function restRequest(method, pathAndQuery, body, extraHeaders, timeoutMs) {
        var cfg = getConfig();
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timerId = setTimeout(function () {
            if (controller) controller.abort();
        }, timeoutMs || cfg.requestTimeoutMs);

        try {
            var headers = Object.assign({
                'apikey': cfg.anonKey,
                'Authorization': 'Bearer ' + cfg.anonKey,
                'Content-Type': 'application/json'
            }, extraHeaders || {});

            var resp = await fetch(cfg.url + '/rest/v1/' + pathAndQuery, {
                method: method,
                headers: headers,
                body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
                signal: controller ? controller.signal : undefined
            });

            var text = await resp.text();
            var data = null;
            if (text) {
                try { data = JSON.parse(text); } catch (e) { data = text; }
            }

            if (!resp.ok) {
                var msg = (data && data.message) ? data.message : ('HTTP ' + resp.status);
                return { data: null, error: { message: msg, status: resp.status, details: data }, headers: resp.headers };
            }

            return { data: data, error: null, headers: resp.headers };
        } catch (err) {
            return { data: null, error: { message: err && err.message ? err.message : 'Network error' }, headers: null };
        } finally {
            clearTimeout(timerId);
        }
    }

    function parseReferredStringList(refText) {
        if (!refText) return [];
        return String(refText)
            .split(/[,;\n]+/)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    }

    function buildReferredMetadata(student) {
        var codesList = [];
        var objList = [];
        var seen = {};

        function pushRef(rawOrObj) {
            if (!rawOrObj) return;
            var rawStr = typeof rawOrObj === 'string'
                ? rawOrObj.trim()
                : String(rawOrObj.raw || (rawOrObj.code ? (rawOrObj.code + (rawOrObj.type ? '(' + rawOrObj.type + ')' : '')) : '')).trim();
            if (!rawStr || seen[rawStr]) return;
            seen[rawStr] = true;

            var match = rawStr.match(/^(\d+)(?:\(([TP,]+)\))?/i);
            var code = (typeof rawOrObj === 'object' && rawOrObj.code) ? String(rawOrObj.code).trim() : (match ? match[1] : rawStr);
            var type = (typeof rawOrObj === 'object' && rawOrObj.type) ? String(rawOrObj.type).toUpperCase() : (match && match[2] ? match[2].toUpperCase() : 'T');
            var hasT = type.indexOf('T') !== -1;
            var hasP = type.indexOf('P') !== -1;
            var typeLabel = (typeof rawOrObj === 'object' && rawOrObj.typeLabel)
                ? rawOrObj.typeLabel
                : ((hasT && hasP) ? 'তত্ত্বীয় ও ব্যবহারিক (T,P)' : (hasP ? 'ব্যবহারিক (Practical)' : 'তত্ত্বীয় (Theory)'));
            var badgeClass = (typeof rawOrObj === 'object' && rawOrObj.badgeClass)
                ? rawOrObj.badgeClass
                : ((hasT && hasP) ? 'badge-danger' : (hasP ? 'badge-info' : 'badge-warning'));

            codesList.push(rawStr);
            objList.push({
                code: code,
                type: type,
                raw: rawStr,
                typeLabel: typeLabel,
                badgeClass: badgeClass
            });
        }

        if (Array.isArray(student.referredSubjects) && student.referredSubjects.length > 0) {
            student.referredSubjects.forEach(pushRef);
        }
        if (Array.isArray(student.referred) && student.referred.length > 0) {
            student.referred.forEach(pushRef);
        }
        if (typeof student.refSub === 'string' && student.refSub.trim()) {
            parseReferredStringList(student.refSub).forEach(pushRef);
        }

        return { referred: codesList, referredSubjects: objList };
    }

    function normalizeGpaValue(val) {
        if (val === undefined || val === null || val === '') return null;
        if (typeof val === 'object') {
            val = val.value !== undefined ? val.value : val.label;
        }
        if (val === undefined || val === null || val === '') return null;
        var str = String(val).trim();
        if (!str) return null;
        var low = str.toLowerCase();
        if (low === 'ref' || low === 'referred') return 'Referred';
        if (low === 'abs' || low === 'absent') return 'Absent';
        if (low === 'drop' || low === 'dropped' || low === 'dropped out') return 'Dropped Out';
        var num = parseFloat(str);
        return (!isNaN(num) && /^\d(?:\.\d+)?$/.test(str)) ? num.toFixed(2) : str;
    }

    function buildSemesterEntry(semNum, gpaVal) {
        var norm = normalizeGpaValue(gpaVal);
        if (!norm) return null;
        var low = norm.toLowerCase();
        var isRef = low === 'referred' || low === 'ref';
        var isAbs = low === 'absent' || low === 'abs';
        var isDrop = low.indexOf('drop') !== -1;
        var num = parseFloat(norm);
        var isPassed = !isRef && !isAbs && !isDrop && !isNaN(num);
        return {
            semester: semNum,
            value: isRef ? 'Referred' : (isAbs ? 'Absent' : (isDrop ? 'Dropped Out' : num.toFixed(2))),
            numericValue: isPassed ? num : null,
            isReferred: isRef,
            isAbsent: isAbs,
            isPassed: isPassed,
            label: isRef ? 'রেফার্ড (Ref)' : (isAbs ? 'অনুপস্থিত' : (isDrop ? 'ড্রপ (Drop)' : num.toFixed(2)))
        };
    }

    /**
     * Convert an internal portal student record into a flat Supabase bteb_results row.
     */
    function toDbRow(student) {
        if (!student || !student.roll) return null;
        var roll = normalizeRoll(student.roll);
        if (!roll) return null;

        var gpas = {};
        var semesters = {};
        var maxSem = 0;

        for (var s = 1; s <= 8; s++) {
            var rawGpa = student['gpa' + s];
            if (!rawGpa && student.gpas && student.gpas['gpa' + s]) rawGpa = student.gpas['gpa' + s];
            if (!rawGpa && student.semesters && student.semesters[s]) rawGpa = student.semesters[s];

            var semEntry = (student.semesters && student.semesters[s] && typeof student.semesters[s] === 'object' && student.semesters[s].value)
                ? Object.assign({ semester: s }, student.semesters[s])
                : buildSemesterEntry(s, rawGpa);

            if (semEntry) {
                semesters[s] = semEntry;
                gpas['gpa' + s] = semEntry.value;
                maxSem = s;
            } else {
                gpas['gpa' + s] = normalizeGpaValue(rawGpa);
            }
        }

        var refs = buildReferredMetadata(student);
        var status = student.status || (refs.referred.length > 0 ? 'Referred' : 'Passed');
        var statusBangla = student.statusBangla || (status === 'Referred' ? 'রেফার্ড' : (status === 'Dropped Out' ? 'ড্রপ আউট' : 'উত্তীর্ণ'));
        var statusType = student.statusType || (status === 'Referred' ? 'warning' : (status === 'Dropped Out' ? 'danger' : 'success'));

        var instCode = student.institute_code || student.instituteCode || student.ic || null;
        var instName = student.institute_name || student.instituteName || student.in || null;
        var latestSem = parseInt(student.latestSemester || student.semester, 10) || maxSem || 5;
        var source = student.source || 'pdf';
        var sourcePriority = student.sourcePriority || (source === 'pdf' ? 10 : 5);

        return {
            roll: roll,
            institute_code: instCode ? String(instCode).trim() : null,
            institute_name: instName ? String(instName).trim() : null,
            gpa1: gpas.gpa1 || null,
            gpa2: gpas.gpa2 || null,
            gpa3: gpas.gpa3 || null,
            gpa4: gpas.gpa4 || null,
            gpa5: gpas.gpa5 || null,
            gpa6: gpas.gpa6 || null,
            gpa7: gpas.gpa7 || null,
            gpa8: gpas.gpa8 || null,
            referred: refs.referred,
            referred_subjects: refs.referredSubjects,
            semesters: semesters,
            status: status,
            status_bangla: statusBangla,
            status_type: statusType,
            latest_semester: latestSem,
            regulation: String(student.regulation || '2022'),
            exam_year: String(student.examYear || '2024'),
            source: source,
            source_priority: sourcePriority,
            source_label: student.sourceLabel || (source === 'pdf' ? '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)' : '📋 কপি-পেস্ট রেজাল্ট শিট'),
            sheet_id: student.sheetId || null,
            updated_at: student.updatedAt || new Date().toISOString()
        };
    }

    /**
     * Reconstruct a portal student object from a Supabase bteb_results row.
     */
    function fromDbRow(row) {
        if (!row || !row.roll) return null;
        var semesters = {};
        if (row.semesters && typeof row.semesters === 'object') {
            for (var key in row.semesters) {
                if (Object.prototype.hasOwnProperty.call(row.semesters, key) && row.semesters[key]) {
                    semesters[key] = Object.assign({}, row.semesters[key]);
                }
            }
        }

        var maxSem = 0;
        for (var s = 1; s <= 8; s++) {
            var flatVal = row['gpa' + s];
            if (flatVal && !semesters[s]) {
                var built = buildSemesterEntry(s, flatVal);
                if (built) semesters[s] = built;
            }
            if (semesters[s] || flatVal) maxSem = s;
        }

        var refs = buildReferredMetadata({
            referred: Array.isArray(row.referred) ? row.referred : [],
            referredSubjects: Array.isArray(row.referred_subjects) ? row.referred_subjects : []
        });

        var status = row.status || (refs.referred.length > 0 ? 'Referred' : 'Passed');
        var source = row.source || 'pdf';

        return {
            roll: String(row.roll).trim(),
            institute_code: row.institute_code || null,
            institute_name: row.institute_name || null,
            gpa1: row.gpa1 || null,
            gpa2: row.gpa2 || null,
            gpa3: row.gpa3 || null,
            gpa4: row.gpa4 || null,
            gpa5: row.gpa5 || null,
            gpa6: row.gpa6 || null,
            gpa7: row.gpa7 || null,
            gpa8: row.gpa8 || null,
            referred: refs.referred,
            referredSubjects: refs.referredSubjects,
            semesters: semesters,
            status: status,
            statusBangla: row.status_bangla || (status === 'Referred' ? 'রেফার্ড' : (status === 'Dropped Out' ? 'ড্রপ আউট' : 'উত্তীর্ণ')),
            statusType: row.status_type || (status === 'Referred' ? 'warning' : (status === 'Dropped Out' ? 'danger' : 'success')),
            latestSemester: row.latest_semester || maxSem || 5,
            regulation: row.regulation || '2022',
            examYear: row.exam_year || '2024',
            source: source,
            sourcePriority: row.source_priority || (source === 'pdf' ? 10 : 5),
            sources: [source],
            sourceLabel: row.source_label || '☁️ Supabase ক্লাউড ডেটাবেস (Live)',
            sheetId: row.sheet_id || null,
            updatedAt: row.updated_at || new Date().toISOString(),
            _fromSupabase: true
        };
    }

    function deduplicateRows(students) {
        var rowMap = new Map();
        for (var i = 0; i < students.length; i++) {
            var row = toDbRow(students[i]);
            if (!row) continue;
            var existing = rowMap.get(row.roll);
            if (!existing || (row.source_priority >= existing.source_priority)) {
                rowMap.set(row.roll, row);
            }
        }
        return Array.from(rowMap.values());
    }

    async function upsertChunkOnce(client, cfg, chunk) {
        if (client) {
            var res = await withTimeout(
                client.from(cfg.tableName).upsert(chunk, { onConflict: 'roll', ignoreDuplicates: false }),
                cfg.requestTimeoutMs
            );
            return { error: res.error || null };
        }
        var restRes = await restRequest(
            'POST',
            encodeURIComponent(cfg.tableName) + '?on_conflict=roll',
            chunk,
            { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            cfg.requestTimeoutMs
        );
        return { error: restRes.error || null };
    }

    /**
     * Batch upsert parsed students into Supabase bteb_results table with automatic retry & chunk splitting.
     */
    async function batchUpsertStudents(students, onProgress) {
        if (!isConfigured()) {
            return { success: false, skipped: true, uploadedCount: 0, totalCount: 0, error: 'Supabase is not configured' };
        }
        if (!Array.isArray(students) || students.length === 0) {
            return { success: true, uploadedCount: 0, totalCount: 0 };
        }

        var cfg = getConfig();
        var client = getClient();
        var rows = deduplicateRows(students);
        var total = rows.length;
        if (total === 0) {
            return { success: true, uploadedCount: 0, totalCount: 0 };
        }

        var batchSize = cfg.batchSize;
        var totalBatches = Math.ceil(total / batchSize);
        var uploaded = 0;
        var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        for (var b = 0; b < totalBatches; b++) {
            var start = b * batchSize;
            var chunk = rows.slice(start, start + batchSize);
            var attempt = await upsertChunkOnce(client, cfg, chunk);

            if (attempt.error && chunk.length > 100) {
                var mid = Math.ceil(chunk.length / 2);
                var sub1 = await upsertChunkOnce(client, cfg, chunk.slice(0, mid));
                var sub2 = !sub1.error ? await upsertChunkOnce(client, cfg, chunk.slice(mid)) : sub1;
                attempt = sub2;
            }

            if (attempt.error) {
                return {
                    success: false,
                    uploadedCount: uploaded,
                    totalCount: total,
                    error: attempt.error.message || 'Batch upsert failed'
                };
            }

            uploaded += chunk.length;
            if (typeof onProgress === 'function') {
                onProgress({
                    uploaded: uploaded,
                    total: total,
                    batchIndex: b + 1,
                    totalBatches: totalBatches,
                    percent: Math.min(100, Math.round((uploaded / total) * 100))
                });
            }
        }

        var t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        return {
            success: true,
            uploadedCount: uploaded,
            totalCount: total,
            elapsedMs: parseFloat((t1 - t0).toFixed(1))
        };
    }

    async function upsertStudent(student) {
        return batchUpsertStudents(student ? [student] : []);
    }

    /**
     * Real-time Student Lookup by Roll from Supabase (Primary Global Query).
     */
    async function fetchStudentByRoll(roll) {
        if (!isConfigured()) {
            return { student: null, configured: false, latencyMs: 0, error: null };
        }

        var clean = normalizeRoll(roll);
        if (!clean) {
            return { student: null, configured: true, latencyMs: 0, error: null };
        }

        var cfg = getConfig();
        var client = getClient();
        var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        var stripped = clean.replace(/^0+/, '');
        var rollsToCheck = (stripped && stripped !== clean) ? [clean, stripped] : [clean];

        try {
            var foundRow = null;
            if (client) {
                var query = client.from(cfg.tableName).select('*');
                query = rollsToCheck.length > 1
                    ? query.in('roll', rollsToCheck).limit(2)
                    : query.eq('roll', clean).limit(1);
                var res = await withTimeout(query, cfg.requestTimeoutMs);
                if (res.error) {
                    return { student: null, configured: true, latencyMs: 0, error: res.error.message };
                }
                if (Array.isArray(res.data) && res.data.length > 0) {
                    foundRow = res.data.find(function (r) { return r.roll === clean; }) || res.data[0];
                }
            } else {
                var filterVal = rollsToCheck.length > 1
                    ? 'in.(' + rollsToCheck.map(encodeURIComponent).join(',') + ')'
                    : 'eq.' + encodeURIComponent(clean);
                var restRes = await restRequest(
                    'GET',
                    encodeURIComponent(cfg.tableName) + '?select=*&roll=' + filterVal + '&limit=2',
                    null,
                    null,
                    cfg.requestTimeoutMs
                );
                if (restRes.error) {
                    return { student: null, configured: true, latencyMs: 0, error: restRes.error.message };
                }
                if (Array.isArray(restRes.data) && restRes.data.length > 0) {
                    foundRow = restRes.data.find(function (r) { return r.roll === clean; }) || restRes.data[0];
                }
            }

            var t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            return {
                student: foundRow ? fromDbRow(foundRow) : null,
                configured: true,
                latencyMs: parseFloat((t1 - t0).toFixed(2)),
                error: null
            };
        } catch (err) {
            return {
                student: null,
                configured: true,
                latencyMs: 0,
                error: err && err.message ? err.message : 'Query failed'
            };
        }
    }

    async function deleteStudentByRoll(roll) {
        if (!isConfigured()) return { success: false, skipped: true };
        var clean = normalizeRoll(roll);
        if (!clean) return { success: false, skipped: true };

        var cfg = getConfig();
        var client = getClient();
        if (client) {
            var res = await withTimeout(client.from(cfg.tableName).delete().eq('roll', clean), cfg.requestTimeoutMs);
            return { success: !res.error, error: res.error ? res.error.message : null };
        }
        var restRes = await restRequest('DELETE', encodeURIComponent(cfg.tableName) + '?roll=eq.' + encodeURIComponent(clean));
        return { success: !restRes.error, error: restRes.error ? restRes.error.message : null };
    }

    async function deleteBySheetId(sheetId) {
        if (!isConfigured() || !sheetId) return { success: false, skipped: true };
        var cfg = getConfig();
        var client = getClient();
        if (client) {
            var res = await withTimeout(client.from(cfg.tableName).delete().eq('sheet_id', sheetId), cfg.requestTimeoutMs);
            return { success: !res.error, error: res.error ? res.error.message : null };
        }
        var restRes = await restRequest('DELETE', encodeURIComponent(cfg.tableName) + '?sheet_id=eq.' + encodeURIComponent(sheetId));
        return { success: !restRes.error, error: restRes.error ? restRes.error.message : null };
    }

    async function deleteAllResults() {
        if (!isConfigured()) return { success: false, skipped: true };
        var cfg = getConfig();
        var client = getClient();
        if (client) {
            var res = await withTimeout(client.from(cfg.tableName).delete().neq('roll', '__BTEB_EMPTY__'), cfg.requestTimeoutMs);
            return { success: !res.error, error: res.error ? res.error.message : null };
        }
        var restRes = await restRequest('DELETE', encodeURIComponent(cfg.tableName) + '?roll=neq.__BTEB_EMPTY__');
        return { success: !restRes.error, error: restRes.error ? restRes.error.message : null };
    }

    /**
     * Test Supabase connectivity & count total rows in bteb_results without downloading rows.
     */
    async function testConnection() {
        if (!isConfigured()) {
            return { connected: false, configured: false, totalRows: 0, latencyMs: 0, error: 'URL ও Anon Key সেট করা হয়নি' };
        }
        var cfg = getConfig();
        var client = getClient();
        var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        try {
            var totalRows = 0;
            if (client) {
                var res = await withTimeout(
                    client.from(cfg.tableName).select('roll', { count: 'exact', head: true }),
                    cfg.requestTimeoutMs
                );
                if (res.error) {
                    return { connected: false, configured: true, totalRows: 0, latencyMs: 0, error: res.error.message };
                }
                totalRows = typeof res.count === 'number' ? res.count : 0;
            } else {
                var restRes = await restRequest(
                    'GET',
                    encodeURIComponent(cfg.tableName) + '?select=roll&limit=1',
                    null,
                    { 'Prefer': 'count=exact' },
                    cfg.requestTimeoutMs
                );
                if (restRes.error) {
                    return { connected: false, configured: true, totalRows: 0, latencyMs: 0, error: restRes.error.message };
                }
                var cr = restRes.headers ? restRes.headers.get('content-range') : '';
                var m = cr ? cr.match(/\/(\d+)\s*$/) : null;
                totalRows = m ? parseInt(m[1], 10) : (Array.isArray(restRes.data) ? restRes.data.length : 0);
            }
            var t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            return {
                connected: true,
                configured: true,
                totalRows: totalRows,
                latencyMs: parseFloat((t1 - t0).toFixed(1)),
                sdkLoaded: Boolean(client),
                error: null
            };
        } catch (err) {
            return {
                connected: false,
                configured: true,
                totalRows: 0,
                latencyMs: 0,
                error: err && err.message ? err.message : 'Connection failed'
            };
        }
    }

    function generateConfigFileText(url, anonKey) {
        var cfg = getConfig();
        var finalUrl = String(url !== undefined ? url : cfg.url || '').trim().replace(/\/+$/, '');
        var finalKey = String(anonKey !== undefined ? anonKey : cfg.anonKey || '').trim();
        return '/**\n'
            + ' * BTEB Result & Education Portal - Supabase Configuration\n'
            + ' * Generated at: ' + new Date().toISOString() + '\n'
            + ' */\n'
            + '(function (global) {\n'
            + '    \'use strict\';\n\n'
            + '    global.BTEB_SUPABASE_CONFIG = {\n'
            + '        url: ' + JSON.stringify(finalUrl || 'https://YOUR_PROJECT_ID.supabase.co') + ',\n'
            + '        anonKey: ' + JSON.stringify(finalKey || 'YOUR_SUPABASE_ANON_KEY') + ',\n'
            + '        tableName: ' + JSON.stringify(cfg.tableName || DEFAULT_TABLE) + ',\n'
            + '        batchSize: ' + (cfg.batchSize || DEFAULT_BATCH_SIZE) + ',\n'
            + '        requestTimeoutMs: ' + (cfg.requestTimeoutMs || DEFAULT_TIMEOUT_MS) + '\n'
            + '    };\n'
            + '})(typeof window !== \'undefined\' ? window : globalThis);\n';
    }

    function downloadConfigFile(url, anonKey) {
        var content = generateConfigFileText(url, anonKey);
        var blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objUrl;
        a.download = 'supabase_config.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
    }

    return {
        getConfig: getConfig,
        isConfigured: isConfigured,
        saveConfig: saveConfig,
        clearRuntimeConfig: clearRuntimeConfig,
        getClient: getClient,
        toDbRow: toDbRow,
        fromDbRow: fromDbRow,
        batchUpsertStudents: batchUpsertStudents,
        upsertStudent: upsertStudent,
        fetchStudentByRoll: fetchStudentByRoll,
        deleteStudentByRoll: deleteStudentByRoll,
        deleteBySheetId: deleteBySheetId,
        deleteAllResults: deleteAllResults,
        testConnection: testConnection,
        generateConfigFileText: generateConfigFileText,
        downloadConfigFile: downloadConfigFile
    };
})();

if (typeof window !== 'undefined') {
    window.BTEBSupabase = BTEBSupabase;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBSupabase;
}
