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
    checkDatabaseInstituteHealth();

    async function checkDatabaseInstituteHealth() {
        if (typeof BTEBStorage === 'undefined' || !BTEBStorage.getDatabaseHealthAsync) return;
        try {
            var health = await BTEBStorage.getDatabaseHealthAsync();
            renderGlobalStats();
            if (health && health.totalStudents > 0 && health.missingInstituteCount > 0) {
                var existingWarn = document.getElementById('staleInstituteRepairBanner');
                if (!existingWarn && savedSheetsContainer && savedSheetsContainer.parentElement) {
                    var banner = document.createElement('div');
                    banner.id = 'staleInstituteRepairBanner';
                    banner.style.cssText = 'margin:0 0 16px 0;padding:14px 16px;border-radius:10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);color:#b45309;font-size:13.5px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;';
                    banner.innerHTML = '<div><strong>⚠️ পুরনো ডেটাবেস সতর্কতা:</strong> <span>'
                        + health.missingInstituteCount.toLocaleString() + 'টি রোলের ইনস্টিটিউট ও EIIN অনুপস্থিত রয়েছে। পুনরায় অফিসিয়াল PDF আপলোড করুন অথবা আপডেটেড ব্যাকআপ ইমপোর্ট করুন।</span></div>'
                        + '<button type="button" id="repairWipeBtn" class="btn btn-outline" style="border-color:#d97706;color:#b45309;font-weight:600;padding:6px 12px;font-size:12.5px;">🗑️ পুরনো ডেটা মুছে নতুন আপলোড করুন</button>';
                    savedSheetsContainer.parentElement.insertBefore(banner, savedSheetsContainer);
                    var wipeBtn = document.getElementById('repairWipeBtn');
                    if (wipeBtn) {
                        wipeBtn.addEventListener('click', async function () {
                            if (confirm('পুরনো ইনস্টিটিউট-বিহীন ডেটাবেস মুছে ফেলতে চান? মুছে ফেলার পর পুনরায় অফিসিয়াল PDF আপলোড করুন।')) {
                                await BTEBStorage.deleteAllSheets();
                                banner.remove();
                                renderGlobalStats();
                                renderSavedSheets();
                                showToast('🗑️ পুরনো ডেটা মুছে ফেলা হয়েছে। এখন নতুন BTEB PDF আপলোড করুন।', 'warning');
                            }
                        });
                    }
                }
            }
        } catch (e) {}
    }

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
                window.handlePdfBatch(Array.from(files));
            }
        }, false);

        pdfDropZone.addEventListener('click', function (e) {
            if (e.target && (e.target.id === 'pdfFileInput' || e.target.tagName === 'BUTTON')) return;
            var fi = document.getElementById('pdfFileInput');
            if (fi) {
                fi.value = null;
                fi.click();
            }
        });
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
            var selectedSem = semesterSelect ? semesterSelect.value : '5';
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
                async function onComplete(res) {
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
                        progressSpeedText.textContent = 'মোট সময়: ' + res.elapsedMs + 'ms';
                    }

                    // Save to BTEBStorage & Database with priority 5 (pasted)
                    await BTEBStorage.saveSheetAsync({
                        fileName: 'কপি-পেস্ট রেজাল্ট শিট (' + (semesterSelect && semesterSelect.selectedIndex >= 0 ? semesterSelect.options[semesterSelect.selectedIndex].text : 'সেমিস্টার ' + selectedSem) + ')',
                        semester: selectedSem,
                        regulation: regulationSelect.value,
                        examYear: examYearInput.value,
                        rawText: rawText,
                        source: 'pasted',
                        priority: 5,
                        studentCount: res.total,
                        passedCount: res.passedCount,
                        referredCount: res.referredCount,
                        droppedCount: res.droppedCount,
                        students: res.results
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
                            '✅ সফলভাবে সেভ হয়েছে! মোট ' + res.total.toLocaleString() + 'টি রোল ডেটাবেসে সেভ করা হয়েছে। (উত্তীর্ণ: ' + res.passedCount + ', রেফার্ড: ' + res.referredCount + ', ড্রপ: ' + res.droppedCount + ')',
                            'success'
                        );

                        renderGlobalStats();
                        renderSavedSheets();
                    }, 400);
                },
                selectedSem,
                400 // 400 rolls per frame chunk
            );
        });
    }

    // ─── Step 5: Export Optimized JSON for Hosting ───
    if (exportOptimizedBtn) {
        exportOptimizedBtn.addEventListener('click', async function () {
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

            // Export combined data from IndexedDB + LocalStorage + Memory
            var allStudentsMap = (typeof BTEBStorage !== 'undefined' && BTEBStorage.getAllStudentsAsync)
                ? await BTEBStorage.getAllStudentsAsync()
                : {};
            var allRolls = Object.keys(allStudentsMap);
            var parsed = allRolls.length > 0
                ? allRolls.map(function (r) { return allStudentsMap[r]; })
                : BTEBParser.parseAll(BTEBStorage.getCombinedRawText());

            if (parsed.length === 0) {
                showToast('⚠️ কোনো রেজাল্ট ডেটা সংরক্ষিত নেই!', 'warning');
                return;
            }

            var optMap = {};
            parsed.forEach(function (student) {
                var semCompact = {};
                if (student.semesters) {
                    for (var s in student.semesters) {
                        semCompact[s] = student.semesters[s].value;
                    }
                }
                optMap[student.roll] = {
                    s: student.status === 'Passed' ? 'P' : (student.status === 'Referred' ? 'R' : 'D'),
                    g: semCompact,
                    r: (student.referredSubjects || []).map(function (sub) { return sub.raw || sub.code || sub; }),
                    ic: student.institute_code || student.instituteCode || null,
                    in: student.institute_name || student.instituteName || null
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
            reader.onload = async function (ev) {
                var result = BTEBStorage.importFromJSONAsync
                    ? await BTEBStorage.importFromJSONAsync(ev.target.result)
                    : BTEBStorage.importFromJSON(ev.target.result);
                if (result.success) {
                    showToast('✅ সফলভাবে ইমপোর্ট হয়েছে! ' + result.studentCount + 'টি রোল, ' + result.sheetCount + 'টি শীট ও ' + result.materialCount + 'টি মেটেরিয়াল লোড করা হয়েছে।', 'success');
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
    var deleteAllSheetsMainBtn = document.getElementById('deleteAllSheetsMainBtn');
    var exportDatabaseJsonBtn = document.getElementById('exportDatabaseJsonBtn');
    var exportDatabaseJsBtn = document.getElementById('exportDatabaseJsBtn');

    if (exportDatabaseJsBtn) {
        exportDatabaseJsBtn.addEventListener('click', async function () {
            await BTEBStorage.exportResultsDatabaseJs();
            showToast('💾 results_database.js ফাইল ডাউনলোড সম্পন্ন হয়েছে!', 'success');
        });
    }

    if (exportDatabaseJsonBtn) {
        exportDatabaseJsonBtn.addEventListener('click', async function () {
            await BTEBStorage.exportDatabaseAsJSON();
            showToast('📥 রেজাল্ট ডেটাবেস ফাইল (.json) ডাউনলোড হয়েছে!', 'success');
        });
    }

    if (deleteAllSheetsMainBtn) {
        deleteAllSheetsMainBtn.addEventListener('click', async function () {
            var stats = BTEBStorage.getTotalStats();
            if (stats.sheetCount === 0 && stats.totalStudents === 0) {
                showToast('ℹ️ মুছে ফেলার মতো কোনো রেজাল্ট ডেটাবেসে নেই।', 'info');
                return;
            }
            if (confirm('⚠️ চূড়ান্ত সতর্কতা: আপনি কি নিশ্চিত যে সমস্ত রেজাল্ট ও ডেটাবেস মুছে ফেলতে চান? এটি মুছে ফেললে কোনো রোল নম্বর আর সার্চে আসবে না।')) {
                await BTEBStorage.deleteAllSheets();
                showToast('🗑️ ডেটাবেসের সমস্ত রেজাল্ট ও ফাইল সম্পূর্ণ মুছে ফেলা হয়েছে।', 'warning');
                renderGlobalStats();
                renderSavedSheets();
            }
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async function () {
            var sheetCount = BTEBStorage.getAllSheets().length;
            if (sheetCount === 0) {
                showToast('ℹ️ মুছে ফেলার মতো কোনো সেভ করা শীট নেই।', 'info');
                return;
            }
            if (confirm('⚠️ সতর্কতা: সকল সেভ করা রেজাল্ট শীট (' + sheetCount + 'টি) এবং ডাটাবেসের সমস্ত স্টুডেন্ট রেজাল্ট স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?')) {
                await BTEBStorage.deleteAllSheets();
                showToast('🗑️ সকল রেজাল্ট শীট ও ডেটাবেস সম্পূর্ণ খালি করা হয়েছে।', 'warning');
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
        var vStats = (typeof BTEBVisitor !== 'undefined') ? BTEBVisitor.getStats() : null;

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
            '</div>' +
            (vStats ? (
                '<div class="dash-stat-card" style="cursor:pointer;" onclick="switchAdminTab(\'tab-visitors\')" title="ভিজিটর লগ দেখুন">' +
                    '<div class="dash-stat-icon" style="background:#f5f3ff;color:#7c3aed">👁️</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(vStats.totalVisits || 0).toLocaleString() + '</span><span class="dash-stat-label">মোট ভিজিটর</span></div>' +
                '</div>' +
                '<div class="dash-stat-card" style="cursor:pointer;" onclick="switchAdminTab(\'tab-visitors\')" title="আজকের ভিজিটর লগ দেখুন">' +
                    '<div class="dash-stat-icon" style="background:#ecfeff;color:#0891b2">📅</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(vStats.todayVisits || 0).toLocaleString() + '</span><span class="dash-stat-label">আজকের ভিজিটর</span></div>' +
                '</div>'
            ) : '');
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

        for (var i = 0; i < sheets.length; i++) {
            var s = sheets[i];
            var semLabel = s.semester ? (semNames[s.semester] || s.semester) + ' সেমিস্টার' : 'সকল সেমিস্টার';
            var savedDate = new Date(s.savedAt);
            var dateStr = savedDate.toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
            var timeStr = savedDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
            var passRate = s.studentCount > 0 ? ((s.passedCount / s.studentCount) * 100).toFixed(0) : 0;
            var displayFileName = s.fileName || ('BTEB_Result_' + semLabel + '.pdf');

            html +=
                '<div class="sheet-card" style="border:1px solid var(--border-color);border-radius:10px;padding:14px;margin-bottom:12px;background:var(--bg-card);">' +
                    '<div class="sheet-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
                        '<div class="sheet-meta-left" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                            '<span style="font-size:16px;">📄</span>' +
                            '<strong style="font-size:14px;color:var(--text-main);">' + displayFileName + '</strong>' +
                            '<span class="sheet-sem-badge">' + semLabel + '</span>' +
                            '<span class="sheet-reg-badge">প্রবিধান ' + s.regulation + '</span>' +
                            '<span class="sheet-year-badge">' + s.examYear + '</span>' +
                        '</div>' +
                        '<div style="display:flex;gap:6px;">' +
                            '<button type="button" class="btn btn-outline btn-sheet-download" data-sheet-id="' + s.id + '" style="font-size:12px;padding:4px 10px;" title="এই ফাইলের ডেটা ডাউনলোড করুন">📥 ডাউনলোড</button>' +
                            '<button type="button" class="btn-sheet-delete" data-sheet-id="' + s.id + '" title="এই ফাইলটি মুছে ফেলুন" style="background:rgba(239,68,68,0.1);color:#ef4444;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;">🗑️ ডিলিট</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sheet-card-body">' +
                        '<div class="sheet-stat-pills" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
                            '<span class="sheet-pill" style="background:rgba(0,0,0,0.05);padding:4px 10px;border-radius:15px;font-size:12px;">👥 মোট: <strong>' + s.studentCount + '</strong></span>' +
                            '<span class="sheet-pill pill-green" style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 10px;border-radius:15px;font-size:12px;">✅ উত্তীর্ণ: ' + s.passedCount + '</span>' +
                            '<span class="sheet-pill pill-amber" style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 10px;border-radius:15px;font-size:12px;">⚠️ রেফার্ড: ' + s.referredCount + '</span>' +
                            '<span class="sheet-pill pill-red" style="background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 10px;border-radius:15px;font-size:12px;">❌ ড্রপ: ' + s.droppedCount + '</span>' +
                            '<span class="sheet-pill pill-blue" style="background:rgba(59,130,246,0.1);color:#3b82f6;padding:4px 10px;border-radius:15px;font-size:12px;">📊 পাসের হার: ' + passRate + '%</span>' +
                        '</div>' +
                        '<div class="sheet-date" style="font-size:12px;color:var(--text-muted);">📅 আপলোড ও সেভ: ' + dateStr + ' | 🕐 ' + timeStr + ' | <span style="color:#10b981;">🟢 স্টুডেন্ট পেজে লাইভ সক্রিয়</span></div>' +
                    '</div>' +
                '</div>';
        }

        html += '</div>';
        savedSheetsContainer.innerHTML = html;

        var downloadBtns = savedSheetsContainer.querySelectorAll('.btn-sheet-download');
        for (var d = 0; d < downloadBtns.length; d++) {
            downloadBtns[d].addEventListener('click', function () {
                var sId = this.getAttribute('data-sheet-id');
                BTEBStorage.exportDatabaseAsJSON();
                showToast('📥 ফাইল ডাউনলোড সম্পন্ন হয়েছে!', 'info');
            });
        }

        var deleteBtns = savedSheetsContainer.querySelectorAll('.btn-sheet-delete');
        for (var j = 0; j < deleteBtns.length; j++) {
            deleteBtns[j].addEventListener('click', async function () {
                var sheetId = this.getAttribute('data-sheet-id');
                if (confirm('এই রেজাল্ট শীটটি মুছে ফেলতে চান?')) {
                    await BTEBStorage.deleteSheet(sheetId);
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

// Failed login attempt tracking for brute-force defense
var failedLoginAttempts = 0;
var loginLockUntil = 0;

function checkAuthStatus() {
    var overlay = document.getElementById('adminAuthOverlay');
    var badge = document.getElementById('adminUserBadge');
    var creds = BTEBStorage.getAdminCredentials();

    if (badge) {
        badge.textContent = '👤 ' + (creds.username || 'sabbir12');
    }

    if (BTEBStorage.isAdminLoggedIn()) {
        document.body.classList.remove('admin-locked');
        if (overlay) overlay.classList.add('hidden');
    } else {
        document.body.classList.add('admin-locked');
        if (overlay) {
            overlay.classList.remove('hidden');
            var loginUserInput = document.getElementById('loginUsername');
            var loginPassInput = document.getElementById('loginPassword');
            if (loginPassInput) loginPassInput.value = '';
            if (loginUserInput) {
                setTimeout(function(){ 
                    if (!loginUserInput.value) {
                        loginUserInput.focus();
                    } else if (loginPassInput) {
                        loginPassInput.focus();
                    }
                }, 150);
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

window.handleAdminLoginSubmit = function() {
    var now = Date.now();
    if (loginLockUntil && now < loginLockUntil) {
        var remainSec = Math.ceil((loginLockUntil - now) / 1000);
        var errBanner = document.getElementById('authErrorBanner');
        var errText = document.getElementById('authErrorMsg');
        if (errBanner) {
            errBanner.classList.remove('hidden');
            if (errText) errText.textContent = '🔒 অতিরিক্ত ভুল চেষ্টার কারণে লগইন ' + remainSec + ' সেকেন্ডের জন্য লক রয়েছে!';
        }
        return;
    }

    var userEl = document.getElementById('loginUsername');
    var passEl = document.getElementById('loginPassword');
    var errBanner = document.getElementById('authErrorBanner');
    var errText = document.getElementById('authErrorMsg');

    var username = userEl ? userEl.value.trim() : '';
    var password = passEl ? passEl.value.trim() : '';

    if (!username || !password) {
        if (errBanner) {
            errBanner.classList.remove('hidden');
            if (errText) errText.textContent = 'অনুগ্রহ করে অ্যাডমিন ইউজারনেম ও পাসওয়ার্ড দুটিই লিখুন!';
        }
        return;
    }

    var isValid = BTEBStorage.verifyAdminCredentials(username, password);

    if (isValid) {
        failedLoginAttempts = 0;
        loginLockUntil = 0;
        if (errBanner) errBanner.classList.add('hidden');
        BTEBStorage.setAdminLoggedIn(true);
        checkAuthStatus();
        if (passEl) passEl.value = '';
        if (window.showToast) {
            window.showToast('✅ স্বাগতম! সফলভাবে অ্যাডমিন প্যানেলে প্রবেশ করেছেন।', 'success');
        }
    } else {
        failedLoginAttempts++;
        if (failedLoginAttempts >= 5) {
            loginLockUntil = Date.now() + (30 * 1000); // Lock for 30s
            if (errBanner) {
                errBanner.classList.remove('hidden');
                if (errText) errText.textContent = '❌ পরপর ৫ বার ভুল পাসওয়ার্ড! নিরাপত্তার স্বার্থে ৩০ সেকেন্ড অপেক্ষা করুন।';
            }
        } else {
            if (errBanner) {
                errBanner.classList.remove('hidden');
                if (errText) errText.textContent = '❌ ভুল ইউজারনেম বা পাসওয়ার্ড! সঠিক পাসওয়ার্ড ছাড়া অ্যাডমিন প্যানেলে প্রবেশ সম্পূর্ণ নিষিদ্ধ।';
            }
        }
        if (passEl) {
            passEl.value = '';
            passEl.focus();
        }
    }
};

window.handleAdminLogout = function() {
    if (confirm('আপনি কি অ্যাডমিন প্যানেল থেকে লগআউট করে সম্পূর্ণ লক করতে চান?')) {
        BTEBStorage.setAdminLoggedIn(false);
        checkAuthStatus();
        if (window.showToast) {
            window.showToast('🚪 সফলভাবে লগআউট সম্পন্ন হয়েছে। অ্যাডমিন প্যানেল লক করা হয়েছে।', 'info');
        }
    }
};

// Auto-Lock Session after 30 minutes of user inactivity
(function() {
    var inactivityTimer = null;
    var INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

    function resetInactivityTimer() {
        if (!BTEBStorage.isAdminLoggedIn()) return;
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(function() {
            if (BTEBStorage.isAdminLoggedIn()) {
                BTEBStorage.setAdminLoggedIn(false);
                checkAuthStatus();
                if (window.showToast) {
                    window.showToast('⏱️ দীর্ঘক্ষণ নিষ্ক্রিয় থাকার কারণে নিরাপত্তার স্বার্থে অ্যাডমিন প্যানেল স্বয়ংক্রিয় লক করা হয়েছে।', 'warning');
                }
            }
        }, INACTIVITY_LIMIT_MS);
    }

    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
})();

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

window.searchStudentForEdit = async function() {
    var searchInput = document.getElementById('searchEditRoll');
    var roll = searchInput ? searchInput.value.trim() : '';

    if (!roll) {
        showToast('⚠️ অনুগ্রহ করে রোল নম্বর লিখুন!', 'warning');
        if (searchInput) searchInput.focus();
        return;
    }

    var foundRaw = BTEBStorage.getStudentAsync ? await BTEBStorage.getStudentAsync(roll) : BTEBStorage.findStudentInSheets(roll);
    var found = foundRaw ? (foundRaw.student ? foundRaw : { student: foundRaw, sheet: (BTEBStorage.getAllSheets().find(function (sh) { return sh.id === foundRaw.sheetId; }) || null) }) : null;

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
// Step 8: Multi-PDF Batch Queue & Chunked Stream Parsing Engine (PDF.js)
// Zero-Freezing, Non-Blocking, 1000+ Page Support with Instant IndexedDB Sync
// ==========================================================================

async function extractAndParsePdfStream(file, defaultSemester, onProgress) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js লাইব্রেরি পাওয়া যায়নি। ইন্টারনেট সংযোগ চেক করুন।');
    }

    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch (e) {}

    var arrayBuffer = await file.arrayBuffer();
    var loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        stopAtErrors: false
    });
    var pdfDoc = await loadingTask.promise;
    var totalPages = pdfDoc.numPages;
    var t0 = performance.now();

    var allStudentsMap = new Map();
    var sampleRawText = '';
    var activeInstituteContext = { institute_code: null, institute_name: null };

    for (var pageNum = 1; pageNum <= totalPages; pageNum++) {
        var page = await pdfDoc.getPage(pageNum);
        var textContent = await page.getTextContent({ normalizeWhitespace: true });

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

        // CRITICAL: Cleanup page canvas representation immediately to avoid browser out-of-memory!
        page.cleanup();

        // Snapshot start-of-page active institute so multi-line page parse starts with the same state
        var pageStartInstitute = {
            institute_code: activeInstituteContext.institute_code,
            institute_name: activeInstituteContext.institute_name
        };

        // 1. Line-by-line parsing
        var lines = pageText.split('\n');
        for (var ln = 0; ln < lines.length; ln++) {
            var lineStr = lines[ln].trim();
            if (lineStr.length >= 6) {
                var lineStudents = BTEBParser.parseAll(lineStr, defaultSemester, activeInstituteContext);
                for (var ls = 0; ls < lineStudents.length; ls++) {
                    var lst = lineStudents[ls];
                    lst.source = 'pdf';
                    lst.sourcePriority = 10;
                    lst.sources = ['pdf'];
                    lst.sourceLabel = '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)';
                    allStudentsMap.set(lst.roll, lst);
                }
            }
        }

        // 2. Also run page-level parse to catch multi-line entries
        var pageStudents = BTEBParser.parseAll(pageText, defaultSemester, pageStartInstitute);
        for (var s = 0; s < pageStudents.length; s++) {
            var st = pageStudents[s];
            st.source = 'pdf';
            st.sourcePriority = 10;
            st.sources = ['pdf'];
            st.sourceLabel = '📄 অফিসিয়াল PDF থেকে ভেরিফাইড (সর্বোচ্চ অগ্রাধিকারপ্রাপ্ত)';
            if (!allStudentsMap.has(st.roll)) {
                allStudentsMap.set(st.roll, st);
            }
        }

        // Sync end-of-page institute state for the next page
        activeInstituteContext.institute_code = pageStartInstitute.institute_code;
        activeInstituteContext.institute_name = pageStartInstitute.institute_name;

        if (pageNum <= 50) {
            sampleRawText += (pageNum > 1 ? '\n\n' : '') + pageText;
        }

        if (onProgress) {
            var percent = Math.round((pageNum / totalPages) * 100);
            var elapsedMs = Math.round(performance.now() - t0);
            var pagesPerSec = elapsedMs > 0 ? (pageNum / (elapsedMs / 1000)).toFixed(1) : 0;
            onProgress({
                currentPage: pageNum,
                totalPages: totalPages,
                percent: percent,
                elapsedMs: elapsedMs,
                pagesPerSec: pagesPerSec,
                studentsFoundSoFar: allStudentsMap.size
            });
        }

        // Non-blocking yield to browser main event loop so UI paints at 60fps and never freezes
        await new Promise(function(resolve) { setTimeout(resolve, 0); });
    }

    try {
        if (pdfDoc.destroy) await pdfDoc.destroy();
        if (pdfDoc.cleanup) pdfDoc.cleanup();
    } catch (e) {}

    var studentsArray = Array.from(allStudentsMap.values());
    var totalElapsed = ((performance.now() - t0) / 1000).toFixed(1);

    return {
        students: studentsArray,
        totalPages: totalPages,
        elapsedSeconds: totalElapsed,
        rawText: sampleRawText
    };
}

window.handlePdfFilesSelected = function(e) {
    if (e.target.files && e.target.files.length > 0) {
        window.handlePdfBatch(Array.from(e.target.files));
    }
};

window.handlePdfFileSelected = function(e) {
    if (e.target.files && e.target.files.length > 0) {
        window.handlePdfBatch(Array.from(e.target.files));
    }
};

window.handlePdfBatch = async function(fileList) {
    var files = fileList.filter(function(f) {
        return f && f.name && f.name.toLowerCase().endsWith('.pdf');
    });

    if (files.length === 0) {
        showToast('⚠️ অনুগ্রহ করে এক বা একাধিক সঠিক PDF (.pdf) ফাইল নির্বাচন করুন!', 'warning');
        return;
    }

    var nameDisplay = document.getElementById('pdfFileNameDisplay');
    if (nameDisplay) {
        nameDisplay.textContent = '📑 মোট ' + files.length + 'টি PDF ফাইল প্রসেসিং কিউতে যুক্ত হয়েছে।';
        nameDisplay.classList.remove('hidden');
    }

    var progWrap = document.getElementById('pdfProgressWrapper');
    var progFill = document.getElementById('pdfProgressBarFill');
    var progPct = document.getElementById('pdfProgressPct');
    var pageStatus = document.getElementById('pdfPageStatus');
    var speedStatus = document.getElementById('pdfSpeedStatus');
    var progTitle = document.getElementById('pdfProgressTitle');
    var statsGrid = document.getElementById('pdfStatsGrid');
    var queueWrapper = document.getElementById('pdfQueueWrapper');
    var queueList = document.getElementById('pdfQueueList');

    if (progWrap) progWrap.classList.remove('hidden');
    if (queueWrapper) queueWrapper.classList.remove('hidden');
    if (statsGrid) statsGrid.classList.remove('hidden');
    if (progFill) progFill.style.width = '0%';
    if (progPct) progPct.textContent = '0%';

    // Build Queue List in UI
    if (queueList) {
        var qHtml = '';
        files.forEach(function(f, idx) {
            qHtml += '<div id="queueItem_' + idx + '" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05);">';
            qHtml += '  <span><strong>' + (idx + 1) + '.</strong> ' + f.name + ' (' + (f.size / (1024 * 1024)).toFixed(1) + ' MB)</span>';
            qHtml += '  <span id="queueBadge_' + idx + '" class="badge" style="background:rgba(0,0,0,0.06);color:var(--text-muted);font-size:11px;padding:2px 8px;border-radius:10px;">⏳ অপেক্ষমাণ</span>';
            qHtml += '</div>';
        });
        queueList.innerHTML = qHtml;
    }

    var sem = document.getElementById('pdfSemester') ? document.getElementById('pdfSemester').value : '5';
    var reg = document.getElementById('pdfRegulation') ? document.getElementById('pdfRegulation').value : '2022';
    var year = document.getElementById('pdfExamYear') ? document.getElementById('pdfExamYear').value : '2024';

    var totalFiles = files.length;
    var cumulativeStudents = 0;
    var cumulativePassed = 0;
    var cumulativeReferred = 0;
    var cumulativeDropped = 0;
    var cumulativePages = 0;
    var lastSavedStudents = [];
    var tBatchStart = performance.now();

    for (var k = 0; k < totalFiles; k++) {
        var curFile = files[k];
        var badgeEl = document.getElementById('queueBadge_' + k);
        if (badgeEl) {
            badgeEl.style.background = 'rgba(239,68,68,0.15)';
            badgeEl.style.color = '#ef4444';
            badgeEl.innerHTML = '<span class="spinner-btn" style="width:10px;height:10px;border-width:1.5px;display:inline-block;vertical-align:middle;margin-right:4px;"></span> স্ক্যান হচ্ছে...';
        }

        if (progTitle) {
            progTitle.textContent = 'Processing PDF ' + (k + 1) + ' of ' + totalFiles + ' — ' + curFile.name;
        }

        try {
            var extractResult = await extractAndParsePdfStream(curFile, sem, function(prog) {
                var fileContribution = (prog.percent / 100);
                var overallPercent = Math.min(100, Math.round(((k + fileContribution) / totalFiles) * 100));

                if (progFill) progFill.style.width = overallPercent + '%';
                if (progPct) progPct.textContent = overallPercent + '%';
                if (pageStatus) {
                    pageStatus.textContent = 'PDF ' + (k + 1) + ' of ' + totalFiles + ' — Page ' + prog.currentPage + ' / ' + prog.totalPages + ' (' + prog.percent + '%) | সর্বমোট রোল: ' + (cumulativeStudents + prog.studentsFoundSoFar).toLocaleString();
                }
                if (speedStatus) {
                    speedStatus.textContent = 'গতি: ' + prog.pagesPerSec + ' পৃষ্ঠা/সেকেন্ড | ব্রাউজার মেমোরি: সুরক্ষিত';
                }
            });

            var fileStudents = extractResult.students;
            var filePassed = fileStudents.filter(function(s){ return s.status === 'Passed'; }).length;
            var fileReferred = fileStudents.filter(function(s){ return s.status === 'Referred'; }).length;
            var fileDropped = fileStudents.filter(function(s){ return s.status === 'Dropped Out'; }).length;

            cumulativeStudents += fileStudents.length;
            cumulativePassed += filePassed;
            cumulativeReferred += fileReferred;
            cumulativeDropped += fileDropped;
            cumulativePages += extractResult.totalPages;
            lastSavedStudents = lastSavedStudents.concat(fileStudents.slice(0, 5));

            // Immediately persist this PDF sheet into IndexedDB & localStorage
            await BTEBStorage.saveSheetAsync({
                fileName: curFile.name,
                semester: sem,
                regulation: reg,
                examYear: year,
                rawText: extractResult.rawText,
                studentCount: fileStudents.length,
                passedCount: filePassed,
                referredCount: fileReferred,
                droppedCount: fileDropped,
                students: fileStudents,
                source: 'pdf',
                priority: 10
            });

            // Update queue item badge
            if (badgeEl) {
                badgeEl.style.background = 'rgba(16,185,129,0.15)';
                badgeEl.style.color = '#10b981';
                badgeEl.textContent = '✅ সম্পন্ন (' + fileStudents.length.toLocaleString() + ' রোল)';
            }

            // Update Live Stats Grid
            var cntTotal = document.getElementById('pdfCntTotal');
            var cntPassed = document.getElementById('pdfCntPassed');
            var cntReferred = document.getElementById('pdfCntReferred');
            var cntDropped = document.getElementById('pdfCntDropped');
            var scanTime = document.getElementById('pdfScanTime');

            if (cntTotal) cntTotal.textContent = cumulativeStudents.toLocaleString();
            if (cntPassed) cntPassed.textContent = cumulativePassed.toLocaleString();
            if (cntReferred) cntReferred.textContent = cumulativeReferred.toLocaleString();
            if (cntDropped) cntDropped.textContent = cumulativeDropped.toLocaleString();
            if (scanTime) {
                var totalSec = ((performance.now() - tBatchStart) / 1000).toFixed(1);
                scanTime.textContent = totalSec + 's (' + cumulativePages + 'p)';
            }

            renderSavedSheets();
            renderGlobalStats();

        } catch (err) {
            console.error('Error processing PDF in queue:', curFile.name, err);
            if (badgeEl) {
                badgeEl.style.background = 'rgba(239,68,68,0.2)';
                badgeEl.style.color = '#ef4444';
                badgeEl.textContent = '❌ ত্রুটি';
            }
        }
    }

    // Complete Progress Bar Animation
    if (progFill) progFill.style.width = '100%';
    if (progPct) progPct.textContent = '100%';
    if (progTitle) {
        progTitle.textContent = '✅ সকল PDF পার্স ও সেভ সম্পন্ন! (All ' + totalFiles + ' PDFs Indexed)';
    }
    if (pageStatus) {
        pageStatus.textContent = '🎉 সর্বমোট ' + totalFiles + 'টি ফাইলের ' + cumulativePages.toLocaleString() + ' পৃষ্ঠা সফলভাবে স্ক্যান ও স্থায়ী ডেটাবেসে সেভ হয়েছে!';
    }

    // Show Confirmation Box
    var saveActionWrap = document.getElementById('pdfSaveActionWrapper');
    var detectedCountEl = document.getElementById('pdfDetectedCountText');
    var confirmSaveBtn = document.getElementById('pdfConfirmSaveBtn');
    var saveSuccessAlert = document.getElementById('pdfSaveSuccessAlert');

    if (saveActionWrap) saveActionWrap.classList.remove('hidden');
    if (detectedCountEl) detectedCountEl.textContent = cumulativeStudents.toLocaleString();
    if (confirmSaveBtn) {
        confirmSaveBtn.innerHTML = '✅ ডেটাবেসে স্থায়ীভাবে সংরক্ষিত হয়েছে!';
        confirmSaveBtn.disabled = true;
    }
    if (saveSuccessAlert) {
        saveSuccessAlert.textContent = '✅ অভিনন্দন! ' + totalFiles + 'টি পিডিএফ থেকে সর্বমোট ' + cumulativeStudents.toLocaleString() + ' জন শিক্ষার্থীর রেজাল্ট সফলভাবে ডেটাবেসে সংরক্ষিত হয়েছে এবং স্টুডেন্ট পেজে উন্মুক্ত হয়েছে!';
        saveSuccessAlert.classList.remove('hidden');
    }

    // Populate Instant Verification & Preview List with Real Uploaded Rolls
    var previewContainer = document.getElementById('pdfParsedPreviewContainer');
    var sampleList = document.getElementById('pdfSampleRollsList');
    var testInput = document.getElementById('pdfTestRollInput');
    var testBtn = document.getElementById('pdfTestRollBtn');
    var testOut = document.getElementById('pdfTestRollOutput');

    if (previewContainer) previewContainer.classList.remove('hidden');

    if (sampleList && lastSavedStudents.length > 0) {
        var sampleHtml = '<table style="width:100%;border-collapse:collapse;text-align:left;">';
        sampleHtml += '<tr style="border-bottom:1px solid var(--border-color);background:rgba(0,0,0,0.03);font-weight:600;"><th style="padding:6px 10px;">রোল নং</th><th style="padding:6px 10px;">ফলাফল</th><th style="padding:6px 10px;">জিপিএ / বিষয়</th><th style="padding:6px 10px;">ইনস্টিটিউট (EIIN)</th></tr>';

        var sampleCount = Math.min(15, lastSavedStudents.length);
        for (var m = 0; m < sampleCount; m++) {
            var sRec = lastSavedStudents[m];
            var bgBadge = sRec.status === 'Passed' ? 'rgba(16,185,129,0.15)' : (sRec.status === 'Referred' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)');
            var clrBadge = sRec.status === 'Passed' ? '#10b981' : (sRec.status === 'Referred' ? '#f59e0b' : '#ef4444');

            var descText = '';
            if (sRec.status === 'Passed') {
                descText = Object.keys(sRec.semesters || {}).map(function(s){ return 'Sem ' + s + ': ' + (sRec.semesters[s].value || sRec.semesters[s]); }).join(', ') || 'উত্তীর্ণ';
            } else if (sRec.status === 'Referred') {
                descText = (sRec.referredSubjects || sRec.referred || []).map(function(sub){ return sub.raw || sub.code || sub; }).join(', ');
            } else {
                descText = 'সেমিস্টার ড্রপ';
            }

            var recInstName = sRec.institute_name || sRec.instituteName || '';
            var recInstCode = sRec.institute_code || sRec.instituteCode || '';
            var recInstDisplay = recInstName ? (recInstName + (recInstCode ? ' (EIIN: ' + recInstCode + ')' : '')) : (recInstCode ? 'EIIN: ' + recInstCode : '—');

            sampleHtml += '<tr style="border-bottom:1px solid var(--border-color);">';
            sampleHtml += '<td style="padding:6px 10px;font-family:monospace;font-weight:600;">' + sRec.roll + '</td>';
            sampleHtml += '<td style="padding:6px 10px;"><span style="background:' + bgBadge + ';color:' + clrBadge + ';padding:2px 8px;border-radius:10px;font-size:12px;font-weight:500;">' + (sRec.statusBangla || sRec.status) + '</span></td>';
            sampleHtml += '<td style="padding:6px 10px;color:var(--text-muted);">' + descText + '</td>';
            sampleHtml += '<td style="padding:6px 10px;color:var(--text-muted);font-size:12px;">' + recInstDisplay + '</td>';
            sampleHtml += '</tr>';
        }
        sampleHtml += '</table>';
        sampleList.innerHTML = sampleHtml;
    }

    // Instant Verification Test Handler
    if (testBtn && testInput && testOut) {
        testBtn.onclick = async function() {
            var queryRoll = BTEBParser.normalizeDigits(testInput.value.trim());
            if (!queryRoll) {
                testOut.classList.remove('hidden');
                testOut.style.background = 'rgba(239,68,68,0.1)';
                testOut.style.color = '#ef4444';
                testOut.textContent = 'অনুগ্রহ করে টেস্ট করার জন্য একটি রোল নম্বর লিখুন।';
                return;
            }

            var found = BTEBStorage.getStudentAsync ? await BTEBStorage.getStudentAsync(queryRoll) : BTEBStorage.getStudent(queryRoll);
            testOut.classList.remove('hidden');
            if (found) {
                var statusColor = found.status === 'Passed' ? '#10b981' : (found.status === 'Referred' ? '#f59e0b' : '#ef4444');
                var statusBg = found.status === 'Passed' ? 'rgba(16,185,129,0.1)' : (found.status === 'Referred' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)');
                testOut.style.background = statusBg;
                testOut.style.border = '1px solid ' + statusColor;
                testOut.style.color = statusColor;

                var gpaInfo = '';
                if (found.status === 'Passed') {
                    gpaInfo = ' | জিপিএ: ' + Object.keys(found.semesters || {}).map(function(s){ return 'সেমিস্টার ' + s + ': ' + (found.semesters[s].value || found.semesters[s]); }).join(', ');
                } else if (found.status === 'Referred') {
                    gpaInfo = ' | রেফার্ড বিষয়: ' + (found.referredSubjects || found.referred || []).map(function(s){ return s.raw || s.code || s; }).join(', ');
                }

                var fInstName = found.institute_name || found.instituteName || '';
                var fInstCode = found.institute_code || found.instituteCode || '';
                var instInfoText = fInstName ? (' | ইনস্টিটিউট: <strong>' + fInstName + '</strong>' + (fInstCode ? ' (EIIN: ' + fInstCode + ')' : '')) : '';

                testOut.innerHTML = '<strong>✓ রেজাল্ট পাওয়া গেছে!</strong> রোল: <strong>' + found.roll + '</strong> | স্ট্যাটাস: <strong>' + (found.statusBangla || found.status) + '</strong>' + gpaInfo + instInfoText + ' <br><a href="index.html" target="_blank" style="color:' + statusColor + ';text-decoration:underline;margin-top:4px;display:inline-block;">👉 স্টুডেন্ট পেজে সম্পূর্ণ মার্কশিট কার্ড দেখুন ➔</a>';
            } else {
                testOut.style.background = 'rgba(239,68,68,0.1)';
                testOut.style.border = '1px solid #ef4444';
                testOut.style.color = '#ef4444';
                testOut.textContent = '✕ রোল #' + queryRoll + ' এই পিডিএফ বা ডেটাবেসে পাওয়া যায়নি।';
            }
        };
    }

    var downloadJsonBtn = document.getElementById('pdfDownloadJsonBtn');
    if (downloadJsonBtn) {
        downloadJsonBtn.onclick = function() {
            BTEBStorage.exportDatabaseAsJSON();
        };
    }

    showToast('🎉 অভিনন্দন! ' + totalFiles + 'টি পিডিএফ থেকে ' + cumulativeStudents.toLocaleString() + ' জন শিক্ষার্থীর রেজাল্ট সফলভাবে ডেটাবেসে সংরক্ষিত হয়েছে!', 'success');
};

// Global single file alias
window.handlePdfFile = function(file) {
    if (file) {
        window.handlePdfBatch([file]);
    }
};

// Drag, drop and click handler on drop zone
var dropZoneEl = document.getElementById('pdfDropZone');
if (dropZoneEl) {
    dropZoneEl.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZoneEl.style.borderColor = '#10b981';
        dropZoneEl.style.background = 'rgba(16,185,129,0.06)';
    });
    dropZoneEl.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dropZoneEl.style.borderColor = '';
        dropZoneEl.style.background = '';
    });
    dropZoneEl.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZoneEl.style.borderColor = '';
        dropZoneEl.style.background = '';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            window.handlePdfBatch(Array.from(e.dataTransfer.files));
        }
    });
    dropZoneEl.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'pdfFileInput') return;
        var input = document.getElementById('pdfFileInput');
        if (input) {
            input.value = null;
            input.click();
        }
    });
}

// ==========================================================================
// Visitor Analytics & Visitor Logs Dashboard Controller
// ==========================================================================
(function () {
    'use strict';

    var currentRenderedVisitorLogs = [];

    function escVisitorHtml(val) {
        return String(val === null || typeof val === 'undefined' ? '' : val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function wireVisitorEventsOnce() {
        var dateFilter = document.getElementById('visitorDateFilter');
        var customDate = document.getElementById('visitorCustomDate');
        var searchInput = document.getElementById('visitorSearchInput');
        var refreshBtn = document.getElementById('visitorRefreshBtn');
        var exportSqlBtn = document.getElementById('visitorExportSqlBtn');
        var exportCsvBtn = document.getElementById('visitorExportCsvBtn');
        var clearBtn = document.getElementById('visitorClearBtn');
        var saveBackendBtn = document.getElementById('visitorSaveBackendBtn');

        if (dateFilter && !dateFilter._visitorWired) {
            dateFilter._visitorWired = true;
            dateFilter.addEventListener('change', function () {
                if (customDate) {
                    if (dateFilter.value === 'custom') {
                        customDate.classList.remove('hidden');
                        if (!customDate.value) {
                            var d = new Date();
                            var p = function (n) { return n < 10 ? '0' + n : String(n); };
                            customDate.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
                        }
                    } else {
                        customDate.classList.add('hidden');
                    }
                }
                window.renderVisitorDashboard();
            });
        }

        if (customDate && !customDate._visitorWired) {
            customDate._visitorWired = true;
            customDate.addEventListener('change', function () {
                window.renderVisitorDashboard();
            });
        }

        if (searchInput && !searchInput._visitorWired) {
            searchInput._visitorWired = true;
            searchInput.addEventListener('input', function () {
                window.renderVisitorDashboard();
            });
        }

        if (refreshBtn && !refreshBtn._visitorWired) {
            refreshBtn._visitorWired = true;
            refreshBtn.addEventListener('click', function () {
                window.renderVisitorDashboard();
                if (window.showToast) window.showToast('🔄 ভিজিটর লগ তালিকা রিফ্রেশ করা হয়েছে!', 'info');
            });
        }

        if (exportSqlBtn && !exportSqlBtn._visitorWired) {
            exportSqlBtn._visitorWired = true;
            exportSqlBtn.addEventListener('click', function () {
                if (typeof BTEBVisitor !== 'undefined') {
                    BTEBVisitor.exportLogsAsSQL(currentRenderedVisitorLogs);
                    if (window.showToast) window.showToast('📥 visitor_logs (.SQL) ফাইল ডাউনলোড শুরু হয়েছে!', 'success');
                }
            });
        }

        if (exportCsvBtn && !exportCsvBtn._visitorWired) {
            exportCsvBtn._visitorWired = true;
            exportCsvBtn.addEventListener('click', function () {
                if (typeof BTEBVisitor !== 'undefined') {
                    BTEBVisitor.exportLogsAsCSV(currentRenderedVisitorLogs);
                    if (window.showToast) window.showToast('📊 visitor_logs (.CSV) ফাইল ডাউনলোড শুরু হয়েছে!', 'success');
                }
            });
        }

        if (clearBtn && !clearBtn._visitorWired) {
            clearBtn._visitorWired = true;
            clearBtn.addEventListener('click', async function () {
                if (typeof BTEBVisitor === 'undefined') return;
                if (!confirm('আপনি কি নিশ্চিতভাবে সংরক্ষিত সকল ভিজিটর লগ মুছে ফেলতে চান?')) return;
                var res = await BTEBVisitor.clearLogsAsync();
                window.renderVisitorDashboard();
                if (window.showToast) {
                    if (res && res.ok === false && res.message) {
                        window.showToast('⚠️ লোকাল লগ মুছে ফেলা হয়েছে, তবে ব্যাকএন্ড: ' + res.message, 'warning');
                    } else {
                        window.showToast('🗑️ সকল ভিজিটর লগ সফলভাবে মুছে ফেলা হয়েছে!', 'success');
                    }
                }
            });
        }

        if (saveBackendBtn && !saveBackendBtn._visitorWired) {
            saveBackendBtn._visitorWired = true;
            saveBackendBtn.addEventListener('click', async function () {
                if (typeof BTEBVisitor === 'undefined') return;
                var toggle = document.getElementById('visitorBackendToggle');
                var endpoint = document.getElementById('visitorApiEndpoint');
                var adminKey = document.getElementById('visitorAdminKey');

                var saved = BTEBVisitor.saveApiConfig({
                    enabled: toggle ? toggle.checked : false,
                    endpoint: endpoint ? endpoint.value : 'api/visitor_logs.php',
                    adminKey: adminKey ? adminKey.value : ''
                });

                await window.renderVisitorDashboard();
                if (window.showToast) {
                    window.showToast(
                        saved.enabled
                            ? '💾 PHP/MySQL ব্যাকএন্ড সেটিংস সংরক্ষিত ও যাচাই করা হয়েছে!'
                            : '💾 Static (LocalStorage) মোড সক্রিয় করা হয়েছে!',
                        'success'
                    );
                }
            });
        }

        if (typeof window !== 'undefined' && !window._adminVisitorRealtimeWired) {
            window._adminVisitorRealtimeWired = true;
            window.addEventListener('bteb-visitor-updated', function () {
                // Refresh global overview cards on Tab 1
                var gStatsEl = document.getElementById('globalStatsContainer');
                if (gStatsEl && typeof BTEBStorage !== 'undefined' && typeof BTEBVisitor !== 'undefined') {
                    var visitorCards = gStatsEl.querySelectorAll('.dash-stat-card');
                    var vStats = BTEBVisitor.getStats();
                    if (visitorCards.length >= 8) {
                        var totalNum = visitorCards[6].querySelector('.dash-stat-num');
                        var todayNum = visitorCards[7].querySelector('.dash-stat-num');
                        if (totalNum) totalNum.textContent = Number(vStats.totalVisits || 0).toLocaleString();
                        if (todayNum) todayNum.textContent = Number(vStats.todayVisits || 0).toLocaleString();
                    }
                }
                var tabEl = document.getElementById('tab-visitors');
                if (tabEl && !tabEl.classList.contains('hidden')) {
                    window.renderVisitorDashboard();
                }
            });
        }
    }

    window.renderVisitorDashboard = async function () {
        if (typeof BTEBVisitor === 'undefined') return;
        wireVisitorEventsOnce();

        var apiCfg = BTEBVisitor.getApiConfig();
        var toggleEl = document.getElementById('visitorBackendToggle');
        var endpointEl = document.getElementById('visitorApiEndpoint');
        var adminKeyEl = document.getElementById('visitorAdminKey');
        if (toggleEl) toggleEl.checked = apiCfg.enabled;
        if (endpointEl && !endpointEl.value) endpointEl.value = apiCfg.endpoint;
        if (adminKeyEl && !adminKeyEl.value && apiCfg.adminKey) adminKeyEl.value = apiCfg.adminKey;

        var dateFilter = document.getElementById('visitorDateFilter');
        var customDate = document.getElementById('visitorCustomDate');
        var searchInput = document.getElementById('visitorSearchInput');

        var filter = {
            dateMode: dateFilter ? dateFilter.value : 'all',
            specificDate: customDate ? customDate.value : '',
            query: searchInput ? searchInput.value : '',
            limit: 200
        };

        var result = await BTEBVisitor.getLogsAsync(filter);
        var stats = result.stats || BTEBVisitor.getStats();
        var logs = Array.isArray(result.logs) ? result.logs : [];
        currentRenderedVisitorLogs = logs;

        var statsGrid = document.getElementById('visitorStatsGrid');
        if (statsGrid) {
            statsGrid.innerHTML =
                '<div class="dash-stat-card">' +
                    '<div class="dash-stat-icon" style="background:#f5f3ff;color:#7c3aed">👁️</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(stats.totalVisits || 0).toLocaleString() + '</span><span class="dash-stat-label">মোট ভিজিট (Total Visits)</span></div>' +
                '</div>' +
                '<div class="dash-stat-card">' +
                    '<div class="dash-stat-icon" style="background:#ecfeff;color:#0891b2">📅</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(stats.todayVisits || 0).toLocaleString() + '</span><span class="dash-stat-label">আজকের ভিজিট (Today)</span></div>' +
                '</div>' +
                '<div class="dash-stat-card">' +
                    '<div class="dash-stat-icon" style="background:#ecfdf5;color:#059669">👤</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(stats.uniqueVisitors || 0).toLocaleString() + '</span><span class="dash-stat-label">মোট ইউনিক ভিজিটর</span></div>' +
                '</div>' +
                '<div class="dash-stat-card">' +
                    '<div class="dash-stat-icon" style="background:#eff6ff;color:#2563eb">🌟</div>' +
                    '<div class="dash-stat-body"><span class="dash-stat-num">' + Number(stats.todayUnique || 0).toLocaleString() + '</span><span class="dash-stat-label">আজকের ইউনিক ভিজিটর</span></div>' +
                '</div>';
        }

        var modeBadge = document.getElementById('visitorModeBadge');
        if (modeBadge) {
            if (result.mode === 'mysql') {
                modeBadge.textContent = '🐘 MySQL + PHP Backend Active';
                modeBadge.style.background = 'rgba(37, 99, 235, 0.12)';
                modeBadge.style.color = '#2563eb';
                modeBadge.style.borderColor = 'rgba(37, 99, 235, 0.3)';
            } else {
                modeBadge.textContent = '🌐 Static Mode (GitHub Pages Ready)';
                modeBadge.style.background = 'rgba(16, 185, 129, 0.12)';
                modeBadge.style.color = '#059669';
                modeBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            }
        }

        var countBadge = document.getElementById('visitorRowCountBadge');
        if (countBadge) {
            countBadge.textContent = logs.length.toLocaleString() + 'টি রেকর্ড';
        }

        var noticeEl = document.getElementById('visitorBackendNotice');
        if (noticeEl) {
            if (result.backendError) {
                noticeEl.textContent = '⚠️ ব্যাকএন্ড বার্তা: ' + result.backendError;
                noticeEl.classList.remove('hidden');
            } else {
                noticeEl.classList.add('hidden');
            }
        }

        // Render Last 30 Days Daily Summary Table
        var dailySummary = Array.isArray(result.dailySummary)
            ? result.dailySummary
            : (BTEBVisitor.getDailySummary ? BTEBVisitor.getDailySummary(30) : []);
        var dailyBadge = document.getElementById('visitorDailyDaysBadge');
        if (dailyBadge) {
            dailyBadge.textContent = dailySummary.length.toLocaleString() + ' দিন';
        }
        var dailyTbody = document.getElementById('visitorDailyTableBody');
        if (dailyTbody) {
            if (dailySummary.length === 0) {
                dailyTbody.innerHTML =
                    '<tr>' +
                        '<td colspan="2" style="text-align:center;padding:24px;color:var(--text-muted);">' +
                            'কোনো ভিজিটর ডেটা পাওয়া যায়নি।' +
                        '</td>' +
                    '</tr>';
            } else {
                var dailyHtml = '';
                for (var dIdx = 0; dIdx < dailySummary.length; dIdx++) {
                    var dRow = dailySummary[dIdx];
                    dailyHtml +=
                        '<tr>' +
                            '<td>' + escVisitorHtml(dRow.visit_date) + '</td>' +
                            '<td><strong>' + Number(dRow.total_visitors || 0).toLocaleString() + '</strong> জন</td>' +
                        '</tr>';
                }
                dailyTbody.innerHTML = dailyHtml;
            }
        }

        var tbody = document.getElementById('visitorLogsTableBody');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML =
                '<tr>' +
                    '<td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">' +
                        'কোনো ভিজিটর লগ পাওয়া যায়নি। স্টুডেন্ট পেজ (<code>index.html</code>) ভিজিট করলে এখানে স্বয়ংক্রিয়ভাবে লগ সংরক্ষিত হবে।' +
                    '</td>' +
                '</tr>';
            return;
        }

        var rowsHtml = '';
        for (var i = 0; i < logs.length; i++) {
            var r = logs[i];
            rowsHtml +=
                '<tr>' +
                    '<td><strong>#' + escVisitorHtml(r.id) + '</strong></td>' +
                    '<td><span class="visitor-ip-badge">' + escVisitorHtml(r.ip_address) + '</span></td>' +
                    '<td>' + escVisitorHtml(r.visit_date) + '</td>' +
                    '<td>' + escVisitorHtml(r.visited_at) + '</td>' +
                    '<td><span class="visitor-page-badge">' + escVisitorHtml(r.page || 'index.html') + '</span></td>' +
                '</tr>';
        }
        tbody.innerHTML = rowsHtml;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireVisitorEventsOnce);
    } else {
        wireVisitorEventsOnce();
    }
})();

