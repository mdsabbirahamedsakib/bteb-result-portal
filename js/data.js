/**
 * BTEB Portal - Data Directory & Subject Mapping
 * (Demo Results Removed per User Instruction - Real Uploaded Data Only)
 */

const BTEBData = (function () {
    'use strict';

    // Empty demo sheet - only user uploaded PDF results will be loaded
    const RAW_BTEB_SHEET_DEMO = '';

    // Official BTEB Polytechnic Subject Code Dictionary
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

    // No hardcoded demo rolls
    const QUICK_DEMO_ROLLS = [];

    return {
        RAW_BTEB_SHEET_DEMO: RAW_BTEB_SHEET_DEMO,
        SUBJECT_DIRECTORY: SUBJECT_DIRECTORY,
        QUICK_DEMO_ROLLS: QUICK_DEMO_ROLLS,
        getSubjectName: function (code) {
            return SUBJECT_DIRECTORY[code] || 'কারিগরি বিষয় (' + code + ')';
        },
        getStudentMeta: function (roll, studentData) {
            var instCode = studentData && (studentData.institute_code || studentData.instituteCode) ? (studentData.institute_code || studentData.instituteCode) : '';
            var instName = studentData && (studentData.institute_name || studentData.instituteName) ? (studentData.institute_name || studentData.instituteName) : '';
            return {
                name: 'শিক্ষার্থী (রোল: ' + roll + ')',
                institute: instName || 'বাংলাদেশ কারিগরি শিক্ষা বোর্ড আওতাধীন পলিটেকনিক ইনস্টিটিউট',
                institute_code: instCode,
                institute_name: instName,
                technology: 'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং',
                session: 'বোর্ড পরীক্ষা সেশন',
                regulation: (studentData && studentData.regulation) ? studentData.regulation : '২০২২/২০১৬'
            };
        }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BTEBData;
}
