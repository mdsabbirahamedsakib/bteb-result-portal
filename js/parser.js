/**
 * BTEB Result & Education Portal - Ultra-Fast Parser & O(1) Indexing Engine
 * Designed for 3-4 Lakh Polytechnic Students with Zero-Lag O(1) Hash Table Lookup.
 * 
 * Supports ALL Official BTEB PDF Result Formats:
 * 1. Standard BTEB PDF Passed Format: 732320 (3.52) or 732320 (3.52, 3.40)
 * 2. Multi-Semester GPA Format: 732320 (gpa5: 3.06, gpa4: 3.20, gpa3: 2.63)
 * 3. Referred Format: 600784 {28542(T), 28544(T)} or 600784 {gpa5: ref, ref_sub: 28542(T))
 * 4. Dropped Out / Semester Drop: 800094 (25852(T), 25931(T), 26355(T,P), 26811(T))
 * 5. Colon / Equal / Tabular Layout: 732320 : 3.52 or 732320   3.52
 * 6. Mismatched brackets: { ... ), ( ... }, [ ... ]
 * 7. Bengali numeral normalization: (০-৯ -> 0-9)
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
     * Supports both explicit "gpa5: 3.50" AND standard BTEB PDF format "3.50"
     */
    function parseStudentBody(roll, rawBody, defaultSemester) {
        const body = (rawBody || '').trim();
        const defSem = parseInt(defaultSemester, 10) || 5;

        const semesters = {};
        let referredSubjects = [];
        let status = 'Passed';
        let statusBangla = 'উত্তীর্ণ';
        let statusType = 'success'; // success, warning, danger
        let latestSemester = defSem;

        // 1. Check for explicit "gpa\d+:" pattern (e.g. gpa5: 3.06, gpa4: 3.20)
        const hasGpaPattern = /gpa\d+/i.test(body);

        if (hasGpaPattern) {
            latestSemester = 0;
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
            // 2. Standard BTEB PDF format without "gpa" keyword:
            // e.g. "3.52", "3.80, 3.65", or subject codes "{25811(T), 25812(P)}"
            referredSubjects = parseSubjectCodes(body);

            // Match floating-point GPA numbers (typically between 2.00 and 4.00 in BTEB)
            const gpaMatches = body.match(/\b([2-4]\.\d{1,2})\b/g);

            if (referredSubjects.length > 0) {
                // Contains referred subjects
                if (referredSubjects.length >= 4 || /drop|fail|withheld/i.test(body)) {
                    status = 'Dropped Out';
                    statusBangla = 'ড্রপ আউট (সেমিস্টার ড্রপ)';
                    statusType = 'danger';
                    semesters[defSem] = {
                        semester: defSem,
                        value: 'Dropped Out',
                        numericValue: null,
                        isReferred: false,
                        isAbsent: false,
                        isPassed: false,
                        label: 'ড্রপ (Drop)'
                    };
                } else {
                    status = 'Referred';
                    statusBangla = 'রেফার্ড';
                    statusType = 'warning';
                    semesters[defSem] = {
                        semester: defSem,
                        value: 'Referred',
                        numericValue: null,
                        isReferred: true,
                        isAbsent: false,
                        isPassed: false,
                        label: 'রেফার্ড (Ref)'
                    };
                }
            } else if (gpaMatches && gpaMatches.length > 0) {
                // Valid GPA passed results (e.g. "3.52" or "3.52, 3.40")
                status = 'Passed';
                statusBangla = 'উত্তীর্ণ';
                statusType = 'success';
                latestSemester = defSem;

                for (let i = 0; i < gpaMatches.length; i++) {
                    const sNum = Math.max(1, defSem - i);
                    const pNum = parseFloat(gpaMatches[i]);
                    semesters[sNum] = {
                        semester: sNum,
                        value: pNum.toFixed(2),
                        numericValue: pNum,
                        isReferred: false,
                        isAbsent: false,
                        isPassed: true,
                        label: pNum.toFixed(2)
                    };
                }
            } else if (/drop|fail|withheld|absent/i.test(body)) {
                status = 'Dropped Out';
                statusBangla = 'ড্রপ আউট / ফেইল';
                statusType = 'danger';
                semesters[defSem] = {
                    semester: defSem,
                    value: 'Dropped Out',
                    numericValue: null,
                    isReferred: false,
                    isAbsent: false,
                    isPassed: false,
                    label: 'ড্রপ (Drop)'
                };
            } else {
                // Check if any decimal number exists
                const floatMatch = body.match(/\b([1-4](?:\.\d+)?)\b/);
                if (floatMatch && parseFloat(floatMatch[1]) >= 2.0) {
                    const pNum = parseFloat(floatMatch[1]);
                    status = 'Passed';
                    statusBangla = 'উত্তীর্ণ';
                    statusType = 'success';
                    semesters[defSem] = {
                        semester: defSem,
                        value: pNum.toFixed(2),
                        numericValue: pNum,
                        isReferred: false,
                        isAbsent: false,
                        isPassed: true,
                        label: pNum.toFixed(2)
                    };
                } else {
                    status = 'Dropped Out';
                    statusBangla = 'ড্রপ আউট (সেমিস্টার ড্রপ)';
                    statusType = 'danger';
                }
            }
        }

        if (latestSemester === 0) {
            latestSemester = defSem;
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
    function findRoll(rawText, targetRoll, defaultSemester) {
        const cleanRoll = normalizeDigits(targetRoll);
        if (!cleanRoll) return null;

        // Check in-memory index map first
        if (rollIndexMap.has(cleanRoll)) {
            return rollIndexMap.get(cleanRoll);
        }

        if (!rawText) return null;

        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);

        // Pattern 1: Bracketed ROLL (content), {content}, [content]
        const p1 = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s*[\\(\\{\\[]([\\s\\S]*?)[\\)\\}\\]]', 'm');
        let match = p1.exec(masked);

        if (match) {
            const rollFound = match[1];
            const bodyContent = unmaskSubjectParentheses(match[2]);
            const student = parseStudentBody(rollFound, bodyContent, defaultSemester);
            rollIndexMap.set(rollFound, student);
            return student;
        }

        // Pattern 2: Colon / Equals: ROLL : 3.50 or ROLL = 3.50
        const p2 = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s*[:=-]\\s*([^\\r\\n,;]+)', 'm');
        match = p2.exec(masked);
        if (match) {
            const rollFound = match[1];
            const bodyContent = unmaskSubjectParentheses(match[2]);
            const student = parseStudentBody(rollFound, bodyContent, defaultSemester);
            rollIndexMap.set(rollFound, student);
            return student;
        }

        return null;
    }

    /**
     * Parse ALL students found in raw text into an indexed array and populate O(1) Map
     */
    function parseAll(rawText, defaultSemester) {
        if (!rawText) return [];
        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);
        const defSem = parseInt(defaultSemester, 10) || 5;

        const results = [];
        const seenRolls = new Set();

        // Pattern 1: Standard Bracketed Format: \b(ROLL)\b \s* [({[] (BODY) [)}]
        const pattern1 = /\b(\d{5,8})\b\s*[\(\{\[]([^\)\}\]]+)[\)\}\]]/g;
        let match;

        while ((match = pattern1.exec(masked)) !== null) {
            const roll = match[1];
            const rawBody = unmaskSubjectParentheses(match[2]);

            // Filter out institute names e.g. "64024 - Rangpur Polytechnic Institute"
            // A valid student body must contain GPA (e.g. 3.52), subject codes, or keywords
            const hasGpa = /\b[1-4]\.\d{1,2}\b/.test(rawBody) || /gpa/i.test(rawBody);
            const hasSubjects = /\d{4,6}\s*(?:\([TPtp,\s]+\))?/.test(rawBody);
            const hasStatusWords = /passed|referred|ref|drop|fail|withheld|absent/i.test(rawBody);

            if (hasGpa || hasSubjects || hasStatusWords) {
                if (!seenRolls.has(roll)) {
                    seenRolls.add(roll);
                    const student = parseStudentBody(roll, rawBody, defSem);
                    results.push(student);
                    rollIndexMap.set(roll, student);
                }
            }
        }

        // Pattern 2: Colon or Equal Separated format: ROLL : 3.50 or ROLL : 28542(T)
        const pattern2 = /\b(\d{5,8})\b\s*[:=-]\s*([2-4]\.\d{1,2}|(?:\d{4,6}(?:«[TPtp\s,]+»)?(?:[,\s]+)?)+)/g;
        while ((match = pattern2.exec(masked)) !== null) {
            const roll = match[1];
            if (!seenRolls.has(roll)) {
                seenRolls.add(roll);
                const rawBody = unmaskSubjectParentheses(match[2]);
                const student = parseStudentBody(roll, rawBody, defSem);
                results.push(student);
                rollIndexMap.set(roll, student);
            }
        }

        return results;
    }

    /**
     * Build O(1) In-Memory Index Hash Map for instant lookup across 3-4 lakh students
     */
    function buildIndex(rawText, defaultSemester) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const results = parseAll(rawText, defaultSemester);
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
    function instantLookup(rawText, targetRoll, defaultSemester) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const cleanRoll = normalizeDigits(targetRoll);
        if (!cleanRoll) return null;

        let student = rollIndexMap.get(cleanRoll);
        let wasInIndex = true;

        if (!student) {
            wasInIndex = false;
            student = findRoll(rawText, cleanRoll, defaultSemester);
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
     * Non-Blocking Asynchronous Chunked Parser
     */
    function parseInChunksAsync(rawText, onProgress, onComplete, defaultSemester, chunkSize = 400) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const defSem = parseInt(defaultSemester, 10) || 5;
        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);

        const pattern = /\b(\d{5,8})\b\s*[\(\{\[]([^\)\}\]]+)[\)\}\]]/g;
        const matches = [];
        const seenRolls = new Set();
        let m;

        while ((m = pattern.exec(masked)) !== null) {
            const roll = m[1];
            const rawBody = unmaskSubjectParentheses(m[2]);
            const hasGpa = /\b[1-4]\.\d{1,2}\b/.test(rawBody) || /gpa/i.test(rawBody);
            const hasSubjects = /\d{4,6}/.test(rawBody);
            const hasStatusWords = /passed|referred|ref|drop|fail|withheld|absent/i.test(rawBody);

            if ((hasGpa || hasSubjects || hasStatusWords) && !seenRolls.has(roll)) {
                seenRolls.add(roll);
                matches.push({ roll: roll, body: rawBody });
            }
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
                const student = parseStudentBody(item.roll, item.body, defSem);
                results.push(student);
                rollIndexMap.set(item.roll, student);

                if (student.status === 'Passed') passedCount++;
                else if (student.status === 'Referred') referredCount++;
                else if (student.status === 'Dropped Out') droppedCount++;

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
     * Clear the in-memory index map
     */
    function clearIndex() {
        rollIndexMap.clear();
        indexedSourceFingerprint = '';
    }

    /**
     * Set a student in the in-memory index map
     */
    function setStudent(student) {
        if (student && student.roll) {
            rollIndexMap.set(String(student.roll).trim(), student);
        }
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
        clearIndex: clearIndex,
        setStudent: setStudent,
        getIndexSize: function () { return rollIndexMap.size; }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBParser;
}
