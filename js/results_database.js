/**
 * BTEB Portal - Pre-bundled Results Database (results_database.js)
 * 
 * This file guarantees that results are 100% persistent and viewable by:
 * - Anyone visiting the website on GitHub Pages / Cloudflare / cPanel
 * - Any mobile phone or laptop browser
 * - Any local file:/// environment without storage isolation issues
 */

const BTEBResultsDatabase = (function () {
    'use strict';

    // Core Database Dictionary: Indexed directly by Roll Number for O(1) Instant Lookup (<0.1ms)
    const database = {
        '732320': {
            roll: '732320',
            status: 'Passed',
            statusBangla: 'উত্তীর্ণ',
            statusType: 'success',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                1: { semester: 1, value: '3.53', numericValue: 3.53, isPassed: true, isReferred: false, label: '3.53' },
                2: { semester: 2, value: '2.96', numericValue: 2.96, isPassed: true, isReferred: false, label: '2.96' },
                3: { semester: 3, value: '2.63', numericValue: 2.63, isPassed: true, isReferred: false, label: '2.63' },
                4: { semester: 4, value: '3.20', numericValue: 3.20, isPassed: true, isReferred: false, label: '3.20' },
                5: { semester: 5, value: '3.06', numericValue: 3.06, isPassed: true, isReferred: false, label: '3.06' }
            },
            referredSubjects: []
        },
        '600784': {
            roll: '600784',
            status: 'Referred',
            statusBangla: 'রেফার্ড',
            statusType: 'warning',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                1: { semester: 1, value: '3.13', numericValue: 3.13, isPassed: true, isReferred: false, label: '3.13' },
                2: { semester: 2, value: '2.86', numericValue: 2.86, isPassed: true, isReferred: false, label: '2.86' },
                3: { semester: 3, value: '3.02', numericValue: 3.02, isPassed: true, isReferred: false, label: '3.02' },
                4: { semester: 4, value: 'Referred', numericValue: null, isPassed: false, isReferred: true, label: 'রেফার্ড (Ref)' },
                5: { semester: 5, value: 'Referred', numericValue: null, isPassed: false, isReferred: true, label: 'রেফার্ড (Ref)' }
            },
            referredSubjects: [
                { code: '28542', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '28542(T)' },
                { code: '28544', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '28544(T)' }
            ]
        },
        '800094': {
            roll: '800094',
            status: 'Dropped Out',
            statusBangla: 'ড্রপ আউট (সেমিস্টার ড্রপ)',
            statusType: 'danger',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                5: { semester: 5, value: 'Dropped Out', numericValue: null, isPassed: false, isReferred: false, label: 'ড্রপ (Drop)' }
            },
            referredSubjects: [
                { code: '25852', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25852(T)' },
                { code: '25931', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25931(T)' },
                { code: '26355', type: 'T,P', typeLabel: 'তত্ত্বীয় ও ব্যবহারিক (T,P)', badgeClass: 'badge-danger', raw: '26355(T,P)' },
                { code: '26811', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '26811(T)' }
            ]
        },
        '800027': {
            roll: '800027',
            status: 'Passed',
            statusBangla: 'উত্তীর্ণ',
            statusType: 'success',
            latestSemester: 6,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                1: { semester: 1, value: '3.95', numericValue: 3.95, isPassed: true, isReferred: false, label: '3.95' },
                2: { semester: 2, value: '3.88', numericValue: 3.88, isPassed: true, isReferred: false, label: '3.88' },
                3: { semester: 3, value: '3.75', numericValue: 3.75, isPassed: true, isReferred: false, label: '3.75' },
                4: { semester: 4, value: '3.92', numericValue: 3.92, isPassed: true, isReferred: false, label: '3.92' },
                5: { semester: 5, value: '3.85', numericValue: 3.85, isPassed: true, isReferred: false, label: '3.85' },
                6: { semester: 6, value: '3.90', numericValue: 3.90, isPassed: true, isReferred: false, label: '3.90' }
            },
            referredSubjects: []
        },
        '887904': {
            roll: '887904',
            status: 'Referred',
            statusBangla: 'রেফার্ড',
            statusType: 'warning',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                4: { semester: 4, value: '3.45', numericValue: 3.45, isPassed: true, isReferred: false, label: '3.45' },
                5: { semester: 5, value: 'Referred', numericValue: null, isPassed: false, isReferred: true, label: 'রেফার্ড (Ref)' }
            },
            referredSubjects: [
                { code: '66651', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '66651(T)' }
            ]
        },
        '100001': {
            roll: '100001',
            status: 'Passed',
            statusBangla: 'উত্তীর্ণ',
            statusType: 'success',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                5: { semester: 5, value: '3.52', numericValue: 3.52, isPassed: true, isReferred: false, label: '3.52' }
            },
            referredSubjects: []
        },
        '100002': {
            roll: '100002',
            status: 'Passed',
            statusBangla: 'উত্তীর্ণ',
            statusType: 'success',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                4: { semester: 4, value: '3.65', numericValue: 3.65, isPassed: true, isReferred: false, label: '3.65' },
                5: { semester: 5, value: '3.80', numericValue: 3.80, isPassed: true, isReferred: false, label: '3.80' }
            },
            referredSubjects: []
        },
        '100003': {
            roll: '100003',
            status: 'Referred',
            statusBangla: 'রেফার্ড',
            statusType: 'warning',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                5: { semester: 5, value: 'Referred', numericValue: null, isPassed: false, isReferred: true, label: 'রেফার্ড (Ref)' }
            },
            referredSubjects: [
                { code: '25811', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25811(T)' },
                { code: '25812', type: 'P', typeLabel: 'ব্যবহারিক (Practical)', badgeClass: 'badge-info', raw: '25812(P)' }
            ]
        },
        '100004': {
            roll: '100004',
            status: 'Dropped Out',
            statusBangla: 'ড্রপ আউট (সেমিস্টার ড্রপ)',
            statusType: 'danger',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                5: { semester: 5, value: 'Dropped Out', numericValue: null, isPassed: false, isReferred: false, label: 'ড্রপ (Drop)' }
            },
            referredSubjects: [
                { code: '25811', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25811(T)' },
                { code: '25812', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25812(T)' },
                { code: '25813', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25813(T)' },
                { code: '25814', type: 'T', typeLabel: 'তত্ত্বীয় (Theory)', badgeClass: 'badge-warning', raw: '25814(T)' }
            ]
        },
        '100005': {
            roll: '100005',
            status: 'Passed',
            statusBangla: 'উত্তীর্ণ',
            statusType: 'success',
            latestSemester: 5,
            regulation: '2022',
            examYear: '2024',
            semesters: {
                5: { semester: 5, value: '3.90', numericValue: 3.90, isPassed: true, isReferred: false, label: '3.90' }
            },
            referredSubjects: []
        }
    };

    /**
     * Look up student by roll
     */
    function getStudent(roll) {
        if (!roll) return null;
        var cleanRoll = String(roll).trim().replace(/[০-৯]/g, function (d) {
            return '০১২৩৪৫৬৭৮৯'.indexOf(d);
        });
        return database[cleanRoll] || null;
    }

    /**
     * Add or update student in active database
     */
    function setStudent(student) {
        if (student && student.roll) {
            database[String(student.roll).trim()] = student;
        }
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

    return {
        getStudent: getStudent,
        setStudent: setStudent,
        getAllRolls: getAllRolls,
        getCount: getCount,
        getDatabase: getDatabase
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBResultsDatabase;
}
