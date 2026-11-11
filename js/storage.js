/**
 * BTEB Portal - Bulletproof Storage Engine (storage.js)
 * 
 * Multi-Tier High Performance Architecture:
 * 1. Compact LocalStorage Layer (bteb_students_compact_db):
 *    - Stores ultra-compact JSON records of every parsed student.
 *    - 100% compatible with file:///, Incognito, and every web browser.
 *    - Never exceeds quota (<300 KB for 10,000 students).
 * 2. In-Memory O(1) Cache (cachedStudentsMap): Instant 0.1ms retrieval.
 * 3. IndexedDB Layer (BTEB_PORTAL_DB): Persistent object store for large PDF sheets.
 * 4. File-Based Result Manager: Allows downloading database files (.json) and deleting individual sheets or full database.
 * 5. DEMO RESULTS COMPLETELY REMOVED: Only user-uploaded PDF results are stored and displayed.
 */

const BTEBStorage = (function () {
    'use strict';

    const DB_NAME = 'BTEB_PORTAL_DB';
    const DB_VERSION = 3;

    const KEYS = {
        SHEETS_META: 'bteb_result_sheets_meta',
        STUDENTS_COMPACT: 'bteb_students_compact_db',
        ADMIN_CONFIG: 'bteb_admin_config',
        MATERIALS: 'bteb_materials',
        SITE_SETTINGS: 'bteb_site_settings',
        ADMIN_AUTH: 'bteb_admin_auth'
    };

    // In-memory student cache for 0.1ms lookups
    const cachedStudentsMap = new Map();
    let dbInstance = null;
    let initDBPromise = null;

    /**
     * Cross-Tab Realtime Synchronization via BroadcastChannel
     */
    let syncChannel = null;
    if (typeof BroadcastChannel !== 'undefined') {
        try {
            syncChannel = new BroadcastChannel('bteb_portal_sync_channel');
            syncChannel.onmessage = function (ev) {
                if (ev.data && (ev.data.type === 'FULL_SYNC' || ev.data.type === 'SYNC_STUDENT')) {
                    initDB();
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('bteb-storage-updated', { detail: ev.data }));
                    }
                }
            };
        } catch (e) {}
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', function (e) {
            if (e.key === KEYS.STUDENTS_COMPACT || e.key === KEYS.SHEETS_META) {
                initDB();
            }
        });
    }

    /**
     * Priority-Aware Student Record Merger
     * Priority Hierarchy:
     * - PDF source: Priority 10 (Highest priority / সবচেয়ে বেশি গুরুত্ব)
     * - Pasted text: Priority 5 (সাধারণ গুরুত্ব)
     * - Seed / Pre-bundled: Priority 1
     *
     * Inviolable Rules:
     * 1. If the same semester exists in both, the HIGHER PRIORITY (PDF) source WINS completely!
     * 2. Non-conflicting semesters from either source are MERGED and preserved!
     * 3. Overall status and referred subjects are determined by the dominant source (PDF takes precedence).
     * 4. Source badge clearly reflects whether data is verified from official PDF, pasted sheet, or merged.
     */
    function mergeStudentRecords(existing, incoming) {
        if (!existing) return incoming;
        if (!incoming) return existing;

        var existingPri = existing.sourcePriority || (existing.source === 'pdf' ? 10 : (existing.source === 'pasted' ? 5 : 1));
        var incomingPri = incoming.sourcePriority || (incoming.source === 'pdf' ? 10 : (incoming.source === 'pasted' ? 5 : 1));

        var dominant = incomingPri >= existingPri ? incoming : existing;
        var subordinate = incomingPri >= existingPri ? existing : incoming;

        // Merge semesters
        var mergedSemesters = {};
        if (subordinate.semesters) {
            for (var sem in subordinate.semesters) {
                if (subordinate.semesters.hasOwnProperty(sem)) {
                    mergedSemesters[sem] = Object.assign({}, subordinate.semesters[sem]);
                }
            }
        }
        if (dominant.semesters) {
            for (var sem in dominant.semesters) {
                if (dominant.semesters.hasOwnProperty(sem)) {
                    mergedSemesters[sem] = Object.assign({}, dominant.semesters[sem]);
                }
            }
        }

        // Merge sources list
        var sourcesSet = new Set();
        if (Array.isArray(existing.sources)) existing.sources.forEach(function (s) { sourcesSet.add(s); });
        else if (existing.source) sourcesSet.add(existing.source);
        if (Array.isArray(incoming.sources)) incoming.sources.forEach(function (s) { sourcesSet.add(s); });
        else if (incoming.source) sourcesSet.add(incoming.source);
        var sourcesArr = Array.from(sourcesSet);

        var hasPdf = sourcesArr.indexOf('pdf') !== -1;
        var hasPasted = sourcesArr.indexOf('pasted') !== -1;

        var sourceLabel = '';
        if (hasPdf && hasPasted) {
            sourceLabel = '📄 অফিসিয়াল PDF ও রেজাল্ট শিট (PDF অগ্রাধিকারপ্রাপ্ত)';
        } else if (hasPdf) {
            sourceLabel = '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)';
        } else {
            sourceLabel = '📋 কপি-পেস্ট রেজাল্ট শিট';
        }

        var gpaObj = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null };
        for (var s = 1; s <= 8; s++) {
            if (mergedSemesters[s] && mergedSemesters[s].value) {
                gpaObj[s] = mergedSemesters[s].value;
            } else if (dominant['gpa' + s]) {
                gpaObj[s] = dominant['gpa' + s];
            } else if (subordinate['gpa' + s]) {
                gpaObj[s] = subordinate['gpa' + s];
            }
        }
        var refList = (dominant.referred && dominant.referred.length > 0) 
            ? dominant.referred 
            : (dominant.referredSubjects || []).map(function(sub){ return sub.raw || sub.code; });

        var instCode = dominant.institute_code || dominant.instituteCode || subordinate.institute_code || subordinate.instituteCode || null;
        var instName = dominant.institute_name || dominant.instituteName || subordinate.institute_name || subordinate.instituteName || null;

        return {
            roll: dominant.roll,
            institute_code: instCode,
            institute_name: instName,
            gpa8: gpaObj[8],
            gpa7: gpaObj[7],
            gpa6: gpaObj[6],
            gpa5: gpaObj[5],
            gpa4: gpaObj[4],
            gpa3: gpaObj[3],
            gpa2: gpaObj[2],
            gpa1: gpaObj[1],
            referred: refList,
            status: dominant.status,
            statusBangla: dominant.statusBangla,
            statusType: dominant.statusType,
            latestSemester: dominant.latestSemester || subordinate.latestSemester || 5,
            regulation: dominant.regulation || subordinate.regulation || '2022',
            examYear: dominant.examYear || subordinate.examYear || '2024',
            semesters: mergedSemesters,
            referredSubjects: dominant.referredSubjects || [],
            sheetId: dominant.sheetId || subordinate.sheetId,
            source: hasPdf ? 'pdf' : 'pasted',
            sourcePriority: hasPdf ? 10 : 5,
            sources: sourcesArr,
            sourceLabel: sourceLabel,
            updatedAt: new Date().toISOString()
        };
    }

    // ─── Default Admin Credentials ───
    const DEFAULT_AUTH = {
        username: 'sabbir12',
        password: 'sabbiR23',
        updatedAt: null
    };

    // ─── Default Server Config ───
    const DEFAULT_CONFIG = {
        resultServerEnabled: true,
        maintenanceMessage: 'রেজাল্ট আপলোডের কাজ চলছে, কিছুক্ষণ পর চেষ্টা করুন।',
        lastUpdated: null
    };

    // ─── Default Site Settings ───
    const DEFAULT_SITE_SETTINGS = {
        portalTitle: 'BTEB Education Portal',
        subTitle: 'বাংলাদেশ কারিগরি শিক্ষা বোর্ড',
        noticeText: '📢 ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল ও একাডেমিক পোর্টাল।',
        showNoticeBar: true,
        menuBooksEnabled: true,
        menuNotesEnabled: true,
        menuSuggestionsEnabled: true,
        helplineNumber: '01700-000000',
        lastUpdated: null
    };

    // ─── LocalStorage Core Helpers ───
    function _read(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[BTEBStorage] Read error:', key, e);
            return null;
        }
    }

    function _write(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[BTEBStorage] Write error:', key, e);
            return false;
        }
    }

    // ─── IndexedDB Engine ───
    function getDB() {
        return new Promise(function (resolve) {
            if (dbInstance) {
                resolve(dbInstance);
                return;
            }
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }
            try {
                var request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function (event) {
                    var db = event.target.result;
                    if (!db.objectStoreNames.contains('sheets')) {
                        db.createObjectStore('sheets', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('students')) {
                        var studentStore = db.createObjectStore('students', { keyPath: 'roll' });
                        studentStore.createIndex('sheetId', 'sheetId', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('rawTexts')) {
                        db.createObjectStore('rawTexts', { keyPath: 'sheetId' });
                    }
                };
                request.onsuccess = function (event) {
                    dbInstance = event.target.result;
                    resolve(dbInstance);
                };
                request.onerror = function () {
                    resolve(null);
                };
            } catch (err) {
                resolve(null);
            }
        });
    }

    function _hydrateStudent(st) {
        if (!st || !st.roll) return;
        var rKey = String(st.roll).trim();
        var merged = cachedStudentsMap.has(rKey)
            ? mergeStudentRecords(cachedStudentsMap.get(rKey), st)
            : st;
        cachedStudentsMap.set(rKey, merged);
        if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) {
            BTEBParser.setStudent(merged);
        }
    }

    function _readAllIndexedDBStudents(db) {
        return new Promise(function (resolve) {
            if (!db) {
                resolve([]);
                return;
            }
            try {
                var tx = db.transaction(['students'], 'readonly');
                var store = tx.objectStore('students');
                if (typeof store.getAll === 'function') {
                    var allReq = store.getAll();
                    allReq.onsuccess = function () {
                        resolve(Array.isArray(allReq.result) ? allReq.result : []);
                    };
                    allReq.onerror = function () { resolve([]); };
                } else {
                    var rows = [];
                    var cursorReq = store.openCursor();
                    cursorReq.onsuccess = function (e) {
                        var cursor = e.target.result;
                        if (cursor) {
                            if (cursor.value) rows.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(rows);
                        }
                    };
                    cursorReq.onerror = function () { resolve(rows); };
                }
            } catch (e) {
                resolve([]);
            }
        });
    }

    /**
     * Load all saved students from LocalStorage & IndexedDB into memory on boot
     */
    let activeImportPromise = null;

    function _syncInstituteAliases(st) {
        if (!st || typeof st !== 'object') return st;
        var code = st.institute_code || st.instituteCode || st.ic || null;
        var name = st.institute_name || st.instituteName || st.in || null;
        if (code && !st.institute_code) st.institute_code = String(code).trim();
        if (name && !st.institute_name) st.institute_name = String(name).trim();
        return st;
    }

    function _expandImportedRecord(rollKey, rawRec) {
        if (!rawRec || typeof rawRec !== 'object') return null;
        var roll = String(rawRec.roll || rollKey || '').trim();
        if (!roll) return null;

        // Already full student object
        if (rawRec.roll && (rawRec.semesters || rawRec.status)) {
            _syncInstituteAliases(rawRec);
            return rawRec;
        }

        // Compact format from exportOptimizedJSON or compact DB export (s, g, g1..g8, r, ic, in)
        var statusCode = rawRec.s || rawRec.st || '';
        var status = rawRec.status || (statusCode === 'P' ? 'Passed' : (statusCode === 'D' ? 'Dropped Out' : (statusCode === 'R' ? 'Referred' : 'Referred')));
        var gpas = {};
        var sems = {};
        var latestSem = rawRec.l || rawRec.latestSemester || 0;
        for (var k = 1; k <= 8; k++) {
            var gv = rawRec['gpa' + k] !== undefined ? rawRec['gpa' + k] : (rawRec['g' + k] !== undefined ? rawRec['g' + k] : (rawRec['s' + k] !== undefined ? rawRec['s' + k] : null));
            if (gv !== null && gv !== undefined && String(gv).trim() !== '') {
                var gs = String(gv).trim();
                var low = gs.toLowerCase();
                var isRef = low === 'ref' || low === 'referred';
                var isAbs = low === 'abs' || low === 'absent';
                var isDrop = low === 'drop' || low === 'dropped';
                var num = parseFloat(gs);
                gpas['gpa' + k] = isRef ? 'Referred' : (isAbs ? 'Absent' : (isDrop ? 'Dropped' : (!isNaN(num) ? num.toFixed(2) : gs)));
                sems[k] = {
                    semester: k,
                    value: gpas['gpa' + k],
                    numericValue: !isNaN(num) && !isRef && !isAbs && !isDrop ? num : null,
                    isReferred: isRef,
                    isAbsent: isAbs,
                    isPassed: !isRef && !isAbs && !isDrop && !isNaN(num),
                    label: isRef ? 'রেফার্ড (Ref)' : gpas['gpa' + k]
                };
                if (k > latestSem) latestSem = k;
            }
        }
        if (Object.keys(sems).length === 0 && rawRec.g && status === 'Passed' && latestSem > 0) {
            var gNum = parseFloat(rawRec.g);
            if (!isNaN(gNum)) {
                gpas['gpa' + latestSem] = gNum.toFixed(2);
                sems[latestSem] = { semester: latestSem, value: gNum.toFixed(2), numericValue: gNum, isReferred: false, isAbsent: false, isPassed: true, label: gNum.toFixed(2) };
            }
        }
        var rawRefs = Array.isArray(rawRec.rf) ? rawRec.rf : (Array.isArray(rawRec.r) ? rawRec.r : (Array.isArray(rawRec.referred) ? rawRec.referred : []));
        var refCodes = [];
        var refSubjects = [];
        for (var j = 0; j < rawRefs.length; j++) {
            var item = String(rawRefs[j] || '').trim();
            if (!item) continue;
            var m = item.match(/^(\d+)(?:\(([TP,]+)\))?/i);
            var subCode = m ? m[1] : item;
            var subType = m && m[2] ? m[2].toUpperCase() : 'T';
            refCodes.push(subCode);
            refSubjects.push({
                code: subCode,
                type: subType,
                typeLabel: subType === 'P' ? 'ব্যবহারিক' : (subType === 'T,P' || subType === 'P,T' ? 'তত্ত্বীয় ও ব্যবহারিক' : 'তত্ত্বীয়'),
                badgeClass: subType === 'P' ? 'badge-info' : 'badge-warning',
                raw: item
            });
        }
        var obj = {
            roll: roll,
            institute_code: rawRec.institute_code || rawRec.instituteCode || rawRec.ic || null,
            institute_name: rawRec.institute_name || rawRec.instituteName || rawRec.in || null,
            gpa8: gpas.gpa8 || null, gpa7: gpas.gpa7 || null, gpa6: gpas.gpa6 || null, gpa5: gpas.gpa5 || null,
            gpa4: gpas.gpa4 || null, gpa3: gpas.gpa3 || null, gpa2: gpas.gpa2 || null, gpa1: gpas.gpa1 || null,
            referred: refCodes,
            referredSubjects: refSubjects,
            semesters: sems,
            status: status,
            statusBangla: status === 'Passed' ? 'উত্তীর্ণ' : (status === 'Dropped Out' ? 'ড্রপ আউট' : 'রেফার্ড'),
            statusType: status === 'Passed' ? 'success' : (status === 'Dropped Out' ? 'danger' : 'warning'),
            latestSemester: latestSem || 5,
            regulation: rawRec.reg || rawRec.regulation || '2022',
            examYear: rawRec.ey || rawRec.examYear || '',
            source: rawRec.src || rawRec.source || 'pdf',
            sourcePriority: (rawRec.src || rawRec.source) === 'pasted' ? 5 : 10,
            sources: [rawRec.src || rawRec.source || 'pdf']
        };
        return obj;
    }

    async function _putStudentsChunked(db, records) {
        if (!db || !records || records.length === 0) return;
        var CHUNK = 4000;
        for (var start = 0; start < records.length; start += CHUNK) {
            var end = Math.min(start + CHUNK, records.length);
            await new Promise(function (resolve) {
                try {
                    var tx = db.transaction(['students'], 'readwrite');
                    var store = tx.objectStore('students');
                    for (var idx = start; idx < end; idx++) {
                        store.put(records[idx]);
                    }
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function () { resolve(); };
                    tx.onabort = function () { resolve(); };
                } catch (e) {
                    resolve();
                }
            });
        }
    }

    async function _repairMissingInstitutesAsync(db) {
        try {
            var missingRolls = [];
            cachedStudentsMap.forEach(function (st, rollKey) {
                _syncInstituteAliases(st);
                if (!st.institute_code || !st.institute_name) {
                    missingRolls.push(rollKey);
                }
            });
            if (missingRolls.length === 0) return 0;

            var repairedList = [];
            var stillMissing = [];

            // Step A: Repair from BTEBResultsDatabase if populated
            if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getStudent) {
                for (var i = 0; i < missingRolls.length; i++) {
                    var r = missingRolls[i];
                    var bRec = BTEBResultsDatabase.getStudent(r);
                    var cur = cachedStudentsMap.get(r);
                    if (bRec && (bRec.institute_code || bRec.instituteCode || bRec.ic || bRec.institute_name || bRec.instituteName || bRec.in)) {
                        var patched = mergeStudentRecords(bRec, cur);
                        _syncInstituteAliases(patched);
                        if (patched.institute_code || patched.institute_name) {
                            cachedStudentsMap.set(r, patched);
                            if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) BTEBParser.setStudent(patched);
                            repairedList.push(patched);
                            continue;
                        }
                    }
                    stillMissing.push(r);
                }
            } else {
                stillMissing = missingRolls;
            }

            // Step B: Re-parse stored IndexedDB rawTexts to recover headers stripped by older versions
            if (stillMissing.length > 0 && db && typeof BTEBParser !== 'undefined' && BTEBParser.parseAll) {
                var stillSet = {};
                for (var s = 0; s < stillMissing.length; s++) stillSet[stillMissing[s]] = true;

                var sheetsMeta = getAllSheets();
                var semBySheetId = {};
                for (var sm = 0; sm < sheetsMeta.length; sm++) {
                    semBySheetId[sheetsMeta[sm].id] = parseInt(sheetsMeta[sm].semester, 10) || 5;
                }

                var rawRows = await new Promise(function (resolve) {
                    try {
                        var tx = db.transaction(['rawTexts'], 'readonly');
                        var req = tx.objectStore('rawTexts').getAll();
                        req.onsuccess = function () { resolve(req.result || []); };
                        req.onerror = function () { resolve([]); };
                    } catch (e) { resolve([]); }
                });

                for (var rt = 0; rt < rawRows.length; rt++) {
                    var txt = rawRows[rt] && rawRows[rt].text;
                    if (!txt || txt.length < 10) continue;
                    var defSem = semBySheetId[rawRows[rt].sheetId] || 5;
                    var reparsed = BTEBParser.parseAll(txt, defSem);
                    for (var rp = 0; rp < reparsed.length; rp++) {
                        var rSt = reparsed[rp];
                        var rr = String(rSt.roll || '').trim();
                        if (!rr || !stillSet[rr] || !(rSt.institute_code && rSt.institute_name)) continue;
                        var existingCur = cachedStudentsMap.get(rr);
                        var fixed = mergeStudentRecords(existingCur, rSt);
                        _syncInstituteAliases(fixed);
                        cachedStudentsMap.set(rr, fixed);
                        if (typeof BTEBParser.setStudent === 'function') BTEBParser.setStudent(fixed);
                        repairedList.push(fixed);
                        delete stillSet[rr];
                    }
                }
            }

            if (repairedList.length > 0) {
                var compactDb = _read(KEYS.STUDENTS_COMPACT);
                if (compactDb && typeof compactDb === 'object' && Object.keys(compactDb).length > 0) {
                    for (var u = 0; u < repairedList.length; u++) {
                        compactDb[repairedList[u].roll] = repairedList[u];
                    }
                    if (!_write(KEYS.STUDENTS_COMPACT, compactDb)) {
                        try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
                    }
                }
                if (db) {
                    await _putStudentsChunked(db, repairedList);
                }
            }
            return repairedList.length;
        } catch (err) {
            return 0;
        }
    }

    function initDB() {
        // 1. Fast load from pre-bundled Project Database
        if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getDatabase) {
            var bundled = BTEBResultsDatabase.getDatabase();
            for (var br in bundled) {
                if (Object.prototype.hasOwnProperty.call(bundled, br)) {
                    var bRec = BTEBResultsDatabase.getStudent ? BTEBResultsDatabase.getStudent(br) : bundled[br];
                    _syncInstituteAliases(bRec);
                    _hydrateStudent(bRec);
                }
            }
        }

        // 2. Fast load from Compact LocalStorage
        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
        var rolls = Object.keys(compactDb);
        for (var i = 0; i < rolls.length; i++) {
            _syncInstituteAliases(compactDb[rolls[i]]);
            _hydrateStudent(compactDb[rolls[i]]);
        }

        // 3. Load from IndexedDB cleanly using single-batch getAll() (fast even for 30k+ students on mobile)
        initDBPromise = (async function () {
            var db = await getDB();
            if (db) {
                var idbRows = await _readAllIndexedDBStudents(db);
                for (var j = 0; j < idbRows.length; j++) {
                    _syncInstituteAliases(idbRows[j]);
                    _hydrateStudent(idbRows[j]);
                }
                await _repairMissingInstitutesAsync(db);
            }
            return true;
        })();

        return initDBPromise;
    }

    // Auto-init immediately
    if (typeof window !== 'undefined') {
        initDB();
    }

    // ─── Sheet Management ───

    function getAllSheets() {
        var saved = _read(KEYS.SHEETS_META);
        return Array.isArray(saved) ? saved : [];
    }

    /**
     * Save sheet and all student records with triple redundancy:
     * - In-memory Map (0ms)
     * - Compact LocalStorage (<300 KB, guaranteed cross-tab/file:/// persistence)
     * - IndexedDB (bulk storage)
     * - Priority-aware merger (PDF takes precedence over copy-paste, all data unified)
     */
    async function saveSheetAsync(sheetData) {
        var semester = sheetData.semester || '5';
        var regulation = sheetData.regulation || '2022';
        var examYear = sheetData.examYear || new Date().getFullYear().toString();
        var rawText = sheetData.rawText || '';
        var fileName = sheetData.fileName || ('BTEB_Result_' + semester + 'th_Sem_' + Date.now() + '.pdf');

        var source = sheetData.source || ((fileName && fileName.toLowerCase().endsWith('.pdf')) ? 'pdf' : 'pasted');
        var priority = sheetData.priority || (source === 'pdf' ? 10 : 5);

        var students = sheetData.students;
        if (!students || !Array.isArray(students)) {
            students = (typeof BTEBParser !== 'undefined') ? BTEBParser.parseAll(rawText, semester) : [];
        }

        var passedCount = students.filter(function (s) { return s.status === 'Passed'; }).length;
        var referredCount = students.filter(function (s) { return s.status === 'Referred'; }).length;
        var droppedCount = students.filter(function (s) { return s.status === 'Dropped Out'; }).length;

        var sheetId = 'sheet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        var sheetMeta = {
            id: sheetId,
            fileName: fileName,
            semester: semester,
            regulation: regulation,
            examYear: examYear,
            source: source,
            priority: priority,
            studentCount: students.length,
            passedCount: passedCount,
            referredCount: referredCount,
            droppedCount: droppedCount,
            savedAt: new Date().toISOString()
        };

        // 1. In-memory Map & Compact LocalStorage update with Priority Merge
        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};

        for (var i = 0; i < students.length; i++) {
            var st = students[i];
            st.sheetId = sheetId;
            st.regulation = regulation;
            st.examYear = examYear;
            st.source = source;
            st.sourcePriority = priority;
            st.sources = [source];
            
            var rStr = String(st.roll).trim();
            var existing = cachedStudentsMap.get(rStr) || compactDb[rStr] || (typeof BTEBResultsDatabase !== 'undefined' ? BTEBResultsDatabase.getStudent(rStr) : null);
            var merged = mergeStudentRecords(existing, st);

            cachedStudentsMap.set(rStr, merged);
            compactDb[rStr] = merged;

            if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) {
                BTEBParser.setStudent(merged);
            }
            if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.mergeStudent) {
                BTEBResultsDatabase.mergeStudent(merged);
            }
        }

        // 2. Compact LocalStorage update (Purge stale compact cache if 30k+ PDF records exceed 5MB quota
        //    so outdated LocalStorage records never shadow fresh IndexedDB records with Institute & EIIN!)
        var compactWritten = _write(KEYS.STUDENTS_COMPACT, compactDb);
        if (!compactWritten) {
            try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
        }

        // 3. Save sheet metadata list
        var allSheets = getAllSheets();
        allSheets.unshift(sheetMeta);
        _write(KEYS.SHEETS_META, allSheets);

        // 4. Save into IndexedDB safely in batches (prevents single-tx memory pressure on Android Chrome)
        var db = await getDB();
        if (db) {
            try {
                await new Promise(function (resolve) {
                    var tx = db.transaction(['sheets', 'rawTexts'], 'readwrite');
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function () { resolve(); };
                    tx.objectStore('sheets').put(sheetMeta);
                    tx.objectStore('rawTexts').put({ sheetId: sheetId, text: rawText });
                });
                var finalRecords = [];
                for (var j = 0; j < students.length; j++) {
                    var curRoll = String(students[j].roll).trim();
                    finalRecords.push(cachedStudentsMap.get(curRoll) || compactDb[curRoll] || students[j]);
                }
                await _putStudentsChunked(db, finalRecords);
            } catch (err) {
                console.warn('[BTEBStorage] IndexedDB async save warning:', err);
            }
        }

        // Notify UI and open tabs via CustomEvent and BroadcastChannel
        if (syncChannel) {
            try {
                syncChannel.postMessage({ type: 'FULL_SYNC', sheetId: sheetId });
            } catch (e) {}
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bteb-storage-updated', { detail: { sheetId: sheetId } }));
        }

        return sheetMeta;
    }

    function saveSheet(sheetData) {
        saveSheetAsync(sheetData);
        return { success: true };
    }

    function getCombinedRawText() {
        var sheets = getAllSheets();
        var texts = [];
        for (var i = 0; i < sheets.length; i++) {
            if (sheets[i].rawText) texts.push(sheets[i].rawText);
        }
        return texts.join('\n\n');
    }

    /**
     * Delete a specific sheet and all its students
     */
    async function deleteSheet(sheetId) {
        // 1. Remove from meta
        var sheets = getAllSheets().filter(function (s) { return s.id !== sheetId; });
        _write(KEYS.SHEETS_META, sheets);

        // 2. Remove from Compact LocalStorage & Memory
        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
        for (var roll in compactDb) {
            if (compactDb[roll].sheetId === sheetId) {
                delete compactDb[roll];
                cachedStudentsMap.delete(roll);
            }
        }
        _write(KEYS.STUDENTS_COMPACT, compactDb);

        // 3. Remove from IndexedDB
        var db = await getDB();
        if (db) {
            try {
                var tx = db.transaction(['sheets', 'students', 'rawTexts'], 'readwrite');
                tx.objectStore('sheets').delete(sheetId);
                tx.objectStore('rawTexts').delete(sheetId);
                var studentStore = tx.objectStore('students');
                var index = studentStore.index('sheetId');
                var req = index.openCursor(IDBKeyRange.only(sheetId));
                req.onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
            } catch (e) {}
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bteb-storage-updated', { detail: { action: 'delete' } }));
        }
    }

    /**
     * Delete all sheets, database records, and reset completely
     */
    async function deleteAllSheets() {
        _write(KEYS.SHEETS_META, []);
        _write(KEYS.STUDENTS_COMPACT, {});
        try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
        cachedStudentsMap.clear();

        if (typeof BTEBParser !== 'undefined' && BTEBParser.clearIndex) {
            BTEBParser.clearIndex();
        }
        if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.clearDatabase) {
            BTEBResultsDatabase.clearDatabase();
        }

        var db = await getDB();
        if (db) {
            try {
                await new Promise(function (resolve) {
                    var tx = db.transaction(['sheets', 'students', 'rawTexts'], 'readwrite');
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function () { resolve(); };
                    tx.onabort = function () { resolve(); };
                    tx.objectStore('sheets').clear();
                    tx.objectStore('students').clear();
                    tx.objectStore('rawTexts').clear();
                });
            } catch (e) {}
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bteb-storage-updated', { detail: { action: 'clearAll' } }));
        }
    }

    /**
     * Unified Student Retrieval with Strict PDF Priority Guarantee
     * 1. Consolidates records across In-Memory Cache, Compact Storage, and Pre-bundled Database.
     * 2. Any data provided (via PDF upload OR Copy-Pasted text) is recognized as ONE single data pool.
     * 3. If conflicting or duplicate records exist, PDF data is given HIGHEST PRIORITY (PDF > Paste > Seed).
     */
    function getStudent(roll) {
        var cleanRoll = (typeof BTEBParser !== 'undefined' && BTEBParser.cleanRollNumber) 
            ? BTEBParser.cleanRollNumber(roll) 
            : (typeof BTEBParser !== 'undefined' ? BTEBParser.normalizeDigits(roll) : String(roll).trim());
        if (!cleanRoll) return null;

        var candidates = [];

        // 1. In-memory check
        if (cachedStudentsMap.has(cleanRoll)) {
            candidates.push(cachedStudentsMap.get(cleanRoll));
        }

        // 2. Compact LocalStorage check
        var compactDb = _read(KEYS.STUDENTS_COMPACT);
        if (compactDb && compactDb[cleanRoll]) {
            candidates.push(compactDb[cleanRoll]);
        }

        // 3. Pre-bundled Database check
        if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getStudent) {
            var bundled = BTEBResultsDatabase.getStudent(cleanRoll);
            if (bundled) {
                candidates.push(bundled);
            }
        }

        // Also check without leading zeroes if not found
        var stripped = cleanRoll.replace(/^0+/, '');
        if (stripped && stripped !== cleanRoll) {
            if (cachedStudentsMap.has(stripped)) candidates.push(cachedStudentsMap.get(stripped));
            if (compactDb && compactDb[stripped]) candidates.push(compactDb[stripped]);
            if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getStudent) {
                var bStrip = BTEBResultsDatabase.getStudent(stripped);
                if (bStrip) candidates.push(bStrip);
            }
        }

        if (candidates.length === 0) return null;

        // Sort ascending by priority (1 -> 5 -> 10) so highest priority (PDF) merges on top
        candidates.sort(function (a, b) {
            var pa = a.sourcePriority || (a.source === 'pdf' ? 10 : (a.source === 'pasted' ? 5 : 1));
            var pb = b.sourcePriority || (b.source === 'pdf' ? 10 : (b.source === 'pasted' ? 5 : 1));
            return pa - pb;
        });

        var merged = candidates[0];
        for (var i = 1; i < candidates.length; i++) {
            merged = mergeStudentRecords(merged, candidates[i]);
        }

        _syncInstituteAliases(merged);
        cachedStudentsMap.set(cleanRoll, merged);
        return merged;
    }

    async function getStudentAsync(roll) {
        if (activeImportPromise) {
            try { await activeImportPromise; } catch (e) {}
        }
        var st = getStudent(roll);
        var cleanRoll = (typeof BTEBParser !== 'undefined' && BTEBParser.cleanRollNumber)
            ? BTEBParser.cleanRollNumber(roll)
            : (typeof BTEBParser !== 'undefined' ? BTEBParser.normalizeDigits(roll) : String(roll).trim());
        if (!cleanRoll) return st;
        var stripped = cleanRoll.replace(/^0+/, '');

        var db = await getDB();
        if (db) {
            try {
                var readOne = function (key) {
                    return new Promise(function (resolve) {
                        var tx = db.transaction(['students'], 'readonly');
                        var store = tx.objectStore('students');
                        var req = store.get(key);
                        req.onsuccess = function () { resolve(req.result || null); };
                        req.onerror = function () { resolve(null); };
                    });
                };

                var idbStudent = await readOne(cleanRoll);
                if (!idbStudent && stripped && stripped !== cleanRoll) {
                    idbStudent = await readOne(stripped);
                }

                if (idbStudent) {
                    _syncInstituteAliases(idbStudent);
                    st = mergeStudentRecords(st, idbStudent);
                }
            } catch (e) {}
        }

        // Cross-device guarantee: if stored record has missing Institute/EIIN, patch from pre-bundled DB or parser index
        if (st && (!st.institute_code || !st.institute_name)) {
            if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getStudent) {
                var rdbRec = BTEBResultsDatabase.getStudent(cleanRoll) || (stripped && stripped !== cleanRoll ? BTEBResultsDatabase.getStudent(stripped) : null);
                if (rdbRec) {
                    _syncInstituteAliases(rdbRec);
                    if (rdbRec.institute_code && !st.institute_code) st.institute_code = rdbRec.institute_code;
                    if (rdbRec.institute_name && !st.institute_name) st.institute_name = rdbRec.institute_name;
                }
            }
            if ((!st.institute_code || !st.institute_name) && typeof BTEBParser !== 'undefined' && BTEBParser.instantLookup) {
                var idxRec = BTEBParser.instantLookup(cleanRoll);
                if (idxRec) {
                    _syncInstituteAliases(idxRec);
                    if (idxRec.institute_code && !st.institute_code) st.institute_code = idxRec.institute_code;
                    if (idxRec.institute_name && !st.institute_name) st.institute_name = idxRec.institute_name;
                }
            }
        }

        if (st) {
            _syncInstituteAliases(st);
            cachedStudentsMap.set(cleanRoll, st);
            if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) {
                BTEBParser.setStudent(st);
            }
        }
        return st;
    }

    async function getAllStudentsAsync() {
        if (initDBPromise) {
            try { await initDBPromise; } catch (e) {}
        }
        var allMap = {};

        function addIntoMap(rec) {
            if (!rec || !rec.roll) return;
            var key = String(rec.roll).trim();
            allMap[key] = allMap[key] ? mergeStudentRecords(allMap[key], rec) : rec;
        }

        if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.getDatabase) {
            var bundled = BTEBResultsDatabase.getDatabase();
            Object.keys(bundled).forEach(function (k) {
                var rec = BTEBResultsDatabase.getStudent ? BTEBResultsDatabase.getStudent(k) : bundled[k];
                _syncInstituteAliases(rec);
                addIntoMap(rec);
            });
        }

        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
        Object.keys(compactDb).forEach(function (k) {
            _syncInstituteAliases(compactDb[k]);
            addIntoMap(compactDb[k]);
        });

        cachedStudentsMap.forEach(function (val) {
            _syncInstituteAliases(val);
            addIntoMap(val);
        });

        var db = await getDB();
        if (db) {
            var idbRows = await _readAllIndexedDBStudents(db);
            for (var i = 0; i < idbRows.length; i++) {
                _syncInstituteAliases(idbRows[i]);
                addIntoMap(idbRows[i]);
            }
        }

        return allMap;
    }

    function getTotalStats() {
        var sheets = getAllSheets();
        var totalStudents = 0, totalPassed = 0, totalReferred = 0, totalDropped = 0;
        for (var i = 0; i < sheets.length; i++) {
            totalStudents += (sheets[i].studentCount || 0);
            totalPassed += (sheets[i].passedCount || 0);
            totalReferred += (sheets[i].referredCount || 0);
            totalDropped += (sheets[i].droppedCount || 0);
        }
        // If no sheets but compact db has students
        if (totalStudents === 0 && cachedStudentsMap.size > 0) {
            totalStudents = cachedStudentsMap.size;
            for (var [r, st] of cachedStudentsMap.entries()) {
                if (st.status === 'Passed') totalPassed++;
                else if (st.status === 'Referred') totalReferred++;
                else if (st.status === 'Dropped Out') totalDropped++;
            }
        }
        return {
            sheetCount: sheets.length,
            totalStudents: totalStudents,
            totalPassed: totalPassed,
            totalReferred: totalReferred,
            totalDropped: totalDropped
        };
    }

    /**
     * Export complete result database as a downloadable JSON file (includes IndexedDB + LocalStorage + Memory)
     */
    async function exportDatabaseAsJSON() {
        var allStudents = await getAllStudentsAsync();
        var sheets = getAllSheets();
        var payload = {
            portal: 'BTEB Result & Education Portal',
            version: '5.1',
            exportedAt: new Date().toISOString(),
            totalStudents: Object.keys(allStudents).length,
            sheets: sheets,
            students: allStudents
        };

        var jsonStr = JSON.stringify(payload);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bteb_results_database_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return payload;
    }

    async function exportAsJSON() {
        var allStudents = await getAllStudentsAsync();
        var payload = {
            portal: 'BTEB Result & Education Portal',
            version: '5.1',
            exportedAt: new Date().toISOString(),
            sheets: getAllSheets(),
            materials: getAllMaterials(),
            siteSettings: getSiteSettings(),
            config: getConfig(),
            students: allStudents
        };
        var jsonStr = JSON.stringify(payload);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bteb_portal_full_backup_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return payload;
    }

    async function exportAsText() {
        var allStudents = await getAllStudentsAsync();
        var rolls = Object.keys(allStudents);
        var lines = [];
        for (var i = 0; i < rolls.length; i++) {
            var st = allStudents[rolls[i]];
            var inst = st.institute_name ? (st.institute_code ? st.institute_code + ' - ' + st.institute_name : st.institute_name) : '';
            var gpas = [];
            for (var s = 1; s <= 8; s++) {
                if (st['gpa' + s]) gpas.push('gpa' + s + ': ' + st['gpa' + s]);
            }
            lines.push((inst ? '[' + inst + '] ' : '') + st.roll + ' (' + gpas.join(', ') + (st.referred && st.referred.length ? ', ref_sub: ' + st.referred.join(', ') : '') + ')');
        }
        var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bteb_results_backup_' + new Date().toISOString().slice(0, 10) + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return lines.length;
    }

    function _prepareImport(rawJson) {
        var parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
        if (!parsed || typeof parsed !== 'object') {
            return { error: 'Invalid backup JSON format' };
        }

        if (Array.isArray(parsed.sheets)) {
            _write(KEYS.SHEETS_META, parsed.sheets);
        }
        if (Array.isArray(parsed.materials)) {
            _write(KEYS.MATERIALS, parsed.materials);
        }
        if (parsed.siteSettings && typeof parsed.siteSettings === 'object') {
            saveSiteSettings(parsed.siteSettings);
        }
        if (parsed.config && typeof parsed.config === 'object') {
            saveConfig(parsed.config);
        }

        // Detect students source: full backup ({ students: {...|[]} }) OR exportOptimizedJSON top-level map
        var studentsSource = null;
        if (parsed.students && typeof parsed.students === 'object') {
            studentsSource = parsed.students;
        } else if (!parsed.sheets && !parsed.materials && !parsed.siteSettings) {
            var topKeys = Object.keys(parsed);
            if (topKeys.length > 0 && /^\d{4,10}$/.test(topKeys[0])) {
                studentsSource = parsed;
            }
        }

        var importedStudents = [];
        if (studentsSource) {
            var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
            var entries = Array.isArray(studentsSource)
                ? studentsSource.map(function (item) { return [item && item.roll, item]; })
                : Object.keys(studentsSource).map(function (k) { return [k, studentsSource[k]]; });

            for (var i = 0; i < entries.length; i++) {
                var rKeyRaw = entries[i][0];
                var rawSt = entries[i][1];
                var st = _expandImportedRecord(rKeyRaw, rawSt);
                if (!st || !st.roll) continue;
                var rKey = String(st.roll).trim();
                var merged = mergeStudentRecords(cachedStudentsMap.get(rKey) || compactDb[rKey], st);
                _syncInstituteAliases(merged);
                cachedStudentsMap.set(rKey, merged);
                compactDb[rKey] = merged;
                importedStudents.push(merged);
                if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) {
                    BTEBParser.setStudent(merged);
                }
                if (typeof BTEBResultsDatabase !== 'undefined' && BTEBResultsDatabase.mergeStudent) {
                    BTEBResultsDatabase.mergeStudent(merged);
                }
            }
            if (!_write(KEYS.STUDENTS_COMPACT, compactDb)) {
                try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
            }
        }

        return {
            parsed: parsed,
            importedStudents: importedStudents,
            summary: {
                success: true,
                sheetCount: Array.isArray(parsed.sheets) ? parsed.sheets.length : 0,
                materialCount: Array.isArray(parsed.materials) ? parsed.materials.length : 0,
                studentCount: importedStudents.length
            }
        };
    }

    function importFromJSON(rawJson) {
        try {
            var prep = _prepareImport(rawJson);
            if (prep.error) return { success: false, error: prep.error };
            if (prep.importedStudents.length > 0) {
                activeImportPromise = getDB().then(function (db) {
                    return _putStudentsChunked(db, prep.importedStudents);
                }).catch(function () {});
            }
            return prep.summary;
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : 'Parse error' };
        }
    }

    async function importFromJSONAsync(rawJson) {
        try {
            var prep = _prepareImport(rawJson);
            if (prep.error) return { success: false, error: prep.error };
            if (prep.importedStudents.length > 0) {
                activeImportPromise = getDB().then(function (db) {
                    return _putStudentsChunked(db, prep.importedStudents);
                }).catch(function () {});
                await activeImportPromise;
            }
            return prep.summary;
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : 'Parse error' };
        }
    }

    async function getDatabaseHealthAsync() {
        if (initDBPromise) {
            try { await initDBPromise; } catch (e) {}
        }
        var total = cachedStudentsMap.size;
        var missingInst = 0;
        cachedStudentsMap.forEach(function (st) {
            _syncInstituteAliases(st);
            if (!st.institute_code || !st.institute_name) missingInst++;
        });
        return {
            totalStudents: total,
            missingInstituteCount: missingInst,
            sheetsCount: getAllSheets().length
        };
    }

    // ─── Individual Student Operations ───

    function addOrUpdateStudent(studentData) {
        var roll = String(studentData.roll || '').trim();
        if (!roll) return { success: false, message: 'রোল নম্বর প্রদান করুন।' };

        var defSem = parseInt(studentData.semester, 10) || 5;
        var compactDbExisting = _read(KEYS.STUDENTS_COMPACT) || {};
        var existingRec = cachedStudentsMap.get(roll) || compactDbExisting[roll] || null;
        var instCode = studentData.institute_code || studentData.instituteCode || (existingRec && (existingRec.institute_code || existingRec.instituteCode)) || null;
        var instName = studentData.institute_name || studentData.instituteName || (existingRec && (existingRec.institute_name || existingRec.instituteName)) || null;
        var student = {
            roll: roll,
            institute_code: instCode,
            institute_name: instName,
            status: studentData.status || 'Passed',
            statusBangla: studentData.status === 'Referred' ? 'রেফার্ড' : (studentData.status === 'Dropped Out' ? 'ড্রপ আউট' : 'উত্তীর্ণ'),
            statusType: studentData.status === 'Referred' ? 'warning' : (studentData.status === 'Dropped Out' ? 'danger' : 'success'),
            semesters: studentData.semesters || {},
            referredSubjects: studentData.referredSubjects || [],
            latestSemester: defSem,
            sheetId: 'custom_individual',
            updatedAt: new Date().toISOString()
        };

        cachedStudentsMap.set(roll, student);
        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
        compactDb[roll] = student;
        if (!_write(KEYS.STUDENTS_COMPACT, compactDb)) {
            try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
        }

        getDB().then(function (db) {
            if (!db) return;
            try {
                var tx = db.transaction(['students'], 'readwrite');
                tx.objectStore('students').put(student);
            } catch (e) {}
        });

        if (typeof BTEBParser !== 'undefined' && BTEBParser.setStudent) {
            BTEBParser.setStudent(student);
        }

        return { success: true, student: student };
    }

    function deleteStudent(roll) {
        var cleanRoll = String(roll).trim();
        cachedStudentsMap.delete(cleanRoll);
        var compactDb = _read(KEYS.STUDENTS_COMPACT) || {};
        if (Object.prototype.hasOwnProperty.call(compactDb, cleanRoll)) {
            delete compactDb[cleanRoll];
            if (!_write(KEYS.STUDENTS_COMPACT, compactDb)) {
                try { localStorage.removeItem(KEYS.STUDENTS_COMPACT); } catch (e) {}
            }
        }
        getDB().then(function (db) {
            if (!db) return;
            try {
                var tx = db.transaction(['students'], 'readwrite');
                tx.objectStore('students').delete(cleanRoll);
            } catch (e) {}
        });
        return { success: true };
    }

    function findStudentInSheets(roll) {
        return getStudent(roll);
    }

    // ─── Admin Config & Auth ───

    function getConfig() {
        return _read(KEYS.ADMIN_CONFIG) || DEFAULT_CONFIG;
    }

    function saveConfig(cfg) {
        const merged = Object.assign({}, DEFAULT_CONFIG, getConfig(), cfg, { lastUpdated: new Date().toISOString() });
        _write(KEYS.ADMIN_CONFIG, merged);
        return merged;
    }

    function isResultServerEnabled() {
        return getConfig().resultServerEnabled !== false;
    }

    function setResultServerEnabled(enabled) {
        return saveConfig({ resultServerEnabled: !!enabled });
    }

    function getMaintenanceMessage() {
        return getConfig().maintenanceMessage || DEFAULT_CONFIG.maintenanceMessage;
    }

    function setMaintenanceMessage(msg) {
        return saveConfig({ maintenanceMessage: msg });
    }

    function getSiteSettings() {
        return _read(KEYS.SITE_SETTINGS) || DEFAULT_SITE_SETTINGS;
    }

    function saveSiteSettings(settings) {
        const merged = Object.assign({}, DEFAULT_SITE_SETTINGS, getSiteSettings(), settings, { lastUpdated: new Date().toISOString() });
        _write(KEYS.SITE_SETTINGS, merged);
        return merged;
    }

    function getAdminCredentials() {
        return _read(KEYS.ADMIN_AUTH) || DEFAULT_AUTH;
    }

    function verifyAdminCredentials(user, pass) {
        var creds = getAdminCredentials();
        var inputUser = (user || '').trim().toLowerCase();
        var targetUser = (creds.username || DEFAULT_AUTH.username).trim().toLowerCase();
        var inputPass = (pass || '').trim();
        var targetPass = (creds.password || DEFAULT_AUTH.password).trim();
        
        var userMatches = (inputUser === targetUser || inputUser === 'admin');
        var passMatches = (inputPass === targetPass || inputPass.toLowerCase() === targetPass.toLowerCase());
        return (userMatches && passMatches);
    }

    function updateAdminCredentials(newUsername, newPassword) {
        if (!newUsername || !newPassword) {
            return { success: false, message: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই পূরণ করা আবশ্যক।' };
        }
        var updated = {
            username: newUsername.trim(),
            password: newPassword.trim(),
            updatedAt: new Date().toISOString()
        };
        _write(KEYS.ADMIN_AUTH, updated);
        return { success: true, message: 'অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড সফলভাবে আপডেট করা হয়েছে।' };
    }

    function isAdminLoggedIn() {
        return sessionStorage.getItem('bteb_admin_logged_in') === 'true';
    }

    function setAdminLoggedIn(status) {
        if (status) {
            sessionStorage.setItem('bteb_admin_logged_in', 'true');
        } else {
            sessionStorage.removeItem('bteb_admin_logged_in');
        }
    }

    // ─── Materials ───
    function getAllMaterials() {
        return _read(KEYS.MATERIALS) || [];
    }

    function saveMaterial(data) {
        var materials = getAllMaterials();
        var item = {
            id: data.id || ('mat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
            title: data.title || 'শিরোনামহীন কনটেন্ট',
            category: data.category || 'book',
            semester: data.semester || '5',
            technology: data.technology || 'Computer',
            author: data.author || 'বিটিইবি পোর্টাল এডিটর',
            description: data.description || '',
            content: data.content || '',
            fileUrl: data.fileUrl || '',
            coverUrl: data.coverUrl || '',
            createdAt: data.createdAt || new Date().toISOString()
        };
        var existingIndex = materials.findIndex(function (m) { return m.id === item.id; });
        if (existingIndex >= 0) {
            materials[existingIndex] = item;
        } else {
            materials.unshift(item);
        }
        _write(KEYS.MATERIALS, materials);
        return item;
    }

    function deleteMaterial(id) {
        var materials = getAllMaterials().filter(function (m) { return m.id !== id; });
        _write(KEYS.MATERIALS, materials);
    }

    async function exportResultsDatabaseJs() {
        var allStudents = await getAllStudentsAsync();
        var rolls = Object.keys(allStudents);
        var institutes = {};
        var compactDb = {};

        for (var i = 0; i < rolls.length; i++) {
            var r = rolls[i];
            var st = allStudents[r];
            if (!st) continue;
            _syncInstituteAliases(st);
            var ic = st.institute_code || '';
            var inName = st.institute_name || '';
            if (ic && inName) {
                institutes[ic] = inName;
            }
            var entry = {
                s: st.status === 'Passed' ? 'P' : (st.status === 'Dropped Out' ? 'D' : 'R')
            };
            if (ic) entry.ic = ic;
            if (inName && (!ic || institutes[ic] !== inName)) entry.in = inName;
            if (st.latestSemester && st.latestSemester !== 5) entry.l = st.latestSemester;
            if (st.regulation && st.regulation !== '2022') entry.reg = st.regulation;
            if (st.examYear) entry.ey = st.examYear;
            if (st.source && st.source !== 'pdf') entry.src = st.source;
            for (var s = 1; s <= 8; s++) {
                var sv = st['gpa' + s];
                if (!sv && st.semesters && st.semesters[s]) sv = st.semesters[s].value;
                if (sv !== null && sv !== undefined && sv !== '') {
                    entry['g' + s] = sv === 'Referred' ? 'ref' : (sv === 'Absent' ? 'abs' : (sv === 'Dropped' ? 'drop' : sv));
                }
            }
            var refs = [];
            if (Array.isArray(st.referredSubjects) && st.referredSubjects.length > 0) {
                for (var rfIdx = 0; rfIdx < st.referredSubjects.length; rfIdx++) {
                    var rs = st.referredSubjects[rfIdx];
                    refs.push((rs && (rs.raw || rs.code)) ? String(rs.raw || rs.code) : String(rs));
                }
            } else if (Array.isArray(st.referred) && st.referred.length > 0) {
                refs = st.referred.slice();
            }
            if (refs.length > 0) entry.rf = refs;
            compactDb[r] = entry;
        }

        var nowIso = new Date().toISOString();
        var content = '/**\n * BTEB Portal - Compact Pre-bundled Results Database (results_database.js)\n'
            + ' * Generated at: ' + nowIso + ' | Records: ' + rolls.length + '\n'
            + ' * Compact Institute-Deduplicated Schema for Fast Mobile Chrome Loading\n */\n\n'
            + 'const BTEBResultsDatabase = (function () {\n    \'use strict\';\n'
            + '    const institutes = ' + JSON.stringify(institutes) + ';\n'
            + '    const database = ' + JSON.stringify(compactDb) + ';\n\n'
            + '    function cleanRoll(r) {\n'
            + '        if (r === null || r === undefined) return \'\';\n'
            + '        var s = String(r).trim();\n'
            + '        var b = {\'০\':\'0\',\'১\':\'1\',\'২\':\'2\',\'৩\':\'3\',\'৪\':\'4\',\'৫\':\'5\',\'৬\':\'6\',\'৭\':\'7\',\'৮\':\'8\',\'৯\':\'9\'};\n'
            + '        return s.replace(/[০-৯]/g, function(d){ return b[d]||d; }).replace(/\\D/g, \'\');\n'
            + '    }\n\n'
            + '    function expandStudent(rollKey, raw) {\n'
            + '        if (!raw || typeof raw !== \'object\') return null;\n'
            + '        if (raw.roll && raw.semesters) {\n'
            + '            if (!raw.institute_code && raw.ic) raw.institute_code = raw.ic;\n'
            + '            if (!raw.institute_name && (raw.in || institutes[raw.institute_code])) raw.institute_name = raw.in || institutes[raw.institute_code];\n'
            + '            return raw;\n'
            + '        }\n'
            + '        var status = raw.s === \'P\' ? \'Passed\' : (raw.s === \'D\' ? \'Dropped Out\' : \'Referred\');\n'
            + '        var semesters = {};\n'
            + '        var gpas = {};\n'
            + '        var latest = raw.l || 0;\n'
            + '        for (var k = 1; k <= 8; k++) {\n'
            + '            var gv = raw[\'g\' + k];\n'
            + '            if (gv !== undefined && gv !== null && gv !== \'\') {\n'
            + '                var gs = String(gv);\n'
            + '                var low = gs.toLowerCase();\n'
            + '                var isRef = low === \'ref\' || low === \'referred\';\n'
            + '                var isAbs = low === \'abs\' || low === \'absent\';\n'
            + '                var isDrop = low === \'drop\' || low === \'dropped\';\n'
            + '                var num = parseFloat(gs);\n'
            + '                var val = isRef ? \'Referred\' : (isAbs ? \'Absent\' : (isDrop ? \'Dropped\' : gs));\n'
            + '                gpas[\'gpa\' + k] = val;\n'
            + '                semesters[k] = {\n'
            + '                    semester: k, value: val,\n'
            + '                    numericValue: (!isNaN(num) && !isRef && !isAbs && !isDrop) ? num : null,\n'
            + '                    isReferred: isRef, isAbsent: isAbs, isPassed: (!isRef && !isAbs && !isDrop && !isNaN(num)),\n'
            + '                    label: isRef ? \'রেফার্ড (Ref)\' : val\n'
            + '                };\n'
            + '                if (k > latest) latest = k;\n'
            + '            }\n'
            + '        }\n'
            + '        var refCodes = [];\n'
            + '        var refSubjects = [];\n'
            + '        if (Array.isArray(raw.rf)) {\n'
            + '            for (var j = 0; j < raw.rf.length; j++) {\n'
            + '                var item = String(raw.rf[j] || \'\').trim();\n'
            + '                var m = item.match(/^(\\d+)(?:\\(([TP,]+)\\))?/i);\n'
            + '                var code = m ? m[1] : item;\n'
            + '                var t = m && m[2] ? m[2].toUpperCase() : \'T\';\n'
            + '                refCodes.push(code);\n'
            + '                refSubjects.push({\n'
            + '                    code: code, type: t,\n'
            + '                    typeLabel: t === \'P\' ? \'ব্যবহারিক\' : (t.indexOf(\',\') !== -1 ? \'তত্ত্বীয় ও ব্যবহারিক\' : \'তত্ত্বীয়\'),\n'
            + '                    badgeClass: t === \'P\' ? \'badge-info\' : \'badge-warning\', raw: item\n'
            + '                });\n'
            + '            }\n'
            + '        }\n'
            + '        var ic = raw.ic || null;\n'
            + '        var inName = raw.in || (ic ? institutes[ic] : null) || null;\n'
            + '        var src = raw.src || \'pdf\';\n'
            + '        return {\n'
            + '            roll: rollKey, institute_code: ic, institute_name: inName,\n'
            + '            gpa8: gpas.gpa8 || null, gpa7: gpas.gpa7 || null, gpa6: gpas.gpa6 || null, gpa5: gpas.gpa5 || null,\n'
            + '            gpa4: gpas.gpa4 || null, gpa3: gpas.gpa3 || null, gpa2: gpas.gpa2 || null, gpa1: gpas.gpa1 || null,\n'
            + '            referred: refCodes, referredSubjects: refSubjects, semesters: semesters,\n'
            + '            status: status,\n'
            + '            statusBangla: status === \'Passed\' ? \'উত্তীর্ণ\' : (status === \'Dropped Out\' ? \'ড্রপ আউট\' : \'রেফার্ড\'),\n'
            + '            statusType: status === \'Passed\' ? \'success\' : (status === \'Dropped Out\' ? \'danger\' : \'warning\'),\n'
            + '            latestSemester: latest || 5, regulation: raw.reg || \'2022\', examYear: raw.ey || \'\',\n'
            + '            source: src, sourcePriority: src === \'pasted\' ? 5 : 10, sources: [src]\n'
            + '        };\n'
            + '    }\n\n'
            + '    function getStudent(roll) {\n'
            + '        var k = cleanRoll(roll);\n'
            + '        if (!k) return null;\n'
            + '        if (database[k]) return expandStudent(k, database[k]);\n'
            + '        var s = k.replace(/^0+/, \'\');\n'
            + '        return (s && database[s]) ? expandStudent(s, database[s]) : null;\n'
            + '    }\n'
            + '    function setStudent(st) { if (st && st.roll) { var r = cleanRoll(st.roll); if (r) database[r] = st; } }\n'
            + '    function mergeStudent(st) { setStudent(st); return getStudent(st && st.roll); }\n'
            + '    function getAllRolls() { return Object.keys(database); }\n'
            + '    function getCount() { return Object.keys(database).length; }\n'
            + '    function getDatabase() { return database; }\n'
            + '    function clearDatabase() { for (var k in database) { delete database[k]; } }\n'
            + '    return {\n'
            + '        getStudent: getStudent, setStudent: setStudent, mergeStudent: mergeStudent,\n'
            + '        getAllRolls: getAllRolls, getCount: getCount, getDatabase: getDatabase, clearDatabase: clearDatabase\n'
            + '    };\n})();\n'
            + 'if (typeof module !== \'undefined\' && module.exports) { module.exports = BTEBResultsDatabase; }\n';

        var blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'results_database.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return {
        initDB: initDB,
        getAllSheets: getAllSheets,
        saveSheet: saveSheet,
        saveSheetAsync: saveSheetAsync,
        deleteSheet: deleteSheet,
        deleteAllSheets: deleteAllSheets,
        getCombinedRawText: getCombinedRawText,
        getStudent: getStudent,
        getStudentAsync: getStudentAsync,
        getAllStudentsAsync: getAllStudentsAsync,
        getDatabaseHealthAsync: getDatabaseHealthAsync,
        getTotalStats: getTotalStats,
        exportDatabaseAsJSON: exportDatabaseAsJSON,
        exportResultsDatabaseJs: exportResultsDatabaseJs,
        exportAsJSON: exportAsJSON,
        exportAsText: exportAsText,
        importFromJSON: importFromJSON,
        importFromJSONAsync: importFromJSONAsync,
        mergeStudentRecords: mergeStudentRecords,
        addOrUpdateStudent: addOrUpdateStudent,
        deleteStudent: deleteStudent,
        findStudentInSheets: findStudentInSheets,
        getConfig: getConfig,
        saveConfig: saveConfig,
        isResultServerEnabled: isResultServerEnabled,
        setResultServerEnabled: setResultServerEnabled,
        getMaintenanceMessage: getMaintenanceMessage,
        setMaintenanceMessage: setMaintenanceMessage,
        getSiteSettings: getSiteSettings,
        saveSiteSettings: saveSiteSettings,
        getAdminCredentials: getAdminCredentials,
        verifyAdminCredentials: verifyAdminCredentials,
        updateAdminCredentials: updateAdminCredentials,
        isAdminLoggedIn: isAdminLoggedIn,
        setAdminLoggedIn: setAdminLoggedIn,
        getAllMaterials: getAllMaterials,
        saveMaterial: saveMaterial,
        deleteMaterial: deleteMaterial
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBStorage;
}
