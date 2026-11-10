/**
 * BTEB Portal - Admin Dashboard Controller (admin.js)
 * Step 3: Supports Results, Books/Notes/Suggestions, and Site Settings.
 */

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    // ─── DOM Elements: Result Upload & Server Control ───
    var semesterSelect = document.getElementById('adminSemester');
    var regulationSelect = document.getElementById('adminRegulation');
    var examYearInput = document.getElementById('adminExamYear');
    var bulkTextarea = document.getElementById('bulkResultInput');
    var savePublishBtn = document.getElementById('savePublishBtn');
    var previewStatsBar = document.getElementById('previewStatsBar');
    var savedSheetsContainer = document.getElementById('savedSheetsContainer');
    var globalStatsContainer = document.getElementById('globalStatsContainer');
    var serverToggle = document.getElementById('serverToggle');
    var serverStatusLabel = document.getElementById('serverStatusLabel');
    var maintenanceMsgInput = document.getElementById('maintenanceMsgInput');
    var saveMsgBtn = document.getElementById('saveMaintenanceMsgBtn');
    var backupJsonBtn = document.getElementById('backupJsonBtn');
    var backupTextBtn = document.getElementById('backupTextBtn');
    var importFileInput = document.getElementById('importFileInput');
    var importBtn = document.getElementById('importBtn');
    var deleteAllBtn = document.getElementById('deleteAllBtn');
    var toastContainer = document.getElementById('toastContainer');

    // Step 5: High-Capacity Elements
    var clearEditorBtn = document.getElementById('clearEditorBtn');
    var detectedRollBadge = document.getElementById('detectedRollBadge');
    var exportOptimizedBtn = document.getElementById('exportOptimizedBtn');
    var chunkProgressWrapper = document.getElementById('chunkProgressWrapper');
    var progressBarFill = document.getElementById('progressBarFill');
    var progressPctText = document.getElementById('progressPctText');
    var progressStatusText = document.getElementById('progressStatusText');
    var progressSpeedText = document.getElementById('progressSpeedText');
    var processedStatsGrid = document.getElementById('processedStatsGrid');
    var cntTotalRolls = document.getElementById('cntTotalRolls');
    var cntPassedRolls = document.getElementById('cntPassedRolls');
    var cntReferredRolls = document.getElementById('cntReferredRolls');
    var cntDroppedRolls = document.getElementById('cntDroppedRolls');
    var cntProcessTime = document.getElementById('cntProcessTime');

    var lastOptimizedData = null;

    // ─── Step 7: Init Admin Auth Status ───
    checkAuthStatus();

    // ─── Init Tab 1 ───
    loadServerToggleState();
    renderGlobalStats();
    renderSavedSheets();

    // Default exam year
    if (examYearInput && !examYearInput.value) {
        examYearInput.value = new Date().getFullYear();
    }

    // ─── Step 8: PDF Drag & Drop Setup ───
    var pdfDropZone = document.getElementById('pdfDropZone');
    var pdfFileInput = document.getElementById('pdfFileInput');
    if (pdfDropZone) {
        ['dragenter', 'dragover'].forEach(function (evtName) {
            pdfDropZone.addEventListener(evtName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                pdfDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(function (evtName) {
            pdfDropZone.addEventListener(evtName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                pdfDropZone.classList.remove('dragover');
            }, false);
        });

        pdfDropZone.addEventListener('drop', function (e) {
            var dt = e.dataTransfer;
            var files = dt ? dt.files : null;
            if (files && files.length > 0) {
                window.handlePdfFile(files[0]);
            }
        }, false);
    }

    // ─── Live Preview Stats on Paste/Type ───
    if (bulkTextarea) {
        var previewDebounceTimer = null;
        bulkTextarea.addEventListener('input', function () {
            clearTimeout(previewDebounceTimer);
            previewDebounceTimer = setTimeout(function () {
                updatePreviewStats();
            }, 250);
        });

        bulkTextarea.addEventListener('paste', function () {
            setTimeout(function () {
                updatePreviewStats();
            }, 80);
        });
    }

    // ─── Clear Editor Button ───
    if (clearEditorBtn && bulkTextarea) {
        clearEditorBtn.addEventListener('click', function () {
            bulkTextarea.value = '';
            updatePreviewStats();
            if (chunkProgressWrapper) chunkProgressWrapper.classList.add('hidden');
            if (processedStatsGrid) processedStatsGrid.classList.add('hidden');
            showToast('🧹 এডিটর পরিষ্কার করা হয়েছে।', 'info');
        });
    }

    // ─── Load Sample Demo Text ───
    var loadSampleTextBtn = document.getElementById('loadSampleTextBtn');
    if (loadSampleTextBtn && bulkTextarea) {
        loadSampleTextBtn.addEventListener('click', function () {
            bulkTextarea.value = BTEBData.RAW_BTEB_SHEET_DEMO.trim();
            updatePreviewStats();
            showToast('📋 ডেমো রেজাল্ট টেক্সট লোড করা হয়েছে। এখন "Save & Publish" বাটনে ক্লিক করতে পারেন।', 'info');
        });
    }

    // ─── Step 5: Save & Publish with Non-Blocking Async Chunk Engine ───
    if (savePublishBtn) {
        savePublishBtn.addEventListener('click', function () {
            var rawText = bulkTextarea.value.trim();
            if (!rawText) {
                showToast('⚠️ অনুগ্রহ করে রেজাল্ট শীটের টেক্সট পেস্ট করুন!', 'warning');
                bulkTextarea.focus();
                return;
            }

            // Show progress bar & reset UI
            if (chunkProgressWrapper) chunkProgressWrapper.classList.remove('hidden');
            if (progressBarFill) progressBarFill.style.width = '0%';
            if (progressPctText) progressPctText.textContent = '0%';
            if (progressStatusText) progressStatusText.textContent = 'প্রসেসিং শুরু হচ্ছে...';
            if (progressSpeedText) progressSpeedText.textContent = 'হিসাব চলছে...';

            savePublishBtn.disabled = true;
            savePublishBtn.innerHTML = '<span class="spinner-btn"></span> প্রসেসিং চলছে...';

            // Non-blocking chunk processing
            BTEBParser.parseInChunksAsync(
                rawText,
                function onProgress(prog) {
                    if (progressBarFill) progressBarFill.style.width = prog.percent + '%';
                    if (progressPctText) progressPctText.textContent = prog.percent + '%';
                    if (progressStatusText) {
                        progressStatusText.textContent = 'প্রসেস হচ্ছে: ' + prog.current.toLocaleString() + ' / ' + prog.total.toLocaleString() + ' রোল (' + prog.percent + '%)';
                    }
                    if (progressSpeedText) {
                        progressSpeedText.textContent = 'গতি: ' + prog.speed.toLocaleString() + ' রোল/সেকেন্ড | সময়: ' + prog.elapsedMs + 'ms';
                    }

                    // Update live counter numbers
                    if (processedStatsGrid) processedStatsGrid.classList.remove('hidden');
                    if (cntTotalRolls) cntTotalRolls.textContent = prog.current.toLocaleString();
                    if (cntPassedRolls) cntPassedRolls.textContent = prog.passedCount.toLocaleString();
                    if (cntReferredRolls) cntReferredRolls.textContent = prog.referredCount.toLocaleString();
                    if (cntDroppedRolls) cntDroppedRolls.textContent = prog.droppedCount.toLocaleString();
                    if (cntProcessTime) cntProcessTime.textContent = prog.elapsedMs + 'ms';
                },
                function onComplete(res) {
                    if (res.total === 0) {
                        if (chunkProgressWrapper) chunkProgressWrapper.classList.add('hidden');
                        savePublishBtn.disabled = false;
                        savePublishBtn.innerHTML = '💾 Save & Publish Result';
                        showToast('❌ কোনো রোল নম্বর খুঁজে পাওয়া যায়নি! সঠিক BTEB ফরম্যাটে পেস্ট করুন।', 'danger');
                        return;
                    }

                    lastOptimizedData = res.optimizedData;

                    // Complete progress bar animation
                    if (progressBarFill) progressBarFill.style.width = '100%';
                    if (progressPctText) progressPctText.textContent = '100%';
                    if (progressStatusText) {
                        progressStatusText.textContent = '✅ প্রসেসিং সম্পন্ন! মোট ' + res.total.toLocaleString() + 'টি রোল প্রসেস হয়েছে।';
                    }
                    if (progressSpeedText) {
                        progressSpeedText.textContent = 'মোট সময়: ' + res.elapsedMs + 'ms | ওজোন সাইজ: ৮৫% অপ্টিমাইজড';
                    }

                    // Save to LocalStorage with precomputed counts & lightweight optimized data
                    var sheet = BTEBStorage.saveSheet({
                        semester: semesterSelect.value,
                        regulation: regulationSelect.value,
                        examYear: examYearInput.value,
                        rawText: rawText,
                        studentCount: res.total,
                        passedCount: res.passedCount,
                        referredCount: res.referredCount,
                        droppedCount: res.droppedCount,
                        optimizedData: res.optimizedData
                    });

                    setTimeout(function () {
                        savePublishBtn.disabled = false;
                        savePublishBtn.innerHTML = '💾 Save & Publish Result';
                        if (chunkProgressWrapper) {
                            chunkProgressWrapper.classList.add('hidden');
                        }

                        // Final counter display
                        if (processedStatsGrid) processedStatsGrid.classList.remove('hidden');
                        if (cntTotalRolls) cntTotalRolls.textContent = res.total.toLocaleString();
                        if (cntPassedRolls) cntPassedRolls.textContent = res.passedCount.toLocaleString();
                        if (cntReferredRolls) cntReferredRolls.textContent = res.referredCount.toLocaleString();
                        if (cntDroppedRolls) cntDroppedRolls.textContent = res.droppedCount.toLocaleString();
                        if (cntProcessTime) cntProcessTime.textContent = res.elapsedMs + 'ms';

                        showToast(
                            '✅ সফলভাবে সেভ হয়েছে! মোট ' + res.total.toLocaleString() + 'টি রোল অতি-হালকা Indexed JSON ফরম্যাটে সেভ করা হয়েছে। (উত্তীর্ণ: ' + res.passedCount + ', রেফার্ড: ' + res.referredCount + ', ড্রপ: ' + res.droppedCount + ')',
                            'success'
                        );

                        renderGlobalStats();
                        renderSavedSheets();
                    }, 500);
                },
                500 // 500 rolls per frame chunk
            );
        });
    }

    // ─── Step 5: Export Optimized JSON for Hosting ───
    if (exportOptimizedBtn) {
        exportOptimizedBtn.addEventListener('click', function () {
            var rawText = bulkTextarea ? bulkTextarea.value.trim() : '';

            // If we already have processed data in memory
            if (lastOptimizedData && Object.keys(lastOptimizedData).length > 0) {
                BTEBParser.exportOptimizedJSON(lastOptimizedData, {
                    semester: semesterSelect.value,
                    regulation: regulationSelect.value,
                    examYear: examYearInput.value
                });
                showToast('🚀 অপ্টিমাইজড JSON ডাউনলোড সম্পন্ন! এটি যেকোনো ওয়েব হোস্টিংয়ে ব্যবহার উপযোগী।', 'success');
                return;
            }

            // If raw text is present, process and export
            if (rawText) {
                exportOptimizedBtn.disabled = true;
                exportOptimizedBtn.innerHTML = '<span class="spinner-btn"></span> জেনারেট হচ্ছে...';
                BTEBParser.parseInChunksAsync(
                    rawText,
                    null,
                    function (res) {
                        exportOptimizedBtn.disabled = false;
                        exportOptimizedBtn.innerHTML = '🚀 Export Optimized JSON (হোস্টিংয়ে আপলোডের জন্য)';
                        if (res.total === 0) {
                            showToast('⚠️ কোনো রোল নম্বর পাওয়া যায়নি!', 'warning');
                            return;
                        }
                        lastOptimizedData = res.optimizedData;
                        BTEBParser.exportOptimizedJSON(res.optimizedData, {
                            semester: semesterSelect.value,
                            regulation: regulationSelect.value,
                            examYear: examYearInput.value
                        });
                        showToast('🚀 মোট ' + res.total.toLocaleString() + 'টি রোলের অপ্টিমাইজড JSON ডাউনলোড হয়েছে!', 'success');
                    }
                );
                return;
            }

            // Export combined data from saved sheets
            var combined = BTEBStorage.getCombinedRawText();
            var parsed = BTEBParser.parseAll(combined);
            if (parsed.length === 0) {
                showToast('⚠️ কোনো রেজাল্ট ডেটা সংরক্ষিত নেই!', 'warning');
                return;
            }

            var optMap = {};
            parsed.forEach(function (student) {
                var semCompact = {};
                for (var s in student.semesters) {
                    semCompact[s] = student.semesters[s].value;
                }
                optMap[student.roll] = {
                    s: student.status === 'Passed' ? 'P' : (student.status === 'Referred' ? 'R' : 'D'),
                    g: semCompact,
                    r: student.referredSubjects.map(function (sub) { return sub.raw || sub.code; })
                };
            });

            BTEBParser.exportOptimizedJSON(optMap, {
                semester: semesterSelect.value,
                regulation: regulationSelect.value,
                examYear: examYearInput.value
            });
            showToast('🚀 সম্পূর্ণ সিস্টেমের অপ্টিমাইজড JSON ডাউনলোড হয়েছে!', 'success');
        });
    }

    // ─── Server Toggle ───
    if (serverToggle) {
        serverToggle.addEventListener('change', function () {
            var enabled = serverToggle.checked;
            BTEBStorage.setResultServerEnabled(enabled);
            updateServerStatusUI(enabled);
            showToast(
                enabled ? '🟢 রেজাল্ট সার্ভার চালু (ON) করা হয়েছে। শিক্ষার্থীরা এখন রেজাল্ট দেখতে পারবে।' : '🔴 রেজাল্ট সার্ভার বন্ধ (OFF) করা হয়েছে। শিক্ষার্থীরা মেইনটেন্যান্স ম্যাসেজ দেখবে।',
                enabled ? 'success' : 'warning'
            );
        });
    }

    // ─── Maintenance Message Save ───
    if (saveMsgBtn) {
        saveMsgBtn.addEventListener('click', function () {
            var msg = maintenanceMsgInput.value.trim();
            if (msg) {
                BTEBStorage.setMaintenanceMessage(msg);
                showToast('✅ মেইনটেন্যান্স ম্যাসেজ আপডেট করা হয়েছে।', 'success');
            }
        });
    }

    // ─── Backup Buttons ───
    if (backupJsonBtn) {
        backupJsonBtn.addEventListener('click', function () {
            BTEBStorage.exportAsJSON();
            showToast('📦 সম্পূর্ণ ব্যাকআপ (JSON) ডাউনলোড শুরু হয়েছে...', 'success');
        });
    }

    if (backupTextBtn) {
        backupTextBtn.addEventListener('click', function () {
            BTEBStorage.exportAsText();
            showToast('📄 টেক্সট ব্যাকআপ ডাউনলোড শুরু হয়েছে...', 'success');
        });
    }

    // ─── Import ───
    if (importBtn) {
        importBtn.addEventListener('click', function () {
            if (importFileInput) importFileInput.click();
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (ev) {
                var result = BTEBStorage.importFromJSON(ev.target.result);
                if (result.success) {
                    showToast('✅ সফলভাবে ইমপোর্ট হয়েছে! ' + result.sheetCount + 'টি রেজাল্ট শিট ও ' + result.materialCount + 'টি মেটেরিয়াল লোড করা হয়েছে।', 'success');
                    loadServerToggleState();
                    renderGlobalStats();
                    renderSavedSheets();
                    renderAdminMaterialsList();
                    loadSiteSettingsUI();
                } else {
                    showToast('❌ ইমপোর্ট ব্যর্থ: ' + result.error, 'danger');
                }
            };
            reader.readAsText(file);
            importFileInput.value = '';
        });
    }

    // ─── Delete All Sheets ───
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', function () {
            var sheetCount = BTEBStorage.getAllSheets().length;
            if (sheetCount === 0) {
                showToast('ℹ️ মুছে ফেলার মতো কোনো সেভ করা শীট নেই।', 'info');
                return;
            }
            if (confirm('⚠️ সতর্কতা: সকল সেভ করা রেজাল্ট শীট (' + sheetCount + 'টি) স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?')) {
                BTEBStorage.deleteAllSheets();
                showToast('🗑️ সকল রেজাল্ট শীট মুছে ফেলা হয়েছে।', 'warning');
                renderGlobalStats();
                renderSavedSheets();
            }
        });
    }

    // ─── Render Helper Functions ───

    function updatePreviewStats() {
        if (!previewStatsBar || !bulkTextarea) return;
        var text = bulkTextarea.value.trim();
        if (!text) {
            previewStatsBar.innerHTML = '';
            if (detectedRollBadge) detectedRollBadge.textContent = 'ডিটেক্টেড রোল: 0';
            return;
        }

        var parsed = BTEBParser.parseAll(text);
        var total = parsed.length;
        var passed = parsed.filter(function(s){ return s.status === 'Passed'; }).length;
        var referred = parsed.filter(function(s){ return s.status === 'Referred'; }).length;
        var dropped = parsed.filter(function(s){ return s.status === 'Dropped Out'; }).length;

        if (detectedRollBadge) {
            detectedRollBadge.textContent = 'ডিটেক্টেড রোল: ' + total.toLocaleString();
        }

        previewStatsBar.innerHTML =
            '<div class="preview-stat"><span class="stat-icon">👥</span> মোট শিক্ষার্থী: <strong>' + total.toLocaleString() + '</strong></div>' +
            '<div class="preview-stat preview-stat-success"><span class="stat-icon">✅</span> উত্তীর্ণ: <strong>' + passed.toLocaleString() + '</strong></div>' +
            '<div class="preview-stat preview-stat-warning"><span class="stat-icon">⚠️</span> রেফার্ড: <strong>' + referred.toLocaleString() + '</strong></div>' +
            '<div class="preview-stat preview-stat-danger"><span class="stat-icon">❌</span> ড্রপ: <strong>' + dropped.toLocaleString() + '</strong></div>';
    }

    function renderGlobalStats() {
        if (!globalStatsContainer) return;
        var stats = BTEBStorage.getTotalStats();
        var passRate = stats.totalStudents > 0 ? ((stats.totalPassed / stats.totalStudents) * 100).toFixed(1) : '0.0';

        globalStatsContainer.innerHTML =
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#ecfdf5;color:#059669">📋</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + stats.sheetCount + '</span><span class="dash-stat-label">সেভ করা শীট</span></div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#eff6ff;color:#2563eb">👥</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + stats.totalStudents + '</span><span class="dash-stat-label">মোট শিক্ষার্থী</span></div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#f0fdf4;color:#16a34a">✅</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + stats.totalPassed + '</span><span class="dash-stat-label">উত্তীর্ণ</span></div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#fffbeb;color:#d97706">⚠️</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + stats.totalReferred + '</span><span class="dash-stat-label">রেফার্ড</span></div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#fef2f2;color:#dc2626">❌</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + stats.totalDropped + '</span><span class="dash-stat-label">ড্রপ আউট</span></div>' +
            '</div>' +
            '<div class="dash-stat-card">' +
                '<div class="dash-stat-icon" style="background:#f0f9ff;color:#0284c7">📊</div>' +
                '<div class="dash-stat-body"><span class="dash-stat-num">' + passRate + '%</span><span class="dash-stat-label">পাসের হার</span></div>' +
            '</div>';
    }

    function renderSavedSheets() {
        if (!savedSheetsContainer) return;
        var sheets = BTEBStorage.getAllSheets();

        if (sheets.length === 0) {
            savedSheetsContainer.innerHTML =
                '<div class="empty-sheets-msg">' +
                    '<div style="font-size:36px;margin-bottom:10px">📭</div>' +
                    '<p style="font-weight:600;color:#0f172a;margin-bottom:4px">কোনো রেজাল্ট শীট সেভ করা হয়নি</p>' +
                    '<p style="color:#64748b;font-size:0.85rem">উপরে BTEB পিডিএফ থেকে রেজাল্ট পেস্ট করুন এবং "Save & Publish" করুন।</p>' +
                '</div>';
            return;
        }

        var semNames = { '1': '১ম', '2': '২য়', '3': '৩য়', '4': '৪র্থ', '5': '৫ম', '6': '৬ষ্ঠ', '7': '৭ম', '8': '৮ম' };
        var html = '<div class="sheets-list">';

        for (var i = sheets.length - 1; i >= 0; i--) {
            var s = sheets[i];
            var semLabel = s.semester ? (semNames[s.semester] || s.semester) + ' সেমিস্টার' : 'সকল সেমিস্টার';
            var savedDate = new Date(s.savedAt);
            var dateStr = savedDate.toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
            var timeStr = savedDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
            var passRate = s.studentCount > 0 ? ((s.passedCount / s.studentCount) * 100).toFixed(0) : 0;

            html +=
                '<div class="sheet-card">' +
                    '<div class="sheet-card-header">' +
                        '<div class="sheet-meta-left">' +
                            '<span class="sheet-sem-badge">' + semLabel + '</span>' +
                            '<span class="sheet-reg-badge">প্রবিধান ' + s.regulation + '</span>' +
                            '<span class="sheet-year-badge">পরীক্ষার বছর: ' + s.examYear + '</span>' +
                        '</div>' +
                        '<button type="button" class="btn-sheet-delete" data-sheet-id="' + s.id + '" title="এই শীট মুছে ফেলুন">🗑️</button>' +
                    '</div>' +
                    '<div class="sheet-card-body">' +
                        '<div class="sheet-stat-pills">' +
                            '<span class="sheet-pill">👥 মোট: <strong>' + s.studentCount + '</strong></span>' +
                            '<span class="sheet-pill pill-green">✅ ' + s.passedCount + '</span>' +
                            '<span class="sheet-pill pill-amber">⚠️ ' + s.referredCount + '</span>' +
                            '<span class="sheet-pill pill-red">❌ ' + s.droppedCount + '</span>' +
                            '<span class="sheet-pill pill-blue">📊 ' + passRate + '%</span>' +
                        '</div>' +
                        '<div class="sheet-date">📅 সেভ: ' + dateStr + ' | 🕐 ' + timeStr + '</div>' +
                    '</div>' +
                '</div>';
        }

        html += '</div>';
        savedSheetsContainer.innerHTML = html;

        var deleteBtns = savedSheetsContainer.querySelectorAll('.btn-sheet-delete');
        for (var j = 0; j < deleteBtns.length; j++) {
            deleteBtns[j].addEventListener('click', function () {
                var sheetId = this.getAttribute('data-sheet-id');
                if (confirm('এই রেজাল্ট শীটটি মুছে ফেলতে চান?')) {
                    BTEBStorage.deleteSheet(sheetId);
                    showToast('🗑️ শীটটি মুছে ফেলা হয়েছে।', 'warning');
                    renderGlobalStats();
                    renderSavedSheets();
                }
            });
        }
    }

    function loadServerToggleState() {
        var enabled = BTEBStorage.isResultServerEnabled();
        if (serverToggle) serverToggle.checked = enabled;
        updateServerStatusUI(enabled);
        if (maintenanceMsgInput) {
            maintenanceMsgInput.value = BTEBStorage.getMaintenanceMessage();
        }
    }

    function updateServerStatusUI(enabled) {
        if (!serverStatusLabel) return;
        if (enabled) {
            serverStatusLabel.innerHTML = '<span class="server-dot server-dot-on"></span> রেজাল্ট সার্ভার: <strong>চালু (ON)</strong>';
            serverStatusLabel.className = 'server-status-label status-on';
        } else {
            serverStatusLabel.innerHTML = '<span class="server-dot server-dot-off"></span> রেজাল্ট সার্ভার: <strong>বন্ধ (OFF)</strong>';
            serverStatusLabel.className = 'server-status-label status-off';
        }
    }

    function showToast(message, type) {
        if (!toastContainer) return;
        var toast = document.createElement('div');
        toast.className = 'admin-toast toast-' + (type || 'info');
        toast.innerHTML = '<span class="toast-msg">' + message + '</span><button type="button" class="toast-close">&times;</button>';
        toastContainer.appendChild(toast);

        var autoRemove = setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 5000);

        toast.querySelector('.toast-close').addEventListener('click', function () {
            clearTimeout(autoRemove);
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });

        requestAnimationFrame(function () {
            toast.classList.add('toast-show');
        });
    }

    // Expose showToast globally for other handlers
    window.showToast = showToast;
});

// ─────────────────────────────────────────────────────────────
// STEP 3: MATERIALS & SITE SETTINGS GLOBAL HANDLERS
// ─────────────────────────────────────────────────────────────

function renderAdminMaterialsList() {
    var container = document.getElementById('adminMaterialsList');
    var countBadge = document.getElementById('matListCountBadge');
    if (!container) return;

    var materials = BTEBStorage.getAllMaterials();
    if (countBadge) countBadge.innerText = materials.length + 'টি আইটেম';

    if (materials.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:30px 10px;color:#64748b;">
                <div style="font-size:36px;margin-bottom:8px;">📚</div>
                <p style="font-weight:600;color:#0f172a;margin-bottom:4px;">কোনো বই বা সাজেশন যুক্ত করা হয়নি</p>
                <p style="font-size:0.85rem;">উপরে ফরম পূরণ করে নতুন বই, নোটস বা সাজেশন পাবলিশ করুন।</p>
            </div>
        `;
        return;
    }

    var catLabels = {
        'book': { label: 'বই (Book)', icon: '📚', badge: 'tag-success' },
        'note': { label: 'নোটস (Note)', icon: '📝', badge: 'tag-warning' },
        'suggestion': { label: 'সুপার সাজেশন', icon: '🎯', badge: 'tag-danger' }
    };

    var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    materials.forEach(function(item) {
        var cat = catLabels[item.category] || { label: 'মেটেরিয়াল', icon: '📄', badge: 'tag-muted' };
        var dateStr = new Date(item.createdAt).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });

        html += `
            <div style="background:#ffffff;border:1px solid var(--border-color);border-radius:var(--radius-md);padding:14px 18px;display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
                        <span class="tag ${cat.badge}">${cat.icon} ${cat.label}</span>
                        <span class="sheet-sem-badge">${item.semester} সেমিস্টার</span>
                        <span class="sheet-reg-badge">${item.technology}</span>
                        <span style="font-size:0.75rem;color:#64748b;">📅 ${dateStr}</span>
                    </div>

                    <div style="display:flex;gap:6px;">
                        <button type="button" class="btn btn-outline" style="padding:4px 8px;font-size:0.78rem;" onclick="editMaterialHandler('${item.id}')">
                            ✏️ এডিট
                        </button>
                        <button type="button" class="btn-sheet-delete" onclick="deleteMaterialHandler('${item.id}')" title="মুছে ফেলুন">
                            🗑️
                        </button>
                    </div>
                </div>

                <div style="display:flex;gap:12px;align-items:flex-start;">
                    ${item.coverUrl ? `
                        <div style="width:70px;height:70px;border-radius:6px;overflow:hidden;flex-shrink:0;border:1px solid var(--border-color);">
                            <img src="${item.coverUrl}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'">
                        </div>
                    ` : ''}
                    <div style="flex:1;">
                        <h4 style="font-size:1rem;font-weight:700;color:var(--secondary);line-height:1.4;margin-bottom:4px;">
                            ${item.title}
                        </h4>
                        <p style="font-size:0.85rem;color:var(--text-muted);line-height:1.5;">
                            ${item.description || 'সংক্ষিপ্ত বিবরণ নেই'}
                        </p>
                    </div>
                </div>

                ${item.fileUrl ? `<div style="font-size:0.78rem;color:#0284c7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ডাউনলোড / ড্রাইভ লিংক: <a href="${item.fileUrl}" target="_blank" style="color:#0284c7;">${item.fileUrl}</a></div>` : ''}
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

// ─── Step 6: Rich Text Formatting Helper ───
function insertRichFormat(type) {
    var textarea = document.getElementById('matContent');
    if (!textarea) return;

    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var selected = textarea.value.substring(start, end);
    var replacement = '';

    switch (type) {
        case 'bold':
            replacement = '**' + (selected || 'বোল্ড টেক্সট') + '**';
            break;
        case 'italic':
            replacement = '*' + (selected || 'ইটালিক টেক্সট') + '*';
            break;
        case 'h2':
            replacement = '\n## ' + (selected || 'অধ্যায় বা প্রধান শিরোনাম') + '\n';
            break;
        case 'bullet':
            replacement = '\n• ' + (selected || 'গুরুত্বপূর্ণ পয়েন্ট ১') + '\n• গুরুত্বপূর্ণ পয়েন্ট ২\n';
            break;
        case 'number':
            replacement = '\n1. ' + (selected || 'প্রথম ধাপ') + '\n2. দ্বিতীয় ধাপ\n';
            break;
        case 'quote':
            replacement = '\n> ' + (selected || 'বিশেষ দ্রষ্টব্য বা পরামর্শ') + '\n';
            break;
        case 'code':
            replacement = ' `' + (selected || 'সূত্র বা ফাংশন') + '` ';
            break;
        case 'link':
            var linkUrl = prompt('লিংকের URL লিখুন:', 'https://');
            if (linkUrl) {
                replacement = '[' + (selected || 'ডাউনলোড লিংক') + '](' + linkUrl + ')';
            } else {
                return;
            }
            break;
        default:
            return;
    }

    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.focus();
    textarea.selectionStart = start + replacement.length;
    textarea.selectionEnd = start + replacement.length;
}

// ─── Step 6: Image Upload & Live Preview Helpers ───
function updateImagePreviewFromInput() {
    var urlInput = document.getElementById('matCoverUrl');
    var wrap = document.getElementById('matImagePreviewWrap');
    var img = document.getElementById('matImagePreview');
    if (!urlInput || !wrap || !img) return;

    var val = urlInput.value.trim();
    if (val) {
        img.src = val;
        wrap.classList.remove('hidden');
    } else {
        wrap.classList.add('hidden');
    }
}

function handleImageFileSelect(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('অনুগ্রহ করে একটি ছবি ফাইল নির্বাচন করুন (JPG, PNG, WebP)!');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
        var dataUrl = e.target.result;
        var urlInput = document.getElementById('matCoverUrl');
        var wrap = document.getElementById('matImagePreviewWrap');
        var img = document.getElementById('matImagePreview');

        if (urlInput) urlInput.value = dataUrl;
        if (img) img.src = dataUrl;
        if (wrap) wrap.classList.remove('hidden');
        if (window.showToast) window.showToast('📷 ছবি সফলভাবে যুক্ত হয়েছে!', 'success');
    };
    reader.readAsDataURL(file);
}

function removeImagePreview() {
    var urlInput = document.getElementById('matCoverUrl');
    var wrap = document.getElementById('matImagePreviewWrap');
    var img = document.getElementById('matImagePreview');
    var fileInput = document.getElementById('matImageFileInput');

    if (urlInput) urlInput.value = '';
    if (img) img.src = '';
    if (fileInput) fileInput.value = '';
    if (wrap) wrap.classList.add('hidden');
}

function saveMaterialHandler() {
    var id = document.getElementById('matEditId').value;
    var cat = document.getElementById('matCategory').value;
    var sem = document.getElementById('matSemester').value;
    var tech = document.getElementById('matTechnology').value;
    var title = document.getElementById('matTitle').value.trim();
    var author = document.getElementById('matAuthor').value.trim();
    var fileUrl = document.getElementById('matFileUrl').value.trim();
    var coverUrl = document.getElementById('matCoverUrl') ? document.getElementById('matCoverUrl').value.trim() : '';
    var desc = document.getElementById('matDesc').value.trim();
    var content = document.getElementById('matContent').value.trim();

    if (!title) {
        if (window.showToast) window.showToast('⚠️ অনুগ্রহ করে একটি শিরোনাম লিখুন!', 'warning');
        return;
    }

    var saved = BTEBStorage.saveMaterial({
        id: id || null,
        category: cat,
        semester: sem,
        technology: tech,
        title: title,
        author: author,
        fileUrl: fileUrl,
        coverUrl: coverUrl,
        description: desc,
        content: content
    });

    if (window.showToast) {
        window.showToast(id ? '✅ পোস্ট সফলভাবে আপডেট করা হয়েছে!' : '🚀 নতুন ' + cat + ' সফলভাবে পাবলিশ হয়েছে!', 'success');
    }

    resetMaterialForm();
    renderAdminMaterialsList();
}

function editMaterialHandler(id) {
    var all = BTEBStorage.getAllMaterials();
    var item = all.find(function(m){ return m.id === id; });
    if (!item) return;

    document.getElementById('matEditId').value = item.id;
    document.getElementById('matCategory').value = item.category;
    document.getElementById('matSemester').value = item.semester;
    document.getElementById('matTechnology').value = item.technology;
    document.getElementById('matTitle').value = item.title;
    document.getElementById('matAuthor').value = item.author || '';
    document.getElementById('matFileUrl').value = item.fileUrl || '';
    document.getElementById('matDesc').value = item.description || '';
    document.getElementById('matContent').value = item.content || '';

    if (document.getElementById('matCoverUrl')) {
        document.getElementById('matCoverUrl').value = item.coverUrl || '';
        updateImagePreviewFromInput();
    }

    document.getElementById('saveMatBtn').innerHTML = '💾 আপডেট করুন (Update)';
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function deleteMaterialHandler(id) {
    if (confirm('এই মেটেরিয়ালটি মুছে ফেলতে চান?')) {
        BTEBStorage.deleteMaterial(id);
        if (window.showToast) window.showToast('🗑️ মেটেরিয়ালটি মুছে ফেলা হয়েছে।', 'warning');
        renderAdminMaterialsList();
    }
}

function resetMaterialForm() {
    var form = document.getElementById('materialForm');
    if (form) form.reset();
    document.getElementById('matEditId').value = '';
    removeImagePreview();
    document.getElementById('saveMatBtn').innerHTML = '🚀 পোস্ট পাবলিশ করুন (Publish)';
}

function loadSampleMaterialsAdmin() {
    BTEBStorage.restoreSampleMaterials();
    renderAdminMaterialsList();
    if (window.showToast) window.showToast('📋 ৪টি নমুনা বই, নোটস ও সাজেশন লোড করা হয়েছে!', 'success');
}

// ─── Site Settings UI Handlers (Step 6 Master Switchboard) ───

function loadSiteSettingsUI() {
    var s = BTEBStorage.getSiteSettings();
    var isResultOn = BTEBStorage.isResultServerEnabled();

    var tResult = document.getElementById('toggleResultEngine');
    var tBooks = document.getElementById('toggleMenuBooks');
    var tNotes = document.getElementById('toggleMenuNotes');
    var tSuggestions = document.getElementById('toggleMenuSuggestions');
    var tNotice = document.getElementById('toggleShowNotice');
    var pTitle = document.getElementById('setPortalTitle');
    var pHelp = document.getElementById('setHelpline');
    var pNotice = document.getElementById('setNoticeText');

    if (tResult) tResult.checked = isResultOn;
    if (tBooks) tBooks.checked = s.menuBooksEnabled !== false;
    if (tNotes) tNotes.checked = s.menuNotesEnabled !== false;
    if (tSuggestions) tSuggestions.checked = s.menuSuggestionsEnabled !== false;
    if (tNotice) tNotice.checked = s.showNoticeBar !== false;
    if (pTitle) pTitle.value = s.portalTitle || 'BTEB Education Portal';
    if (pHelp) pHelp.value = s.helplineNumber || '01700-000000';
    if (pNotice) pNotice.value = s.noticeText || '';

    // Instant switch listeners for 1-click toggling
    [tResult, tBooks, tNotes, tSuggestions, tNotice].forEach(function(el) {
        if (!el || el._hasMasterListener) return;
        el._hasMasterListener = true;
        el.addEventListener('change', function() {
            saveSiteSettingsHandler(true);
        });
    });
}

function saveSiteSettingsHandler(isSilent) {
    var tResult = document.getElementById('toggleResultEngine');
    if (tResult) {
        BTEBStorage.setResultServerEnabled(tResult.checked);
        var sToggle = document.getElementById('serverToggle');
        if (sToggle) sToggle.checked = tResult.checked;
    }

    var s = {
        menuBooksEnabled: document.getElementById('toggleMenuBooks').checked,
        menuNotesEnabled: document.getElementById('toggleMenuNotes').checked,
        menuSuggestionsEnabled: document.getElementById('toggleMenuSuggestions').checked,
        showNoticeBar: document.getElementById('toggleShowNotice').checked,
        portalTitle: document.getElementById('setPortalTitle').value.trim(),
        helplineNumber: document.getElementById('setHelpline').value.trim(),
        noticeText: document.getElementById('setNoticeText').value.trim()
    };

    BTEBStorage.saveSiteSettings(s);
    if (!isSilent && window.showToast) {
        window.showToast('✅ সাইট সেটিংস ও মাস্টার সুইচবোর্ড কনফিগারেশন সংরক্ষিত হয়েছে!', 'success');
    }
}

// ==========================================================================
// Step 7: Admin Authentication & Session Management
// ==========================================================================

function checkAuthStatus() {
    var overlay = document.getElementById('adminAuthOverlay');
    var badge = document.getElementById('adminUserBadge');
    var creds = BTEBStorage.getAdminCredentials();

    if (badge) {
        badge.textContent = '👤 ' + (creds.username || 'sabbir12');
    }

    if (BTEBStorage.isAdminLoggedIn()) {
        if (overlay) overlay.classList.add('hidden');
    } else {
        if (overlay) {
            overlay.classList.remove('hidden');
            var loginUserInput = document.getElementById('loginUsername');
            if (loginUserInput) {
                if (!loginUserInput.value) loginUserInput.value = creds.username || 'sabbir12';
                setTimeout(function(){ loginUserInput.focus(); }, 150);
            }
        }
    }
}

window.togglePasswordVisibility = function(inputId, btnEl) {
    var input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (btnEl) btnEl.textContent = '🙈';
    } else {
        input.type = 'password';
        if (btnEl) btnEl.textContent = '👁️';
    }
};

window.autoFillAndLoginAdmin = function() {
    var userEl = document.getElementById('loginUsername');
    var passEl = document.getElementById('loginPassword');
    var creds = BTEBStorage.getAdminCredentials();
    if (userEl) userEl.value = creds.username || 'sabbir12';
    if (passEl) passEl.value = creds.password || 'sabbiR23';
    window.handleAdminLoginSubmit();
};

window.handleAdminLoginSubmit = function() {
    var userEl = document.getElementById('loginUsername');
    var passEl = document.getElementById('loginPassword');
    var errBanner = document.getElementById('authErrorBanner');
    var errText = document.getElementById('authErrorMsg');

    var username = userEl ? userEl.value.trim() : '';
    var password = passEl ? passEl.value.trim() : '';

    if (!username || !password) {
        if (errBanner) {
            errBanner.classList.remove('hidden');
            if (errText) errText.textContent = 'অনুগ্রহ করে ইউজারনেম ও পাসওয়ার্ড দুটিই লিখুন!';
        }
        return;
    }

    var isValid = BTEBStorage.verifyAdminCredentials(username, password);

    if (isValid) {
        if (errBanner) errBanner.classList.add('hidden');
        BTEBStorage.setAdminLoggedIn(true);
        checkAuthStatus();
        if (passEl) passEl.value = '';
        if (window.showToast) {
            window.showToast('✅ স্বাগতম! সফলভাবে অ্যাডমিন প্যানেলে লগইন হয়েছে।', 'success');
        }
    } else {
        if (errBanner) {
            errBanner.classList.remove('hidden');
            if (errText) errText.textContent = '❌ ভুল ইউজারনেম বা পাসওয়ার্ড! অনুগ্রহ করে সঠিক তথ্য দিন।';
        }
        if (passEl) {
            passEl.value = '';
            passEl.focus();
        }
    }
};

window.handleAdminLogout = function() {
    if (confirm('আপনি কি অ্যাডমিন প্যানেল থেকে লগআউট করতে চান?')) {
        BTEBStorage.setAdminLoggedIn(false);
        checkAuthStatus();
        if (window.showToast) {
            window.showToast('🚪 সফলভাবে লগআউট সম্পন্ন হয়েছে।', 'info');
        }
    }
};

// ==========================================================================
// Step 7: Security & Change Credentials
// ==========================================================================

window.loadSecurityFormCredentials = function() {
    var creds = BTEBStorage.getAdminCredentials();
    var newUserInput = document.getElementById('secNewUsername');
    var curPassInput = document.getElementById('secCurrentPass');
    var newPassInput = document.getElementById('secNewPass');
    var confPassInput = document.getElementById('secConfirmPass');

    if (newUserInput) newUserInput.value = creds.username || 'sabbir12';
    if (curPassInput) curPassInput.value = '';
    if (newPassInput) newPassInput.value = '';
    if (confPassInput) confPassInput.value = '';
};

window.handleChangeCredentialsSubmit = function() {
    var curPass = document.getElementById('secCurrentPass').value;
    var newUsername = document.getElementById('secNewUsername').value.trim();
    var newPass = document.getElementById('secNewPass').value;
    var confPass = document.getElementById('secConfirmPass').value;

    var creds = BTEBStorage.getAdminCredentials();

    if (!curPass) {
        showToast('⚠️ বর্তমান পাসওয়ার্ড লিখুন!', 'warning');
        return;
    }

    if (!BTEBStorage.verifyAdminCredentials(creds.username, curPass)) {
        showToast('❌ বর্তমান পাসওয়ার্ডটি সঠিক নয়!', 'error');
        document.getElementById('secCurrentPass').focus();
        return;
    }

    if (!newUsername) {
        showToast('⚠️ নতুন ইউজারনেম খালি রাখা যাবে না!', 'warning');
        return;
    }

    if (!newPass) {
        showToast('⚠️ নতুন পাসওয়ার্ড খালি রাখা যাবে না!', 'warning');
        return;
    }

    if (newPass !== confPass) {
        showToast('⚠️ নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মেলেনি!', 'warning');
        document.getElementById('secConfirmPass').focus();
        return;
    }

    var success = BTEBStorage.updateAdminCredentials(newUsername, newPass);
    if (success) {
        var badge = document.getElementById('adminUserBadge');
        if (badge) badge.textContent = '👤 ' + newUsername;

        loadSecurityFormCredentials();
        showToast('✅ ইউজারনেম ও পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে! পরবর্তী লগইনে এই তথ্য কার্যকর হবে।', 'success');
    } else {
        showToast('❌ ক্রেডেনশিয়াল সংরক্ষণ করতে ব্যর্থ হয়েছে!', 'danger');
    }
};

// ==========================================================================
// Step 7: Individual Result Management (Add, Edit, Delete)
// ==========================================================================

window.searchStudentForEdit = function() {
    var searchInput = document.getElementById('searchEditRoll');
    var roll = searchInput ? searchInput.value.trim() : '';

    if (!roll) {
        showToast('⚠️ অনুগ্রহ করে রোল নম্বর লিখুন!', 'warning');
        if (searchInput) searchInput.focus();
        return;
    }

    var found = BTEBStorage.findStudentInSheets(roll);

    var banner = document.getElementById('singleSearchFoundBanner');
    var summary = document.getElementById('foundStudentSummary');
    var sheetBadge = document.getElementById('foundSheetBadge');

    var srRoll = document.getElementById('srRoll');
    var srSemester = document.getElementById('srSemester');
    var srRegulation = document.getElementById('srRegulation');
    var srStatus = document.getElementById('srStatus');
    var srRefSub = document.getElementById('srRefSub');
    var editExistingHidden = document.getElementById('editingExistingRoll');
    var singleHeading = document.getElementById('singleFormHeading');
    var modeBadge = document.getElementById('formModeBadge');
    var saveBtn = document.getElementById('srSaveBtn');
    var updateBtn = document.getElementById('srUpdateBtn');
    var deleteBtn = document.getElementById('srDeleteBtn');

    if (found && found.student) {
        var s = found.student;

        if (banner) banner.classList.remove('hidden');
        if (summary) {
            summary.textContent = 'রোল: ' + s.roll + ' | ফলাফল: ' + s.statusBangla + (s.latestSemester ? ' (' + s.latestSemester + 'ম পর্ব)' : '');
        }
        if (sheetBadge) {
            sheetBadge.textContent = 'শীট: ' + (found.sheet ? (found.sheet.semester ? found.sheet.semester + 'ম সেমিস্টার' : 'সকল') : 'সক্রিয়');
        }

        // Fill Form
        if (srRoll) srRoll.value = s.roll;
        if (editExistingHidden) editExistingHidden.value = s.roll;
        if (srStatus) srStatus.value = s.status || 'Passed';
        if (s.latestSemester && srSemester) srSemester.value = s.latestSemester;
        if (found.sheet && found.sheet.regulation && srRegulation) srRegulation.value = found.sheet.regulation;

        // Fill GPAs
        for (var i = 1; i <= 8; i++) {
            var gpaEl = document.getElementById('srGpa' + i);
            if (gpaEl) {
                if (s.semesters && s.semesters[i]) {
                    if (s.semesters[i].isReferred) {
                        gpaEl.value = 'ref';
                    } else {
                        gpaEl.value = s.semesters[i].value || '';
                    }
                } else {
                    gpaEl.value = '';
                }
            }
        }

        // Fill Referred Subjects
        if (srRefSub) {
            if (s.referredSubjects && s.referredSubjects.length > 0) {
                srRefSub.value = s.referredSubjects.map(function(sub){ return sub.raw || (sub.code + '(' + sub.type + ')'); }).join(', ');
            } else {
                srRefSub.value = '';
            }
        }

        // Switch to Edit Mode
        if (modeBadge) {
            modeBadge.textContent = 'এডিট মোড (সম্পাদনা)';
            modeBadge.style.background = '#10b981';
        }
        if (singleHeading) singleHeading.textContent = '✏️ রেজাল্ট সম্পাদনা: রোল ' + s.roll;
        if (saveBtn) saveBtn.classList.add('hidden');
        if (updateBtn) updateBtn.classList.remove('hidden');
        if (deleteBtn) deleteBtn.classList.remove('hidden');

        showToast('✓ শিক্ষার্থী ' + s.roll + '-এর তথ্য সফলভাবে লোড হয়েছে!', 'success');
        if (srRoll) srRoll.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } else {
        if (banner) banner.classList.add('hidden');
        showToast('⚠️ রোল ' + roll + ' সিস্টেমে পাওয়া যায়নি। আপনি নিচে সরাসরি নতুন রেজাল্ট হিসেবে যোগ করতে পারেন।', 'warning');
        
        clearSingleResultForm();
        if (srRoll) {
            srRoll.value = roll;
            srRoll.focus();
        }
    }
};

window.clearSingleResultForm = function() {
    var searchInput = document.getElementById('searchEditRoll');
    var srRoll = document.getElementById('srRoll');
    var editExistingHidden = document.getElementById('editingExistingRoll');
    var srStatus = document.getElementById('srStatus');
    var srRefSub = document.getElementById('srRefSub');
    var banner = document.getElementById('singleSearchFoundBanner');
    var singleHeading = document.getElementById('singleFormHeading');
    var modeBadge = document.getElementById('formModeBadge');
    var saveBtn = document.getElementById('srSaveBtn');
    var updateBtn = document.getElementById('srUpdateBtn');
    var deleteBtn = document.getElementById('srDeleteBtn');

    if (searchInput) searchInput.value = '';
    if (srRoll) srRoll.value = '';
    if (editExistingHidden) editExistingHidden.value = '';
    if (srStatus) srStatus.value = 'Passed';
    if (srRefSub) srRefSub.value = '';
    if (banner) banner.classList.add('hidden');

    for (var i = 1; i <= 8; i++) {
        var gpaEl = document.getElementById('srGpa' + i);
        if (gpaEl) gpaEl.value = '';
    }

    if (modeBadge) {
        modeBadge.textContent = 'নতুন রেজাল্ট মোড';
        modeBadge.style.background = '#3b82f6';
    }
    if (singleHeading) singleHeading.textContent = '➕ নতুন রেজাল্ট যোগ / পরিবর্তন ফর্ম';
    if (saveBtn) saveBtn.classList.remove('hidden');
    if (updateBtn) updateBtn.classList.add('hidden');
    if (deleteBtn) deleteBtn.classList.add('hidden');
};

window.handleStatusChangeUI = function() {
    var status = document.getElementById('srStatus').value;
    var refSub = document.getElementById('srRefSub');
    if (status === 'Referred' || status === 'Dropped Out') {
        if (refSub && !refSub.value) {
            refSub.placeholder = 'যেমন: 28542(T), 28544(T)';
            refSub.focus();
        }
    }
};

function getFormDataFromSingleResult() {
    var roll = document.getElementById('srRoll').value.trim();
    var semester = document.getElementById('srSemester').value;
    var regulation = document.getElementById('srRegulation').value;
    var status = document.getElementById('srStatus').value;
    var refSub = document.getElementById('srRefSub').value.trim();

    var gpas = {};
    for (var i = 1; i <= 8; i++) {
        var val = (document.getElementById('srGpa' + i).value || '').trim();
        if (val) gpas['gpa' + i] = val;
    }

    return {
        roll: roll,
        semester: semester,
        regulation: regulation,
        status: status,
        gpas: gpas,
        refSub: refSub
    };
}

window.saveSingleResultHandler = function() {
    var data = getFormDataFromSingleResult();
    if (!data.roll) {
        showToast('⚠️ রোল নম্বর দেওয়া আবশ্যক!', 'warning');
        return;
    }

    var res = BTEBStorage.addOrUpdateStudent(data);
    if (res && res.success) {
        showToast('✅ রোল ' + data.roll + '-এর ফলাফল সফলভাবে ডেটাবেজে সংরক্ষিত হয়েছে!', 'success');
        clearSingleResultForm();
        renderSavedSheets();
        renderGlobalStats();
    } else {
        showToast('❌ ফলাফল সেভ করা যায়নি: ' + (res.error || 'অজানা ত্রুটি'), 'danger');
    }
};

window.updateExistingStudentHandler = function() {
    var data = getFormDataFromSingleResult();
    if (!data.roll) {
        showToast('⚠️ রোল নম্বর দেওয়া আবশ্যক!', 'warning');
        return;
    }

    var res = BTEBStorage.addOrUpdateStudent(data);
    if (res && res.success) {
        showToast('✅ রোল ' + data.roll + '-এর ফলাফল সফলভাবে আপডেট করা হয়েছে!', 'success');
        clearSingleResultForm();
        renderSavedSheets();
        renderGlobalStats();
    } else {
        showToast('❌ ফলাফল আপডেট করা যায়নি: ' + (res.error || 'অজানা ত্রুটি'), 'danger');
    }
};

window.deleteCurrentStudentHandler = function() {
    var roll = document.getElementById('srRoll').value.trim() || document.getElementById('editingExistingRoll').value.trim();
    if (!roll) {
        showToast('⚠️ কোনো রোল নম্বর পাওয়া যায়নি!', 'warning');
        return;
    }

    if (confirm('আপনি কি নিশ্চিতভাবে রোল ' + roll + '-এর ফলাফল সম্পূর্ণ মুছে ফেলতে চান?')) {
        var res = BTEBStorage.deleteStudent(roll);
        if (res && res.success) {
            showToast('🗑️ রোল ' + roll + '-এর ফলাফল সফলভাবে মুছে ফেলা হয়েছে!', 'info');
            clearSingleResultForm();
            renderSavedSheets();
            renderGlobalStats();
        } else {
            showToast('⚠️ ফলাফল মোছা সম্ভব হয়নি!', 'warning');
        }
    }
};

window.quickDeleteStudentHandler = function() {
    var rollInput = document.getElementById('quickDeleteRollInput');
    var roll = rollInput ? rollInput.value.trim() : '';

    if (!roll) {
        showToast('⚠️ অনুগ্রহ করে যে রোলটি মুছতে চান তা লিখুন!', 'warning');
        if (rollInput) rollInput.focus();
        return;
    }

    if (confirm('সতর্কতা: আপনি কি নিশ্চিতভাবে রোল ' + roll + '-এর ফলাফল মুছে ফেলতে চান?')) {
        var res = BTEBStorage.deleteStudent(roll);
        if (res && res.success) {
            showToast('🗑️ রোল ' + roll + '-এর ফলাফল সফলভাবে মুছে ফেলা হয়েছে!', 'info');
            if (rollInput) rollInput.value = '';
            renderSavedSheets();
            renderGlobalStats();
        } else {
            showToast('⚠️ রোল ' + roll + ' খুঁজে পাওয়া যায়নি!', 'warning');
        }
    }
};

window.confirmDeleteAllResults = function() {
    if (confirm('⚠️ চরম সতর্কবার্তা: আপনি কি সত্যিই সকল সেভ করা রেজাল্ট শীট এবং ফলাফল মুছে ফেলতে চান?')) {
        if (confirm('এই কাজটি ফিরিয়ে আনা যাবে না! নিশ্চিত করার জন্য ওকে চাপুন:')) {
            BTEBStorage.deleteAllSheets();
            renderSavedSheets();
            renderGlobalStats();
            clearSingleResultForm();
            showToast('🗑️ সকল রেজাল্ট সফলভাবে মুছে ফেলা হয়েছে!', 'danger');
        }
    }
};

// ==========================================================================
// Step 8: Client-Side PDF Auto-Parsing Engine (PDF.js)
// ==========================================================================

async function extractTextFromPdf(file, onProgress) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js লাইব্রেরি পাওয়া যায়নি। ইন্টারনেট সংযোগ চেক করুন।');
    }

    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch (e) {}

    var arrayBuffer = await file.arrayBuffer();
    var pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var totalPages = pdfDoc.numPages;
    var fullText = '';
    var t0 = performance.now();

    for (var pageNum = 1; pageNum <= totalPages; pageNum++) {
        var page = await pdfDoc.getPage(pageNum);
        var textContent = await page.getTextContent();

        var lastY = null;
        var pageText = '';

        for (var i = 0; i < textContent.items.length; i++) {
            var item = textContent.items[i];
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += '\n';
            } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
                pageText += ' ';
            }
            pageText += item.str;
            lastY = item.transform[5];
        }

        fullText += (pageNum > 1 ? '\n\n' : '') + pageText;

        if (onProgress) {
            var percent = Math.round((pageNum / totalPages) * 100);
            var elapsedMs = Math.round(performance.now() - t0);
            var pagesPerSec = elapsedMs > 0 ? (pageNum / (elapsedMs / 1000)).toFixed(1) : 0;
            onProgress({
                currentPage: pageNum,
                totalPages: totalPages,
                percent: percent,
                elapsedMs: elapsedMs,
                pagesPerSec: pagesPerSec
            });
        }
    }

    var totalElapsed = ((performance.now() - t0) / 1000).toFixed(1);
    return {
        text: fullText,
        totalPages: totalPages,
        elapsedSeconds: totalElapsed
    };
}

window.handlePdfFileSelected = function(e) {
    if (e.target.files && e.target.files.length > 0) {
        window.handlePdfFile(e.target.files[0]);
    }
};

window.handlePdfFile = async function(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        showToast('⚠️ অনুগ্রহ করে একটি সঠিক PDF (.pdf) ফাইল নির্বাচন করুন!', 'warning');
        return;
    }

    var nameDisplay = document.getElementById('pdfFileNameDisplay');
    if (nameDisplay) {
        nameDisplay.textContent = '📑 ' + file.name + ' (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB)';
        nameDisplay.classList.remove('hidden');
    }

    var progWrap = document.getElementById('pdfProgressWrapper');
    var progFill = document.getElementById('pdfProgressBarFill');
    var progPct = document.getElementById('pdfProgressPct');
    var pageStatus = document.getElementById('pdfPageStatus');
    var speedStatus = document.getElementById('pdfSpeedStatus');
    var statsGrid = document.getElementById('pdfStatsGrid');

    if (progWrap) progWrap.classList.remove('hidden');
    if (statsGrid) statsGrid.classList.add('hidden');
    if (progFill) progFill.style.width = '0%';
    if (progPct) progPct.textContent = '0%';

    try {
        var extractResult = await extractTextFromPdf(file, function(prog) {
            if (progFill) progFill.style.width = prog.percent + '%';
            if (progPct) progPct.textContent = prog.percent + '%';
            if (pageStatus) {
                pageStatus.textContent = 'Reading page ' + prog.currentPage.toLocaleString() + ' of ' + prog.totalPages.toLocaleString() + '... (' + prog.percent + '%)';
            }
            if (speedStatus) {
                speedStatus.textContent = 'গতি: ' + prog.pagesPerSec + ' পৃষ্ঠা/সেকেন্ড | সময়: ' + (prog.elapsedMs / 1000).toFixed(1) + 's';
            }
        });

        if (progFill) progFill.style.width = '100%';
        if (progPct) progPct.textContent = '100%';
        if (pageStatus) {
            pageStatus.textContent = '✅ মোট ' + extractResult.totalPages.toLocaleString() + ' পৃষ্ঠা সফলভাবে স্ক্যান হয়েছে!';
        }

        // Parse extracted text with BTEBParser
        var parsedStudents = BTEBParser.parseAll(extractResult.text);

        if (parsedStudents.length === 0) {
            showToast('⚠️ পিডিএফ থেকে কোনো রোল নম্বর ডিটেক্ট করা যায়নি! ফাইল ফরম্যাট চেক করুন।', 'warning');
            return;
        }

        var passedCount = parsedStudents.filter(function(s){ return s.status === 'Passed'; }).length;
        var referredCount = parsedStudents.filter(function(s){ return s.status === 'Referred'; }).length;
        var droppedCount = parsedStudents.filter(function(s){ return s.status === 'Dropped Out'; }).length;

        // Auto Save to BTEBStorage
        var sem = document.getElementById('pdfSemester') ? document.getElementById('pdfSemester').value : '5';
        var reg = document.getElementById('pdfRegulation') ? document.getElementById('pdfRegulation').value : '2022';
        var year = document.getElementById('pdfExamYear') ? document.getElementById('pdfExamYear').value : '2024';

        BTEBStorage.saveSheet({
            semester: sem,
            regulation: reg,
            examYear: year,
            rawText: extractResult.text,
            studentCount: parsedStudents.length,
            passedCount: passedCount,
            referredCount: referredCount,
            droppedCount: droppedCount
        });

        // Update Stats Grid
        if (statsGrid) statsGrid.classList.remove('hidden');
        var cntTotal = document.getElementById('pdfCntTotal');
        var cntPassed = document.getElementById('pdfCntPassed');
        var cntReferred = document.getElementById('pdfCntReferred');
        var cntDropped = document.getElementById('pdfCntDropped');
        var scanTime = document.getElementById('pdfScanTime');

        if (cntTotal) cntTotal.textContent = parsedStudents.length.toLocaleString();
        if (cntPassed) cntPassed.textContent = passedCount.toLocaleString();
        if (cntReferred) cntReferred.textContent = referredCount.toLocaleString();
        if (cntDropped) cntDropped.textContent = droppedCount.toLocaleString();
        if (scanTime) scanTime.textContent = extractResult.elapsedSeconds + 's (' + extractResult.totalPages + 'p)';

        // Also update text area & render lists
        var bulkTa = document.getElementById('bulkResultInput');
        if (bulkTa) {
            bulkTa.value = extractResult.text;
            updatePreviewStats();
        }

        renderSavedSheets();
        renderGlobalStats();

        showToast('🎉 অভিনন্দন! ' + parsedStudents.length.toLocaleString() + 'টি রোল নম্বর পিডিএফ থেকে সফলভাবে পার্স ও সেভ হয়েছে!', 'success');

    } catch (err) {
        console.error('PDF parsing error:', err);
        showToast('❌ পিডিএফ প্রসেসিং ব্যর্থ: ' + err.message, 'danger');
    }
};
