const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Settings & State
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    
    // Auth Login
    startLogin: () => ipcRenderer.invoke('start-login'),
    checkLogin: () => ipcRenderer.invoke('check-login'),
    logout: () => ipcRenderer.invoke('logout'),
    
    // Binary Tooling
    checkBinary: () => ipcRenderer.invoke('check-binary'),
    downloadBinary: () => ipcRenderer.invoke('download-binary'),
    
    // Scraper & Queue
    fetchCourse: (url) => ipcRenderer.invoke('fetch-course', url),
    startDownload: (params) => ipcRenderer.invoke('start-download', params),
    stopDownload: () => ipcRenderer.invoke('stop-download'),
    redownloadLesson: (lessonId) => ipcRenderer.invoke('redownload-lesson', lessonId),
    
    // Library Explorer
    scanLibrary: () => ipcRenderer.invoke('scan-library'),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    
    // Listeners for progress and logs
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onLog: (callback) => ipcRenderer.on('log-message', (event, msg) => callback(msg)),
    onLoginStatus: (callback) => ipcRenderer.on('login-status', (event, status) => callback(status)),
    
    // Remove all listeners
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('download-progress');
        ipcRenderer.removeAllListeners('log-message');
        ipcRenderer.removeAllListeners('login-status');
    }
});
