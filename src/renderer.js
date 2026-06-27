// Renderer Process Controller

// State variables
let currentSettings = {};
let scrapedCourse = null;
let activeDownloads = new Map(); // Map taskID -> progressData

// DOM Elements
const panels = document.querySelectorAll('.tab-panel');
const navButtons = document.querySelectorAll('.nav-btn');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

// 1. Tab Navigation
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update nav active state
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Show selected panel
        panels.forEach(p => p.classList.remove('active'));
        const activePanel = document.getElementById(`panel-${tab}`);
        if (activePanel) activePanel.classList.add('active');
        
        // Update header texts
        updateHeader(tab);

        // Tab-specific loads
        if (tab === 'library') {
            loadLibrary();
        } else if (tab === 'dashboard') {
            refreshCoreStatus();
        }
    });
});

function updateHeader(tab) {
    const titles = {
        dashboard: {
            title: "Dashboard",
            subtitle: "Welcome to Amayori. Manage your courses and downloads."
        },
        courses: {
            title: "Scrape & Download",
            subtitle: "Enter a Domestika course URL to retrieve and select videos for download."
        },
        library: {
            title: "My Library",
            subtitle: "Browse and play your downloaded Domestika courses."
        },
        settings: {
            title: "Settings",
            subtitle: "Configure authentication cookies, download paths, and transcoding options."
        },
        help: {
            title: "Help & Instructions",
            subtitle: "Learn how to use Amayori and obtain credentials."
        }
    };
    
    if (titles[tab]) {
        pageTitle.innerText = titles[tab].title;
        pageSubtitle.innerText = titles[tab].subtitle;
    }
}

// 2. Terminal System Drawer Log
const btnShowTerminal = document.getElementById('btn-show-terminal');
const btnCloseTerminal = document.getElementById('btn-close-terminal');
const terminalDrawer = document.getElementById('terminal-drawer');
const logOutputContainer = document.getElementById('log-output-container');
const btnClearLogs = document.getElementById('btn-clear-logs');

btnShowTerminal.addEventListener('click', () => {
    terminalDrawer.classList.toggle('hidden');
});

btnCloseTerminal.addEventListener('click', () => {
    terminalDrawer.classList.add('hidden');
});

btnClearLogs.addEventListener('click', () => {
    logOutputContainer.innerHTML = '';
});

function addLogLine(msg, type = 'system') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    // Timestamp
    const time = new Date().toLocaleTimeString();
    line.innerText = `[${time}] ${msg}`;
    logOutputContainer.appendChild(line);
    logOutputContainer.scrollTop = logOutputContainer.scrollHeight;
}

// Toast Notification System
const TOAST_ICONS = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};

function showToast(type, title, message, duration = 4500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        ${TOAST_ICONS[type] || TOAST_ICONS.info}
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close" title="Dismiss">&times;</button>
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    container.appendChild(toast);
    // Trigger animation (needs one frame delay)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('toast-show'));
    });

    const dismiss = () => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    const timer = setTimeout(dismiss, duration);
    toast.querySelector('.toast-close').addEventListener('click', () => clearTimeout(timer));
}

// Listen for logs from main process
window.api.onLog((msg) => {
    let type = 'system';
    if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed')) {
        type = 'error';
    } else if (msg.toLowerCase().includes('successful') || msg.toLowerCase().includes('complete')) {
        type = 'success';
    }
    addLogLine(msg, type);
});

// 3. Core Status Checks
async function refreshCoreStatus() {
    const status = await window.api.checkBinary();
    
    // Badges update
    const binBadge = document.getElementById('sys-binary-badge');
    const ffmpegBadge = document.getElementById('sys-ffmpeg-badge');
    const ffprobeBadge = document.getElementById('sys-ffprobe-badge');
    
    const dashboardBinStatus = document.getElementById('stat-binary-status');
    const btnFixBinary = document.getElementById('btn-fix-binary');

    // N_m3u8DL-RE status
    if (status.hasBinary) {
        binBadge.className = "badge badge-success";
        binBadge.innerText = "Installed";
        dashboardBinStatus.innerText = "Available";
        btnFixBinary.style.display = 'none';
        document.getElementById('binary-engine-path').innerText = `Location: ${status.binaryPath}`;
    } else {
        binBadge.className = "badge badge-danger";
        binBadge.innerText = "Missing";
        dashboardBinStatus.innerText = "Not Setup";
        btnFixBinary.style.display = 'inline-block';
        document.getElementById('binary-engine-path').innerText = `Location: Not Found`;
    }

    // FFmpeg
    if (status.hasFfmpeg) {
        ffmpegBadge.className = "badge badge-success";
        ffmpegBadge.innerText = "Installed";
        document.getElementById('ffmpeg-status-badge').className = "badge badge-success";
        document.getElementById('ffmpeg-status-badge').innerText = "Available";
        document.getElementById('ffmpeg-path-lbl').innerText = "PATH: Registered";
        document.getElementById('nvenc-group').style.display = 'block'; // Show NVENC toggle if ffmpeg is available
    } else {
        ffmpegBadge.className = "badge badge-danger";
        ffmpegBadge.innerText = "Missing";
        document.getElementById('ffmpeg-status-badge').className = "badge badge-danger";
        document.getElementById('ffmpeg-status-badge').innerText = "Missing";
        document.getElementById('ffmpeg-path-lbl').innerText = "PATH: Not Found";
        document.getElementById('nvenc-group').style.display = 'none';
    }

    // FFprobe
    if (status.hasFfprobe) {
        ffprobeBadge.className = "badge badge-success";
        ffprobeBadge.innerText = "Installed";
    } else {
        ffprobeBadge.className = "badge badge-danger";
        ffprobeBadge.innerText = "Missing";
    }
}

// Manual/Automatic binary installer
const btnInstallBinaryManual = document.getElementById('btn-install-binary-manual');
const btnFixBinary = document.getElementById('btn-fix-binary');

const installAction = async () => {
    btnInstallBinaryManual.disabled = true;
    btnFixBinary.disabled = true;
    btnInstallBinaryManual.classList.add('btn-loading');
    btnInstallBinaryManual.textContent = 'Installing...';
    addLogLine('Initiating N_m3u8DL-RE automated download...');
    showToast('info', 'Downloading Engine', 'Fetching the latest N_m3u8DL-RE from GitHub...');
    
    const result = await window.api.downloadBinary();
    if (result.success) {
        addLogLine('N_m3u8DL-RE download and installation complete!', 'success');
        showToast('success', 'Engine Installed!', 'N_m3u8DL-RE has been downloaded and is ready to use.');
    } else {
        addLogLine(`N_m3u8DL-RE installation failed: ${result.error}`, 'error');
        showToast('error', 'Installation Failed', result.error || 'Could not download N_m3u8DL-RE. Check your connection.');
    }
    
    btnInstallBinaryManual.disabled = false;
    btnFixBinary.disabled = false;
    btnInstallBinaryManual.classList.remove('btn-loading');
    btnInstallBinaryManual.textContent = 'Install / Update';
    refreshCoreStatus();
};

btnInstallBinaryManual.addEventListener('click', installAction);
btnFixBinary.addEventListener('click', installAction);

// 4. Settings Loading and Saving
const cookieSessionInput = document.getElementById('cookie-session-input');
const credentialsInput = document.getElementById('credentials-input');
const downloadFolderInput = document.getElementById('download-folder-input');
const chkTranscode = document.getElementById('chk-transcode');
const chkNvenc = document.getElementById('chk-nvenc');
const concurrencyRange = document.getElementById('concurrency-range');
const concurrencyLbl = document.getElementById('concurrency-lbl');
const btnBrowseFolder = document.getElementById('btn-browse-folder');
const btnSaveSettings = document.getElementById('btn-save-settings');
const saveSuccessIndicator = document.getElementById('settings-save-success-indicator');

// Dynamic range label
concurrencyRange.addEventListener('input', (e) => {
    concurrencyLbl.innerText = e.target.value;
});

btnBrowseFolder.addEventListener('click', async () => {
    const folder = await window.api.selectFolder();
    if (folder) {
        downloadFolderInput.value = folder;
    }
});

async function loadSettingsUI() {
    currentSettings = await window.api.getSettings();
    
    // Parse cookies list
    const sessionCookie = currentSettings.cookies.find(c => c.name === '_domestika_session');
    cookieSessionInput.value = sessionCookie ? sessionCookie.value : '';
    credentialsInput.value = currentSettings._credentials_ || '';
    downloadFolderInput.value = currentSettings.downloadFolder || '';
    chkTranscode.checked = currentSettings.transcode || false;
    chkNvenc.checked = currentSettings.useNvenc || false;
    concurrencyRange.value = currentSettings.concurrency || 3;
    concurrencyLbl.innerText = currentSettings.concurrency || 3;
    
    // Subtitles checkboxes
    const subLangs = currentSettings.subtitleLangs || ['en'];
    const chkSubLangs = document.querySelectorAll('input[name="sub-lang"]');
    chkSubLangs.forEach(chk => {
        chk.checked = subLangs.includes(chk.value);
    });
}

btnSaveSettings.addEventListener('click', async () => {
    // Collect subtitle languages
    const subLangs = [];
    const chkSubLangs = document.querySelectorAll('input[name="sub-lang"]');
    chkSubLangs.forEach(chk => {
        if (chk.checked) subLangs.push(chk.value);
    });

    const sessionVal = cookieSessionInput.value.trim();
    const cookiesArr = sessionVal ? [{ name: '_domestika_session', value: sessionVal, domain: '.domestika.org' }] : [];

    const newSettings = {
        cookies: cookiesArr,
        _credentials_: credentialsInput.value.trim(),
        downloadFolder: downloadFolderInput.value.trim(),
        transcode: chkTranscode.checked,
        useNvenc: chkNvenc.checked,
        concurrency: parseInt(concurrencyRange.value),
        subtitleLangs: subLangs
    };
    
    await window.api.saveSettings(newSettings);
    addLogLine('Settings saved to disk.', 'success');
    showToast('success', 'Settings Saved', 'Your configuration has been saved successfully.');
    
    // Animate success badge
    saveSuccessIndicator.classList.add('visible');
    setTimeout(() => {
        saveSuccessIndicator.classList.remove('visible');
    }, 2000);
    
    refreshLoginStatus();
});

// 5. Login Popup Authentication Flow
const btnPopupLogin = document.getElementById('btn-popup-login');
const btnClearAuth = document.getElementById('btn-clear-auth');
const authIndicator = document.getElementById('auth-status-indicator');

btnPopupLogin.addEventListener('click', async () => {
    addLogLine('Opening authentication popup window...');
    showToast('info', 'Login Window Opening', 'Complete login in the popup — the app will auto-detect when you are signed in.');
    await window.api.startLogin();
});

btnClearAuth.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your credentials? This will log you out of Domestika.')) {
        await window.api.logout();
        addLogLine('Logged out, settings cleared.');
        showToast('warning', 'Logged Out', 'Your authentication credentials have been cleared.');
        loadSettingsUI();
        refreshLoginStatus();
    }
});

async function refreshLoginStatus() {
    const status = await window.api.checkLogin();
    const dot = authIndicator.querySelector('.status-dot');
    const label = authIndicator.querySelector('.status-text');
    
    if (status.loggedIn) {
        dot.className = "status-dot online";
        label.innerText = "Authenticated";
        btnClearAuth.style.display = 'inline-block';
    } else {
        dot.className = "status-dot offline";
        label.innerText = "Not Authenticated";
        btnClearAuth.style.display = 'none';
    }
}

window.api.onLoginStatus((status) => {
    if (status.loggedIn) {
        addLogLine(status.message, 'success');
        showToast('success', 'Authenticated!', status.message);
        loadSettingsUI();
        refreshLoginStatus();
    }
});

// 6. Course Fetcher / Scraper UI
const btnFetchCourse = document.getElementById('btn-fetch-course');
const courseUrlInput = document.getElementById('course-url-input');
const scrapingSpinner = document.getElementById('scraping-spinner');
const scrapedCourseContainer = document.getElementById('scraped-course-container');

const lessonsListContainer = document.getElementById('lessons-list-container');
const courseTitleLbl = document.getElementById('course-title-lbl');
const courseLessonsCountLbl = document.getElementById('course-lessons-count-lbl');

btnFetchCourse.addEventListener('click', async () => {
    const url = courseUrlInput.value.trim();
    if (!url) {
        alert('Please enter a valid course URL.');
        return;
    }
    
    if (!url.toLowerCase().endsWith('/course') && !url.toLowerCase().includes('/course/')) {
        alert('The URL must end with "/course". Please double check.');
        return;
    }
    
    // Set UI to loading state
    btnFetchCourse.disabled = true;
    scrapingSpinner.classList.remove('hidden');
    scrapedCourseContainer.classList.add('hidden');
    
    const result = await window.api.fetchCourse(url);
    
    btnFetchCourse.disabled = false;
    scrapingSpinner.classList.add('hidden');
    
    if (result.success && result.course) {
        scrapedCourse = result.course;
        renderCourseDetails(result.course);
    } else {
        alert(`Failed to retrieve course details: ${result.error || 'Check logs'}`);
        addLogLine(`Scraping failed: ${result.error}`, 'error');
    }
});

function renderCourseDetails(course) {
    scrapedCourseContainer.classList.remove('hidden');
    courseTitleLbl.innerText = course.title;
    
    let totalLessonsCount = 0;
    course.units.forEach(unit => {
        totalLessonsCount += unit.videos.length;
    });
    
    courseLessonsCountLbl.innerText = `${totalLessonsCount} Lessons found across ${course.units.length} chapters`;
    
    lessonsListContainer.innerHTML = '';
    
    course.units.forEach((unit) => {
        // Create unit wrapper
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'unit-section-title';
        sectionTitle.innerText = unit.section;
        lessonsListContainer.appendChild(sectionTitle);
        
        const unitCard = document.createElement('div');
        unitCard.className = 'unit-card';
        
        const unitHeader = document.createElement('div');
        unitHeader.className = 'unit-header';
        unitHeader.innerText = unit.title;
        unitCard.appendChild(unitHeader);
        
        unit.videos.forEach((video, videoIdx) => {
            const lessonItem = document.createElement('div');
            lessonItem.className = 'lesson-item';
            
            // Unique ID for checkbox
            const taskID = `task_${unit.index}_${videoIdx}`;
            
            const leftDiv = document.createElement('div');
            leftDiv.className = 'lesson-item-left';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'lesson-checkbox-col';
            checkbox.checked = true; // Checked by default
            checkbox.dataset.taskId = taskID;
            checkbox.dataset.unitTitle = unit.title;
            checkbox.dataset.sectionTitle = unit.section;
            checkbox.dataset.videoTitle = video.title;
            checkbox.dataset.playbackUrl = video.playbackURL;
            checkbox.dataset.index = videoIdx;
            
            const label = document.createElement('span');
            label.className = 'lesson-label-title';
            label.innerText = `${videoIdx + 1}. ${video.title}`;
            
            leftDiv.appendChild(checkbox);
            leftDiv.appendChild(label);
            lessonItem.appendChild(leftDiv);
            
            unitCard.appendChild(lessonItem);
        });
        
        lessonsListContainer.appendChild(unitCard);
    });
}

// Select/Deselect list items
document.getElementById('btn-select-all-lessons').addEventListener('click', () => {
    document.querySelectorAll('.lesson-checkbox-col').forEach(chk => chk.checked = true);
});

document.getElementById('btn-deselect-all-lessons').addEventListener('click', () => {
    document.querySelectorAll('.lesson-checkbox-col').forEach(chk => chk.checked = false);
});

// 7. Download Queue Action
const btnStartDownloadQueue = document.getElementById('btn-start-download-queue');
const btnStopDownloadQueue = document.getElementById('btn-stop-download-queue');
const activeQueueContainer = document.getElementById('active-queue-container');
const queueItemsContainer = document.getElementById('queue-items-container');
const overallProgressBar = document.getElementById('overall-progress-bar');
const overallProgressPercent = document.getElementById('overall-progress-percent');
const queueStatusText = document.getElementById('queue-status-text');

btnStartDownloadQueue.addEventListener('click', async () => {
    if (!scrapedCourse) return;
    
    // Check if binary is installed
    const status = await window.api.checkBinary();
    if (!status.hasBinary) {
        alert('The N_m3u8DL-RE engine is not installed. Please download it via Settings first.');
        return;
    }
    
    // Gather selected checkboxes
    const checked = document.querySelectorAll('.lesson-checkbox-col:checked');
    if (checked.length === 0) {
        alert('Please select at least one lesson to download.');
        return;
    }
    
    const lessonsToDownload = [];
    checked.forEach(chk => {
        lessonsToDownload.push({
            id: chk.dataset.taskId,
            unitTitle: chk.dataset.unitTitle,
            sectionTitle: chk.dataset.sectionTitle,
            videoTitle: chk.dataset.videoTitle,
            playbackURL: chk.dataset.playbackUrl,
            index: parseInt(chk.dataset.index)
        });
    });
    
    // Subtitle selection
    const subLangs = [];
    document.querySelectorAll('input[name="sub-lang"]:checked').forEach(chk => {
        subLangs.push(chk.value);
    });
    
    const transcodeVal = document.getElementById('chk-transcode').checked;
    const nvencVal = document.getElementById('chk-nvenc').checked;
    const concurrencyVal = parseInt(document.getElementById('concurrency-range').value);
    
    // Reset state map
    activeDownloads.clear();
    lessonsToDownload.forEach(l => {
        activeDownloads.set(l.id, {
            title: l.videoTitle,
            status: 'Queued',
            progress: 0,
            speed: '',
            eta: ''
        });
    });
    
    // Build UI items list
    queueItemsContainer.innerHTML = '';
    lessonsToDownload.forEach(l => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.id = `q-item-${l.id}`;
        
        item.innerHTML = `
            <div class="queue-item-info">
                <div class="queue-item-title">${l.videoTitle}</div>
                <div class="queue-item-meta">
                    <span class="queue-item-status-text" id="q-status-${l.id}">Queued</span>
                    <span id="q-speed-${l.id}"></span>
                    <span id="q-eta-${l.id}"></span>
                </div>
            </div>
            <div class="queue-item-progress-container">
                <div class="queue-progress-bar-bg">
                    <div class="queue-progress-bar-fill" id="q-fill-${l.id}" style="width: 0%;"></div>
                </div>
                <span class="queue-progress-percent" id="q-percent-${l.id}">0%</span>
            </div>
        `;
        queueItemsContainer.appendChild(item);
    });
    
    // Show download container
    activeQueueContainer.classList.remove('hidden');
    btnStartDownloadQueue.disabled = true;
    btnStartDownloadQueue.classList.add('btn-loading');
    btnStartDownloadQueue.textContent = 'Downloading...';
    queueStatusText.innerText = "Downloading...";
    
    // Smooth scroll to the progress container
    setTimeout(() => {
        activeQueueContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
    
    showToast('info', 'Download Started', `Downloading ${lessonsToDownload.length} selected lessons to your local library.`);
    
    // Start active downloads count
    document.getElementById('stat-downloading-count').innerText = lessonsToDownload.length;
    
    // Invoke main process
    const result = await window.api.startDownload({
        courseTitle: scrapedCourse.title,
        lessons: lessonsToDownload,
        subtitleLangs: subLangs,
        transcode: transcodeVal,
        useNvenc: nvencVal,
        concurrency: concurrencyVal
    });
    
    if (!result.success) {
        showToast('error', 'Download Failed', result.error);
        btnStartDownloadQueue.disabled = false;
        btnStartDownloadQueue.classList.remove('btn-loading');
        btnStartDownloadQueue.textContent = 'Start Downloads';
        activeQueueContainer.classList.add('hidden');
    }
});

btnStopDownloadQueue.addEventListener('click', async () => {
    await window.api.stopDownload();
    btnStartDownloadQueue.disabled = false;
    btnStartDownloadQueue.classList.remove('btn-loading');
    btnStartDownloadQueue.textContent = 'Start Downloads';
    queueStatusText.innerText = "Cancelled";
    document.getElementById('stat-downloading-count').innerText = 0;
    showToast('warning', 'Downloads Stopped', 'The download queue has been cancelled by the user.');
});

// Listen for download progress updates
window.api.onDownloadProgress((data) => {
    if (data.id === 'queue-finished') {
        btnStartDownloadQueue.disabled = false;
        btnStartDownloadQueue.classList.remove('btn-loading');
        btnStartDownloadQueue.textContent = 'Start Downloads';
        queueStatusText.innerText = "Finished";
        document.getElementById('stat-downloading-count').innerText = 0;
        addLogLine("Full download queue processed successfully!", "success");
        showToast('success', 'Downloads Complete', 'All selected lessons have been downloaded successfully!');
        loadLibrary(); // refresh library UI
        return;
    }
    
    if (data.id === 'binary-download') {
        // Special case: manual binary download progress
        addLogLine(`Engine download progress: ${data.progress}% (${data.speed})`);
        return;
    }
    
    // Update local state map
    if (activeDownloads.has(data.id)) {
        const item = activeDownloads.get(data.id);
        item.status = data.status;
        item.progress = data.progress;
        item.speed = data.speed;
        item.eta = data.eta;
        
        // Update DOM elements
        const statusEl = document.getElementById(`q-status-${data.id}`);
        const speedEl = document.getElementById(`q-speed-${data.id}`);
        const etaEl = document.getElementById(`q-eta-${data.id}`);
        const fillEl = document.getElementById(`q-fill-${data.id}`);
        const percentEl = document.getElementById(`q-percent-${data.id}`);
        
        if (statusEl) statusEl.innerText = data.status;
        if (speedEl) speedEl.innerText = data.speed ? `• ${data.speed}` : '';
        if (etaEl) etaEl.innerText = data.eta ? `• ETA: ${data.eta}` : '';
        if (fillEl) fillEl.style.width = `${data.progress}%`;
        if (percentEl) percentEl.innerText = `${Math.round(data.progress)}%`;
        
        // Calculate overall average progress
        let sum = 0;
        activeDownloads.forEach(val => {
            if (val.status === 'Completed') sum += 100;
            else sum += val.progress;
        });
        const averageProgress = Math.round(sum / activeDownloads.size);
        overallProgressBar.style.width = `${averageProgress}%`;
        overallProgressPercent.innerText = `${averageProgress}%`;
    }
});

// 8. Library Tree Rendering
const libraryContainer = document.getElementById('library-container');
const libraryEmpty = document.getElementById('library-empty');
const btnRefreshLibrary = document.getElementById('btn-refresh-library');
const btnOpenDownloadDir = document.getElementById('btn-open-download-dir');

btnRefreshLibrary.addEventListener('click', loadLibrary);

btnOpenDownloadDir.addEventListener('click', async () => {
    if (currentSettings.downloadFolder) {
        await window.api.openPath(currentSettings.downloadFolder);
    }
});

async function loadLibrary() {
    addLogLine("Scanning local download directory...");
    const courses = await window.api.scanLibrary();
    
    // Update completed courses count in dashboard
    document.getElementById('stat-completed-count').innerText = courses.length;
    
    if (courses.length === 0) {
        libraryContainer.innerHTML = '';
        libraryEmpty.classList.remove('hidden');
        return;
    }
    
    libraryEmpty.classList.add('hidden');
    libraryContainer.innerHTML = '';
    
    courses.forEach(course => {
        const courseCard = document.createElement('div');
        courseCard.className = 'lib-course-card';
        
        const courseHeader = document.createElement('div');
        courseHeader.className = 'lib-course-header';
        
        const courseTitle = document.createElement('div');
        courseTitle.className = 'lib-course-title';
        courseTitle.innerText = course.title;
        
        courseHeader.appendChild(courseTitle);
        
        // Action to open course folder directly
        const openCourseBtn = document.createElement('button');
        openCourseBtn.className = 'btn btn-secondary btn-small';
        openCourseBtn.innerText = 'Open folder';
        openCourseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.api.openPath(course.path);
        });
        courseHeader.appendChild(openCourseBtn);
        
        courseCard.appendChild(courseHeader);
        
        // Sections
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'lib-sections-container';
        
        course.sections.forEach(section => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'lib-section';
            
            const sectionTitle = document.createElement('div');
            sectionTitle.className = 'lib-section-title';
            sectionTitle.innerText = section.title;
            sectionDiv.appendChild(sectionTitle);
            
            // Units
            section.units.forEach(unit => {
                const unitDiv = document.createElement('div');
                unitDiv.className = 'lib-unit';
                
                const unitTitle = document.createElement('div');
                unitTitle.className = 'lib-unit-title';
                unitTitle.innerText = unit.title;
                unitDiv.appendChild(unitTitle);
                
                // Files (Videos & Subtitles)
                const filesList = document.createElement('div');
                filesList.className = 'lib-files-list';
                
                unit.files.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'lib-file-item';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'lib-file-name';
                    nameSpan.innerText = file.name;
                    // Double click/Click to open in default system player
                    nameSpan.addEventListener('click', () => {
                        window.api.openPath(file.path);
                    });
                    
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'lib-file-actions';
                    
                    const sizeSpan = document.createElement('span');
                    sizeSpan.className = 'lib-file-size';
                    sizeSpan.innerText = formatBytes(file.sizeBytes);
                    
                    actionsDiv.appendChild(sizeSpan);
                    
                    // If video, show play button
                    if (file.name.endsWith('.mp4') || file.name.endsWith('.mkv')) {
                        const playIcon = document.createElement('span');
                        playIcon.className = 'lib-play-icon';
                        playIcon.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height:14px; vertical-align: middle;">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        `;
                        playIcon.addEventListener('click', () => {
                            window.api.openPath(file.path);
                        });
                        actionsDiv.appendChild(playIcon);
                        
                        // Add single-file redownload action button
                        const redownloadBtn = document.createElement('button');
                        redownloadBtn.className = 'btn redownload-btn-item';
                        redownloadBtn.innerText = 'Redownload';
                        redownloadBtn.addEventListener('click', () => {
                            if (confirm(`Redownload this lesson: "${file.name}"?`)) {
                                redownloadSingleFile(course.title, section.title, unit.title, file.name);
                            }
                        });
                        actionsDiv.appendChild(redownloadBtn);
                    }
                    
                    fileItem.appendChild(nameSpan);
                    fileItem.appendChild(actionsDiv);
                    filesList.appendChild(fileItem);
                });
                
                unitDiv.appendChild(filesList);
                sectionDiv.appendChild(unitDiv);
            });
            
            sectionContainer.appendChild(sectionDiv);
        });
        
        courseCard.appendChild(sectionContainer);
        libraryContainer.appendChild(courseCard);
    });
}

function redownloadSingleFile(courseTitle, sectionTitle, unitTitle, fileName) {
    if (!scrapedCourse) {
        alert("Please load the course page under the 'Scrape & Download' tab first, so we can access the video streams for redownloading.");
        return;
    }
    
    // Find the lesson matching courseTitle and unitTitle and fileName
    // Wait, the fileName starts with prefix like index_Title.mp4.
    // Let's parse index out of the file name
    const match = /^(\d+)_(.*)\.mp4$/.exec(fileName);
    if (!match) {
        alert("Could not identify the video lesson index from the filename.");
        return;
    }
    
    const index = parseInt(match[1]);
    const cleanTitle = match[2];
    
    // Find the video in scrapedCourse
    let matchedLesson = null;
    scrapedCourse.units.forEach(unit => {
        if (unit.title === unitTitle && unit.section === sectionTitle) {
            unit.videos.forEach((v, vIdx) => {
                if (vIdx === index) {
                    matchedLesson = {
                        id: `redownload_${Date.now()}_${index}`,
                        unitTitle: unit.title,
                        sectionTitle: unit.section,
                        videoTitle: v.title,
                        playbackURL: v.playbackURL,
                        index: vIdx
                    };
                }
            });
        }
    });
    
    if (!matchedLesson) {
        alert("Could not find the lesson in the active scraped course metadata. Make sure you have fetched the correct course page.");
        return;
    }
    
    // Subtitles selection
    const subLangs = [];
    document.querySelectorAll('input[name="sub-lang"]:checked').forEach(chk => {
        subLangs.push(chk.value);
    });
    
    const transcodeVal = document.getElementById('chk-transcode').checked;
    const nvencVal = document.getElementById('chk-nvenc').checked;
    
    // Create UI item in the active queue
    activeQueueContainer.classList.remove('hidden');
    
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = `q-item-${matchedLesson.id}`;
    
    item.innerHTML = `
        <div class="queue-item-info">
            <div class="queue-item-title">[Redownload] ${matchedLesson.videoTitle}</div>
            <div class="queue-item-meta">
                <span class="queue-item-status-text" id="q-status-${matchedLesson.id}">Queued</span>
                <span id="q-speed-${matchedLesson.id}"></span>
                <span id="q-eta-${matchedLesson.id}"></span>
            </div>
        </div>
        <div class="queue-item-progress-container">
            <div class="queue-progress-bar-bg">
                <div class="queue-progress-bar-fill" id="q-fill-${matchedLesson.id}" style="width: 0%;"></div>
            </div>
            <span class="queue-progress-percent" id="q-percent-${matchedLesson.id}">0%</span>
        </div>
    `;
    
    queueItemsContainer.insertBefore(item, queueItemsContainer.firstChild);
    
    activeDownloads.set(matchedLesson.id, {
        title: matchedLesson.videoTitle,
        status: 'Queued',
        progress: 0,
        speed: '',
        eta: ''
    });
    
    window.api.redownloadLesson({
        courseTitle: courseTitle,
        lesson: matchedLesson,
        subtitleLangs: subLangs,
        transcode: transcodeVal,
        useNvenc: nvencVal
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 9. Startup Initialization
window.addEventListener('DOMContentLoaded', async () => {
    addLogLine("App window loaded.");
    
    // Load Settings into inputs
    await loadSettingsUI();
    
    // Check Engine (N_m3u8DL-RE & Ffmpeg) status
    await refreshCoreStatus();
    
    // Check authentication login cookies
    await refreshLoginStatus();
    const login = await window.api.checkLogin();
    if (!login.loggedIn) {
        addLogLine("No authentication cookies detected. Please configure your login details under Settings.", "warning");
    }
});
