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
    let origDocTitle = null;

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
        'বাংলাদেশ কারিগরি শিক্ষা বোর্ড আওতাধীন পলিটেকনিক ইনস্টিটিউট': 'Polytechnic Institute under Bangladesh Technical Education Board',
        '⚠️ পুরনো ডেটাবেস সতর্কতা:': '⚠️ Legacy Database Warning:',
        '🗑️ পুরনো ডেটা মুছে নতুন আপলোড করুন': '🗑️ Clear Legacy Data & Re-upload',
        '🗑️ পুরনো ডেটা মুছে ফেলা হয়েছে। এখন নতুন BTEB PDF আপলোড করুন।': '🗑️ Legacy data cleared. Please upload the official BTEB PDF again.',
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
        'রেফার্ড (Referred)': 'Referred',

        // Document <title> & Branding / Notice Variants
        'BTEB Result & Education Portal | বাংলাদেশ কারিগরি শিক্ষা বোর্ড': 'BTEB Result & Education Portal | Bangladesh Technical Education Board',
        'বই, নোটস ও সুপার সাজেশন | BTEB Education Portal': 'Books, Notes & Super Suggestions | BTEB Education Portal',
        '📢 ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল ও একাডেমিক পোর্টাল।': '📢 Diploma in Engineering Examination Results & Academic Portal.',
        '📢 ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল ও নতুন সেমিস্টারের বই-সাজেশন আপডেট করা হয়েছে।': '📢 Diploma in Engineering exam results and new semester books & suggestions have been updated.',

        // Tooltips [title] & [placeholder]
        'অ্যাডমিন পাসওয়ার্ড ও ইউজারনেম পরিবর্তন করুন': 'Change admin password and username',
        'আজকের ভিজিটর লগ দেখুন': 'View today\'s visitor logs',
        'আজকের মোট ভিজিট সংখ্যা': 'Total visits today',
        'ইটালিক': 'Italic',
        'উদ্ধৃতি (Quote)': 'Quote',
        'এই ফাইলটি মুছে ফেলুন': 'Delete this file',
        'এই ফাইলের ডেটা ডাউনলোড করুন': 'Download data for this file',
        'নম্বর লিস্ট': 'Numbered List',
        'পাসওয়ার্ড দেখুন / লুকান': 'Show / Hide Password',
        'পিডিএফ ফাইল নির্বাচন করতে এখানে ক্লিক করুন অথবা টেনে এনে ড্রপ করুন': 'Click here or drag and drop to select PDF file(s)',
        'বুলেট লিস্ট': 'Bullet List',
        'বোল্ড': 'Bold',
        'ভিজিটর লগ দেখুন': 'View visitor logs',
        'লগআউট করুন': 'Logout',
        'লাইট মোডে পরিবর্তন করুন': 'Switch to Light Mode',
        'ডার্ক মোডে পরিবর্তন করুন': 'Switch to Dark Mode',
        'লিংক': 'Link',
        'সর্বমোট ভিজিট সংখ্যা': 'All-time total visits',
        'সূত্র / কোড': 'Code / Formula',
        'স্বতন্ত্র ভিজিটর সংখ্যা': 'Unique visitors count',
        'হেডিং (H2)': 'Heading (H2)',
        'এখানে BTEB বোর্ডের PDF থেকে কপি করা হাজার হাজার বা লক্ষাধিক লাইনের টেক্সট সরাসরি Paste করুন...': 'Paste thousands or millions of lines of text copied from the BTEB board PDF directly here...',
        'এখানে ওয়ার্ডের মতো বিস্তারিত বিবরণ, সাজেশনের গুরুত্বপূর্ণ অধ্যায়, প্রশ্নাবলি বা সিলেবাসের পয়েন্টগুলো লিখুন...': 'Write detailed descriptions, key suggestion chapters, questions, or syllabus points like Word...',
        'ঐচ্ছিক সিক্রেট কী': 'Optional secret key',
        'ছবির ডিরেক্ট URL (যেমন: https://.../note.jpg) অথবা ফাইল আপলোড করুন': 'Direct image URL (e.g. https://.../note.jpg) or upload a file',
        'নতুন পাসওয়ার্ডটি পুনরায় লিখুন': 'Re-enter new password',
        'নতুন শক্তিশালী পাসওয়ার্ড লিখুন': 'Enter new strong password',
        'পিডিএফের যেকোনো ১টি রোল নম্বর লিখে এখানে রেজাল্ট টেস্ট করুন...': 'Enter any roll number from the PDF here to test the result...',
        'বর্তমান পাসওয়ার্ড লিখুন': 'Enter current password',
        'যেমন: 2024': 'e.g. 2024',
        'যেমন: 28542(T), 28544(T), 28553(T), 28554(T)': 'e.g. 28542(T), 28544(T), 28553(T), 28554(T)',
        'যেমন: 28542(T), 28544(T)': 'e.g. 28542(T), 28544(T)',
        'যেমন: ৫ম সেমিস্টার Microprocessor & Interfacing চূড়ান্ত সাজেশন ২০২৪': 'e.g. 5th Semester Microprocessor & Interfacing Final Suggestion 2024',
        'যেমন: 601234': 'e.g. 601234',
        'যেমন: sabbir12 বা নতুন নাম': 'e.g. sabbir12 or new username',
        'যেমন: পলিটেকনিক টিচার্স ফোরাম': 'e.g. Polytechnic Teachers Forum',
        'রোল নম্বর লিখুন': 'Enter roll number',
        'সংক্ষেপে শিক্ষার্থীদের জন্য গুরুত্বপূর্ণ তথ্য...': 'Brief important information for students...',

        // Select options, Marksheet Badges & Common Runtime Labels
        '১ম পর্ব': '1st Semester',
        '২য় পর্ব': '2nd Semester',
        '৩য় পর্ব': '3rd Semester',
        '৪র্থ পর্ব': '4th Semester',
        '৫ম পর্ব': '5th Semester',
        '৬ষ্ঠ পর্ব': '6th Semester',
        '৭ম পর্ব': '7th Semester',
        '৮ম পর্ব': '8th Semester',
        'সকল সেমিস্টার': 'All Semesters',
        'সকল পর্ব': 'All Semesters',
        'সকল টেকনোলজি': 'All Technologies',
        'কম্পিউটার (CST)': 'Computer (CST)',
        'সিভিল (Civil)': 'Civil (Civil)',
        'ইলেকট্রিক্যাল (Electrical)': 'Electrical (Electrical)',
        'মেকানিক্যাল (Mechanical)': 'Mechanical (Mechanical)',
        'ইলেকট্রনিক্স (Electronics)': 'Electronics (Electronics)',
        '✓ উত্তীর্ণ (Passed)': '✓ Passed',
        '⚠ রেফার্ড (Referred)': '⚠ Referred',
        '✕ ড্রপ আউট (Dropped Out)': '✕ Dropped Out',
        '✕ ড্রপ আউট (Dropped)': '✕ Dropped',
        '✓ শিক্ষার্থী পাওয়া গেছে:': '✓ Student Found:',
        '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)': '📄 Official PDF Verified (Highest Priority)',
        '📄 অফিসিয়াল PDF ও শিট মার্জড (PDF অগ্রাধিকারপ্রাপ্ত)': '📄 Official PDF & Sheet Merged (PDF Priority)',
        '📄 অফিসিয়াল PDF ও রেজাল্ট শিট (PDF অগ্রাধিকারপ্রাপ্ত)': '📄 Official PDF & Result Sheet (PDF Priority)',
        'অনুসন্ধান চলছে...': 'Searching...',
        'প্রসেসিং চলছে...': 'Processing...',
        'জেনারেট হচ্ছে...': 'Generating...',
        'স্ক্যান হচ্ছে...': 'Scanning...',
        '⏳ অপেক্ষমাণ': '⏳ Waiting',
        '❌ ত্রুটি': '❌ Error',
        'রোল নং': 'Roll No',
        'ফলাফল': 'Result',
        'জিপিএ / বিষয়': 'GPA / Subjects',
        'ইনস্টিটিউট (EIIN)': 'Institute (EIIN)',
        'বই (Book)': 'Book',
        'নোটস (Note)': 'Notes',
        '📚 বই': '📚 Book',
        '📝 নোটস': '📝 Notes',
        '🎯 সাজেশন': '🎯 Suggestion',
        '✏️ এডিট': '✏️ Edit',
        'মুছে ফেলুন': 'Delete',
        'বিটিইবি টিম': 'BTEB Team',
        'অজানা': 'Unknown',
        'কোনো অতিরিক্ত কনটেন্ট নেই।': 'No additional content available.',
        '🔗 ডাউনলোড / ড্রাইভ লিংক:': '🔗 Download / Drive Link:',

        // Admin Panel Missing Headings, Labels, Forms & Split-Node Fragments
        '➕ নতুন রেজাল্ট যোগ / পরিবর্তন ফর্ম': '➕ Add / Edit Result Form',
        '➕ নতুন রেজাল্ট যোগ করুন': '➕ Add New Result',
        '"সেভ করুন"': '"Save to DB"',
        '✍️ নতুন বই, হ্যান্ডনোটস বা সাজেশন যুক্ত করুন': '✍️ Add New Book, Handnotes or Suggestion',
        '✅ অভিনন্দন! রেজাল্টগুলো সফলভাবে স্থায়ী ফাইলে সেভ করা হয়েছে এবং স্টুডেন্ট পেজে উন্মুক্ত হয়েছে!': '✅ Congratulations! Results have been permanently saved and published on the Student Page!',
        '⚠️ রেজাল্ট মোছার ডিলিট অপশন (Delete Options)': '⚠️ Result Deletion Options',
        '⚠️ সকল রেজাল্ট মুছে ফেলুন (Delete All)': '⚠️ Delete All Results',
        '⚡ প্রসেসিং সময়': '⚡ Processing Time',
        '⚡ স্ক্যান সময় ও পেজ': '⚡ Scan Time & Pages',
        '১ বা ততোধিক (১০-১৫টি) বিশাল রেজাল্ট পিডিএফ কোনো হ্যাং ছাড়াই স্বয়ংক্রিয়ভাবে পার্স ও O(1) ইনডেক্স হবে।': '1 or more (10–15+) large result PDFs are automatically parsed and O(1) indexed without freezing.',
        '১০০% রেডি ও স্বয়ংসম্পূর্ণ': '100% Ready & Self-Contained',
        'Admin API Key (db_config.local.php অনুযায়ী):': 'Admin API Key (per db_config.local.php):',
        'BTEB বোর্ডের এক বা একাধিক রেজাল্ট PDF ফাইল এখানে ড্রপ করুন অথবা ক্লিক করুন': 'Drop one or more BTEB Result PDF files here or click to browse',
        'GitHub Pages বা স্ট্যাটিক হোস্টিংয়ে এটি': 'Keep this',
        'আপনার হোস্টিংয়ের': 'Upload or drop these files directly into your hosting\'s',
        'ইউজারনেম ছোট বা বড় হাতের অক্ষরে লিখলেও লগইন করা যাবে।': 'Username is case-insensitive during login.',
        'উপরে ফরম পূরণ করে নতুন বই, নোটস বা সাজেশন পাবলিশ করুন।': 'Fill out the form above to publish a new book, note, or suggestion.',
        '-এ কাজ করে। তাই এটি যেকোনো ফ্রি বা পেইড ওয়েব হোস্টিংয়ে তাৎক্ষণিক চলবে:': 'storage. So it works immediately on any free or paid web host:',
        'এই প্রজেক্টটি কোনো সার্ভার-সাইড ব্যাকএন্ড (Node.js/PHP) ছাড়াই সম্পূর্ণ ক্লায়েন্ট সাইড এবং ব্রাউজারের': 'This project runs completely client-side without any backend (Node.js/PHP), using your browser\'s',
        'এখানে আপনার সেভ করা প্রতিটি PDF রেজাল্ট ফাইল আলাদাভাবে সুরক্ষিত থাকবে। আপনি যেকোনো সময় দেখতে, ডাউনলোড করতে বা মুছে ফেলতে পারেন।': 'All your saved PDF result files are stored securely here. You can view, download, or delete them anytime.',
        'এবং নতুন': 'and a new',
        'ওয়েবসাইটের উপরে চলমান নোটিশ বা হেডলাইন বার প্রদর্শন করবে।': 'Displays a scrolling notice or headline bar at the top of the website.',
        'ওয়েবসাইটের নোটিশ টেক্সট (Notice Bar Message):': 'Website Notice Text (Notice Bar Message):',
        'কোনো বই বা সাজেশন যুক্ত করা হয়নি': 'No books or suggestions added yet',
        'ক্যাটাগরি (Category): *': 'Category: *',
        'গতি: ০ রোল/সেকেন্ড | সময়: ০ms': 'Speed: 0 rolls/sec | Time: 0ms',
        'গতি: হিসাব হচ্ছে...': 'Speed: Calculating...',
        'গিটহব রিপোজিটরিতে কোড পুশ করে': 'Push the code to your GitHub repository and select',
        'চালু (ON)': 'ON',
        'চালু করলে ভিজিট তথ্য সরাসরি PHP API-তে পাঠানো হবে (ব্যাকএন্ড না থাকলে স্বয়ংক্রিয় Static ব্যাকআপ কাজ করবে)।': 'When enabled, visit data is sent directly to the PHP API (auto-falls back to static storage if unavailable).',
        'চালু করলে ভিজিট তথ্য সরাসরি PHP API-তে পাঠানো হবে (ব্যাকএন্ড না থাকলে স্বয়ংক্রিয় Cloud Sync কাজ করবে)।': 'When enabled, visit data is sent directly to the PHP API (auto-falls back to Cloud Sync if unavailable).',
        'রাখুন — তখন স্বয়ংক্রিয়ভাবে': 'on GitHub Pages or static hosting — visits automatically sync via',
        'এর মাধ্যমে ফোন, ল্যাপটপ ও সকল ডিভাইস থেকে একই ইউনিক ভিজিটর সংখ্যা রিয়েল-টাইম সিঙ্ক হবে। আপনি যদি cPanel/PHP+MySQL সার্ভারে হোস্ট করেন এবং প্রতিটি ভিজিটরের আসল IP ঠিকানা MySQL-এর': 'for real-time identical unique visitor counts across Phone, Laptop, and all devices. If hosting on cPanel/PHP+MySQL and you want raw visitor IPs saved in the MySQL',
        'চালু রাখলে বোর্ড ফাইনাল পরীক্ষার চূড়ান্ত সুপার সাজেশনগুলো দৃশ্যমান হবে।': 'Keep ON to display final super suggestions for board exams.',
        'চালু রাখলে শিক্ষার্থীরা অধ্যায়ভিত্তিক হ্যান্ডনোটস ও লেকচার শিট পড়তে পারবে।': 'Keep ON to allow students to read chapter-wise handnotes and lecture sheets.',
        'চালু রাখলে শিক্ষার্থীরা রেজাল্ট খুঁজতে পারবে। বন্ধ রাখলে শিক্ষার্থী পেজে মেইনটেন্যান্স ব্যানার দেখাবে।': 'Keep ON to let students search results. Turn OFF to show a maintenance banner on the student page.',
        'চালু রাখলে শিক্ষার্থীরা সকল ডিপ্লোমা পাঠ্যবই দেখতে ও ডাউনলোড করতে পারবে।': 'Keep ON to allow students to view and download all Diploma textbooks.',
        'ছবি বা কভার ফটো (Image / Diagram / Note Screenshot):': 'Cover Image / Diagram / Note Screenshot:',
        'ছবির প্রিভিউ সক্রিয়': 'Image Preview Active',
        'জন শিক্ষার্থীর রেজাল্ট প্রস্তুত।': 'student results ready.',
        'টেকনোলজি (Technology): *': 'Technology: *',
        'টেবিলে সেভ করতে চান, তবে': 'table, configure',
        'ডাউনলোড বা ড্রাইভ লিংক (PDF / Drive URL):': 'Download or Drive Link (PDF / Drive URL):',
        'ডেটা প্রসেসিং চলছে (Non-Freezing Async Chunk)...': 'Processing data (Non-Freezing Async Chunk)...',
        'নতুন রেজাল্ট মোড': 'New Result Mode',
        'এডিট মোড (সম্পাদনা)': 'Edit Mode',
        'নিচের': 'Click the',
        'নিচের বাটনে ক্লিক করলে সকল সেভ করা রেজাল্ট শীট মুছে যাবে।': 'Clicking the button below will permanently erase all saved result sheets.',
        'নিচের সুইচগুলো অন (ON) রাখলে শিক্ষার্থীরা সরাসরি বই, নোটস ও সাজেশন পেজে যেতে পারবে। বন্ধ (OFF) রাখলে "Coming Soon" মোডাল দেখাবে:': 'Keep switches ON so students can access Books, Notes & Suggestions directly. Turn OFF to show a "Coming Soon" modal:',
        'নিরাপত্তার জন্য বর্তমান পাসওয়ার্ড লিখুন': 'Enter current password for security verification',
        'নিরাপত্তার স্বার্থে বর্তমান পাসওয়ার্ড যাচাই করে নতুন': 'For security, verify your current password to set a new',
        'নির্দিষ্ট রোল নম্বর সরাসরি ডিলিট:': 'Delete Specific Roll Number Directly:',
        'পয়েন্ট (যেমন: 3.53) অথবা ref লিখুন': 'GPA (e.g. 3.53) or ref',
        'পরীক্ষার বছর (Exam Year):': 'Exam Year:',
        'পিডিএফ স্ক্যান কিউ চলছে...': 'PDF scan queue running...',
        'পৃষ্ঠা: ০ / ০': 'Pages: 0 / 0',
        'প্রবিধান (Regulation): *': 'Regulation: *',
        'প্রসেস হচ্ছে: ০ / ০ রোল': 'Processing: 0 / 0 rolls',
        'ফলাফল স্ট্যাটাস (Status): *': 'Result Status: *',
        'ফোল্ডারে এই ফাইলগুলো সরাসরি আপলোড বা ড্রপ করুন।': 'folder.',
        'বন্ধ (OFF)': 'Disabled (OFF)',
        'বাটনে ক্লিক করলেই তথ্যগুলো ব্রাউজারে স্থায়ী ফাইলে সেভ হয়ে যাবে এবং স্টুডেন্ট পেজ থেকে যেকোনো শিক্ষার্থী দেখতে পারবে।': 'button below to permanently save the results in browser storage so students can access them.',
        'বিটিইবি ফরম্যাট: বিষয় কোডের পর (T) তত্ত্বীয় বা (P) ব্যবহারিক উল্লেখ করতে পারেন।': 'BTEB Format: You may append (T) for Theory or (P) for Practical after subject codes.',
        'বিস্তারিত কনটেন্ট / নোটস বা অধ্যায় সূচি (Rich Text Editor):': 'Detailed Content / Notes or Chapter Index (Rich Text Editor):',
        'বোর্ডের মূল রেজাল্ট PDF ফাইলটি সরাসরি নিচে ড্রপ করুন। কোনো সার্ভার ছাড়াই আপনার ব্রাউজার': 'Drop the official board result PDF file below. Without any server, your browser uses the',
        'ভিজিটর লগ লোড হচ্ছে...': 'Loading visitor logs...',
        'কোনো ভিজিটর লগ পাওয়া যায়নি। স্টুডেন্ট পেজ (': 'No visitor logs found. Visiting the Student Page (',
        ') ভিজিট করলে এখানে স্বয়ংক্রিয়ভাবে লগ সংরক্ষিত হবে।': ') will automatically save logs here.',
        'মোট প্রসেসড রোল': 'Total Processed Rolls',
        'মোট শিক্ষার্থী:': 'Total Students:',
        'উত্তীর্ণ:': 'Passed:',
        'রেফার্ড:': 'Referred:',
        'ড্রপ:': 'Dropped:',
        'যাচাই করুন': 'Verify',
        'যেকোনো নির্দিষ্ট শিক্ষার্থীর রোল নম্বর লিখে সার্চ করুন। শিক্ষার্থীর পূর্ববর্তী সকল সেমিস্টারের জিপিএ ও রেফার্ড বিষয় সরাসরি নিচের এডিটর বক্সে লোড হবে:': 'Search any student roll number. All previous semester GPAs and referred subjects will load directly into the editor below:',
        'রাখুন — তখন কোনো সার্ভার ছাড়াই সাইট স্বয়ংক্রিয়ভাবে চলবে। আপনি যদি cPanel/PHP+MySQL সার্ভারে হোস্ট করেন এবং প্রতিটি ভিজিটরের আসল IP ঠিকানা MySQL-এর': 'on GitHub Pages or static hosting — the site works automatically without a server. If hosting on cPanel/PHP+MySQL and you want real visitor IPs saved in the MySQL',
        'রিসেট': 'Reset',
        'রেজাল্ট সার্ভার:': 'Result Server:',
        'রেফার্ড বা ড্রপ বিষয়সমূহ (Referred Subject Codes):': 'Referred or Dropped Subjects (Subject Codes):',
        'রোল নম্বর (Roll Number): *': 'Roll Number: *',
        'লাইব্রেরি ব্যবহার করে হাজার হাজার পৃষ্ঠা থেকে টেক্সট ও রোল নম্বর নিজে নিজেই স্ক্যান করে রেজাল্ট সংরক্ষণ করবে:': 'library to automatically scan text and roll numbers from thousands of pages and save results:',
        'লেখক / শিক্ষক / সূত্র (Author/Source):': 'Author / Teacher / Source:',
        'শিরোনাম (Title): *': 'Title: *',
        'সংক্ষিপ্ত বিবরণী (Short Description):': 'Short Description:',
        'সকল রেজাল্ট শিট এবং বই-সাজেশনের পূর্ণাঙ্গ ব্যাকআপ ডাউনলোড করুন অথবা ইমপোর্ট করুন:': 'Download or import a complete backup of all result sheets and study materials:',
        'সকল সেভ করা রেজাল্ট একসাথে ডিলিট:': 'Delete All Saved Results at Once:',
        'সতর্কতা:': 'Warning:',
        'সম্পূর্ণ ফোল্ডারটি ড্র্যাগ অ্যান্ড ড্রপ করলেই ১ ক্লিকে গ্লোবাল সিডিএন-এ হোস্ট হয়ে যাবে।': 'Drag and drop the entire folder to deploy on a global CDN in 1 click.',
        'সিলেক্ট করলেই ফ্রিতে সাইট লাইভ হবে।': 'to publish the site live for free.',
        'সেট করুন। পরবর্তীতে অ্যাডমিন প্যানেলে লগইন করার সময় এই নতুন তথ্য ব্যবহার করতে হবে:': '. Use these new credentials for future Admin Panel logins:',
        'সেট করে নিচের সুইচটি চালু করুন:': 'and enable the switch below:',
        'সেমিস্টার (Semester): *': 'Semester: *',
        'সেমিস্টার ভিত্তিক জিপিএ পয়েন্ট (GPA-1 থেকে GPA-8):': 'Semester-wise GPA Points (GPA-1 to GPA-8):',
        '🌐 যেভাবে হোস্ট করবেন:': '🌐 How to Host:',
        '🎉 পিডিএফ স্ক্যান সম্পন্ন! মোট': '🎉 PDF scan complete! Total',
        '🎓 রেজাল্ট সার্চ ইঞ্জিন ও সার্ভার (Result Engine Master Switch)': '🎓 Result Search Engine & Server (Master Switch)',
        '🎯 সুপার সাজেশন (Suggestion)': '🎯 Super Suggestion',
        '🎯 সুপার সাজেশন মেনু (Suggestions Menu)': '🎯 Suggestions Menu',
        '🏠 হোমপেজ খুলুন': '🏠 Open Homepage',
        '👥 মোট:': '👥 Total:',
        '💡 ৩-৪ লক্ষ রোলের মেমোরি সাইজ ৮৫% কমে যাবে': '💡 Reduces memory size for 300k–400k rolls by 85%',
        '💾 results_database.js ফাইল ডাউনলোড': '💾 Download results_database.js',
        '💾 এই রেজাল্টগুলো ডেটাবেসে নিশ্চিত সেভ করুন (Save to DB)': '💾 Confirm & Save Results to Database (Save to DB)',
        '💾 রেজাল্ট আপডেট করুন (Update Result)': '💾 Update Result',
        '💾 আপডেট করুন (Update)': '💾 Update',
        '📁 PDF ফাইল নির্বাচন করুন (Select PDF Files)': '📁 Choose PDF Files',
        '📁 ছবি নির্বাচন': '📁 Choose Image',
        '📁 ফোল্ডার কাঠামো:': '📁 Folder Structure:',
        '📄 BTEB রেজাল্ট শিট এডিটর': '📄 BTEB Result Sheet Editor',
        '📋 ডেমো বই-সাজেশন লোড করুন': '📋 Load Demo Materials',
        '📋 পিডিএফ থেকে প্রাপ্ত শিক্ষার্থীদের তালিকা (নমুনা প্রথম ১০টি):': '📋 Parsed Student List from PDF (First 10 Sample):',
        '📋 ব্যাচ কিউ স্ট্যাটাস (Batch File Queue):': '📋 Batch File Queue Status:',
        '📚 পাঠ্যবই ও সিলেবাস (Book)': '📚 Textbook & Syllabus (Book)',
        '📚 প্রকাশিত বই ও সাজেশনের তালিকা': '📚 Published Books & Suggestions List',
        '📚 বই ও সিলেবাস মেনু (Books Menu)': '📚 Books & Syllabus Menu',
        '📝 হ্যান্ডনোটস ও শিট (Note)': '📝 Handnotes & Sheet (Note)',
        '📝 হ্যান্ডনোটস মেনু (Handnotes Menu)': '📝 Handnotes Menu',
        '📢 নোটিশ অ্যানাউন্সমেন্ট বার (Notice Announcement Bar)': '📢 Notice Announcement Bar',
        '📤 ৩-৪ লক্ষ রেজাল্ট বাল্ক আপলোডার ও ফাস্ট প্রসেসর': '📤 High-Speed Bulk Result Uploader (300k–400k Rolls)',
        '📥 ডাউনলোড': '📥 Download',
        '📥 রেজাল্ট ডেটাবেস ফাইল ডাউনলোড (.JSON)': '📥 Download Result Database (.JSON)',
        '📥 সম্পূর্ণ ডেটাবেস ডাউনলোড (.JSON)': '📥 Download Full Database (.JSON)',
        '📦 সম্পূর্ণ ডেটাবেজ ব্যাকআপ (JSON)': '📦 Full Database Backup (JSON)',
        '🔄 ফর্ম রিসেট': '🔄 Reset Form',
        '🔍 সেভ হওয়া রেজাল্ট ইনস্ট্যান্ট ভেরিফিকেশন (Instant Test)': '🔍 Instant Verification Test (Saved Results)',
        '🗑️ এই রেজাল্ট মুছে ফেলুন (Delete)': '🗑️ Delete This Result',
        '🗑️ ডিলিট': '🗑️ Delete',
        '🗑️ রিমুভ': '🗑️ Remove',
        '🗑️ সম্পূর্ণ ডেটাবেস মুছে ফেলুন (Delete All)': '🗑️ Delete Entire Database (Delete All)',
        '🚀 Export Optimized JSON (হোস্টিংয়ে আপলোডের জন্য)': '🚀 Export Optimized JSON (For Hosting Upload)',
        '🚀 পোস্ট পাবলিশ করুন (Publish)': '🚀 Publish Post',
        '🚀 যেকোনো হোস্টিংয়ে ব্যবহারের নিয়মাবলী (Deployment Guide)': '🚀 Deployment Guide (Works on Any Hosting)',
        '🚀 স্টুডেন্ট পেজে রেজাল্ট দেখুন ➔': '🚀 View Result on Student Page ➔',
        '🟢 স্টুডেন্ট পেজে লাইভ সক্রিয়': '🟢 Live on Student Page',
        '🧹 পরিষ্কার করুন': '🧹 Clear',
        'কোনো রেজাল্ট শীট সেভ করা হয়নি': 'No result sheets saved yet',
        'উপরে BTEB পিডিএফ থেকে রেজাল্ট পেস্ট করুন এবং "Save & Publish" করুন।': 'Paste results from a BTEB PDF above and click "Save & Publish".',
        'উপরে BTEB পিডিএফ থেকে রেজাল্ট পেস্ট করুন এবং': 'Paste results from a BTEB PDF above and click',

        // Admin Instant Test / Auth / Toast / Status Messages
        'অনুগ্রহ করে টেস্ট করার জন্য একটি রোল নম্বর লিখুন।': 'Please enter a roll number to test.',
        '✓ রেজাল্ট পাওয়া গেছে!': '✓ Result Found!',
        'রোল:': 'Roll:',
        '| স্ট্যাটাস:': '| Status:',
        '| ইনস্টিটিউট:': '| Institute:',
        '👉 স্টুডেন্ট পেজে সম্পূর্ণ মার্কশিট কার্ড দেখুন ➔': '👉 View full marksheet on Student Page ➔',
        'অনুগ্রহ করে অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড দুটিই লিখুন!': 'Please enter both admin username and password!',
        '❌ ভুল ইউজারনেম বা পাসওয়ার্ড! সঠিক পাসওয়ার্ড ছাড়া অ্যাডমিন প্যানেলে প্রবেশ সম্পূর্ণ নিষিদ্ধ।': '❌ Invalid username or password! Access denied without valid credentials.',
        '❌ পরপর ৫ বার ভুল পাসওয়ার্ড! নিরাপত্তার স্বার্থে ৩০ সেকেন্ড অপেক্ষা করুন।': '❌ 5 consecutive wrong attempts! Please wait 30 seconds for security.',
        '✅ স্বাগতম! সফলভাবে অ্যাডমিন প্যানেলে প্রবেশ করেছেন।': '✅ Welcome! Successfully logged into Admin Panel.',
        '🚪 সফলভাবে লগআউট সম্পন্ন হয়েছে। অ্যাডমিন প্যানেল লক করা হয়েছে।': '🚪 Logged out successfully. Admin Panel is now locked.',
        '⏱️ দীর্ঘক্ষণ নিষ্ক্রিয় থাকার কারণে নিরাপত্তার স্বার্থে অ্যাডমিন প্যানেল স্বয়ংক্রিয় লক করা হয়েছে।': '⏱️ Admin Panel automatically locked due to prolonged inactivity.',
        '⚠️ বর্তমান পাসওয়ার্ড লিখুন!': '⚠️ Please enter current password!',
        '❌ বর্তমান পাসওয়ার্ডটি সঠিক নয়!': '❌ Current password is incorrect!',
        '⚠️ নতুন ইউজারনেম খালি রাখা যাবে না!': '⚠️ New username cannot be empty!',
        '⚠️ নতুন পাসওয়ার্ড খালি রাখা যাবে না!': '⚠️ New password cannot be empty!',
        '⚠️ নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মেলেনি!': '⚠️ New password and confirm password do not match!',
        '✅ ইউজারনেম ও পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে! পরবর্তী লগইনে এই তথ্য কার্যকর হবে।': '✅ Username & password updated! Will apply on next login.',
        '❌ ক্রেডেনশিয়াল সংরক্ষণ করতে ব্যর্থ হয়েছে!': '❌ Failed to save credentials!',
        '🧹 এডিটর পরিষ্কার করা হয়েছে।': '🧹 Editor cleared.',
        '⚠️ অনুগ্রহ করে রেজাল্ট শীটের টেক্সট পেস্ট করুন!': '⚠️ Please paste result sheet text!',
        'প্রসেসিং শুরু হচ্ছে...': 'Starting processing...',
        'হিসাব চলছে...': 'Calculating...',
        '❌ কোনো রোল নম্বর খুঁজে পাওয়া যায়নি! সঠিক BTEB ফরম্যাটে পেস্ট করুন।': '❌ No roll numbers found! Paste in valid BTEB format.',
        '🚀 অপ্টিমাইজড JSON ডাউনলোড সম্পন্ন! এটি যেকোনো ওয়েব হোস্টিংয়ে ব্যবহার উপযোগী।': '🚀 Optimized JSON downloaded! Ready for any web host.',
        '⚠️ কোনো রোল নম্বর পাওয়া যায়নি!': '⚠️ No roll numbers found!',
        '⚠️ কোনো রেজাল্ট ডেটা সংরক্ষিত নেই!': '⚠️ No result data stored!',
        '🚀 সম্পূর্ণ সিস্টেমের অপ্টিমাইজড JSON ডাউনলোড হয়েছে!': '🚀 Full system Optimized JSON downloaded!',
        '🟢 রেজাল্ট সার্ভার চালু (ON) করা হয়েছে। শিক্ষার্থীরা এখন রেজাল্ট দেখতে পারবে।': '🟢 Result server turned ON. Students can now search results.',
        '🔴 রেজাল্ট সার্ভার বন্ধ (OFF) করা হয়েছে। শিক্ষার্থীরা মেইনটেন্যান্স ম্যাসেজ দেখবে।': '🔴 Result server turned OFF. Students will see maintenance notice.',
        '✅ মেইনটেন্যান্স ম্যাসেজ আপডেট করা হয়েছে।': '✅ Maintenance message updated.',
        '📦 সম্পূর্ণ ব্যাকআপ (JSON) ডাউনলোড শুরু হয়েছে...': '📦 Full backup (JSON) download started...',
        '📄 টেক্সট ব্যাকআপ ডাউনলোড শুরু হয়েছে...': '📄 Text backup download started...',
        '💾 results_database.js ফাইল ডাউনলোড সম্পন্ন হয়েছে!': '💾 results_database.js file downloaded!',
        '📥 রেজাল্ট ডেটাবেস ফাইল (.json) ডাউনলোড হয়েছে!': '📥 Result database file (.json) downloaded!',
        'ℹ️ মুছে ফেলার মতো কোনো রেজাল্ট ডেটাবেসে নেই।': 'ℹ️ No results found in database to delete.',
        '🗑️ ডেটাবেসের সমস্ত রেজাল্ট ও ফাইল সম্পূর্ণ মুছে ফেলা হয়েছে।': '🗑️ All database results and files have been deleted.',
        'ℹ️ মুছে ফেলার মতো কোনো সেভ করা শীট নেই।': 'ℹ️ No saved sheets to delete.',
        '🗑️ সকল রেজাল্ট শীট ও ডেটাবেস সম্পূর্ণ খালি করা হয়েছে।': '🗑️ All result sheets and database cleared.',
        '📥 ফাইল ডাউনলোড সম্পন্ন হয়েছে!': '📥 File download completed!',
        '🗑️ শীটটি মুছে ফেলা হয়েছে।': '🗑️ Sheet deleted.',
        '📷 ছবি সফলভাবে যুক্ত হয়েছে!': '📷 Image added successfully!',
        '⚠️ অনুগ্রহ করে একটি শিরোনাম লিখুন!': '⚠️ Please enter a title!',
        '✅ পোস্ট সফলভাবে আপডেট করা হয়েছে!': '✅ Post updated successfully!',
        '🗑️ মেটেরিয়ালটি মুছে ফেলা হয়েছে।': '🗑️ Material deleted.',
        '📋 ৪টি নমুনা বই, নোটস ও সাজেশন লোড করা হয়েছে!': '📋 4 sample books, notes & suggestions loaded!',
        '✅ সাইট সেটিংস ও মাস্টার সুইচবোর্ড কনফিগারেশন সংরক্ষিত হয়েছে!': '✅ Site settings & master switches saved!',
        '⚠️ অনুগ্রহ করে রোল নম্বর লিখুন!': '⚠️ Please enter a roll number!',
        '⚠️ রোল নম্বর দেওয়া আবশ্যক!': '⚠️ Roll number is required!',
        '⚠️ কোনো রোল নম্বর পাওয়া যায়নি!': '⚠️ No roll number found!',
        '⚠️ অনুগ্রহ করে যে রোলটি মুছতে চান তা লিখুন!': '⚠️ Please enter the roll number to delete!',
        '🗑️ সকল রেজাল্ট সফলভাবে মুছে ফেলা হয়েছে!': '🗑️ All results deleted successfully!',
        '⚠️ অনুগ্রহ করে এক বা একাধিক সঠিক PDF (.pdf) ফাইল নির্বাচন করুন!': '⚠️ Please select one or more valid PDF (.pdf) files!',
        '✅ ডেটাবেসে স্থায়ীভাবে সংরক্ষিত হয়েছে!': '✅ Permanently saved to database!',
        '🔄 ভিজিটর লগ তালিকা রিফ্রেশ করা হয়েছে!': '🔄 Visitor logs refreshed!',
        '📥 visitor_logs (.SQL) ফাইল ডাউনলোড শুরু হয়েছে!': '📥 visitor_logs (.SQL) download started!',
        '📊 visitor_logs (.CSV) ফাইল ডাউনলোড শুরু হয়েছে!': '📊 visitor_logs (.CSV) download started!',
        '🗑️ সকল ভিজিটর লগ সফলভাবে মুছে ফেলা হয়েছে!': '🗑️ All visitor logs cleared successfully!',
        '💾 PHP/MySQL ব্যাকএন্ড সেটিংস সংরক্ষিত ও যাচাই করা হয়েছে!': '💾 PHP/MySQL backend settings saved & verified!',
        '💾 Static (LocalStorage) মোড সক্রিয় করা হয়েছে!': '💾 Static (LocalStorage) mode enabled!',
        '💾 Global Cloud Sync (GitHub Pages Ready) মোড সক্রিয় করা হয়েছে!': '💾 Global Cloud Sync (GitHub Pages Ready) mode enabled!',
        '📴 অফলাইন IndexedDB ব্যাকআপ': '📴 Offline IndexedDB Backup',
        'ব্যাকএন্ড সার্ভারের সাথে সংযোগ করা যায়নি (Static মোড দেখানো হচ্ছে)।': 'Unable to connect to backend server (showing Static mode).',
        'ক্লাউড সার্ভারে সংযোগ করা যায়নি — অফলাইন IndexedDB ব্যাকআপ দেখানো হচ্ছে।': 'Unable to reach cloud server — showing offline IndexedDB backup.',
        '☁️ Supabase ক্লাউড ডেটাবেস ও মাল্টি-ডিভাইস সিঙ্ক (Permanent Global DB)': '☁️ Supabase Cloud Database & Multi-Device Sync (Permanent Global DB)',
        '⚪ কনফিগার করা হয়নি (লোকাল মোড)': '⚪ Not Configured (Local Mode)',
        '🟡 কনফিগারড (যাচাই অপেক্ষমাণ)': '🟡 Configured (Pending Verification)',
        '🔴 কানেকশন ত্রুটি': '🔴 Connection Error',
        'টেবিল: bteb_results': 'Table: bteb_results',
        'এখানে আপনার Supabase Project URL ও Anon Key সেট করলে আপলোড করা প্রতিটি BTEB রেজাল্ট PDF-এর রোল, সেমিস্টারভিত্তিক জিপিএ (gpa1 থেকে gpa5) এবং রেফার্ড বিষয় স্বয়ংক্রিয়ভাবে ব্যাচ আকারে bteb_results টেবিলে সেভ হবে ও যেকোনো ফোন বা ল্যাপটপের স্টুডেন্ট পেজ থেকে দেখা যাবে। সব ডিভাইসে অটো-কানেক্টের জন্য ডাউনলোড করা supabase_config.js ফাইলটি js/ ফোল্ডারে রেখে GitHub-এ পুশ করুন।': 'Set your Supabase Project URL and Anon Key here to automatically batch-save all parsed BTEB PDF results (roll, semester GPAs gpa1-gpa5, and referred subjects) into bteb_results for instant cross-device lookup. To enable auto-connect on all devices, replace js/supabase_config.js with the downloaded config file and push to GitHub.',
        'এই প্রজেক্টটি Supabase ক্লাউড ডেটাবেস এবং ব্রাউজারের IndexedDB / LocalStorage সাপোর্ট করে। তাই যেকোনো ফ্রি বা পেইড ওয়েব হোস্টিংয়ে এটি তাৎক্ষণিক চলবে:': 'This project supports Supabase Cloud Database along with browser IndexedDB / LocalStorage, so it runs immediately on any free or paid web hosting:',
        '🔌 সেভ ও কানেকশন যাচাই': '🔌 Save & Test Connection',
        '☁️ লোকাল সব রেজাল্ট Supabase-এ সিঙ্ক করুন': '☁️ Sync All Local Results to Supabase',
        '📥 supabase_config.js ডাউনলোড': '📥 Download supabase_config.js',
        '🗄️ SQL স্কিমা দেখুন / কপি': '🗄️ View / Copy SQL Schema',
        '☁️ Supabase ক্লাউডে ব্যাচ সিঙ্ক চলছে...': '☁️ Batch syncing to Supabase Cloud...',
        '✅ Supabase ক্লাউড সিঙ্ক সম্পন্ন!': '✅ Supabase Cloud Sync Complete!',
        '❌ Supabase সিঙ্ক ব্যর্থ হয়েছে': '❌ Supabase Sync Failed',
        'ব্যাচ সাইজ: ৫০০': 'Batch size: 500',
        '📋 Supabase SQL Editor-এ নিচের কোডটি একবার Run করুন (database/supabase_schema.sql):': '📋 Run the SQL below once inside Supabase SQL Editor (database/supabase_schema.sql):',
        '📋 SQL কপি করুন': '📋 Copy SQL',
        '⚠️ প্রথমে Supabase Project URL ও Anon Key সেভ করুন!': '⚠️ Please save Supabase Project URL and Anon Key first!',
        '⚠️ Supabase Project URL এবং Anon Key উভয়ই দিন!': '⚠️ Please enter both Supabase Project URL and Anon Key!',
        'ℹ️ Supabase-এ পাঠানোর মতো কোনো লোকাল রেজাল্ট পাওয়া যায়নি।': 'ℹ️ No local results found to sync to Supabase.',
        '📥 supabase_config.js ডাউনলোড সম্পন্ন! এটি js/ ফোল্ডারে রিপ্লেস করে GitHub-এ পুশ করুন।': '📥 Downloaded supabase_config.js! Replace js/supabase_config.js and push to GitHub.',
        '📋 Supabase SQL স্কিমা ক্লিপবোর্ডে কপি হয়েছে!': '📋 Supabase SQL schema copied to clipboard!',
        'ℹ️ SQL বক্স থেকে টেক্সট সিলেক্ট করে কপি করুন।': 'ℹ️ Please select and copy the text from the SQL box.',
        '☁️ Supabase ক্লাউড ডেটাবেস (Live)': '☁️ Supabase Cloud Database (Live)',
        '☁️ Supabase ক্লাউড ডেটাবেসে ব্যাচ সিঙ্ক চলছে...': '☁️ Batch syncing to Supabase Cloud Database...',
        '✅ সকল PDF পার্স, IndexedDB ও Supabase সিঙ্ক সম্পন্ন!': '✅ All PDFs Parsed, Indexed & Synced to Supabase!',
        '✅ IndexedDB ও Supabase ডেটাবেসে সংরক্ষিত!': '✅ Saved to IndexedDB & Supabase Database!',
        'URL ও Anon Key সেট করা হয়নি': 'URL and Anon Key are not configured',
        'টেবিল অনুপস্থিত': 'Table not found'
    };

    const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

    const BN_MONTHS = {
        'জানুয়ারি': 'January', 'জানুয়ারি': 'January',
        'ফেব্রুয়ারি': 'February', 'ফেব্রুয়ারি': 'February',
        'মার্চ': 'March',
        'এপ্রিল': 'April',
        'মে': 'May',
        'জুন': 'June',
        'জুলাই': 'July',
        'আগস্ট': 'August',
        'সেপ্টেম্বর': 'September',
        'অক্টোবর': 'October',
        'নভেম্বর': 'November',
        'ডিসেম্বর': 'December'
    };

    const STATUS_MAP = {
        'উত্তীর্ণ': 'Passed',
        'রেফার্ড': 'Referred',
        'ড্রপ আউট': 'Dropped Out',
        'সেমিস্টার ড্রপ': 'Semester Drop',
        'অনুপস্থিত': 'Absent'
    };

    function toAsciiDigits(str) {
        return String(str).replace(/[০-৯]/g, function (d) { return BN_DIGITS[d] || d; });
    }

    function toOrdinalSem(sem) {
        const clean = toAsciiDigits(String(sem).replace(/[^০-৯\d]/g, ''));
        const map = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th', '6': '6th', '7': '7th', '8': '8th' };
        return map[clean] || clean;
    }

    function translateDateTimeText(str) {
        let out = toAsciiDigits(String(str));
        Object.keys(BN_MONTHS).forEach(function (bnM) {
            if (out.indexOf(bnM) !== -1) {
                out = out.split(bnM).join(BN_MONTHS[bnM]);
            }
        });
        out = out.replace(/পূর্বাহ্ণ/g, 'AM').replace(/অপরাহ্ণ/g, 'PM');
        return out;
    }

    function translateSubTerm(term) {
        if (!term) return term;
        const trimmed = String(term).trim();
        if (Object.prototype.hasOwnProperty.call(EXACT_DICT, trimmed)) return EXACT_DICT[trimmed];
        if (Object.prototype.hasOwnProperty.call(STATUS_MAP, trimmed)) return STATUS_MAP[trimmed];
        return toAsciiDigits(trimmed);
    }

    const DYNAMIC_PATTERNS = [
        [/^মোট\s+([০-৯\d,]+)টি\s+রিসোর্স\s+পাওয়া\s+গেছে$/, function (_, n) { return 'Total ' + toAsciiDigits(n) + ' resource(s) found'; }],
        [/^রেফার্ড\s*\(Referred\)\s*-\s*([০-৯\d,]+)টি\s+বিষয়$/, function (_, n) { return 'Referred - ' + toAsciiDigits(n) + ' Subject(s)'; }],
        [/^⚠️\s*রেফার্ড\s*\/\s*অকৃতকার্য\s+বিষয়সমূহ\s*\(Referred Subjects\s*-\s*([০-৯\d,]+)টি\s+বিষয়\)$/, function (_, n) { return '⚠️ Referred / Failed Subjects (' + toAsciiDigits(n) + ' Subject(s))'; }],
        [/^কারিগরি\s+বিষয়\s*\(([^)]+)\)$/, function (_, code) { return 'Technical Subject (' + toAsciiDigits(code) + ')'; }],
        [/^শিক্ষার্থী\s*\(রোল:\s*([^)]+)\)$/, function (_, roll) { return 'Student (Roll: ' + roll + ')'; }],
        [/^⚡\s*মাত্র\s+([০-৯\d.,]+)ms\s+এ\s+প্রস্তুত\s*\(O\(1\)\s*Engine\)$/, function (_, ms) { return '⚡ Ready in ' + toAsciiDigits(ms) + 'ms (O(1) Engine)'; }],
        [/^প্রবিধান:\s*([০-৯\d]+)$/, function (_, reg) { return 'Regulation: ' + toAsciiDigits(reg); }],
        [/^প্রবিধান\s+([০-৯\d]+)$/, function (_, reg) { return 'Regulation ' + toAsciiDigits(reg); }],
        [/^([০-৯\d,]+)টি\s+রেকর্ড$/, function (_, n) { return toAsciiDigits(n) + ' record(s)'; }],
        [/^([০-৯\d,]+)\s*দিন$/, function (_, n) { return toAsciiDigits(n) + ' day(s)'; }],
        [/^([০-৯\d,]+)টি\s+আইটেম$/, function (_, n) { return toAsciiDigits(n) + ' item(s)'; }],
        [/^ডিটেক্টেড\s+রোল:\s*([০-৯\d,]+)$/, function (_, n) { return 'Detected Rolls: ' + toAsciiDigits(n); }],
        [/^শীঘ্রই\s+আসছে:\s*(.+)$/, function (_, mod) { return 'Coming Soon: ' + translateSubTerm(mod); }],
        [/^আমাদের\s+"BTEB Result & Education Portal"\s+এর\s+পরবর্তী\s+ধাপে\s+(.+?)\s+ফিচারটি\s+উন্মুক্ত\s+করা\s+হবে।$/, function (_, mod) { return 'The ' + translateSubTerm(mod) + ' feature will be unlocked in the next update of "BTEB Result & Education Portal".'; }],
        [/^✅\s*উত্তীর্ণ:\s*([০-৯\d,]+)$/, function (_, n) { return '✅ Passed: ' + toAsciiDigits(n); }],
        [/^⚠️\s*রেফার্ড:\s*([০-৯\d,]+)$/, function (_, n) { return '⚠️ Referred: ' + toAsciiDigits(n); }],
        [/^❌\s*ড্রপ:\s*([০-৯\d,]+)$/, function (_, n) { return '❌ Dropped: ' + toAsciiDigits(n); }],
        [/^📊\s*পাসের\s+হার:\s*([০-৯\d.,]+)%$/, function (_, n) { return '📊 Pass Rate: ' + toAsciiDigits(n) + '%'; }],
        [/^📅\s*আপলোড\s+ও\s+সেভ:\s*(.+?)\s*\|\s*🕐\s*(.+?)\s*\|$/, function (_, d, t) { return '📅 Uploaded & Saved: ' + translateDateTimeText(d) + ' | 🕐 ' + translateDateTimeText(t) + ' |'; }],
        [/^শীট:\s*(.+)$/, function (_, rest) {
            const r = rest.trim();
            if (r === 'সকল') return 'Sheet: All';
            if (r === 'সক্রিয়') return 'Sheet: Active';
            const semMatch = r.match(/^([১-৮\d]+)(?:ম|য়|য়|র্থ|ষ্ঠ)?\s*সেমিস্টার$/);
            if (semMatch) return 'Sheet: ' + toOrdinalSem(semMatch[1]) + ' Semester';
            return 'Sheet: ' + toAsciiDigits(r);
        }],
        [/^রোল:\s*([০-৯\d]+)\s*\|\s*ফলাফল:\s*(.+?)(?:\s*\(([০-৯\d]+)(?:ম|য়|য়|র্থ|ষ্ঠ)?\s*পর্ব\))?$/, function (_, roll, st, sem) {
            const stEn = translateSubTerm(st);
            return 'Roll: ' + toAsciiDigits(roll) + ' | Result: ' + stEn + (sem ? ' (' + toOrdinalSem(sem) + ' Sem)' : '');
        }],
        [/^পৃষ্ঠা:\s*([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)(.*)$/, function (_, cur, tot, extra) {
            let ex = toAsciiDigits(extra || '').replace(/সর্বমোট\s*রোল:/g, 'Total Rolls:');
            return 'Pages: ' + toAsciiDigits(cur) + ' / ' + toAsciiDigits(tot) + ex;
        }],
        [/^প্রসেস\s+হচ্ছে:\s*([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)\s*রোল(.*)$/, function (_, cur, tot, extra) {
            return 'Processing: ' + toAsciiDigits(cur) + ' / ' + toAsciiDigits(tot) + ' rolls' + toAsciiDigits(extra || '');
        }],
        [/^গতি:\s*(.+)$/, function (_, rest) {
            let out = toAsciiDigits(rest)
                .replace(/হিসাব\s+হচ্ছে\.\.\./g, 'Calculating...')
                .replace(/রোল\/সেকেন্ড/g, 'rolls/sec')
                .replace(/পৃষ্ঠা\/সেকেন্ড/g, 'pages/sec')
                .replace(/সময়:/g, 'Time:')
                .replace(/ব্রাউজার\s+মেমোরি:\s*সুরক্ষিত/g, 'Browser Memory: Safe');
            return 'Speed: ' + out;
        }],
        [/^মোট\s+সময়:\s*(.+)$/, function (_, t) { return 'Total Time: ' + toAsciiDigits(t); }],
        [/^✅\s*সম্পন্ন\s*\(([^)]+)\)$/, function (_, inner) {
            return '✅ Completed (' + toAsciiDigits(inner).replace(/রোল/g, 'rolls') + ')';
        }],
        [/^✅\s*সকল\s+PDF\s+পার্স\s+ও\s+সেভ\s+সম্পন্ন!(.*)$/, function (_, rest) { return '✅ All PDFs Parsed & Saved!' + toAsciiDigits(rest); }],
        [/^🎉\s*সর্বমোট\s+([০-৯\d,]+)টি\s+ফাইলের\s+([০-৯\d,]+)\s+পৃষ্ঠা\s+সফলভাবে\s+স্ক্যান\s+ও\s+স্থায়ী\s+ডেটাবেসে\s+সেভ\s+হয়েছে!$/, function (_, files, pages) {
            return '🎉 Successfully scanned ' + toAsciiDigits(pages) + ' pages across ' + toAsciiDigits(files) + ' file(s) and saved to permanent database!';
        }],
        [/^✅\s*অভিনন্দন!\s*([০-৯\d,]+)টি\s+পিডিএফ\s+থেকে\s+সর্বমোট\s+([০-৯\d,]+)\s+জন\s+শিক্ষার্থীর\s+রেজাল্ট\s+সফলভাবে\s+ডেটাবেসে\s+সংরক্ষিত\s+হয়েছে(?:\s+এবং\s+স্টুডেন্ট\s+পেজে\s+উন্মুক্ত\s+হয়েছে)?!$/, function (_, files, students) {
            return '✅ Congratulations! ' + toAsciiDigits(students) + ' student results from ' + toAsciiDigits(files) + ' PDF(s) saved to database and published!';
        }],
        [/^🎉\s*অভিনন্দন!\s*([০-৯\d,]+)টি\s+পিডিএফ\s+থেকে\s+([০-৯\d,]+)\s+জন\s+শিক্ষার্থীর\s+রেজাল্ট\s+সফলভাবে\s+ডেটাবেসে\s+সংরক্ষিত\s+হয়েছে!$/, function (_, files, students) {
            return '🎉 Congratulations! ' + toAsciiDigits(students) + ' student results from ' + toAsciiDigits(files) + ' PDF(s) saved to database!';
        }],
        [/^📑\s*মোট\s+([০-৯\d,]+)টি\s+PDF\s+ফাইল\s+প্রসেসিং\s+কিউতে\s+যুক্ত\s+হয়েছে।$/, function (_, n) {
            return '📑 ' + toAsciiDigits(n) + ' PDF file(s) added to processing queue.';
        }],
        [/^\|\s*জিপিএ:\s*(.+)$/, function (_, rest) {
            return '| GPA: ' + toAsciiDigits(rest).replace(/সেমিস্টার\s+([০-৯\d]+)/g, function (_, s) { return 'Sem ' + toAsciiDigits(s); });
        }],
        [/^\|\s*রেফার্ড\s+বিষয়:\s*(.+)$/, function (_, rest) {
            return '| Referred Subjects: ' + toAsciiDigits(rest);
        }],
        [/^✕\s*রোল\s*#?([০-৯\d]+)\s+এই\s+পিডিএফ\s+বা\s+ডেটাবেসে\s+পাওয়া\s+যায়নি।$/, function (_, r) {
            return '✕ Roll #' + toAsciiDigits(r) + ' was not found in this PDF or database.';
        }],
        [/^✏️\s*রেজাল্ট\s+সম্পাদনা:\s*রোল\s+([০-৯\d]+)$/, function (_, r) { return '✏️ Edit Result: Roll ' + toAsciiDigits(r); }],
        [/^✓\s*শিক্ষার্থী\s+([০-৯\d]+)-এর\s+তথ্য\s+সফলভাবে\s+লোড\s+হয়েছে!$/, function (_, r) { return '✓ Loaded student ' + toAsciiDigits(r) + ' data successfully!'; }],
        [/^⚠️\s*রোল\s+([০-৯\d]+)\s+সিস্টেমে\s+পাওয়া\s+যায়নি।\s*আপনি\s+নিচে\s+সরাসরি\s+নতুন\s+রেজাল্ট\s+হিসেবে\s+যোগ\s+করতে\s+পারেন।$/, function (_, r) { return '⚠️ Roll ' + toAsciiDigits(r) + ' not found. You can add it below as a new result.'; }],
        [/^✅\s*রোল\s+([০-৯\d]+)-এর\s+ফলাফল\s+সফলভাবে\s+ডেটাবেজে\s+সংরক্ষিত\s+হয়েছে!$/, function (_, r) { return '✅ Result for Roll ' + toAsciiDigits(r) + ' saved to database!'; }],
        [/^✅\s*রোল\s+([০-৯\d]+)-এর\s+ফলাফল\s+সফলভাবে\s+আপডেট\s+করা\s+হয়েছে!$/, function (_, r) { return '✅ Result for Roll ' + toAsciiDigits(r) + ' updated!'; }],
        [/^🗑️\s*রোল\s+([০-৯\d]+)-এর\s+ফলাফল\s+সফলভাবে\s+মুছে\s+ফেলা\s+হয়েছে!$/, function (_, r) { return '🗑️ Result for Roll ' + toAsciiDigits(r) + ' deleted!'; }],
        [/^⚠️\s*রোল\s+([০-৯\d]+)\s+খুঁজে\s+পাওয়া\s+যায়নি!$/, function (_, r) { return '⚠️ Roll ' + toAsciiDigits(r) + ' not found!'; }],
        [/^✅\s*প্রসেসিং\s+সম্পন্ন!\s*মোট\s+([০-৯\d,]+)টি\s+রোল\s+প্রসেস\s+হয়েছে।$/, function (_, n) { return '✅ Processing complete! ' + toAsciiDigits(n) + ' rolls processed.'; }],
        [/^✅\s*সফলভাবে\s+সেভ\s+হয়েছে!\s*মোট\s+([০-৯\d,]+)টি\s+রোল\s+ডেটাবেসে\s+সেভ\s+করা\s+হয়েছে।\s*\(উত্তীর্ণ:\s*([০-৯\d,]+),\s*রেফার্ড:\s*([০-৯\d,]+),\s*ড্রপ:\s*([০-৯\d,]+)\)$/, function (_, t, p, r, d) {
            return '✅ Saved successfully! ' + toAsciiDigits(t) + ' rolls stored (Passed: ' + toAsciiDigits(p) + ', Referred: ' + toAsciiDigits(r) + ', Dropped: ' + toAsciiDigits(d) + ')';
        }],
        [/^🔒\s*অতিরিক্ত\s+ভুল\s+চেষ্টার\s+কারণে\s+লগইন\s+([০-৯\d]+)\s+সেকেন্ডের\s+জন্য\s+লক\s+রয়েছে!$/, function (_, s) { return '🔒 Login locked for ' + toAsciiDigits(s) + ' seconds due to repeated invalid attempts!'; }],
        [/^⚠️\s*ব্যাকএন্ড\s+বার্তা:\s*(.+)$/, function (_, msg) { return '⚠️ Backend Notice: ' + translateSubTerm(msg); }],
        [/^☁️\s*গ্লোবাল\s+ক্লাউডে\s+সকল\s+ডিভাইস\s+মিলিয়ে\s+([০-৯\d,]+)টি\s+ইউনিক\s+ভিজিট\s+রেকর্ড\s+রয়েছে।\s*এই\s+ডিভাইস\s+থেকে\s+স্টুডেন্ট\s+পেজ\s+ভিজিট\s+করলে\s+অথবা\s+PHP\/MySQL\s+সক্রিয়\s+করলে\s+এখানে\s+লগ\s+তালিকা\s+দেখাবে।$/, function (_, n) {
            return '☁️ ' + toAsciiDigits(n) + ' unique visit(s) are recorded in Global Cloud across all devices. Student-page visits from this device (or centralized PHP/MySQL logs) will appear here.';
        }],
        [/^([১-৮\d]+(?:ম|য়|য়|র্থ|ষ্ঠ)?)\s+পর্ব$/, function (_, sem) { return toOrdinalSem(sem) + ' Semester'; }],
        [/^([১-৮\d]+(?:ম|য়|য়|র্থ|ষ্ঠ)?|all)\s+সেমিস্টার$/, function (_, sem) {
            return String(sem).toLowerCase() === 'all' ? 'All Semesters' : toOrdinalSem(sem) + ' Semester';
        }],
        [/^([০-৯\d,]+)টি\s+রোলের\s+ইনস্টিটিউট\s+ও\s+EIIN\s+অনুপস্থিত\s+রয়েছে।\s*পুনরায়\s+অফিসিয়াল\s+PDF\s+আপলোড\s+করুন\s+অথবা\s+আপডেটেড\s+ব্যাকআপ\s+ইমপোর্ট\s+করুন।$/, function (_, n) {
            return toAsciiDigits(n) + ' roll(s) in this browser lack Institute/EIIN data from an earlier upload. Please re-upload the official PDF or import an updated backup.';
        }],
        [/^✅\s*সফলভাবে\s+ইমপোর্ট\s+হয়েছে!\s*([০-৯\d,]+)টি\s+রোল,\s*([০-৯\d,]+)টি\s+শীট\s+ও\s*([০-৯\d,]+)টি\s+মেটেরিয়াল\s+লোড\s+করা\s+হয়েছে।$/, function (_, st, sh, m) {
            return '✅ Imported successfully! Loaded ' + toAsciiDigits(st) + ' roll(s), ' + toAsciiDigits(sh) + ' sheet(s), and ' + toAsciiDigits(m) + ' material(s).';
        }],
        [/^🟢\s*Supabase\s+সংযুক্ত\s*\(([^)]+)\)$/, function (_, lat) { return '🟢 Supabase Connected (' + lat + ')'; }],
        [/^☁️\s*ক্লাউড\s+রেকর্ড:\s*([০-৯\d,]+)টি\s*\(([^)]+)\)$/, function (_, n, tbl) { return '☁️ Cloud Records: ' + toAsciiDigits(n) + ' (' + tbl + ')'; }],
        [/^ব্যাচ:\s*([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)$/, function (_, b, tb) { return 'Batch: ' + toAsciiDigits(b) + ' / ' + toAsciiDigits(tb); }],
        [/^ব্যাচ\s+([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)\s*\|\s*টেবিল:\s*(.+)$/, function (_, b, tb, tbl) { return 'Batch ' + toAsciiDigits(b) + ' / ' + toAsciiDigits(tb) + ' | Table: ' + tbl; }],
        [/^✅\s*সফলভাবে\s+সেভ\s+হয়েছে!\s*মোট\s+([০-৯\d,]+)টি\s+রোল\s+ডেটাবেসে\s+সেভ\s+করা\s+হয়েছে।\s*\(উত্তীর্ণ:\s*([০-৯\d,]+),\s*রেফার্ড:\s*([০-৯\d,]+),\s*ড্রপ:\s*([০-৯\d,]+)\)\s*\(Supabase-এ\s+সিঙ্ক\s+সম্পন্ন\)$/, function (_, t, p, r, d) {
            return '✅ Saved successfully! ' + toAsciiDigits(t) + ' rolls stored (Passed: ' + toAsciiDigits(p) + ', Referred: ' + toAsciiDigits(r) + ', Dropped: ' + toAsciiDigits(d) + ') (Synced to Supabase)';
        }],
        [/^✅\s*মোট\s+([০-৯\d,]+)\s+জন\s+শিক্ষার্থীর\s+রেজাল্ট\s+Supabase-এ\s+সিঙ্ক\s+হয়েছে\s*\(([^)]+)\)!$/, function (_, n, ms) {
            return '✅ Synced ' + toAsciiDigits(n) + ' student result(s) to Supabase (' + ms + ')!';
        }],
        [/^✅\s*Supabase\s+কানেকশন\s+সফল!\s*টেবিলে\s+([০-৯\d,]+)টি\s+রেকর্ড\s+রয়েছে\s*\(([^)]+)\)।$/, function (_, n, ms) {
            return '✅ Supabase connected! ' + toAsciiDigits(n) + ' record(s) in table (' + ms + ').';
        }],
        [/^❌\s*Supabase\s+(সিঙ্ক|কানেকশন)\s+(?:ত্রুটি|ব্যর্থ):\s*(.+)$/, function (_, kind, err) {
            return '❌ Supabase ' + (kind === 'সিঙ্ক' ? 'Sync' : 'Connection') + ' Error: ' + translateSubTerm(err);
        }],
        [/^☁️\s*Supabase-এ\s+ব্যাচ\s+আপলোড\s+চলছে\s+—\s+(.+)$/, function (_, fn) { return '☁️ Batch uploading to Supabase — ' + fn; }],
        [/^☁️\s*Supabase\s+সিঙ্ক\s*\(([^)]+)\):\s*([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)\s+রোল\s*\((\d+%)\)$/, function (_, fn, u, t, p) {
            return '☁️ Supabase Sync (' + fn + '): ' + toAsciiDigits(u) + ' / ' + toAsciiDigits(t) + ' rolls (' + p + ')';
        }],
        [/^✅\s*সম্পন্ন\s*\+\s*☁️\s*Supabase\s*\(([০-৯\d,]+)\s+রোল\)$/, function (_, n) { return '✅ Done + ☁️ Supabase (' + toAsciiDigits(n) + ' rolls)'; }],
        [/^🎉\s*সর্বমোট\s+([০-৯\d,]+)টি\s+ফাইল\s*\(([০-৯\d,]+)\s+পৃষ্ঠা\)\s+স্ক্যান\s+ও\s+([০-৯\d,]+)টি\s+রোল\s+Supabase\s+ক্লাউড\s+ডেটাবেসে\s+সেভ\s+হয়েছে!$/, function (_, f, p, r) {
            return '🎉 Scanned ' + toAsciiDigits(f) + ' file(s) (' + toAsciiDigits(p) + ' pages) and saved ' + toAsciiDigits(r) + ' roll(s) to Supabase Cloud Database!';
        }],
        [/^✅\s*অভিনন্দন!\s*([০-৯\d,]+)টি\s+পিডিএফ\s+থেকে\s+সর্বমোট\s+([০-৯\d,]+)\s+জন\s+শিক্ষার্থীর\s+রেজাল্ট\s*\(([০-৯\d,]+)টি\s+ক্লাউডে\)\s+Supabase\s+ও\s+লোকাল\s+ডেটাবেসে\s+সেভ\s+হয়েছে!$/, function (_, f, r, s) {
            return '✅ Congratulations! Saved ' + toAsciiDigits(r) + ' student result(s) from ' + toAsciiDigits(f) + ' PDF(s) (' + toAsciiDigits(s) + ' synced to Supabase Cloud)!';
        }],
        [/^([০-৯\d,]+)\s*\/\s*([০-৯\d,]+)\s*রোল$/, function (_, u, t) { return toAsciiDigits(u) + ' / ' + toAsciiDigits(t) + ' rolls'; }],
        [/^([১-৮]+(?:ম|য়|য়|র্থ|ষ্ঠ))$/, function (_, sem) { return toOrdinalSem(sem); }],
        [/^[০-৯]+(?:[.,][০-৯]+)*%?$/, function (m) { return toAsciiDigits(m); }]
    ];

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

        // Targeted inline replacement for standalone "জন" or STATUS_MAP tokens
        if (normalized === 'জন') {
            return lead + 'visitor(s)' + tail;
        }
        if (Object.prototype.hasOwnProperty.call(STATUS_MAP, normalized)) {
            return lead + STATUS_MAP[normalized] + tail;
        }

        return original;
    }

    function shouldSkipNode(node, isAttr) {
        if (!node) return true;
        let el = node.nodeType === 1 ? node : node.parentElement;
        while (el) {
            const tag = el.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'CODE' || tag === 'PRE' || tag === 'SVG') {
                return true;
            }
            if (!isAttr && tag === 'TEXTAREA') {
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
        if (shouldSkipNode(textNode, false)) return;
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
        if (!el || el.nodeType !== 1 || shouldSkipNode(el, true)) return;
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

    function updateDocumentTitle(lang) {
        if (typeof document === 'undefined') return;
        if (origDocTitle === null) {
            origDocTitle = document.title || '';
        }
        const nextTitle = lang === 'en' ? translateText(origDocTitle) : origDocTitle;
        if (document.title !== nextTitle) {
            document.title = nextTitle;
        }
    }

    function updateToggleButtonUI(lang) {
        const btn = document.getElementById('langToggleBtn');
        if (btn) {
            btn.textContent = lang === 'en' ? 'বাংলা' : 'English';
            btn.setAttribute('aria-label', lang === 'en' ? 'Switch to Bangla' : 'Switch to English');
            btn.setAttribute('title', lang === 'en' ? 'Switch language to Bangla' : 'Switch language to English');
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
            updateDocumentTitle(nextLang);
            translateSubtree(document.body, nextLang);
        } finally {
            isApplying = false;
            startObserver();
        }
    }

    const OBSERVER_CONFIG = {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'placeholder']
    };

    function startObserver() {
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
        if (!observer) {
            observer = new MutationObserver(function (mutations) {
                if (isApplying) return;

                if (currentLang !== 'en') {
                    for (let i = 0; i < mutations.length; i++) {
                        const m = mutations[i];
                        if (m.type === 'characterData' && m.target && m.target.nodeType === 3) {
                            if (!shouldSkipNode(m.target, false)) {
                                origTextMap.set(m.target, m.target.nodeValue);
                            }
                        } else if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                            const attr = m.attributeName;
                            if ((attr === 'title' || attr === 'placeholder') && !shouldSkipNode(m.target, true)) {
                                let saved = origAttrMap.get(m.target);
                                if (!saved) { saved = {}; origAttrMap.set(m.target, saved); }
                                saved[attr] = m.target.getAttribute(attr);
                            }
                        }
                    }
                    return;
                }

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
                        } else if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                            const attr = m.attributeName;
                            if ((attr === 'title' || attr === 'placeholder') && !shouldSkipNode(m.target, true)) {
                                const curVal = m.target.getAttribute(attr);
                                if (curVal !== null) {
                                    let saved = origAttrMap.get(m.target);
                                    if (!saved) { saved = {}; origAttrMap.set(m.target, saved); }
                                    if (hasBanglaChars(curVal) || !Object.prototype.hasOwnProperty.call(saved, attr)) {
                                        saved[attr] = curVal;
                                    }
                                    processElementAttrs(m.target, 'en');
                                }
                            }
                        } else if (m.type === 'childList' && m.addedNodes) {
                            for (let j = 0; j < m.addedNodes.length; j++) {
                                translateSubtree(m.addedNodes[j], 'en');
                            }
                        }
                    }
                } finally {
                    isApplying = false;
                    observer.observe(document.body, OBSERVER_CONFIG);
                }
            });
        }
        observer.observe(document.body, OBSERVER_CONFIG);
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
