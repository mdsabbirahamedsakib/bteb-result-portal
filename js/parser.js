/**
 * BTEB Result & Education Portal - Ultra-Fast Parser & O(1) Indexing Engine
 * Designed for 3-4 Lakh Polytechnic Students with Zero-Lag O(1) Hash Table Lookup.
 * 
 * Supports:
 * 1. Passed Format: 732320 (gpa5: 3.06, gpa4: 3.20, gpa3: 2.63, gpa2: 2.96, gpa1: 3.53)
 * 2. Referred Format: 600784 {gpa5: ref, gpa4: ref, gpa3: 3.02, gpa2: 2.86, gpa1: 3.13, ref_sub: 28542(T), 28544(T), 28553(T), 28554(T))
 * 3. Dropped Out Format: 800094 (25852(T), 25931(T), 26355(T,P), 26811(T)}
 * 4. PDF table pipe delimiters (|) and multi-line column artifacts
 * 5. Mismatched brackets: { ... ), ( ... }, [ ... ]
 * 6. High-Performance Indexed JavaScript Map (O(1) Instant Lookup in < 1ms)
 * 7. Non-blocking parsing & Bengali digit normalization (০-৯ -> 0-9)
 */

const BTEBParser = (function () {
    'use strict';

    // In-memory O(1) Hash Map for Instant Result Retrieval
    const rollIndexMap = new Map();
    let indexedSourceFingerprint = '';

    // Bengali to English digit mapping
    const BENGALI_DIGITS = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
        '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };

    /**
     * Convert Bengali numerals to standard English digits
     */
    function normalizeDigits(str) {
        if (!str) return '';
        return String(str).replace(/[০-৯]/g, d => BENGALI_DIGITS[d] || d).trim();
    }

    /**
     * Clean PDF artifacts: table pipes (|), duplicate spaces, and weird tabs
     */
    function cleanRawPdfText(text) {
        if (!text) return '';
        // Replace pipe characters often found in PDF table extractions
        return text.replace(/\|/g, ' ');
    }

    /**
     * Mask internal subject code parentheses (T), (P), (T,P) so outer bracket regex doesn't terminate early.
     */
    function maskSubjectParentheses(text) {
        return text.replace(/\(([TPtp\s,]+)\)/g, '«$1»');
    }

    /**
     * Restore masked parentheses
     */
    function unmaskSubjectParentheses(text) {
        return text.replace(/«(.*?)»/g, '($1)');
    }

    /**
     * Parse subject codes like 28542(T), 26355(T,P), 25852(P) into structured objects
     */
    function parseSubjectCodes(str) {
        if (!str) return [];
        const subjects = [];
        const regex = /(\d{4,6})\s*(?:\(([TPtp,\s]+)\))?/g;
        let match;

        while ((match = regex.exec(str)) !== null) {
            const code = match[1];
            const typeRaw = match[2] ? match[2].toUpperCase().replace(/\s+/g, '') : 'GENERAL';
            
            let typeLabel = 'সাধারণ';
            let badgeClass = 'badge-secondary';
            
            if (typeRaw.includes('T') && typeRaw.includes('P')) {
                typeLabel = 'তত্ত্বীয় ও ব্যবহারিক (T,P)';
                badgeClass = 'badge-danger';
            } else if (typeRaw.includes('T')) {
                typeLabel = 'তত্ত্বীয় (Theory)';
                badgeClass = 'badge-warning';
            } else if (typeRaw.includes('P')) {
                typeLabel = 'ব্যবহারিক (Practical)';
                badgeClass = 'badge-info';
            }

            subjects.push({
                code: code,
                type: typeRaw,
                typeLabel: typeLabel,
                badgeClass: badgeClass,
                raw: match[0].trim()
            });
        }
        return subjects;
    }

    /**
     * Parse the inner body content of a student entry
     */
    function parseStudentBody(roll, rawBody) {
        const body = rawBody.trim();
        const hasGpaPattern = /gpa\d+/i.test(body);

        const semesters = {};
        let referredSubjects = [];
        let status = 'Passed';
        let statusBangla = 'উত্তীর্ণ';
        let statusType = 'success'; // success, warning, danger
        let latestSemester = 0;

        if (hasGpaPattern) {
            // Extract all semester GPAs: gpa1, gpa2, ... gpa8
            const gpaRegex = /gpa(\d+)\s*[:=]\s*([0-9\.]+|ref[a-z]*|abs[a-z]*|drop[a-z]*|fail[a-z]*)/gi;
            let gpaMatch;

            while ((gpaMatch = gpaRegex.exec(body)) !== null) {
                const semNum = parseInt(gpaMatch[1], 10);
                const gpaVal = gpaMatch[2].toLowerCase();

                if (semNum > latestSemester) {
                    latestSemester = semNum;
                }

                if (gpaVal.startsWith('ref')) {
                    semesters[semNum] = {
                        semester: semNum,
                        value: 'Referred',
                        numericValue: null,
                        isReferred: true,
                        isAbsent: false,
                        isPassed: false,
                        label: 'রেফার্ড (Ref)'
                    };
                } else if (gpaVal.startsWith('abs')) {
                    semesters[semNum] = {
                        semester: semNum,
                        value: 'Absent',
                        numericValue: null,
                        isReferred: false,
                        isAbsent: true,
                        isPassed: false,
                        label: 'অনুপস্থিত (Abs)'
                    };
                } else if (gpaVal.startsWith('drop') || gpaVal.startsWith('fail')) {
                    semesters[semNum] = {
                        semester: semNum,
                        value: 'Dropped',
                        numericValue: null,
                        isReferred: false,
                        isAbsent: false,
                        isPassed: false,
                        label: 'ড্রপ (Drop)'
                    };
                } else {
                    const parsedNum = parseFloat(gpaVal);
                    semesters[semNum] = {
                        semester: semNum,
                        value: parsedNum.toFixed(2),
                        numericValue: parsedNum,
                        isReferred: false,
                        isAbsent: false,
                        isPassed: true,
                        label: parsedNum.toFixed(2)
                    };
                }
            }

            // Extract ref_sub list if any
            const refSubMatch = body.match(/ref_sub\s*[:=]\s*([^)\}\r\n]+)/i);
            if (refSubMatch) {
                referredSubjects = parseSubjectCodes(refSubMatch[1]);
            }

            // Check if any semester is referred or if ref_sub has subjects
            const hasReferredSemester = Object.values(semesters).some(s => s.isReferred);
            if (hasReferredSemester || referredSubjects.length > 0) {
                status = 'Referred';
                statusBangla = 'রেফার্ড';
                statusType = 'warning';
            } else {
                status = 'Passed';
                statusBangla = 'উত্তীর্ণ';
                statusType = 'success';
            }
        } else {
            // Dropped out / Semester Drop format
            referredSubjects = parseSubjectCodes(body);
            status = 'Dropped Out';
            statusBangla = 'ড্রপ আউট (সেমিস্টার ড্রপ)';
            statusType = 'danger';
        }

        return {
            roll: roll,
            status: status,
            statusBangla: statusBangla,
            statusType: statusType,
            semesters: semesters,
            referredSubjects: referredSubjects,
            latestSemester: latestSemester,
            rawContent: body
        };
    }

    /**
     * Search for a specific roll number inside raw BTEB text using regex
     */
    function findRoll(rawText, targetRoll) {
        const cleanRoll = normalizeDigits(targetRoll);
        if (!cleanRoll) return null;

        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);

        // Pattern matches: ROLL followed by delimiter [({[], content, up to closing [)}]
        const pattern = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s*[\\(\\{\\[]([\\s\\S]*?)[\\)\\}\\]]', 'm');
        const match = pattern.exec(masked);

        if (!match) return null;

        const rollFound = match[1];
        const bodyContent = unmaskSubjectParentheses(match[2]);

        const student = parseStudentBody(rollFound, bodyContent);
        // Cache in O(1) map
        rollIndexMap.set(rollFound, student);
        return student;
    }

    /**
     * Parse ALL students found in raw text into an indexed array and populate O(1) Map
     */
    function parseAll(rawText) {
        if (!rawText) return [];
        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);
        
        const pattern = /\b(\d{5,8})\b\s*[\(\{\[]([\s\S]*?)[\)\}\]]/g;
        const results = [];
        let match;

        while ((match = pattern.exec(masked)) !== null) {
            const roll = match[1];
            const body = unmaskSubjectParentheses(match[2]);
            const student = parseStudentBody(roll, body);
            results.push(student);
            rollIndexMap.set(roll, student);
        }

        return results;
    }

    /**
     * Build O(1) In-Memory Index Hash Map for instant lookup across 3-4 lakh students
     */
    function buildIndex(rawText) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const results = parseAll(rawText);
        const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        indexedSourceFingerprint = String(rawText.length) + '_' + results.length;
        
        return {
            totalIndexed: results.length,
            indexingTimeMs: parseFloat((t1 - t0).toFixed(2)),
            map: rollIndexMap
        };
    }

    /**
     * Instant O(1) Lookup: Retrieves student result in < 1 millisecond
     */
    function instantLookup(rawText, targetRoll) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const cleanRoll = normalizeDigits(targetRoll);
        if (!cleanRoll) return null;

        let student = rollIndexMap.get(cleanRoll);
        let wasInIndex = true;

        if (!student) {
            wasInIndex = false;
            student = findRoll(rawText, cleanRoll);
        }

        const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const elapsedMs = parseFloat((t1 - t0).toFixed(3));

        return {
            student: student,
            elapsedMs: elapsedMs,
            isO1Hit: wasInIndex,
            totalIndexed: rollIndexMap.size
        };
    }

    /**
     * Calculate Official BTEB CGPA based on regulation weightage
     */
    function calculateCGPA(semesters, regulation = '2022') {
        const weightages = {
            '2022': { 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.10, 5: 0.15, 6: 0.20, 7: 0.25, 8: 0.15 },
            '2016': { 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.10, 5: 0.15, 6: 0.20, 7: 0.25, 8: 0.15 }
        };

        const currentWeightage = weightages[regulation] || weightages['2022'];
        let totalWeightedScore = 0;
        let totalWeightUsed = 0;
        let completedSemestersCount = 0;

        for (let sem = 1; sem <= 8; sem++) {
            if (semesters[sem] && semesters[sem].isPassed && semesters[sem].numericValue !== null) {
                const weight = currentWeightage[sem] || 0.125;
                totalWeightedScore += semesters[sem].numericValue * weight;
                totalWeightUsed += weight;
                completedSemestersCount++;
            }
        }

        if (totalWeightUsed === 0) return null;

        const normalizedCGPA = totalWeightedScore / totalWeightUsed;
        return {
            cgpa: normalizedCGPA.toFixed(2),
            completedSemesters: completedSemestersCount,
            totalWeight: Math.round(totalWeightUsed * 100)
        };
    }

    /**
     * Non-Blocking Asynchronous Chunked Parser for 3-4 Lakh students.
     * Processes batches of items and yields execution to the main thread via requestAnimationFrame / setTimeout
     * so that the browser UI never freezes or hangs.
     */
    function parseInChunksAsync(rawText, onProgress, onComplete, chunkSize = 400) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);

        const pattern = /\b(\d{5,8})\b\s*[\(\{\[]([\s\S]*?)[\)\}\]]/g;
        const matches = [];
        let m;
        while ((m = pattern.exec(masked)) !== null) {
            matches.push({
                roll: m[1],
                body: unmaskSubjectParentheses(m[2])
            });
        }

        const total = matches.length;
        if (total === 0) {
            if (onComplete) {
                onComplete({
                    results: [],
                    total: 0,
                    passedCount: 0,
                    referredCount: 0,
                    droppedCount: 0,
                    elapsedMs: 0,
                    optimizedData: {}
                });
            }
            return;
        }

        let currentIndex = 0;
        const results = [];
        const optimizedIndex = {};
        let passedCount = 0;
        let referredCount = 0;
        let droppedCount = 0;

        function processNextChunk() {
            const chunkEnd = Math.min(currentIndex + chunkSize, total);
            for (let i = currentIndex; i < chunkEnd; i++) {
                const item = matches[i];
                const student = parseStudentBody(item.roll, item.body);
                results.push(student);
                rollIndexMap.set(item.roll, student);

                if (student.status === 'Passed') passedCount++;
                else if (student.status === 'Referred') referredCount++;
                else if (student.status === 'Dropped Out') droppedCount++;

                // Ultra-lightweight schema
                const semCompact = {};
                for (let s in student.semesters) {
                    semCompact[s] = student.semesters[s].value;
                }
                optimizedIndex[item.roll] = {
                    s: student.status === 'Passed' ? 'P' : (student.status === 'Referred' ? 'R' : 'D'),
                    g: semCompact,
                    r: student.referredSubjects.map(sub => sub.raw || sub.code)
                };
            }

            currentIndex = chunkEnd;
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            const elapsed = Math.max(1, now - t0);
            const percent = Math.min(100, Math.round((currentIndex / total) * 100));
            const speed = Math.round((currentIndex / elapsed) * 1000);

            if (onProgress) {
                onProgress({
                    current: currentIndex,
                    total: total,
                    percent: percent,
                    speed: speed,
                    elapsedMs: Math.round(elapsed),
                    passedCount: passedCount,
                    referredCount: referredCount,
                    droppedCount: droppedCount
                });
            }

            if (currentIndex < total) {
                if (typeof requestAnimationFrame !== 'undefined') {
                    requestAnimationFrame(processNextChunk);
                } else {
                    setTimeout(processNextChunk, 0);
                }
            } else {
                const totalElapsed = (typeof performance !== 'undefined') ? performance.now() - t0 : Date.now() - t0;
                indexedSourceFingerprint = String(rawText.length) + '_' + total;
                if (onComplete) {
                    onComplete({
                        results: results,
                        total: total,
                        passedCount: passedCount,
                        referredCount: referredCount,
                        droppedCount: droppedCount,
                        elapsedMs: parseFloat(totalElapsed.toFixed(2)),
                        optimizedData: optimizedIndex
                    });
                }
            }
        }

        processNextChunk();
    }

    /**
     * Export Ultra-lightweight Indexed JSON ready for CDN / Web Hosting
     */
    function exportOptimizedJSON(optimizedData, meta = {}) {
        const payload = {
            portal: 'BTEB High-Capacity Result Engine',
            version: '5.0',
            exportedAt: new Date().toISOString(),
            totalStudents: Object.keys(optimizedData).length,
            meta: meta,
            schema: {
                s: 'Status: P=Passed, R=Referred, D=Dropped Out',
                g: 'Semester GPA mapping {semesterNum: GPA}',
                r: 'Referred subjects array'
            },
            students: optimizedData
        };

        const jsonStr = JSON.stringify(payload);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const semTag = meta.semester ? ('sem' + meta.semester + '_') : '';
        const yearTag = meta.examYear || new Date().getFullYear();
        a.download = 'bteb_results_optimized_' + semTag + yearTag + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return payload;
    }

    /**
     * Clear the in-memory index map
     */
    function clearIndex() {
        rollIndexMap.clear();
        indexedSourceFingerprint = '';
    }

    return {
        normalizeDigits: normalizeDigits,
        findRoll: findRoll,
        parseAll: parseAll,
        parseStudentBody: parseStudentBody,
        calculateCGPA: calculateCGPA,
        parseSubjectCodes: parseSubjectCodes,
        buildIndex: buildIndex,
        instantLookup: instantLookup,
        parseInChunksAsync: parseInChunksAsync,
        exportOptimizedJSON: exportOptimizedJSON,
        clearIndex: clearIndex,
        getIndexSize: function () { return rollIndexMap.size; }
    };
})();

// Export for Node/CommonJS environment if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBParser;
}
