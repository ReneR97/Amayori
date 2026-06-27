const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow = null;
let settings = {};
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Default configurations
const defaultSettings = {
    downloadFolder: path.join(app.getPath('downloads'), 'Amayori Domestika'),
    cookies: [],
    _credentials_: '',
    subtitleLangs: ['en'],
    transcode: false,
    useNvenc: false,
    concurrency: 3
};

// Load settings
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            settings = { ...defaultSettings, ...JSON.parse(data) };
        } else {
            settings = { ...defaultSettings };
            saveSettings();
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
        settings = { ...defaultSettings };
    }
}

// Save settings
function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: true, // Standard titlebar with windows controls
        title: "Amayori Domestika Downloader",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Restore persisted cookies into the session at startup
async function restoreSavedCookies() {
    if (!settings.cookies || settings.cookies.length === 0) return;
    const ses = session.defaultSession;
    for (const cookie of settings.cookies) {
        try {
            const domain = cookie.domain || '.domestika.org';
            const url = `https://${domain.replace(/^\./, '')}/`;
            await ses.cookies.set({
                url,
                name: cookie.name,
                value: cookie.value,
                domain,
                path: cookie.path || '/'
            });
        } catch (e) {
            console.warn(`Could not restore cookie ${cookie.name}:`, e.message);
        }
    }
    // Also restore _credentials_ if present
    if (settings._credentials_) {
        try {
            await ses.cookies.set({
                url: 'https://www.domestika.org/',
                name: '_credentials_',
                value: settings._credentials_,
                domain: '.domestika.org',
                path: '/'
            });
        } catch (e) {
            console.warn('Could not restore _credentials_ cookie:', e.message);
        }
    }
    console.log('[Session] Restored saved cookies from settings.');
}

// Initialize Application
app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    loadSettings();
    createWindow();
    // Restore cookies after window creation so session is ready
    await restoreSavedCookies();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations

// 1. Settings management
ipcMain.handle('get-settings', () => {
    return settings;
});

ipcMain.handle('save-settings', (event, newSettings) => {
    settings = { ...settings, ...newSettings };
    saveSettings();
    return settings;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// 2. Binary Tooling (N_m3u8DL-RE verification and download)
function getBinaryName() {
    return process.platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
}

/**
 * Returns a writable directory to store/find the N_m3u8DL-RE binary.
 * We use the app's persistent user data directory (app.getPath('userData')) 
 * which is always persistent and writable, even when running as a portable app.
 */
function getBinaryDir() {
    return app.getPath('userData');
}

ipcMain.handle('check-binary', () => {
    const binaryName = getBinaryName();
    const binaryPath = path.join(getBinaryDir(), binaryName);
    const hasBinary = fs.existsSync(binaryPath);

    // Also check for FFmpeg/FFprobe in system PATH
    let hasFfmpeg = false;
    let hasFfprobe = false;

    const ffmpegFallbackPaths = process.platform === 'win32' ? [
        'C:\\ffmpeg\\bin',
        'C:\\ffmpeg',
        path.join(app.getAppPath(), 'ffmpeg'),
        path.join(path.dirname(app.getPath('exe')), 'ffmpeg'),
    ] : [];

    function isFfmpegAvailable(name) {
        try {
            const checkCmd = process.platform === 'win32' ? 'where' : 'which';
            execSync(`${checkCmd} ${name}`, { stdio: 'ignore' });
            return true;
        } catch(e) {
            const ext = process.platform === 'win32' ? '.exe' : '';
            for (const dir of ffmpegFallbackPaths) {
                if (fs.existsSync(path.join(dir, `${name}${ext}`))) {
                    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
                    return true;
                }
            }
            return false;
        }
    }

    hasFfmpeg = isFfmpegAvailable('ffmpeg');
    hasFfprobe = isFfmpegAvailable('ffprobe');

    return {
        hasBinary,
        binaryName,
        binaryPath,
        hasFfmpeg,
        hasFfprobe
    };
});

ipcMain.handle('download-binary', async () => {
    try {
        logToUI('Checking latest N_m3u8DL-RE release on GitHub...');
        const apiUrl = 'https://api.github.com/repos/nilaoda/N_m3u8DL-RE/releases/latest';
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'Amayori-Downloader' }
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned status ${response.status}`);
        }
        const release = await response.json();
        
        const platform = process.platform;
        const arch = process.arch;
        
        let platformKey = '';
        if (platform === 'win32') platformKey = 'win';
        else if (platform === 'darwin') platformKey = 'osx';
        else if (platform === 'linux') platformKey = 'linux';
        
        let archKey = '';
        if (arch === 'x64') archKey = 'x64';
        else if (arch === 'arm64') archKey = 'arm64';
        
        if (!platformKey) {
            throw new Error(`Unsupported OS: ${platform}`);
        }
        
        // Match appropriate asset
        const asset = release.assets.find(a => {
            const name = a.name.toLowerCase();
            const matchesPlatform = name.includes(platformKey);
            let archOk = name.includes(archKey);
            if (arch === 'arm64' && !archOk) {
                archOk = name.includes('aarch64');
            }
            if (arch === 'x64' && !archOk) {
                archOk = name.includes('amd64');
            }
            return matchesPlatform && archOk;
        });
        
        if (!asset) {
            throw new Error(`Could not find suitable asset for OS=${platformKey} Arch=${archKey} in latest release.`);
        }
        
        const downloadUrl = asset.browser_download_url;
        const assetName = asset.name;
        const downloadPath = path.join(getBinaryDir(), assetName);
        
        logToUI(`Found asset: ${assetName}. Downloading...`);
        
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
        
        const fileStream = fs.createWriteStream(downloadPath);
        const body = res.body;
        const reader = body.getReader();
        
        let loadedBytes = 0;
        const totalBytes = asset.size || 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            loadedBytes += value.length;
            fileStream.write(Buffer.from(value));
            
            if (totalBytes > 0) {
                const percent = ((loadedBytes / totalBytes) * 100).toFixed(1);
                mainWindow.webContents.send('download-progress', {
                    id: 'binary-download',
                    status: 'Downloading binary...',
                    progress: parseFloat(percent),
                    speed: `${(loadedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
                    eta: ''
                });
            }
        }
        fileStream.end();
        
        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        
        logToUI('Download complete. Extracting files...');
        
        const extractDir = getBinaryDir();
        if (assetName.endsWith('.zip')) {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(downloadPath);
            zip.extractAllTo(extractDir, true);
        } else if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tgz')) {
            const tar = require('tar');
            await tar.x({
                file: downloadPath,
                cwd: extractDir
            });
        }
        
        // Find binary
        const binaryName = getBinaryName();
        let foundPath = '';
        
        function searchForBinary(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (['node_modules', 'src', 'release', '.git', 'assets'].includes(file)) continue;
                    const nested = searchForBinary(fullPath);
                    if (nested) return nested;
                } else if (file === binaryName) {
                    return fullPath;
                }
            }
            return '';
        }
        
        foundPath = searchForBinary(extractDir);
        if (!foundPath) {
            throw new Error(`Could not find ${binaryName} inside extracted files.`);
        }
        
        const destPath = path.join(extractDir, binaryName);
        if (foundPath !== destPath) {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            fs.renameSync(foundPath, destPath);
        }
        
        // Clean up archive
        fs.unlinkSync(downloadPath);
        
        // chmod on non-Windows
        if (platform !== 'win32') {
            fs.chmodSync(destPath, '755');
        }
        
        logToUI(`Binary setup successfully! Path: ${destPath}`);
        return { success: true };
    } catch(e) {
        logToUI(`Error downloading binary: ${e.message}`);
        console.error(e);
        return { success: false, error: e.message };
    }
});

// Helper to log logs to UI
function logToUI(msg) {
    if (mainWindow) {
        mainWindow.webContents.send('log-message', msg);
    }
    console.log(msg);
}

// 3. Embedded Login Flow
let loginWin = null;

// Known login/auth page patterns — if URL matches these, user is NOT yet logged in
const LOGIN_URL_PATTERNS = [
    /domestika\.org\/auth\//i,
    /domestika\.org\/[a-z-]+\/login/i,
    /domestika\.org\/[a-z-]+\/users\/sign_in/i,
    /domestika\.org\/[a-z-]+\/users\/password/i,
    /domestika\.org\/[a-z-]+\/sessions/i
];

function isLoginPage(url) {
    return LOGIN_URL_PATTERNS.some(pattern => pattern.test(url));
}

async function harvestDomestikaCookies() {
    const ses = session.defaultSession;
    // Query by URL to capture host-only cookies (no leading dot) on www.domestika.org
    // as well as domain cookies on .domestika.org
    const byUrl = await ses.cookies.get({ url: 'https://www.domestika.org' });
    const byDomain = await ses.cookies.get({ domain: 'domestika.org' });
    // Merge both lists, deduplicate by name
    const seen = new Set();
    const all = [];
    for (const c of [...byUrl, ...byDomain]) {
        if (!seen.has(c.name)) {
            seen.add(c.name);
            all.push(c);
        }
    }
    const session_ = all.find(c => c.name === '_domestika_session');
    const creds = all.find(c => c.name === '_credentials_');
    console.log('[Cookies] Harvested names:', all.map(c => c.name).join(', '));
    return { sessionCookie: session_ || null, credentialsCookie: creds || null, all };
}

async function tryCaptureCookiesAndClose(loginWin) {
    if (!loginWin || loginWin.isDestroyed()) return false;

    const { sessionCookie, credentialsCookie, all } = await harvestDomestikaCookies();

    // We need at least the session cookie to be authenticated
    if (!sessionCookie) return false;

    // Build cookies array for storage (include all domestika.org cookies)
    const relevantCookies = all
        .filter(c => c.name === '_domestika_session' || c.name === '_credentials_' || c.name.startsWith('_session'))
        .map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || '.domestika.org'
        }));

    settings.cookies = relevantCookies.length > 0 ? relevantCookies : [
        { name: '_domestika_session', value: sessionCookie.value, domain: '.domestika.org' }
    ];
    settings._credentials_ = credentialsCookie ? credentialsCookie.value : '';
    saveSettings();

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('login-status', {
            loggedIn: true,
            message: credentialsCookie
                ? 'Successfully Authenticated! Full API access available.'
                : 'Session captured. Some features may require the credentials cookie.'
        });
    }
    if (!loginWin.isDestroyed()) loginWin.close();
    return true;
}

ipcMain.handle('start-login', async (event) => {
    if (loginWin && !loginWin.isDestroyed()) {
        loginWin.focus();
        return;
    }

    // Clear existing domestika session cookies before logging in fresh
    try {
        const ses = session.defaultSession;
        const existing = await ses.cookies.get({ domain: 'domestika.org' });
        for (const c of existing) {
            const cookieUrl = `https://${c.domain.replace(/^\./, '')}/`;
            await ses.cookies.remove(cookieUrl, c.name);
        }
    } catch (e) {
        console.warn('Could not clear old session cookies:', e.message);
    }

    loginWin = new BrowserWindow({
        width: 900,
        height: 750,
        parent: mainWindow,
        modal: false, // non-modal so user can interact freely
        show: false,
        title: 'Log in to Domestika',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Use same default session so we can read cookies
            session: session.defaultSession
        }
    });

    loginWin.loadURL('https://www.domestika.org/auth/login');
    loginWin.once('ready-to-show', () => {
        loginWin.show();
        logToUI('Login window opened. Please log in to Domestika...');
    });

    // Primary method: watch navigation events
    // When user navigates away from login pages to the main site, they're logged in
    loginWin.webContents.on('did-navigate', async (e, url) => {
        if (!loginWin || loginWin.isDestroyed()) return;
        console.log('[Login] Navigated to:', url);

        // If not on a login page and on the domestika domain, try to capture
        if (url.includes('domestika.org') && !isLoginPage(url)) {
            // Wait longer (3s) to let Domestika's JS set the _credentials_ cookie
            setTimeout(async () => {
                const captured = await tryCaptureCookiesAndClose(loginWin);
                if (captured) {
                    clearInterval(fallbackInterval);
                    logToUI('Login detected via navigation event.');
                }
            }, 3000);
        }
    });

    loginWin.webContents.on('did-navigate-in-page', async (e, url) => {
        if (!loginWin || loginWin.isDestroyed()) return;
        if (url.includes('domestika.org') && !isLoginPage(url)) {
            setTimeout(async () => {
                await tryCaptureCookiesAndClose(loginWin);
            }, 3000);
        }
    });

    // Fallback: poll every 3 seconds regardless
    const fallbackInterval = setInterval(async () => {
        if (!loginWin || loginWin.isDestroyed()) {
            clearInterval(fallbackInterval);
            return;
        }
        const currentUrl = loginWin.webContents.getURL();
        if (currentUrl.includes('domestika.org') && !isLoginPage(currentUrl)) {
            const captured = await tryCaptureCookiesAndClose(loginWin);
            if (captured) clearInterval(fallbackInterval);
        }
    }, 3000);

    loginWin.on('closed', () => {
        clearInterval(fallbackInterval);
        loginWin = null;
        logToUI('Login window closed.');
    });
});

ipcMain.handle('check-login', async () => {
    // Check live session cookies first
    const { sessionCookie } = await harvestDomestikaCookies();
    if (sessionCookie) {
        return { loggedIn: true };
    }
    // Fallback: check persisted settings
    const hasSession = settings.cookies && settings.cookies.some(c => c.name === '_domestika_session' && c.value);
    return { loggedIn: hasSession };
});

ipcMain.handle('logout', async () => {
    const ses = session.defaultSession;
    // Remove all domestika cookies
    try {
        const all = await ses.cookies.get({ domain: 'domestika.org' });
        for (const c of all) {
            const cookieUrl = `https://${c.domain.replace(/^\./, '')}/`;
            await ses.cookies.remove(cookieUrl, c.name);
        }
    } catch (e) {
        console.warn('Error clearing cookies:', e.message);
    }
    await ses.clearStorageData({ storages: ['localStorage', 'sessionStorage', 'indexedDB'] });
    settings.cookies = [];
    settings._credentials_ = '';
    saveSettings();
    return { success: true };
});

// Helper for cookies set
async function setCookiesOnSession(cookiesList) {
    const ses = session.defaultSession;
    for (const cookie of cookiesList) {
        const domain = cookie.domain || '.domestika.org';
        const url = `https://${domain.replace(/^\./, '')}`;
        await ses.cookies.set({
            url: url,
            name: cookie.name,
            value: cookie.value,
            domain: domain,
            path: cookie.path || '/'
        });
    }
}

async function fetchFromApi(apiUrl, acceptVersion, accessToken) {
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            'x-dmstk-accept-version': acceptVersion,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`API fetch failed with status: ${response.status}`);
    }
    return await response.json();
}

// 4. Course Scraper
ipcMain.handle('fetch-course', async (event, courseUrl) => {
    logToUI(`Fetching course page: ${courseUrl}`);
    const tempWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    try {
        // Apply settings cookies
        await setCookiesOnSession(settings.cookies);
        if (settings._credentials_) {
            const ses = session.defaultSession;
            await ses.cookies.set({
                url: 'https://www.domestika.org',
                name: '_credentials_',
                value: settings._credentials_,
                domain: '.domestika.org',
                path: '/'
            });
        }

        await tempWin.loadURL(courseUrl);

        // Extract Title and Units from page DOM
        const courseData = await tempWin.webContents.executeJavaScript(`(() => {
            let ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
            let courseSchema = null;
            for (let script of ldJsonScripts) {
                try {
                    let parsed = JSON.parse(script.innerHTML.trim());
                    let candidates = Array.isArray(parsed) ? parsed : [parsed];
                    for (const entry of candidates) {
                        if (entry['@context'] && entry['@context'].includes('schema.org') && entry['@type'] === 'Course') {
                            courseSchema = entry;
                            break;
                        }
                    }
                } catch(e) {}
                if (courseSchema) break;
            }
            
            let title = '';
            if (courseSchema && courseSchema.name) {
                title = courseSchema.name.trim();
            } else {
                title = document.title.split('|')[0].trim();
            }
            
            let unitElements = document.querySelectorAll('h4.h2.unit-item__title a, h4.unit-item__title a');
            if (unitElements.length === 0) {
                unitElements = document.querySelectorAll('.unit-item__title a, a[href*="/course/units/"]');
            }
            
            let units = [];
            unitElements.forEach((el, index) => {
                units.push({
                    id: index,
                    title: el.innerText.trim(),
                    href: el.getAttribute('href')
                });
            });
            
            return {
                title,
                units
            };
        })()`);

        if (!courseData || !courseData.units || courseData.units.length === 0) {
            throw new Error("Could not find any units. Ensure you are logged in and have access to this course.");
        }

        // Get Final Project ID if any
        let finalProjectId = null;
        const regexFinal = /courses\/(.*?)-*\/final_project/i;
        for (const unit of courseData.units) {
            const match = regexFinal.exec(unit.href);
            if (match) {
                finalProjectId = match[1].split('-')[0];
                break;
            }
        }

        // Remove final project unit from standard units list
        courseData.units = courseData.units.filter(unit => !regexFinal.test(unit.href));

        logToUI(`Scraped: "${courseData.title}". Fetching lessons for ${courseData.units.length} units...`);

        // Load each unit page to extract videos (from window.__INITIAL_PROPS__)
        const finalUnits = [];
        for (let i = 0; i < courseData.units.length; i++) {
            const unit = courseData.units[i];
            logToUI(`Fetching lessons from unit ${i+1}/${courseData.units.length}: ${unit.title}`);
            await tempWin.loadURL(unit.href);

            const unitDetails = await tempWin.webContents.executeJavaScript(`(() => {
                const data = window.__INITIAL_PROPS__;
                let sectionEl = document.querySelector('h2.h3.course-header-new__subtitle, h2.course-header-new__subtitle, .course-header-new__subtitle');
                let section = sectionEl ? sectionEl.innerText.trim() : 'General';
                
                let videos = [];
                if (data && data.videos && data.videos.length > 0) {
                    data.videos.forEach((v, index) => {
                        if (v.video && v.video.playbackURL) {
                            videos.push({
                                playbackURL: v.video.playbackURL,
                                title: v.video.title ? v.video.title.replaceAll('.', '').trim() : \`Lesson \${index + 1}\`
                            });
                        }
                    });
                }
                return { section, videos };
            })()`);

            finalUnits.push({
                index: i + 1,
                title: unit.title.replace(/[/\\?%*:|"<>]/g, '-'),
                section: unitDetails.section.replace(/[/\\?%*:|"<>]/g, '-'),
                videos: unitDetails.videos
            });
        }

        // Fetch Final Project video from API if credentials are available
        if (finalProjectId && settings._credentials_) {
            try {
                logToUI("Fetching final project video details...");
                const decodedCredentials = decodeURIComponent(settings._credentials_);
                const regexToken = /accessToken":"(.*?)"/;
                const match = regexToken.exec(decodedCredentials);
                
                if (match && match[1]) {
                    const accessToken = match[1];
                    const finalProjData = await fetchFromApi(`https://api.domestika.org/api/courses/${finalProjectId}/final-project?with_server_timing=true`, 'finalProject.v1', accessToken);
                    
                    if (finalProjData && finalProjData.data && finalProjData.data.relationships) {
                        const finalVideoRelation = finalProjData.data.relationships.video;
                        if (finalVideoRelation && finalVideoRelation.data && finalVideoRelation.data.id) {
                            const videoId = finalVideoRelation.data.id;
                            const videoData = await fetchFromApi(`https://api.domestika.org/api/videos/${videoId}?with_server_timing=true`, 'video.v1', accessToken);
                            
                            if (videoData && videoData.data && videoData.data.attributes && videoData.data.attributes.playbackUrl) {
                                finalUnits.push({
                                    index: finalUnits.length + 1,
                                    title: 'Final Project',
                                    section: 'Final Project',
                                    videos: [
                                        {
                                            playbackURL: videoData.data.attributes.playbackUrl,
                                            title: 'Final Project'
                                        }
                                    ]
                                });
                                logToUI("Added Final Project video");
                            }
                        }
                    }
                }
            } catch (err) {
                logToUI(`Could not fetch final project video: ${err.message}`);
                console.error(err);
            }
        }

        logToUI("Scraping completed!");
        return {
            success: true,
            course: {
                title: courseData.title.replace(/[/\\?%*:|"<>]/g, '-'),
                units: finalUnits
            }
        };

    } catch (e) {
        logToUI(`Scraping failed: ${e.message}`);
        console.error(e);
        return { success: false, error: e.message };
    } finally {
        tempWin.close();
    }
});

// 5. Download Queue Controller
let activeProcesses = [];
let activeQueue = [];
let isDownloading = false;

ipcMain.handle('start-download', async (event, params) => {
    if (isDownloading) {
        logToUI('A download process is already running.');
        return { success: false, error: 'Queue is already running.' };
    }

    const { courseTitle, lessons, subtitleLangs, transcode, useNvenc, concurrency } = params;
    activeQueue = [...lessons]; // Array of { id, unitTitle, sectionTitle, videoTitle, playbackURL, index }
    isDownloading = true;
    activeProcesses = [];

    logToUI(`Starting downloads for: ${courseTitle} (${activeQueue.length} lessons)`);
    processQueue(courseTitle, subtitleLangs, transcode, useNvenc, concurrency);

    return { success: true };
});

ipcMain.handle('stop-download', () => {
    logToUI('Stopping active downloads...');
    isDownloading = false;
    activeQueue = [];
    
    // Terminate all running processes
    activeProcesses.forEach(proc => {
        try {
            proc.kill();
        } catch(e) {}
    });
    activeProcesses = [];
    
    logToUI('Downloads stopped.');
    return { success: true };
});

ipcMain.handle('redownload-lesson', async (event, params) => {
    // Redownload single file helper
    const { courseTitle, lesson, subtitleLangs, transcode, useNvenc } = params;
    logToUI(`Starting redownload for lesson: ${lesson.videoTitle}`);
    
    // Push single lesson to the queue
    activeQueue.push(lesson);
    if (!isDownloading) {
        isDownloading = true;
        processQueue(courseTitle, subtitleLangs, transcode, useNvenc, 1);
    }
    return { success: true };
});

async function processQueue(courseTitle, subtitleLangs, transcode, useNvenc, maxConcurrency) {
    const runningTasks = new Set();
    
    const runNextTask = async () => {
        if (!isDownloading || activeQueue.length === 0) {
            if (runningTasks.size === 0) {
                isDownloading = false;
                logToUI('All downloads in queue finished.');
                if (mainWindow) {
                    mainWindow.webContents.send('download-progress', { id: 'queue-finished', status: 'Finished' });
                }
            }
            return;
        }

        const task = activeQueue.shift();
        runningTasks.add(task);

        // Notify UI that task is starting
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', {
                id: task.id,
                status: 'Starting...',
                progress: 0,
                speed: '',
                eta: ''
            });
        }

        try {
            await downloadTaskPromise(task, courseTitle, subtitleLangs, transcode, useNvenc);
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    id: task.id,
                    status: 'Completed',
                    progress: 100,
                    speed: '',
                    eta: ''
                });
            }
        } catch (err) {
            logToUI(`Failed downloading lesson ${task.videoTitle}: ${err.message}`);
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    id: task.id,
                    status: 'Failed',
                    progress: 0,
                    speed: '',
                    eta: ''
                });
            }
        } finally {
            runningTasks.delete(task);
            // Run next task
            runNextTask();
        }
    };

    // Spawn up to maxConcurrency parallel workers
    const limit = Math.min(maxConcurrency, activeQueue.length);
    for (let i = 0; i < limit; i++) {
        runNextTask();
    }
}

async function getFileCodec(filePath) {
    try {
        const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const { stdout } = await execPromise(cmd);
        return stdout.trim();
    } catch (e) {
        return 'unknown';
    }
}

function downloadTaskPromise(task, courseTitle, subtitleLangs, transcode, useNvenc) {
    return new Promise((resolve, reject) => {
        const cleanCourse = courseTitle;
        const cleanSection = task.sectionTitle;
        const cleanUnit = task.unitTitle;
        
        // Save directory path
        const saveDir = path.join(settings.downloadFolder, cleanCourse, cleanSection, cleanUnit);
        
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }
        
        const saveName = `${task.index}_${task.videoTitle}`;
        
        const binaryName = getBinaryName();
        const binaryPath = path.join(getBinaryDir(), binaryName);
        
        if (!fs.existsSync(binaryPath)) {
            reject(new Error(`N_m3u8DL-RE binary not found at ${binaryPath}`));
            return;
        }

        const args = [
            task.playbackURL,
            '-sv', 'res="1080*":for=best',
            '--save-dir', saveDir,
            '--tmp-dir', saveDir,
            '--save-name', saveName
        ];

        // Add subtitles
        if (subtitleLangs && subtitleLangs.length > 0) {
            args.push('--auto-subtitle-fix');
            args.push('--sub-format', 'SRT');
            
            let subRegex = '';
            if (subtitleLangs.includes('all')) {
                subRegex = 'all';
            } else {
                subRegex = `lang=${subtitleLangs.join('|')}:for=all`;
            }
            args.push('--select-subtitle', subRegex);
        }

        args.push('--no-ansi-color');

        const child = spawn(binaryPath, args, { cwd: getBinaryDir() });
        activeProcesses.push(child);

        let progress = 0;
        let speed = '';
        let eta = '';

        const parseOutput = (data) => {
            const text = data.toString();
            
            // Extract percentage e.g. "45.23%"
            const percentMatch = /(\d+(?:\.\d+)?)%/.exec(text);
            if (percentMatch) {
                progress = parseFloat(percentMatch[1]);
            }
            
            // Extract speed e.g. "1.52MB/s"
            const speedMatch = /(\d+(?:\.\d+)?\s*(?:MB\/s|KB\/s|Mbps|Kbps))/.exec(text);
            if (speedMatch) {
                speed = speedMatch[1];
            }
            
            // Extract ETA e.g. "00:00:23"
            const etaMatch = /ETA\s*([\d:hms]+)/i.exec(text);
            if (etaMatch) {
                eta = etaMatch[1];
            }

            if (mainWindow) {
                mainWindow.webContents.send('download-progress', {
                    id: task.id,
                    status: 'Downloading...',
                    progress,
                    speed,
                    eta
                });
            }
        };

        child.stdout.on('data', parseOutput);
        child.stderr.on('data', parseOutput);

        child.on('close', async (code) => {
            // Remove from active processes list
            activeProcesses = activeProcesses.filter(p => p !== child);

            if (code !== 0) {
                reject(new Error(`N_m3u8DL-RE exited with code ${code}`));
                return;
            }

            // Perform transcoding if requested
            if (transcode) {
                try {
                    if (mainWindow) {
                        mainWindow.webContents.send('download-progress', {
                            id: task.id,
                            status: 'Transcoding (H.265)...',
                            progress: 99,
                            speed: '',
                            eta: ''
                        });
                    }

                    const downloadedFile = path.join(saveDir, `${saveName}.mp4`);
                    const tempOutput = path.join(saveDir, `${saveName}_hevc.mp4`);

                    if (fs.existsSync(downloadedFile)) {
                        const codec = await getFileCodec(downloadedFile);
                        if (codec !== 'hevc' && codec !== 'h265') {
                            const encoder = useNvenc ? 'hevc_nvenc' : 'libx265';
                            const encoderParams = useNvenc 
                                ? '-preset p7 -tune hq -rc vbr -cq 23 -b:v 0' 
                                : '-preset medium -crf 23';
                                
                            const transcodeCmd = `ffmpeg -y -i "${downloadedFile}" -c:v ${encoder} ${encoderParams} -c:a copy -c:s copy "${tempOutput}"`;
                            await execPromise(transcodeCmd);
                            
                            fs.unlinkSync(downloadedFile);
                            fs.renameSync(tempOutput, downloadedFile);
                            logToUI(`Transcode successful for ${task.videoTitle}`);
                        } else {
                            logToUI(`Skipped transcode: ${task.videoTitle} is already HEVC.`);
                        }
                    }
                } catch (transcodeErr) {
                    logToUI(`Transcoding failed for ${task.videoTitle}: ${transcodeErr.message}`);
                    // Resolve anyway as the file is downloaded successfully
                }
            }

            resolve();
        });

        child.on('error', (err) => {
            activeProcesses = activeProcesses.filter(p => p !== child);
            reject(err);
        });
    });
}

// 6. Library Explorer IPC Handler
ipcMain.handle('scan-library', () => {
    const rootDir = settings.downloadFolder;
    if (!fs.existsSync(rootDir)) {
        return [];
    }

    const courses = [];
    try {
        const courseFolders = fs.readdirSync(rootDir);
        for (const courseName of courseFolders) {
            const coursePath = path.join(rootDir, courseName);
            if (!fs.statSync(coursePath).isDirectory()) continue;

            const course = {
                title: courseName,
                path: coursePath,
                sections: []
            };

            const sectionFolders = fs.readdirSync(coursePath);
            for (const sectionName of sectionFolders) {
                const sectionPath = path.join(coursePath, sectionName);
                if (!fs.statSync(sectionPath).isDirectory()) continue;

                const section = {
                    title: sectionName,
                    path: sectionPath,
                    units: []
                };

                const unitFolders = fs.readdirSync(sectionPath);
                for (const unitName of unitFolders) {
                    const unitPath = path.join(sectionPath, unitName);
                    if (!fs.statSync(unitPath).isDirectory()) continue;

                    const unit = {
                        title: unitName,
                        path: unitPath,
                        files: []
                    };

                    const files = fs.readdirSync(unitPath);
                    for (const fileName of files) {
                        const filePath = path.join(unitPath, fileName);
                        const stat = fs.statSync(filePath);
                        if (stat.isFile()) {
                            unit.files.push({
                                name: fileName,
                                path: filePath,
                                sizeBytes: stat.size
                            });
                        }
                    }

                    if (unit.files.length > 0) {
                        section.units.push(unit);
                    }
                }

                if (section.units.length > 0) {
                    course.sections.push(section);
                }
            }

            if (course.sections.length > 0) {
                courses.push(course);
            }
        }
    } catch (e) {
        console.error('Library scan error:', e);
    }
    return courses;
});

ipcMain.handle('open-path', async (event, targetPath) => {
    if (fs.existsSync(targetPath)) {
        await shell.openPath(targetPath);
        return { success: true };
    }
    return { success: false, error: 'Path does not exist.' };
});
