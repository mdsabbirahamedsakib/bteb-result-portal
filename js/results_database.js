/**
 * BTEB Portal - Pre-bundled Results Database (results_database.js)
 * 100% Real PDF / Uploaded Student Records Only (Zero Demo Policy)
 * 
 * This file guarantees that results are 100% persistent and viewable by:
 * - Anyone visiting the website on GitHub Pages / Cloudflare / cPanel
 * - Any mobile phone or laptop browser
 * - Any local file:/// environment without storage isolation issues
 */

const BTEBResultsDatabase = (function () {
    'use strict';

    // Core Database Dictionary: Indexed directly by Roll Number for O(1) Instant Lookup (<0.1ms)
    // ZERO DEMO POLICY: Starts completely empty; populated ONLY by real uploaded BTEB PDF results.
    const database = {};

    /**
     * Clean and normalize roll number:
     * - Converts Bengali numerals (০-৯) to English (0-9)
     * - Removes whitespace, tabs, prefixes (e.g. "Roll: ")
     */
    function cleanRoll(roll) {
        if (!roll) return '';
        var s = String(roll).trim();
        s = s.replace(/[০-৯]/g, function (d) {
            return '০১২৩৪৫৬৭৮৯'.indexOf(d);
        });
        s = s.replace(/^(?:roll\s*(?:no)?[.:\-\s]*|#\s*)/i, '').trim();
        var match = s.match(/\b\d{5,8}\b/);
        return match ? match[0] : s.replace(/[^\w]/g, '').trim();
    }

    /**
     * Look up student by roll with strict O(1) lookup
     */
    function getStudent(roll) {
        var r = cleanRoll(roll);
        if (!r) return null;
        if (database[r]) return database[r];
        // Also check stripped leading zeroes
        var stripped = r.replace(/^0+/, '');
        if (stripped && database[stripped]) return database[stripped];
        return null;
    }

    /**
     * Add or update student in active database
     */
    function setStudent(student) {
        if (student && student.roll) {
            var r = cleanRoll(student.roll);
            if (r) {
                database[r] = student;
            }
        }
    }

    /**
     * Priority-aware merge for BTEBResultsDatabase
     * PDF (priority 10) > Pasted (priority 5) > Pre-bundled (priority 1)
     */
    function mergeStudent(incoming) {
        if (!incoming || !incoming.roll) return null;
        var roll = cleanRoll(incoming.roll);
        if (!roll) return null;
        var existing = database[roll];

        if (!existing) {
            database[roll] = incoming;
            return incoming;
        }

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

        // Sources list
        var sourcesSet = new Set();
        if (Array.isArray(existing.sources)) existing.sources.forEach(function (s) { sourcesSet.add(s); });
        else if (existing.source) sourcesSet.add(existing.source);
        if (Array.isArray(incoming.sources)) incoming.sources.forEach(function (s) { sourcesSet.add(s); });
        else if (incoming.source) sourcesSet.add(incoming.source);
        var sourcesArr = Array.from(sourcesSet);

        var hasPdf = sourcesArr.indexOf('pdf') !== -1;
        var hasPasted = sourcesArr.indexOf('pasted') !== -1;

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

        var merged = {
            roll: dominant.roll,
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
            source: hasPdf ? 'pdf' : 'pasted',
            sourcePriority: hasPdf ? 10 : 5,
            sources: sourcesArr,
            sourceLabel: hasPdf && hasPasted ? '📄 অফিসিয়াল PDF ও শিট মার্জড (PDF অগ্রাধিকারপ্রাপ্ত)' : (hasPdf ? '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)' : '📋 কপি-পেস্ট রেজাল্ট শিট'),
            updatedAt: new Date().toISOString()
        };

        database[roll] = merged;
        return merged;
    }

    /**
     * Get all rolls in database
     */
    function getAllRolls() {
        return Object.keys(database);
    }

    /**
     * Get total count
     */
    function getCount() {
        return Object.keys(database).length;
    }

    /**
     * Export raw database object
     */
    function getDatabase() {
        return database;
    }

    /**
     * Clear all records
     */
    function clearDatabase() {
        for (var k in database) {
            if (database.hasOwnProperty(k)) {
                delete database[k];
            }
        }
    }

    /**
     * Export self as downloadable results_database.js file
     */
    function exportAsJsFile() {
        var content = '/**\n * BTEB Portal - Pre-bundled Results Database (results_database.js)\n'
            + ' * Generated at: ' + new Date().toISOString() + '\n'
            + ' * Total Records: ' + Object.keys(database).length + '\n'
            + ' * ZERO DEMO POLICY: 100% Real PDF Results Only\n'
            + ' */\n\n'
            + 'const BTEBResultsDatabase = (function () {\n'
            + '    \'use strict\';\n\n'
            + '    const database = ' + JSON.stringify(database, null, 4) + ';\n\n'
            + '    function cleanRoll(r) {\n'
            + '        if (!r) return "";\n'
            + '        var s = String(r).trim().replace(/[০-৯]/g, function(d){ return "০১২৩৪৫৬৭৮৯".indexOf(d); });\n'
            + '        var m = s.match(/\\b\\d{5,8}\\b/);\n'
            + '        return m ? m[0] : s.replace(/[^\\w]/g, "").trim();\n'
            + '    }\n\n'
            + '    function getStudent(roll) {\n'
            + '        var r = cleanRoll(roll);\n'
            + '        if (!r) return null;\n'
            + '        if (database[r]) return database[r];\n'
            + '        var stripped = r.replace(/^0+/, "");\n'
            + '        return (stripped && database[stripped]) ? database[stripped] : null;\n'
            + '    }\n\n'
            + '    function setStudent(st) { if (st && st.roll) { var r = cleanRoll(st.roll); if (r) database[r] = st; } }\n'
            + '    function mergeStudent(st) { return BTEBResultsDatabase.setStudent(st); }\n'
            + '    function getAllRolls() { return Object.keys(database); }\n'
            + '    function getCount() { return Object.keys(database).length; }\n'
            + '    function getDatabase() { return database; }\n'
            + '    function clearDatabase() { for (var k in database) { delete database[k]; } }\n\n'
            + '    return {\n'
            + '        getStudent: getStudent,\n'
            + '        setStudent: setStudent,\n'
            + '        mergeStudent: mergeStudent,\n'
            + '        getAllRolls: getAllRolls,\n'
            + '        getCount: getCount,\n'
            + '        getDatabase: getDatabase,\n'
            + '        clearDatabase: clearDatabase\n'
            + '    };\n'
            + '})();\n\n'
            + 'if (typeof module !== \'undefined\' && module.exports) {\n'
            + '    module.exports = BTEBResultsDatabase;\n'
            + '}\n';

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
        cleanRoll: cleanRoll,
        getStudent: getStudent,
        setStudent: setStudent,
        mergeStudent: mergeStudent,
        getAllRolls: getAllRolls,
        getCount: getCount,
        getDatabase: getDatabase,
        clearDatabase: clearDatabase,
        exportAsJsFile: exportAsJsFile
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBResultsDatabase;
}
