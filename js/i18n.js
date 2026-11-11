/**
 * BTEB Portal - Non-Destructive Bangla / English Language Switcher (i18n.js)
 *
 * Injects live bilingual switching on top of existing UI without altering
 * any core parsing, database, visitor tracking, or layout logic.
 * - Persists selected language in localStorage ('bteb_portal_lang')
 * - Preserves exact original Bengali DOM text via WeakMap so switching back
 *   to Bengali restores every character verbatim.
 * - Automatically translates dynamically rendered DOM content (marksheets,
 *   visitor counters, admin stats/tables, materials) via a guarded MutationObserver.
 */

const BTEBLang = (function () {
    'use strict';

    const STORAGE_KEY = 'bteb_portal_lang';
    const DEFAULT_LANG = 'bn';

    const origTextMap = new WeakMap();
    const origAttrMap = new WeakMap();

    let currentLang = DEFAULT_LANG;
    let observer = null;
    let isApplying = false;

    const EXACT_DICT = {
        // Brand & Navbar
        'বাংলাদেশ কারিগরি শিক্ষা বোর্ড': 'Bangladesh Technical Education Board',
        '🎓 রেজাল্ট (Result)': '🎓 Result',
        '📚 বই ও সিলেবাস': '📚 Books & Syllabus',
        '📝 হ্যান্ডনোটস': '📝 Handnotes',
        '🎯 সাজেশন': '🎯 Suggestions',
        '⚙️ Admin Panel': '⚙️ Admin Panel',
        'ডিজিটাল লাইব্রেরি দেখুন →': 'View Digital Library →',
        'ডিজিটাল লাইব্রেরি দেখুন &rarr;': 'View Digital Library →',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল ও নতুন সেমিস্টারের বই-সাজেশন আপডেট করা হয়েছে।': 'Diploma in Engineering exam results and new semester books & suggestions have been updated.',

        // Maintenance Banner
        'রেজাল্ট সার্ভার সাময়িকভাবে বন্ধ আছে': 'Result Server Temporarily Offline',
        'রেজাল্ট আপলোডের কাজ চলছে, কিছুক্ষণ পর চেষ্টা করুন।': 'Result upload is in progress, please try again shortly.',

        // Index Hero & Search Card
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং রেজাল্ট সার্চ ইঞ্জিন': 'Diploma in Engineering Result Search Engine',
        'BTEB অফিসিয়াল পিডিএফ থেকে নির্ভুলভাবে সকল সেমিস্টারের রেজাল্ট, জিপিএ ও রেফার্ড বিষয় দেখুন': 'Accurately check semester-wise results, GPA, and referred subjects directly from official BTEB PDFs',
        'রোল নম্বর (Roll Number):': 'Roll Number:',
        'আপনার ৬ ডিজিটের বোর্ড রোল নম্বর লিখুন': 'Enter your 6-digit board roll number',
        'সেমিস্টার (Semester):': 'Semester:',
        'সকল সেমিস্টার (All)': 'All Semesters',
        '১ম সেমিস্টার (1st)': '1st Semester',
        '২য় সেমিস্টার (2nd)': '2nd Semester',
        '৩য় সেমিস্টার (3rd)': '3rd Semester',
        '৪র্থ সেমিস্টার (4th)': '4th Semester',
        '৫ম সেমিস্টার (5th)': '5th Semester',
        '৬ষ্ঠ সেমিস্টার (6th)': '6th Semester',
        '৭ম সেমিস্টার (7th)': '7th Semester',
        '৮ম সেমিস্টার (8th)': '8th Semester',
        'প্রবিধান (Regulation):': 'Regulation:',
        'প্রবিধান ২০২২': 'Regulation 2022',
        'প্রবিধান ২০১৬': 'Regulation 2016',
        'প্রবিধান ২০১০': 'Regulation 2010',
        '🔍 রেজাল্ট দেখুন': '🔍 View Result',

        // Empty State & Feature Highlights
        'উপরে রোল নম্বর লিখে "রেজাল্ট দেখুন" বাটনে ক্লিক করুন': 'Enter your roll number above and click "View Result"',
        'আপনার ৬ বা ৭ ডিজিটের বোর্ড পরীক্ষার রোল নম্বর দিয়ে তাৎক্ষণিক নির্ভুল মার্কশিট ফলাফল দেখুন।': 'Enter your 6 or 7-digit board exam roll number for an instant, accurate marksheet result.',
        '⚡ স্মার্ট পিডিএফ পার্সার ও আপলোডার': '⚡ Smart PDF Parser & Uploader',
        'পিডিএফ থেকে কপি করা টেক্সট স্বয়ংক্রিয়ভাবে পার্স হয়। অ্যাডমিন প্যানেল থেকে যেকোনো সময় নতুন রেজাল্ট শিট যোগ করা যায়।': 'Copied PDF text or full PDFs are parsed automatically. New result sheets can be added anytime from the Admin Panel.',
        '📚 ডিজিটাল লাইব্রেরি ও নোটস': '📚 Digital Library & Notes',
        'ডিপ্লোমার সকল সেমিস্টারের পাঠ্যবই, অধ্যায়ভিত্তিক হ্যান্ডনোটস এবং লেকচার শিট সম্পূর্ণ ফ্রিতে পড়তে ও ডাউনলোড করতে পারবেন।': 'Read and download textbooks, chapter-wise handnotes, and lecture sheets for all Diploma semesters completely free.',
        '🎯 বোর্ড ফাইনাল সুপার সাজেশন': '🎯 Board Final Super Suggestions',
        'পরীক্ষার শতভাগ প্রস্তুতি নেওয়ার জন্য অভিজ্ঞ শিক্ষকদের তৈরি বিশেষ সাজেশন ও গুরুত্বপূর্ণ প্রশ্নাবলি সংরক্ষিত রয়েছে।': 'Curated board final suggestions and key questions prepared by experienced teachers for 100% exam readiness.',

        // Coming Soon Modal
        'শীঘ্রই আসছে!': 'Coming Soon!',
        'অ্যাডমিন প্যানেল থেকে এই ফিচারটি সাময়িকভাবে বন্ধ রাখা হয়েছে। শীঘ্রই এটি সক্রিয় করা হবে।': 'This feature has been temporarily paused from the Admin Panel. It will be enabled soon.',
        'ঠিক আছে': 'OK',

        // Result Marksheet Card (app.js)
        'বাংলাদেশ কারিগরি শিক্ষা বোর্ড, ঢাকা': 'Bangladesh Technical Education Board, Dhaka',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল মার্কশিট': 'Diploma in Engineering Examination Result Marksheet',
        '🖨️ প্রিন্ট / সেভ PDF': '🖨️ Print / Save PDF',
        '🔄 নতুন সার্চ': '🔄 New Search',
        'ফলাফল স্ট্যাটাস (Status):': 'Result Status:',
        'উত্তীর্ণ (Passed)': 'Passed',
        'ড্রপ আউট (Dropped Out / সেমিস্টার ড্রপ)': 'Dropped Out (Semester Drop)',
        'গড় CGPA:': 'Average CGPA:',
        '📄 অফিসিয়াল PDF ভেরিফাইড (অগ্রাধিকারপ্রাপ্ত)': '📄 Official PDF Verified (Priority)',
        '📋 কপি-পেস্ট শিট রেজাল্ট': '📋 Copy-Paste Sheet Result',
        'শিক্ষার্থীর রোল (Roll No):': 'Student Roll No:',
        'শিক্ষার্থীর নাম (Student Name):': 'Student Name:',
        'ইনস্টিটিউট (Institute):': 'Institute:',
        'EIIN / ইনস্টিটিউট কোড:': 'EIIN / Institute Code:',
        'টেকনোলজি (Technology):': 'Technology:',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং': 'Diploma in Engineering',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং': 'Diploma in Engineering',
        'শিক্ষাবর্ষ / সেশন (Session):': 'Academic Session:',
        'বোর্ড পরীক্ষা সেশন': 'Board Exam Session',
        'সর্বশেষ সেমিস্টার (Latest Sem):': 'Latest Semester:',
        'সেমিস্টার ড্রপ': 'Semester Drop',
        '📊 সেমিস্টারভিত্তিক জিপিএ ও অগ্রগতি মিটার (Semester-wise GPA)': '📊 Semester-wise GPA & Progress Meter',
        '১ম - ৮ম সেমিস্টার ট্র্যাকার': '1st - 8th Semester Tracker',
        'সেমিস্টার (Semester)': 'Semester',
        'প্রাপ্ত জিপিএ ও মিটার': 'Obtained GPA & Meter',
        'স্ট্যাটাস (Status)': 'Status',
        'মন্তব্য (Remarks)': 'Remarks',
        'ফলাফল নেই': 'No Result',
        'পরীক্ষা অনুষ্ঠিত হয়নি / রেকর্ড নেই': 'Exam not held / No record',
        'সফলভাবে উত্তীর্ণ': 'Successfully Passed',
        'রেফার্ড (Ref)': 'Referred (Ref)',
        'পরবর্তী সেশনে পরীক্ষা বাধ্যতামূলক': 'Re-examination mandatory in next session',
        'অনুপস্থিত (Abs)': 'Absent (Abs)',
        'অনুপস্থিত ছিলেন': 'Was absent',
        'ড্রপ': 'Drop',
        'ড্রপ আউট': 'Dropped Out',
        'সেমিস্টার পুনরাবৃত্তি আবশ্যক': 'Semester repeat required',
        '৪ বা ততোধিক বিষয়ে অকৃতকার্য হওয়ায় সেমিস্টার ড্রপ': 'Semester dropped due to failing in 4 or more subjects',
        'নির্বাচিত': 'Selected',
        'BTEB প্রবিধান অনুযায়ী নিচে উল্লেখিত বিষয়সমূহে পরবর্তী সেমিস্টার পরীক্ষার সাথে পুনরায় পরীক্ষায় অংশগ্রহণ করতে হবে।': 'Per BTEB regulation, you must appear for re-examination in the subjects listed below during the next semester exam.',
        'তত্ত্বীয় (Theory)': 'Theory',
        'ব্যবহারিক (Practical)': 'Practical',
        'তত্ত্বীয় ও ব্যবহারিক (T,P)': 'Theory & Practical (T,P)',
        'সাধারণ': 'General',
        '• তত্ত্বীয় (Theory) পরীক্ষা দিতে হবে': '• Must appear for Theory exam',
        '• ব্যবহারিক (Practical) পরীক্ষা দিতে হবে': '• Must appear for Practical exam',
        'বিশেষ দ্রষ্টব্য:': 'Important Note:',
        'এটি একটি ডিজিটাল প্রিন্ট কপি। যেকোনো ভুল-ত্রুটির ক্ষেত্রে বাংলাদেশ কারিগরি শিক্ষা বোর্ড (BTEB) এর মূল রেজাল্ট গেজেট চূড়ান্ত বলে গণ্য হবে।': 'This is a digital print copy. In case of any discrepancy, the official BTEB result gazette shall be considered final.',
        'যাচাইকারী কর্মকর্তা': 'Verifying Officer',
        'ভারপ্রাপ্ত কর্মকর্তা (পরীক্ষা নিয়ন্ত্রণ)': 'Officer-in-Charge (Exam Control)',
        'পরীক্ষা নিয়ন্ত্রক, কারিগরি শিক্ষা বোর্ড': 'Controller of Examinations, BTEB',

        // Not Found View
        'উক্ত রোল নম্বরের কোনো রেজাল্ট পাওয়া যায়নি': 'No Result Found for This Roll Number',
        'রোল নম্বর:': 'Roll Number:',
        'এর কোনো ফলাফল ডেটাবেসে অন্তর্ভুক্ত নেই।': 'does not have any result in the database yet.',
        'অনুগ্রহ করে সঠিক রোল নম্বর লিখুন অথবা অ্যাডমিন প্যানেল থেকে উক্ত সেমিস্টারের অফিসিয়াল BTEB রেজাল্ট PDF আপলোড নিশ্চিত করুন।': 'Please verify your roll number or ensure the official BTEB result PDF is uploaded via the Admin Panel.',
        'পুনরায় চেষ্টা করুন': 'Try Again',
        'অ্যাডমিন প্যানেলে যান': 'Go to Admin Panel',

        // Footer & Visitor Counter
        '— পলিটেকনিক শিক্ষার্থীদের জন্য একটি উন্মুক্ত প্ল্যাটফর্ম': '— An Open Platform for Polytechnic Students',
        '— পলিটেকনিক শিক্ষার্থীদের জন্য উন্মুক্ত শিক্ষা প্ল্যাটফর্ম': '— Open Education Platform for Polytechnic Students',
        'বাংলাদেশ কারিগরি শিক্ষা বোর্ড (BTEB) এর ডিপ্লোমা ইন ইঞ্জিনিয়ারিং শিক্ষার্থীদের সহায়তায় নির্মিত।': 'Built to assist Diploma in Engineering students under Bangladesh Technical Education Board (BTEB).',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং শিক্ষার্থীদের সহায়তায় সার্বিক কারিগরি তথ্য ও রিসোর্স।': 'Comprehensive technical resources and study support for Diploma in Engineering students.',
        '👁️ মোট ভিজিটর:': '👁️ Total Visitors:',
        '📅 আজকের ভিজিটর:': '📅 Today\'s Visitors:',
        '👤 ইউনিক ভিজিটর:': '👤 Unique Visitors:',

        // Materials Page
        '📚 পলিটেকনিক ডিজিটাল লাইব্রেরি ও স্টাডি মেটেরিয়ালস': '📚 Polytechnic Digital Library & Study Materials',
        'ডিপ্লোমা ইন ইঞ্জিনিয়ারিংয়ের সকল সেমিস্টারের পাঠ্যবই, শর্ট হ্যান্ডনোটস এবং বোর্ড ফাইনাল পরীক্ষার সুপার সাজেশন সম্পূর্ণ বিনামূল্যে সংগ্রহ করুন।': 'Access free textbooks, short handnotes, and board final super suggestions for all Diploma in Engineering semesters.',
        '🌟 সকল মেটেরিয়ালস': '🌟 All Materials',
        '📚 পাঠ্যবই ও সিলেবাস (Books)': '📚 Textbooks & Syllabus',
        '📝 হ্যান্ডনোটস ও শিট (Notes)': '📝 Handnotes & Sheets',
        '🎯 সুপার সাজেশন (Suggestions)': '🎯 Super Suggestions',
        'টেকনোলজি (Technology):': 'Technology:',
        'সকল টেকনোলজি (All)': 'All Technologies',
        'সার্চ করুন (Search by Title or Keyword):': 'Search (Title or Keyword):',
        'যেমন: Microprocessor, Data Communication বা সাজেশন...': 'e.g., Microprocessor, Data Communication or Suggestion...',
        'লোড হচ্ছে...': 'Loading...',
        '+ নতুন বই বা সাজেশন পোস্ট করুন (অ্যাডমিন)': '+ Post Book or Suggestion (Admin)',
        'কোনো রিসোর্স পাওয়া যায়নি': 'No Resources Found',
        'আপনার ফিল্টারের সাথে মিলে এমন কোনো বই, নোটস বা সাজেশন পাওয়া যায়নি। অনুগ্রহ করে ফিল্টার পরিবর্তন করুন অথবা অ্যাডমিন থেকে নতুন যুক্ত করুন।': 'No books, notes, or suggestions matched your filter. Try changing the filters or add new items via the Admin Panel.',
        'সকল ফিল্টার রিসেট করুন': 'Reset All Filters',
        'বই (Textbook)': 'Textbook',
        'হ্যান্ডনোটস (Notes)': 'Handnotes',
        'সুপার সাজেশন': 'Super Suggestion',
        'মেটেরিয়াল': 'Material',
        'কোনো বিবরণ নেই': 'No description available',
        'বিস্তারিত': 'Details',
        '👁️ বিস্তারিত': '👁️ Details',
        '📥 ডাউনলোড / পড়ুন': '📥 Download / Read',
        'মেটেরিয়াল বিবরণ': 'Material Details',
        'বিস্তারিত তথ্য ও অধ্যায় সূচি:': 'Details & Chapter Index:',
        'উৎস / লেখক:': 'Source / Author:',
        'বন্ধ করুন': 'Close',
        '📥 পড়ুন / ডাউনলোড লিংক খুলুন': '📥 Open Read / Download Link',

        // Admin Navbar, Auth & Header
        '🔑 পাসওয়ার্ড পরিবর্তন': '🔑 Change Password',
        '🚪 লগআউট': '🚪 Logout',
        'অ্যাডমিন লগইন (Admin Authentication)': 'Admin Login',
        'রেজাল্ট আপলোড ও পোর্টাল পরিচালনায় প্রবেশ করতে নির্ধারিত অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড দিয়ে যাচাই করুন': 'Verify with your admin username and password to manage results and portal settings',
        'ভুল ইউজারনেম বা পাসওয়ার্ড!': 'Incorrect username or password!',
        'ইউজারনেম (Username): *': 'Username: *',
        'অ্যাডমিন ইউজারনেম লিখুন': 'Enter admin username',
        'পাসওয়ার্ড (Password): *': 'Password: *',
        'অ্যাডমিন পাসওয়ার্ড লিখুন': 'Enter admin password',
        '🔓 সুরক্ষিত লগইন করুন (Login)': '🔓 Secure Login',
        '← স্টুডেন্ট সার্চ পেজে ফিরে যান': '← Back to Student Search Page',
        '🔒 সর্বোচ্চ নিরাপত্তা এনক্রিপশন সক্রিয়': '🔒 Maximum Security Encryption Active',
        '🏠 হোম': '🏠 Home',
        '⚙️ অ্যাডমিন প্যানেল': '⚙️ Admin Panel',
        '⚙️ অ্যাডমিন কন্ট্রোল সেন্টার (Admin Control Center)': '⚙️ Admin Control Center',
        'রেজাল্ট আপলোড, বই ও সাজেশন প্রকাশনা এবং সাইটের মেনু অন/অফ পরিচালনা করুন': 'Manage result uploads, books & suggestions publishing, and site menu controls',

        // Admin Hub Cards & Nav Tabs
        'বাল্ক ও PDF রেজাল্ট': 'Bulk & PDF Results',
        '৩-৪ লক্ষ টেক্সট ও সরাসরি PDF আপলোড': 'Large text sheets & direct PDF upload',
        'একক রেজাল্ট পরিচালনা': 'Manage Single Result',
        'রোল সার্চ, GPA ১-৮ এডিট ও ডিলিট': 'Roll lookup, GPA 1-8 edit & delete',
        'বই ও সাজেশন': 'Books & Suggestions',
        'স্টাডি ম্যাটেরিয়াল পোস্ট ও ছবি প্রকাশ': 'Publish study materials & covers',
        'সাইট সেটিংস ও মাস্টার সুইচ': 'Site Settings & Master Switch',
        'মেনু ও সার্ভার অন/অফ মাস্টার কন্ট্রোল': 'Menu & server ON/OFF controls',
        'সিকিউরিটি ও ক্রেডেনশিয়াল': 'Security & Credentials',
        'ইউজারনেম ও পাসওয়ার্ড পরিবর্তন': 'Change username & password',
        'ভিজিটর লগ (Analytics)': 'Visitor Logs (Analytics)',
        'মোট, আজকের ভিজিটর ও লগ টেবিল': 'Total, daily visitors & log table',
        '📊 রেজাল্ট আপলোড ও সার্ভার': '📊 Results & Server',
        '🎯 একক রেজাল্ট পরিচালনা': '🎯 Single Result',
        '📚 বই ও সাজেশন': '📚 Books & Notes',
        '⚙️ সাইট সেটিংস': '⚙️ Site Settings',
        '🔐 সিকিউরিটি ও পাসওয়ার্ড': '🔐 Security',
        '👁️ ভিজিটর লগ': '👁️ Visitor Logs',
        '🎓 স্টুডেন্ট পেজ': '🎓 Student Page',

        // Admin Global Stats & Server Control
        'সেভ করা শীট': 'Saved Sheets',
        'মোট শিক্ষার্থী': 'Total Students',
        'উত্তীর্ণ': 'Passed',
        'রেফার্ড': 'Referred',
        'পাসের হার': 'Pass Rate',
        'মোট ভিজিটর': 'Total Visitors',
        'আজকের ভিজিটর': 'Today\'s Visitors',
        '🖥️ রেজাল্ট সার্ভার কন্ট্রোল (Server Control)': '🖥️ Result Server Control',
        'রেজাল্ট সার্ভার চালু / বন্ধ': 'Result Server ON / OFF',
        'বন্ধ (OFF) করলে শিক্ষার্থী পেজে রেজাল্টের বদলে মেইনটেন্যান্স ম্যাসেজ দেখাবে।': 'Turning OFF shows a maintenance message instead of search results on the student page.',
        'কাস্টম মেইনটেন্যান্স বার্তা:': 'Custom Maintenance Message:',
        'শিক্ষার্থীদের জন্য বার্তা লিখুন...': 'Enter notice for students...',
        '💾 ম্যাসেজ সেভ': '💾 Save Message',

        // Admin PDF Upload & Bulk Uploader
        '📄 সরাসরি BTEB রেজাল্ট PDF আপলোড ও অটো-পার্সিং (Upload BTEB Result PDF)': '📄 Direct BTEB Result PDF Upload & Auto-Parser',
        '১০০% স্বয়ংক্রিয় ক্লায়েন্ট পার্সার': '100% Automated Client Parser',
        '📄 PDF ফাইল এখানে ড্রপ করুন বা ক্লিক করে সিলেক্ট করুন': '📄 Drop PDF file(s) here or click to select',
        'একাধিক PDF ফাইল (১ম থেকে ৮ম পর্ব) একসাথে সিলেক্ট করা যাবে': 'Select single or multiple PDF files (1st to 8th Semester)',
        '📂 PDF সিলেক্ট করুন': '📂 Choose PDF(s)',
        '📂 সংরক্ষিত রেজাল্ট ফাইল ও ডেটাবেস ম্যানেজার (Saved Result Files)': '📂 Saved Result Files & Database Manager',
        '💾 ব্যাকআপ ও ডাউনলোড (Backup & Export)': '💾 Backup & Export',
        '📦 সম্পূর্ণ ব্যাকআপ ডাউনলোড (JSON)': '📦 Download Full Backup (JSON)',
        '📄 টেক্সট ফাইল ডাউনলোড': '📄 Download Text File',
        '📥 ব্যাকআপ ফাইল ইমপোর্ট': '📥 Import Backup File',
        '⚠️ বিপদ অঞ্চল (Danger Zone)': '⚠️ Danger Zone',
        '🗑️ সকল রেজাল্ট শীট মুছে ফেলুন': '🗑️ Delete All Result Sheets',

        // Admin Visitor Logs Tab
        'মোট ভিজিট (Total Visits)': 'Total Visits',
        'আজকের ভিজিট (Today)': 'Today\'s Visits',
        'মোট ইউনিক ভিজিটর': 'Total Unique Visitors',
        'আজকের ইউনিক ভিজিটর': 'Today\'s Unique Visitors',
        '📅 তারিখ অনুযায়ী ভিজিটর সংখ্যা (শেষ ৩০ দিন)': '📅 Daily Visitor Count (Last 30 Days)',
        'তারিখ (Date)': 'Date',
        'মোট ভিজিটর (Total Visitors)': 'Total Visitors',
        'কোনো ভিজিটর ডেটা পাওয়া যায়নি।': 'No visitor data found.',
        '👁️ ভিজিটর লগ তালিকা (visitor_logs)': '👁️ Visitor Logs Table (visitor_logs)',
        '📅 সকল তারিখ': '📅 All Dates',
        '🌟 আজকের লগ': '🌟 Today\'s Logs',
        '🗓️ নির্দিষ্ট তারিখ': '🗓️ Custom Date',
        'IP / Client ID বা পেজ খুঁজুন...': 'Search IP / Client ID or page...',
        '🔄 রিফ্রেশ': '🔄 Refresh',
        '📥 .SQL ডাউনলোড': '📥 Download .SQL',
        '📊 .CSV ডাউনলোড': '📊 Download .CSV',
        '🗑️ লগ মুছুন': '🗑️ Clear Logs',
        '# (id)': '# (id)',
        'IP / ক্লায়েন্ট ঠিকানা (ip_address)': 'IP / Client Address (ip_address)',
        'তারিখ (visit_date)': 'Date (visit_date)',
        'সময় (visited_at)': 'Timestamp (visited_at)',
        'পেজ (page)': 'Page (page)',
        '🗄️ ঐচ্ছিক PHP + MySQL ব্যাকএন্ড সংযোগ (cPanel / Server Hosting)': '🗄️ Optional PHP + MySQL Backend Connection (cPanel / Server Hosting)',
        '🐘 MySQL / PHP ব্যাকএন্ড API ব্যবহার করুন': '🐘 Enable MySQL / PHP Backend API',
        '💾 ব্যাকএন্ড কনফিগারেশন সেভ ও যাচাই': '💾 Save & Verify Backend Config',

        // Admin Single Result / Materials / Settings / Security headings
        '🔍 রোল নম্বর দিয়ে রেজাল্ট খুঁজুন, এডিট ও ডিলিট করুন': '🔍 Search, Edit & Delete Individual Result',
        'রোল নম্বর লিখুন (Roll Number):': 'Enter Roll Number:',
        'শিক্ষার্থীর রোল নম্বর লিখুন...': 'Enter student roll number...',
        '🔍 খুঁজুন ও এডিট করুন': '🔍 Search & Edit',
        '🔄 নতুন ফর্ম': '🔄 New Form',
        '🔘 মেনু অন/অফ কন্ট্রোল (Menu Display Settings)': '🔘 Menu Display Controls (ON/OFF)',
        '📝 সাইট ব্র্যান্ডিং ও নোটিশ কনফিগারেশন': '📝 Site Branding & Notice Configuration',
        '💾 সাইট সেটিংস সংরক্ষণ করুন (Save Settings)': '💾 Save Settings',
        '🔐 সিকিউরিটি ও পাসওয়ার্ড পরিবর্তন (Change Credentials)': '🔐 Security & Change Credentials',
        'বর্তমান পাসওয়ার্ড (Current Password): *': 'Current Password: *',
        'নতুন ইউজারনেম (New Username): *': 'New Username: *',
        'নতুন পাসওয়ার্ড (New Password): *': 'New Password: *',
        'নতুন পাসওয়ার্ড নিশ্চিত করুন (Confirm Password): *': 'Confirm New Password: *',
        '💾 তথ্য আপডেট ও সংরক্ষণ করুন': '💾 Update & Save Credentials',
        '🔄 রিসেট': '🔄 Reset',
        'হেল্পলাইন / যোগাযোগ নম্বর:': 'Helpline / Contact Number:',
        'পোর্টালের নাম (Portal Title):': 'Portal Title:',
        'ডার্ক / লাইট মোড পরিবর্তন করুন': 'Toggle Dark / Light Mode',
        'উত্তীর্ণ (Passed) - সকল সেমিস্টার': 'Passed - All Semesters',
        'রেফার্ড (Referred)': 'Referred'
    };

    const DYNAMIC_PATTERNS = [
        [/^মোট\s+([০-৯\d,]+)টি\s+রিসোর্স\s+পাওয়া\s+গেছে$/, function (_, n) { return 'Total ' + toAsciiDigits(n) + ' resource(s) found'; }],
        [/^রেফার্ড\s*\(Referred\)\s*-\s*([০-৯\d,]+)টি\s+বিষয়$/, function (_, n) { return 'Referred - ' + toAsciiDigits(n) + ' Subject(s)'; }],
        [/^⚠️\s*রেফার্ড\s*\/\s*অকৃতকার্য\s+বিষয়সমূহ\s*\(Referred Subjects\s*-\s*([০-৯\d,]+)টি\s+বিষয়\)$/, function (_, n) { return '⚠️ Referred / Failed Subjects (' + toAsciiDigits(n) + ' Subject(s))'; }],
        [/^শিক্ষার্থী\s*\(রোল:\s*([^)]+)\)$/, function (_, roll) { return 'Student (Roll: ' + roll + ')'; }],
        [/^⚡\s*মাত্র\s+([০-৯\d.,]+)ms\s+এ\s+প্রস্তুত\s*\(O\(1\)\s*Engine\)$/, function (_, ms) { return '⚡ Ready in ' + toAsciiDigits(ms) + 'ms (O(1) Engine)'; }],
        [/^প্রবিধান:\s*([০-৯\d]+)$/, function (_, reg) { return 'Regulation: ' + toAsciiDigits(reg); }],
        [/^প্রবিধান\s+([০-৯\d]+)$/, function (_, reg) { return 'Regulation ' + toAsciiDigits(reg); }],
        [/^([০-৯\d,]+)টি\s+রেকর্ড$/, function (_, n) { return toAsciiDigits(n) + ' record(s)'; }],
        [/^([০-৯\d,]+)\s*দিন$/, function (_, n) { return toAsciiDigits(n) + ' day(s)'; }],
        [/^([০-৯\d,]+)টি\s+আইটেম$/, function (_, n) { return toAsciiDigits(n) + ' item(s)'; }],
        [/^ডিটেক্টেড\s+রোল:\s*([০-৯\d,]+)$/, function (_, n) { return 'Detected Rolls: ' + toAsciiDigits(n); }],
        [/^শীঘ্রই\s+আসছে:\s*(.+)$/, function (_, mod) { return 'Coming Soon: ' + mod; }],
        [/^আমাদের "BTEB Result & Education Portal" এর পরবর্তী ধাপে (.+) ফিচারটি উন্মুক্ত করা হবে।$/, function (_, mod) { return 'The ' + mod + ' feature will be unlocked in the next update of "BTEB Result & Education Portal".'; }],
        [/^([১-৮\d]+(?:ম|য়|য়|র্থ|ষ্ঠ)?)\s+সেমিস্টার$/, function (_, sem) { return toOrdinalSem(sem) + ' Semester'; }]
    ];

    const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

    function toAsciiDigits(str) {
        return String(str).replace(/[০-৯]/g, function (d) { return BN_DIGITS[d] || d; });
    }

    function toOrdinalSem(sem) {
        const clean = toAsciiDigits(String(sem).replace(/[^০-৯\d]/g, ''));
        const map = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th', '6': '6th', '7': '7th', '8': '8th' };
        return map[clean] || clean;
    }

    function hasBanglaChars(str) {
        return /[\u0980-\u09FF]/.test(str);
    }

    function translateText(original) {
        if (!original || !hasBanglaChars(original)) return original;

        const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!match) return original;
        const lead = match[1];
        const core = match[2];
        const tail = match[3];
        if (!core) return original;

        // Normalize internal line whitespace cleanly for lookup when multiline
        const normalized = core.replace(/\s+/g, ' ').trim();

        if (Object.prototype.hasOwnProperty.call(EXACT_DICT, core)) {
            return lead + EXACT_DICT[core] + tail;
        }
        if (Object.prototype.hasOwnProperty.call(EXACT_DICT, normalized)) {
            return lead + EXACT_DICT[normalized] + tail;
        }

        for (let i = 0; i < DYNAMIC_PATTERNS.length; i++) {
            const pat = DYNAMIC_PATTERNS[i][0];
            const fn = DYNAMIC_PATTERNS[i][1];
            const res = normalized.match(pat);
            if (res) {
                return lead + normalized.replace(pat, fn) + tail;
            }
        }

        // Targeted inline replacement for partial labels ending with ":" or "জন"
        if (normalized === 'জন') {
            return lead + 'visitor(s)' + tail;
        }

        return original;
    }

    function shouldSkipNode(node) {
        if (!node) return true;
        let el = node.nodeType === 1 ? node : node.parentElement;
        while (el) {
            const tag = el.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'PRE' || tag === 'SVG') {
                return true;
            }
            if (el.id === 'langToggleBtn' || el.id === 'adminUserBadge' || el.classList && el.classList.contains('notranslate')) {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    function processTextNode(textNode, targetLang) {
        if (shouldSkipNode(textNode)) return;
        const currentVal = textNode.nodeValue;
        if (!currentVal || !currentVal.trim()) return;

        if (!origTextMap.has(textNode)) {
            origTextMap.set(textNode, currentVal);
        }

        const orig = origTextMap.get(textNode);
        if (targetLang === 'en') {
            const translated = translateText(orig);
            if (currentVal !== translated) {
                textNode.nodeValue = translated;
            }
        } else {
            if (currentVal !== orig) {
                textNode.nodeValue = orig;
            }
        }
    }

    function processElementAttrs(el, targetLang) {
        if (!el || el.nodeType !== 1 || shouldSkipNode(el)) return;
        const attrs = ['placeholder', 'title'];
        let saved = origAttrMap.get(el);
        if (!saved) {
            saved = {};
            origAttrMap.set(el, saved);
        }
        for (let i = 0; i < attrs.length; i++) {
            const attrName = attrs[i];
            if (!el.hasAttribute(attrName)) continue;
            const curAttr = el.getAttribute(attrName);
            if (!Object.prototype.hasOwnProperty.call(saved, attrName)) {
                saved[attrName] = curAttr;
            }
            const origAttr = saved[attrName];
            if (targetLang === 'en') {
                const trAttr = translateText(origAttr);
                if (curAttr !== trAttr) el.setAttribute(attrName, trAttr);
            } else {
                if (curAttr !== origAttr) el.setAttribute(attrName, origAttr);
            }
        }
    }

    function translateSubtree(root, targetLang) {
        if (!root || typeof document === 'undefined') return;
        if (root.nodeType === 3) {
            processTextNode(root, targetLang);
            return;
        }
        if (root.nodeType !== 1) return;

        processElementAttrs(root, targetLang);

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
        let cur = walker.nextNode();
        while (cur) {
            if (cur.nodeType === 3) {
                processTextNode(cur, targetLang);
            } else if (cur.nodeType === 1) {
                processElementAttrs(cur, targetLang);
            }
            cur = walker.nextNode();
        }
    }

    function updateToggleButtonUI(lang) {
        const btn = document.getElementById('langToggleBtn');
        if (btn) {
            btn.textContent = lang === 'en' ? 'বাংলা' : 'English';
            btn.setAttribute('aria-label', lang === 'en' ? 'বাংলা ভাষায় দেখুন' : 'Switch to English');
            btn.setAttribute('title', lang === 'en' ? 'বাংলা ভাষায় পরিবর্তন করুন' : 'Switch language to English');
        }
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'bn');
        }
    }

    function applyLanguage(lang, skipSave) {
        const nextLang = (lang === 'en') ? 'en' : DEFAULT_LANG;
        currentLang = nextLang;

        if (!skipSave) {
            try {
                localStorage.setItem(STORAGE_KEY, nextLang);
            } catch (e) {}
        }

        if (typeof document === 'undefined' || !document.body) return;

        isApplying = true;
        if (observer) observer.disconnect();
        try {
            updateToggleButtonUI(nextLang);
            translateSubtree(document.body, nextLang);
        } finally {
            isApplying = false;
            startObserver();
        }
    }

    function startObserver() {
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
        if (!observer) {
            observer = new MutationObserver(function (mutations) {
                if (isApplying || currentLang !== 'en') return;
                isApplying = true;
                observer.disconnect();
                try {
                    for (let i = 0; i < mutations.length; i++) {
                        const m = mutations[i];
                        if (m.type === 'characterData' && m.target && m.target.nodeType === 3) {
                            if (hasBanglaChars(m.target.nodeValue) || !origTextMap.has(m.target)) {
                                origTextMap.set(m.target, m.target.nodeValue);
                            }
                            processTextNode(m.target, 'en');
                        } else if (m.type === 'childList' && m.addedNodes) {
                            for (let j = 0; j < m.addedNodes.length; j++) {
                                translateSubtree(m.addedNodes[j], 'en');
                            }
                        }
                    }
                } finally {
                    isApplying = false;
                    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                }
            });
        }
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function getSavedLanguage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved === 'en' ? 'en' : DEFAULT_LANG;
        } catch (e) {
            return DEFAULT_LANG;
        }
    }

    function toggleLanguage() {
        applyLanguage(currentLang === 'en' ? 'bn' : 'en');
        return currentLang;
    }

    function init() {
        currentLang = getSavedLanguage();
        updateToggleButtonUI(currentLang);

        const btn = document.getElementById('langToggleBtn');
        if (btn && !btn._btebLangWired) {
            btn._btebLangWired = true;
            btn.addEventListener('click', toggleLanguage);
        }

        if (currentLang === 'en') {
            applyLanguage('en', true);
        } else {
            startObserver();
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', function (e) {
            if (e && e.key === STORAGE_KEY) {
                const next = e.newValue === 'en' ? 'en' : DEFAULT_LANG;
                if (next !== currentLang) {
                    applyLanguage(next, true);
                }
            }
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    return {
        getLanguage: function () { return currentLang; },
        setLanguage: function (lang) { applyLanguage(lang); return currentLang; },
        toggleLanguage: toggleLanguage
    };
})();
