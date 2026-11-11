/**
 * BTEB Result & Education Portal - Supabase Configuration
 * ---------------------------------------------------------------------------
 * মাল্টি-ডিভাইস সিঙ্ক এবং পার্মানেন্ট ডেটা সংরক্ষণের জন্য নিচে আপনার Supabase
 * প্রজেক্টের URL এবং Public Anon Key বসান (Supabase Dashboard -> Settings -> API)।
 *
 * নোট: আপনি চাইলে অ্যাডমিন প্যানেল (admin.html) থেকেও সরাসরি URL ও Key সেভ,
 * টেস্ট এবং কনফিগারেশন ফাইলটি ডাউনলোড করে এখানে রিপ্লেস করতে পারবেন।
 */
(function (global) {
    'use strict';

    global.BTEB_SUPABASE_CONFIG = {
        url: 'https://mxumlmoozjlpnasplell.supabase.co',
        anonKey: 'sb_publishable_DPm2LpBx3ufHsn_B4Ueb_g_wbX7WclC',
        tableName: 'bteb_results',
        batchSize: 500,
        requestTimeoutMs: 12000
    };
})(typeof window !== 'undefined' ? window : globalThis);
