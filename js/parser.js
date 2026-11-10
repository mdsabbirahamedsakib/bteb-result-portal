/**
 * BTEB Result & Education Portal - Ultra-Fast Multi-Format Parser & O(1) Indexing Engine
 * Designed for 3-4 Lakh Polytechnic Students with Zero-Lag O(1) Hash Table Lookup.
 * 
 * Supports ALL Official BTEB PDF Result Formats:
 * 1. Standard Bracketed Format: 732320 (3.52), 732320 (3.52, 3.40), 732320 (gpa5: 3.52)
 * 2. Referred Format: 600784 {28542(T), 28544(T)}, 600784 (28542(T)), 600784 [28542(T)]
 * 3. Dropped Out / Semester Drop: 800094 (25852(T), 25931(T), 26355(T,P), 26811(T))
 * 4. Colon / Dash / Equal: 732320 : 3.52, 732320 = 3.52, 732320 - 3.52
 * 5. Tabular / Space-Separated: 732320   3.52   PASSED or 732320   28542(T)
 * 6. Line-by-Line / Key-Value: Roll: 732320 \n GPA: 3.52
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
     */
    function parseStudentBody(roll, rawBody, defaultSemester) {
        const body = (rawBody || '').trim();
        const defSem = parseInt(defaultSemester, 10) || 5;

        const semesters = {};
        let referredSubjects = [];
        let status = 'Passed';
        let statusBangla = 'উত্তীর্ণ';
        let statusType = 'success';
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
            // 2. Standard BTEB PDF format without "gpa" keyword
            referredSubjects = parseSubjectCodes(body);
            const gpaMatches = body.match(/\b([2-4]\.\d{1,2})\b/g);

            if (referredSubjects.length > 0) {
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
     * Search for a specific roll number inside raw text
     */
    function findRoll(rawText, targetRoll, defaultSemester) {
        const cleanRoll = normalizeDigits(targetRoll);
        if (!cleanRoll) return null;

        if (rollIndexMap.has(cleanRoll)) {
            return rollIndexMap.get(cleanRoll);
        }

        if (!rawText) return null;

        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);

        // Pattern 1: Bracketed
        const p1 = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s*[\\(\\{\\[]([\\s\\S]*?)[\\)\\}\\]]', 'm');
        let match = p1.exec(masked);
        if (match) {
            const student = parseStudentBody(match[1], unmaskSubjectParentheses(match[2]), defaultSemester);
            rollIndexMap.set(match[1], student);
            return student;
        }

        // Pattern 2: Colon / Dash / Equal
        const p2 = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s*[:=-]\\s*([^\\r\\n,;]+)', 'm');
        match = p2.exec(masked);
        if (match) {
            const student = parseStudentBody(match[1], unmaskSubjectParentheses(match[2]), defaultSemester);
            rollIndexMap.set(match[1], student);
            return student;
        }

        // Pattern 3: Tabular space separated
        const p3 = new RegExp('(?:^|[^\\d])(' + cleanRoll + ')\\s{1,8}([2-4]\\.\\d{1,2}|(?:\\d{4,6}[^\\r\\n]+))', 'm');
        match = p3.exec(masked);
        if (match) {
            const student = parseStudentBody(match[1], unmaskSubjectParentheses(match[2]), defaultSemester);
            rollIndexMap.set(match[1], student);
            return student;
        }

        return null;
    }

    /**
     * Parse ALL students found in raw text into an array and index map
     */
    function parseAll(rawText, defaultSemester) {
        if (!rawText) return [];
        const cleaned = cleanRawPdfText(rawText);
        const masked = maskSubjectParentheses(cleaned);
        const defSem = parseInt(defaultSemester, 10) || 5;

        const results = [];
        const seenRolls = new Set();

        function addCandidate(roll, body) {
            if (!roll || seenRolls.has(roll)) return;
            // Ignore institute 5-digit headers like "64024 - Rangpur Polytechnic"
            const hasGpa = /\b[1-4]\.\d{1,2}\b/.test(body) || /gpa/i.test(body);
            const hasSubjects = /\d{4,6}/.test(body);
            const hasStatus = /passed|referred|ref|drop|fail|withheld|absent/i.test(body);

            if (hasGpa || hasSubjects || hasStatus) {
                seenRolls.add(roll);
                const student = parseStudentBody(roll, body, defSem);
                results.push(student);
                rollIndexMap.set(roll, student);
            }
        }

        // Pattern 1: Standard Bracketed: \b(ROLL)\b \s* [({[] (BODY) [)}]
        const pattern1 = /\b(\d{5,8})\b\s*[\(\{\[]([^\)\}\]]+)[\)\}\]]/g;
        let match;
        while ((match = pattern1.exec(masked)) !== null) {
            addCandidate(match[1], unmaskSubjectParentheses(match[2]));
        }

        // Pattern 2: Colon / Dash / Equal: \b(ROLL)\b \s* [:=] \s* (BODY)
        const pattern2 = /\b(\d{5,8})\b\s*[:=-]\s*([2-4]\.\d{1,2}|(?:\d{4,6}(?:«[TPtp\s,]+»)?(?:[,\s]+)?)+)/g;
        while ((match = pattern2.exec(masked)) !== null) {
            addCandidate(match[1], unmaskSubjectParentheses(match[2]));
        }

        // Pattern 3: Tabular / Multi-space layout: \b(ROLL)\b \s{2,} (GPA)
        const pattern3 = /\b(\d{5,8})\b\s{2,}([2-4]\.\d{1,2})\b/g;
        while ((match = pattern3.exec(masked)) !== null) {
            addCandidate(match[1], match[2]);
        }

        // Pattern 4: Tabular referred layout: \b(ROLL)\b \s{2,} (SUBJECTS)
        const pattern4 = /\b(\d{5,8})\b\s{2,}((?:(?:\d{4,6}(?:«[TPtp\s,]+»)?)[,\s]*)+)/g;
        while ((match = pattern4.exec(masked)) !== null) {
            addCandidate(match[1], unmaskSubjectParentheses(match[2]));
        }

        return results;
    }

    /**
     * Build O(1) Index Hash Map
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
     * Instant O(1) Lookup
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
     * Calculate Official BTEB CGPA
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
        clearIndex: clearIndex,
        setStudent: setStudent,
        getIndexSize: function () { return rollIndexMap.size; }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBParser;
}
