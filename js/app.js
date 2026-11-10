/**
 * BTEB Portal - Application Controller & High-Performance UI Renderer (app.js)
 * Step 4: O(1) Instant Lookup, 60fps GPU Animations, Skeleton Shimmer,
 * Dark/Light Theme Switcher, and Celebration Confetti Engine.
 */

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    // ─── Initialize Theme (Dark / Light Mode) ───
    initThemeSwitcher();

    // ─── Apply Site Settings & Menu Toggles ───
    applySiteSettingsToUI();

    // ─── Check Server Status & Show Maintenance Banner ───
    var maintenanceBanner = document.getElementById('maintenanceBanner');
    var maintenanceBannerMsg = document.getElementById('maintenanceBannerMsg');
    var searchSection = document.getElementById('searchSection');
    var isServerOn = true;

    if (typeof BTEBStorage !== 'undefined') {
        isServerOn = BTEBStorage.isResultServerEnabled();
        if (!isServerOn) {
            if (maintenanceBanner) {
                maintenanceBanner.classList.remove('hidden');
                if (maintenanceBannerMsg) {
                    maintenanceBannerMsg.textContent = BTEBStorage.getMaintenanceMessage();
                }
            }
            if (searchSection) searchSection.style.opacity = '0.4';
            if (searchSection) searchSection.style.pointerEvents = 'none';
            var emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.classList.add('hidden');
        }
    }

    // ─── Build combined data source & Pre-index in O(1) Hash Map ───
    var currentRawData;
    if (typeof BTEBStorage !== 'undefined') {
        currentRawData = BTEBStorage.getCombinedRawText();
    } else {
        currentRawData = BTEBData.RAW_BTEB_SHEET_DEMO;
    }

    // Pre-build O(1) index map for instant lookups
    if (typeof BTEBParser !== 'undefined' && BTEBParser.buildIndex) {
        BTEBParser.buildIndex(currentRawData);
    }

    var semesterNamesBangla = {
        1: '১ম সেমিস্টার (1st)',
        2: '২য় সেমিস্টার (2nd)',
        3: '৩য় সেমিস্টার (3rd)',
        4: '৪র্থ সেমিস্টার (4th)',
        5: '৫ম সেমিস্টার (5th)',
        6: '৬ষ্ঠ সেমিস্টার (6th)',
        7: '৭ম সেমিস্টার (7th)',
        8: '৮ম সেমিস্টার (8th)'
    };

    // DOM Elements
    var searchForm = document.getElementById('searchForm');
    var rollInput = document.getElementById('rollInput');
    var semesterSelect = document.getElementById('semesterSelect');
    var regulationSelect = document.getElementById('regulationSelect');
    var searchBtn = document.getElementById('searchBtn');
    var quickDemoPills = document.getElementById('quickDemoPills');
    var resultContainer = document.getElementById('resultContainer');
    var skeletonLoader = document.getElementById('skeletonLoader');
    var emptyState = document.getElementById('emptyState');
    var comingSoonModal = document.getElementById('comingSoonModal');
    var closeComingSoonBtn = document.getElementById('closeComingSoonBtn');
    var comingSoonTitle = document.getElementById('comingSoonTitle');
    var comingSoonDesc = document.getElementById('comingSoonDesc');

    // Initialize Demo Quick Pills
    renderQuickDemoPills();

    // Event Listeners
    if (searchForm) {
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            executeSearch();
        });
    }

    if (rollInput) {
        rollInput.addEventListener('input', function (e) {
            var originalVal = e.target.value;
            var converted = BTEBParser.normalizeDigits(originalVal);
            if (originalVal !== converted) {
                e.target.value = converted;
            }
        });
    }

    if (closeComingSoonBtn) {
        closeComingSoonBtn.addEventListener('click', function () {
            comingSoonModal.classList.add('hidden');
        });
    }

    window.addEventListener('click', function (e) {
        if (e.target === comingSoonModal) comingSoonModal.classList.add('hidden');
    });

    // ─── Theme Switcher (Dark / Light Mode) ───
    function initThemeSwitcher() {
        var themeToggleBtn = document.getElementById('themeToggleBtn');
        var themeIcon = document.getElementById('themeIcon');
        var savedTheme = localStorage.getItem('bteb_theme');

        // Check saved or system preference
        var theme = savedTheme;
        if (!theme) {
            theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }

        applyTheme(theme);

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', function () {
                var current = document.documentElement.getAttribute('data-theme') || 'light';
                var next = current === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                localStorage.setItem('bteb_theme', next);
            });
        }

        function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            if (themeIcon) {
                themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
            }
            if (themeToggleBtn) {
                themeToggleBtn.title = t === 'dark' ? 'লাইট মোডে পরিবর্তন করুন' : 'ডার্ক মোডে পরিবর্তন করুন';
            }
        }
    }

    /**
     * Apply Site Settings: Notice Bar, Portal Title, and Menu On/Off Toggles
     */
    function applySiteSettingsToUI() {
        if (typeof BTEBStorage === 'undefined') return;
        var settings = BTEBStorage.getSiteSettings();

        // Portal Title
        var titleEl = document.getElementById('brandPortalTitle');
        if (titleEl && settings.portalTitle) {
            titleEl.textContent = settings.portalTitle;
        }

        // Notice Bar
        var noticeBar = document.getElementById('siteNoticeBar');
        var noticeTextEl = document.getElementById('siteNoticeText');
        if (noticeBar && noticeTextEl) {
            if (settings.showNoticeBar && settings.noticeText) {
                noticeTextEl.textContent = settings.noticeText;
                noticeBar.classList.remove('hidden');
            } else {
                noticeBar.classList.add('hidden');
            }
        }

        // Menu Toggles (Books, Notes, Suggestions)
        configureMenuLink('navLinkBooks', 'badgeBooks', settings.menuBooksEnabled, 'বই ও সিলেবাস (Books)', 'materials.html?cat=book');
        configureMenuLink('navLinkNotes', 'badgeNotes', settings.menuNotesEnabled, 'হ্যান্ডনোটস ও শিট (Notes)', 'materials.html?cat=note');
        configureMenuLink('navLinkSuggestions', 'badgeSuggestions', settings.menuSuggestionsEnabled, 'সুপার সাজেশন (Suggestions)', 'materials.html?cat=suggestion');
    }

    function configureMenuLink(linkId, badgeId, isEnabled, moduleName, targetUrl) {
        var link = document.getElementById(linkId);
        var badge = document.getElementById(badgeId);
        if (!link) return;

        if (isEnabled) {
            link.href = targetUrl;
            if (badge) {
                badge.textContent = 'Active';
                badge.style.display = 'none';
            }
        } else {
            link.href = '#';
            if (badge) {
                badge.textContent = 'Soon';
                badge.style.display = 'inline-block';
            }
            link.addEventListener('click', function (e) {
                e.preventDefault();
                showComingSoon(moduleName);
            });
        }
    }

    /**
     * Render Quick Click Demo Pills
     */
    function renderQuickDemoPills() {
        if (!quickDemoPills) return;
        quickDemoPills.innerHTML = '';

        BTEBData.QUICK_DEMO_ROLLS.forEach(function (item) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'demo-pill pill-' + item.badge;
            btn.innerHTML =
                '<span class="pill-roll">#' + item.roll + '</span>' +
                '<span class="pill-tag">' + item.label + '</span>';
            btn.title = item.desc;
            btn.addEventListener('click', function () {
                rollInput.value = item.roll;
                executeSearch(item.roll);
            });
            quickDemoPills.appendChild(btn);
        });
    }

    /**
     * High-Performance Instant Search Engine with O(1) Lookup & Skeleton Loading
     */
    function executeSearch(overrideRoll) {
        if (!isServerOn) {
            alert('রেজাল্ট সার্ভার বর্তমানে বন্ধ আছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।');
            return;
        }

        var rawRoll = overrideRoll || rollInput.value.trim();
        var roll = BTEBParser.normalizeDigits(rawRoll);
        var selectedSemester = semesterSelect.value;
        var selectedRegulation = regulationSelect.value;

        if (!roll) {
            showErrorToast('অনুগ্রহ করে একটি সঠিক রোল নম্বর লিখুন।');
            rollInput.focus();
            return;
        }

        if (typeof BTEBStorage !== 'undefined') {
            currentRawData = BTEBStorage.getCombinedRawText();
        }

        // Show smooth skeleton shimmer loader
        if (emptyState) emptyState.classList.add('hidden');
        if (resultContainer) resultContainer.classList.add('hidden');
        if (skeletonLoader) skeletonLoader.classList.remove('hidden');

        searchBtn.disabled = true;
        searchBtn.innerHTML = '<span class="spinner"></span> অনুসন্ধান চলছে...';

        // Perform instant O(1) Lookup
        var lookupData = BTEBParser.instantLookup(currentRawData, roll);

        // Smooth 200ms frame transition for butter-smooth UX
        setTimeout(function () {
            if (skeletonLoader) skeletonLoader.classList.add('hidden');
            searchBtn.disabled = false;
            searchBtn.innerHTML = '🔍 রেজাল্ট দেখুন';

            if (!lookupData || !lookupData.student) {
                renderNotFound(roll);
            } else {
                renderResultCard(lookupData.student, selectedRegulation, selectedSemester, lookupData.elapsedMs);
                
                // If passed, trigger celebration confetti!
                if (lookupData.student.status === 'Passed') {
                    launchCelebrationConfetti();
                }
            }
        }, 180);
    }

    /**
     * Render Professional Marksheet / Result Card with Visual GPA Progress & Animations
     */
    function renderResultCard(data, regulation, targetSemester, elapsedMs) {
        if (emptyState) emptyState.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        resultContainer.className = 'animate-slide-up'; // 60fps GPU slide-up

        var studentMeta = BTEBData.getStudentMeta(data.roll);
        var cgpaData = BTEBParser.calculateCGPA(data.semesters, regulation);

        var statusBadgeClass = 'badge-success';
        var statusIcon = '✓';
        var statusTitle = 'উত্তীর্ণ (Passed)';

        if (data.status === 'Referred') {
            statusBadgeClass = 'badge-warning';
            statusIcon = '⚠';
            statusTitle = 'রেফার্ড (Referred) - ' + data.referredSubjects.length + 'টি বিষয়';
        } else if (data.status === 'Dropped Out') {
            statusBadgeClass = 'badge-danger';
            statusIcon = '✕';
            statusTitle = 'ড্রপ আউট (Dropped Out / সেমিস্টার ড্রপ)';
        }

        var perfDisplay = (typeof elapsedMs === 'number') ? elapsedMs : 0.25;

        var html = '';
        html += '<div class="result-card" id="printableResultCard">';
        
        // Benchmark Performance Chip & Marksheet Header
        html += '  <div class="card-header-bar">';
        html += '    <div class="board-brand">';
        html += '      <div class="govt-logo">';
        html += '        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
        html += '          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>';
        html += '          <path d="M2 17l10 5 10-5"></path>';
        html += '          <path d="M2 12l10 5 10-5"></path>';
        html += '        </svg>';
        html += '      </div>';
        html += '      <div class="board-info">';
        html += '        <h2 class="board-title">বাংলাদেশ কারিগরি শিক্ষা বোর্ড, ঢাকা</h2>';
        html += '        <h3 class="board-subtitle">BANGLADESH TECHNICAL EDUCATION BOARD, DHAKA</h3>';
        html += '        <p class="exam-title">ডিপ্লোমা ইন ইঞ্জিনিয়ারিং পরীক্ষা ফলাফল মার্কশিট</p>';
        html += '      </div>';
        html += '    </div>';
        html += '    <div class="print-actions no-print">';
        html += '      <span class="benchmark-badge" title="O(1) Hash Table Lookup Engine">';
        html += '        ⚡ মাত্র ' + perfDisplay + 'ms এ প্রস্তুত (O(1) Engine)';
        html += '      </span>';
        html += '      <button type="button" class="btn btn-outline" id="printResultBtn">🖨️ প্রিন্ট / সেভ PDF</button>';
        html += '      <button type="button" class="btn btn-secondary" id="newSearchBtn">🔄 নতুন সার্চ</button>';
        html += '    </div>';
        html += '  </div>';

        // Status Banner
        html += '  <div class="status-banner banner-' + data.statusType + '">';
        html += '    <div class="status-left">';
        html += '      <span class="status-icon">' + statusIcon + '</span>';
        html += '      <div>';
        html += '        <span class="status-label">ফলাফল স্ট্যাটাস (Status):</span>';
        html += '        <span class="status-value">' + statusTitle + '</span>';
        html += '      </div>';
        html += '    </div>';
        html += '    <div class="status-right">';
        if (cgpaData) {
            html += '      <div class="cgpa-pill">গড় CGPA: <strong>' + cgpaData.cgpa + '</strong></div>';
        }
        html += '      <span class="reg-pill">প্রবিধান: ' + regulation + '</span>';
        html += '    </div>';
        html += '  </div>';

        // Student Info Grid
        html += '  <div class="student-info-grid">';
        html += '    <div class="info-item"><span class="info-label">শিক্ষার্থীর রোল (Roll No):</span><strong class="info-val text-primary text-xl">' + data.roll + '</strong></div>';
        html += '    <div class="info-item"><span class="info-label">শিক্ষার্থীর নাম (Student Name):</span><span class="info-val">' + studentMeta.name + '</span></div>';
        html += '    <div class="info-item"><span class="info-label">ইনস্টিটিউট (Institute):</span><span class="info-val">' + studentMeta.institute + '</span></div>';
        html += '    <div class="info-item"><span class="info-label">টেকনোলজি (Technology):</span><span class="info-val">' + studentMeta.technology + '</span></div>';
        html += '    <div class="info-item"><span class="info-label">শিক্ষাবর্ষ / সেশন (Session):</span><span class="info-val">' + studentMeta.session + '</span></div>';
        html += '    <div class="info-item"><span class="info-label">সর্বশেষ সেমিস্টার (Latest Sem):</span><span class="info-val">' + (data.latestSemester ? semesterNamesBangla[data.latestSemester] : 'সেমিস্টার ড্রপ') + '</span></div>';
        html += '  </div>';

        // Semester Table with Visual GPA Meters
        html += '  <div class="section-title-wrap">';
        html += '    <h3 class="section-title">📊 সেমিস্টারভিত্তিক জিপিএ ও অগ্রগতি মিটার (Semester-wise GPA)</h3>';
        html += '    <span class="badge badge-neutral">১ম - ৮ম সেমিস্টার ট্র্যাকার</span>';
        html += '  </div>';
        html += '  <div class="table-responsive">';
        html += '    <table class="marksheet-table">';
        html += '      <thead><tr><th>সেমিস্টার (Semester)</th><th>প্রাপ্ত জিপিএ ও মিটার</th><th>স্ট্যাটাস (Status)</th><th>মন্তব্য (Remarks)</th></tr></thead>';
        html += '      <tbody>';

        for (var s = 1; s <= 8; s++) {
            var semData = data.semesters[s];
            var gpaDisplay = '—';
            var semStatusBadge = '<span class="tag tag-muted">ফলাফল নেই</span>';
            var remarks = 'পরীক্ষা অনুষ্ঠিত হয়নি / রেকর্ড নেই';
            var meterPercent = 0;

            if (semData) {
                if (semData.isPassed) {
                    gpaDisplay = '<strong>' + semData.value + '</strong>';
                    semStatusBadge = '<span class="tag tag-success">উত্তীর্ণ (Passed)</span>';
                    remarks = 'সফলভাবে উত্তীর্ণ';
                    meterPercent = Math.min(100, Math.round((semData.numericValue / 4.0) * 100));
                } else if (semData.isReferred) {
                    gpaDisplay = '<span class="text-danger font-bold">Referred</span>';
                    semStatusBadge = '<span class="tag tag-danger">রেফার্ড (Ref)</span>';
                    remarks = 'পরবর্তী সেশনে পরীক্ষা বাধ্যতামূলক';
                } else if (semData.isAbsent) {
                    gpaDisplay = '<span class="text-warning font-bold">Absent</span>';
                    semStatusBadge = '<span class="tag tag-warning">অনুপস্থিত (Abs)</span>';
                    remarks = 'অনুপস্থিত ছিলেন';
                } else {
                    gpaDisplay = '<span class="text-danger">ড্রপ</span>';
                    semStatusBadge = '<span class="tag tag-danger">ড্রপ আউট</span>';
                    remarks = 'সেমিস্টার পুনরাবৃত্তি আবশ্যক';
                }
            } else if (data.status === 'Dropped Out' && s === 1) {
                gpaDisplay = '<span class="text-danger font-bold">ড্রপ</span>';
                semStatusBadge = '<span class="tag tag-danger">ড্রপ আউট</span>';
                remarks = '৪ বা ততোধিক বিষয়ে অকৃতকার্য হওয়ায় সেমিস্টার ড্রপ';
            }

            var isTarget = (targetSemester && targetSemester === String(s));
            var rowClass = isTarget ? 'row-highlight' : '';

            html += '<tr class="' + rowClass + '">';
            html += '  <td class="font-medium">' + semesterNamesBangla[s] + (isTarget ? ' <span class="badge badge-accent">নির্বাচিত</span>' : '') + '</td>';
            html += '  <td style="min-width:140px;">';
            html += '    <div class="gpa-progress-wrap">';
            html += '      <span style="font-size:0.95rem;">' + gpaDisplay + '</span>';
            if (meterPercent > 0) {
                html += '      <div class="gpa-progress-bar no-print"><div class="gpa-progress-fill" style="width:' + meterPercent + '%;"></div></div>';
            }
            html += '    </div>';
            html += '  </td>';
            html += '  <td class="text-center">' + semStatusBadge + '</td>';
            html += '  <td class="text-muted text-sm">' + remarks + '</td>';
            html += '</tr>';
        }

        html += '      </tbody>';
        html += '    </table>';
        html += '  </div>';

        // Referred Subjects
        if (data.referredSubjects && data.referredSubjects.length > 0) {
            html += '<div class="referred-section">';
            html += '  <div class="referred-header">';
            html += '    <h4 class="referred-title">⚠️ রেফার্ড / অকৃতকার্য বিষয়সমূহ (Referred Subjects - ' + data.referredSubjects.length + 'টি বিষয়)</h4>';
            html += '    <p class="referred-subtitle">BTEB প্রবিধান অনুযায়ী নিচে উল্লেখিত বিষয়সমূহে পরবর্তী সেমিস্টার পরীক্ষার সাথে পুনরায় পরীক্ষায় অংশগ্রহণ করতে হবে।</p>';
            html += '  </div>';
            html += '  <div class="subject-cards-grid">';

            data.referredSubjects.forEach(function (sub) {
                var subName = BTEBData.getSubjectName(sub.code);
                html += '<div class="subject-card ' + sub.badgeClass + '">';
                html += '  <div class="sub-code-row">';
                html += '    <span class="sub-code">' + sub.code + '</span>';
                html += '    <span class="sub-type-badge">' + sub.typeLabel + '</span>';
                html += '  </div>';
                html += '  <div class="sub-name">' + subName + '</div>';
                html += '  <div class="sub-instruction">';
                if (sub.type.includes('T')) html += '• তত্ত্বীয় (Theory) পরীক্ষা দিতে হবে ';
                if (sub.type.includes('P')) html += '• ব্যবহারিক (Practical) পরীক্ষা দিতে হবে';
                html += '  </div>';
                html += '</div>';
            });

            html += '  </div>';
            html += '</div>';
        }

        // Footer
        html += '<div class="marksheet-footer">';
        html += '  <div class="disclaimer-text"><strong>বিশেষ দ্রষ্টব্য:</strong> এটি একটি ডিজিটাল প্রিন্ট কপি। যেকোনো ভুল-ত্রুটির ক্ষেত্রে বাংলাদেশ কারিগরি শিক্ষা বোর্ড (BTEB) এর মূল রেজাল্ট গেজেট চূড়ান্ত বলে গণ্য হবে।</div>';
        html += '  <div class="signature-row print-only">';
        html += '    <div class="sig-col"><div class="sig-line"></div><span>যাচাইকারী কর্মকর্তা</span></div>';
        html += '    <div class="sig-col"><div class="sig-line"></div><span>ভারপ্রাপ্ত কর্মকর্তা (পরীক্ষা নিয়ন্ত্রণ)</span></div>';
        html += '    <div class="sig-col"><div class="sig-line"></div><span>পরীক্ষা নিয়ন্ত্রক, কারিগরি শিক্ষা বোর্ড</span></div>';
        html += '  </div>';
        html += '</div>';
        html += '</div>';

        resultContainer.innerHTML = html;

        document.getElementById('printResultBtn').addEventListener('click', function () {
            window.print();
        });

        document.getElementById('newSearchBtn').addEventListener('click', function () {
            resultContainer.classList.add('hidden');
            emptyState.classList.remove('hidden');
            rollInput.value = '';
            rollInput.focus();
        });

        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Render Not Found View
     */
    function renderNotFound(roll) {
        if (emptyState) emptyState.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        resultContainer.className = 'animate-slide-up';

        resultContainer.innerHTML =
            '<div class="result-not-found">' +
            '  <div class="not-found-icon">🔍</div>' +
            '  <h3 class="not-found-title">রোল নম্বর: <span class="text-danger">' + roll + '</span> এর কোনো রেজাল্ট পাওয়া যায়নি!</h3>' +
            '  <p class="not-found-desc">' +
            '    সম্ভাব্য কারণসমূহ:<br>' +
            '    ১. রোল নম্বরটি ভুল টাইপ করা হয়েছে।<br>' +
            '    ২. উক্ত রোল নম্বরের রেজাল্ট এখনো বোর্ডে প্রকাশিত হয়নি বা উইথহোল্ড আছে।<br>' +
            '    ৩. অ্যাডমিন <a href="admin.html" style="color:var(--primary);font-weight:700">Admin Panel</a> থেকে নতুন রেজাল্ট শিট আপলোড করলে এই রোল খুঁজে পাওয়া যেতে পারে।' +
            '  </p>' +
            '  <div class="not-found-actions">' +
            '    <button type="button" class="btn btn-primary" id="retrySearchBtn">পুনরায় চেষ্টা করুন</button>' +
            '    <button type="button" class="btn btn-outline" id="tryDemoRollsBtn">ডেমো রোল দিয়ে দেখুন</button>' +
            '  </div>' +
            '</div>';

        document.getElementById('retrySearchBtn').addEventListener('click', function () {
            rollInput.focus();
            rollInput.select();
        });

        document.getElementById('tryDemoRollsBtn').addEventListener('click', function () {
            rollInput.value = '100001';
            executeSearch('100001');
        });

        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * 60fps GPU Celebration Confetti Particle Physics System
     */
    function launchCelebrationConfetti() {
        var canvas = document.getElementById('confettiCanvas');
        if (!canvas) return;

        var ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        var particles = [];
        var colors = ['#10b981', '#059669', '#34d399', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

        for (var i = 0; i < 90; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * 0.4 - 50,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedX: Math.random() * 4 - 2,
                speedY: Math.random() * 3 + 2,
                rotation: Math.random() * 360,
                rotationSpeed: Math.random() * 8 - 4,
                opacity: 1
            });
        }

        var startTime = performance.now();
        var duration = 3200; // 3.2 seconds animation

        function renderFrame(now) {
            var elapsed = now - startTime;
            if (elapsed > duration) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (var p = 0; p < particles.length; p++) {
                var pt = particles[p];
                pt.x += pt.speedX;
                pt.y += pt.speedY;
                pt.rotation += pt.rotationSpeed;
                pt.opacity = Math.max(0, 1 - (elapsed / duration));

                ctx.save();
                ctx.translate(pt.x, pt.y);
                ctx.rotate((pt.rotation * Math.PI) / 180);
                ctx.globalAlpha = pt.opacity;
                ctx.fillStyle = pt.color;
                ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.6);
                ctx.restore();
            }

            requestAnimationFrame(renderFrame);
        }

        requestAnimationFrame(renderFrame);
    }

    /**
     * Show Coming Soon Modal
     */
    function showComingSoon(moduleName) {
        if (!comingSoonModal) return;
        comingSoonTitle.innerText = 'শীঘ্রই আসছে: ' + moduleName;
        comingSoonDesc.innerText = 'আমাদের "BTEB Result & Education Portal" এর পরবর্তী ধাপে ' + moduleName + ' ফিচারটি উন্মুক্ত করা হবে।';
        comingSoonModal.classList.remove('hidden');
    }

    /**
     * Error Toast helper
     */
    function showErrorToast(msg) {
        alert(msg);
    }
});
