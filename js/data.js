/**
 * BTEB Portal - Demo Database & Configuration Data
 * Completely Fictional / Mock Data (Does not match any real person or student)
 */

const BTEBData = (function () {
    'use strict';

    // Fictional Mock Result Sheet demo text (For testing parser & chunk engine)
    const RAW_BTEB_SHEET_DEMO = `
BANGLADESH TECHNICAL EDUCATION BOARD, DHAKA
DIPLOMA IN ENGINEERING (CURRICULUM-2022)
5TH SEMESTER EXAMINATION, 2024
INSTITUTE: 00000 - DEMO POLYTECHNIC INSTITUTE
TECHNOLOGY: 000 - SAMPLE ENGINEERING DEPARTMENT

------------------------------------------------------------------------------------------------------
RESULT SHEET (REGULAR & REFERRED) - MOCK SAMPLE DATA
------------------------------------------------------------------------------------------------------

100001 (gpa5: 3.50, gpa4: 3.40, gpa3: 3.30, gpa2: 3.20, gpa1: 3.60)

100002 {gpa5: ref, gpa4: ref, gpa3: 3.10, gpa2: 2.90, gpa1: 3.00, ref_sub: 28542(T), 28544(T))

100003 (25852(T), 25931(T), 26355(T,P), 26811(T)}

100004 (gpa6: 3.85, gpa5: 3.80, gpa4: 3.75, gpa3: 3.70, gpa2: 3.65, gpa1: 3.90)

100005 (gpa5: ref, gpa4: 3.25, gpa3: 3.15, gpa2: 3.05, gpa1: 3.35, ref_sub: 66651(T))
    `.trim();

    // Subject Dictionary
    const SUBJECT_DIRECTORY = {
        '28542': 'Microprocessor & Interfacing',
        '28544': 'Data Communication',
        '28553': 'Web Development',
        '28554': 'Operating System Application',
        '25852': 'Chemistry',
        '25931': 'Mathematics-3',
        '26355': 'Electrical Circuit & Machine',
        '26811': 'Engineering Drawing',
        '66651': 'Computer Graphic Design',
        '66652': 'Programming Essentials',
        '66653': 'Database Management System',
        '66654': 'Web Design & Development',
        '66655': 'Computer Peripherals',
        '66641': 'Data Structure & Algorithm',
        '66741': 'Environmental Studies',
        '66842': 'Electronic Devices & Circuits'
    };

    // Generic Mock Students (No real person's data)
    const DEMO_STUDENTS = {
        '100001': {
            name: 'নমুনা শিক্ষার্থী ০১ (Demo Student 1)',
            institute: 'ডেমো পলিটেকনিক ইনস্টিটিউট (Mock Polytechnic)',
            technology: 'কম্পিউটার প্রযুক্তি (Sample Tech)',
            session: '২০২২-২০২৩',
            regulation: '২০২২'
        },
        '100002': {
            name: 'নমুনা শিক্ষার্থী ০২ (Demo Student 2)',
            institute: 'ডেমো পলিটেকনিক ইনস্টিটিউট (Mock Polytechnic)',
            technology: 'কম্পিউটার প্রযুক্তি (Sample Tech)',
            session: '২০২১-২০২২',
            regulation: '২০১৬'
        },
        '100003': {
            name: 'নমুনা শিক্ষার্থী ০৩ (Demo Student 3)',
            institute: 'ডেমো পলিটেকনিক ইনস্টিটিউট (Mock Polytechnic)',
            technology: 'ইলেকট্রিক্যাল প্রযুক্তি (Sample Tech)',
            session: '২০২২-২০২৩',
            regulation: '২০২২'
        },
        '100004': {
            name: 'নমুনা শিক্ষার্থী ০৪ (Demo Student 4)',
            institute: 'ডেমো পলিটেকনিক ইনস্টিটিউট (Mock Polytechnic)',
            technology: 'সিভিল প্রযুক্তি (Sample Tech)',
            session: '২০২১-২০২২',
            regulation: '২০২২'
        },
        '100005': {
            name: 'নমুনা শিক্ষার্থী ০৫ (Demo Student 5)',
            institute: 'ডেমো পলিটেকনিক ইনস্টিটিউট (Mock Polytechnic)',
            technology: 'মেকানিক্যাল প্রযুক্তি (Sample Tech)',
            session: '২০২১-২০২২',
            regulation: '২০২২'
        }
    };

    // Quick demo list for UI buttons with generic mock rolls
    const QUICK_DEMO_ROLLS = [
        { roll: '100001', label: 'উত্তীর্ণ (Passed)', badge: 'success', desc: 'সকল সেমিস্টারে উত্তীর্ণ' },
        { roll: '100002', label: 'রেফার্ড (Referred)', badge: 'warning', desc: '২টি বিষয়ে রেফার্ড' },
        { roll: '100003', label: 'ড্রপ আউট (Dropped)', badge: 'danger', desc: 'সেমিস্টার ড্রপ' },
        { roll: '100004', label: 'টপ রেজাল্ট (GPA 3.85)', badge: 'success', desc: '৬ষ্ঠ সেমিস্টার উত্তীর্ণ' },
        { roll: '100005', label: '১ বিষয়ে রেফার্ড', badge: 'warning', desc: '১টি রেফার্ড সাবজেক্ট' }
    ];

    return {
        RAW_BTEB_SHEET_DEMO: RAW_BTEB_SHEET_DEMO,
        SUBJECT_DIRECTORY: SUBJECT_DIRECTORY,
        DEMO_STUDENTS: DEMO_STUDENTS,
        QUICK_DEMO_ROLLS: QUICK_DEMO_ROLLS,
        getSubjectName: function (code) {
            return SUBJECT_DIRECTORY[code] || 'প্রকৌশল বিষয় (Engineering Subject)';
        },
        getStudentMeta: function (roll) {
            return DEMO_STUDENTS[roll] || {
                name: 'শিক্ষার্থী (Roll - ' + roll + ')',
                institute: 'পলিটেকনিক ইনস্টিটিউট (Polytechnic Institute)',
                technology: 'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং',
                session: '২০২১-২০২২',
                regulation: '২০২২'
            };
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBData;
}
