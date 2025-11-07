class DigilockerManager {
    constructor() {
        this.isUnlocked = false;
        this.documents = [];
        this.hasPin = false;
        
        // Store native document methods to avoid conflicts
        this._createElement = Document.prototype.createElement.bind(window.document);
        
        // DOM Elements
        this.pinSetupModal = window.document.getElementById('pinSetupModal');
        this.pinVerifyModal = window.document.getElementById('pinVerifyModal');
        this.digilockerLanding = window.document.getElementById('digilockerLanding');
        this.digilockerMain = window.document.getElementById('digilockerMain');
        this.documentsGrid = window.document.getElementById('documentsGrid');
        this.documentsCount = window.document.getElementById('documentsCount');
        this.fileInput = window.document.getElementById('fileInput');
        this.pdfViewerModal = window.document.getElementById('pdfViewerModal');
        this.pdfTitle = window.document.getElementById('pdfTitle');
        this.loadingOverlay = window.document.getElementById('loadingOverlay');
        this.emptyState = window.document.getElementById('emptyState');
        
        this.initializeDigilocker();
        this.setupEventListeners();
    }

    async initializeDigilocker() {
        try {
            const response = await fetch('/api/digilocker/pin/check');
            const data = await response.json();
            
            if (data.success) {
                this.hasPin = data.has_pin;
            }
        } catch (error) {
            console.error('Error checking PIN status:', error);
        }
    }

    setupEventListeners() {
        this.setupPinInputs('setupPinInputs');
        this.setupPinInputs('verifyPinInputs');
        this.setupDragAndDrop();
    }

    setupPinInputs(containerId) {
        const container = document.getElementById(containerId);
        const inputs = container.querySelectorAll('.pin-digit');
        
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                
                if (value.match(/[0-9]/)) {
                    e.target.classList.add('filled');
                    
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else {
                    e.target.value = '';
                    e.target.classList.remove('filled');
                }
                
                this.updatePinButton(containerId);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace') {
                    e.target.value = '';
                    e.target.classList.remove('filled');
                    
                    if (index > 0) {
                        inputs[index - 1].focus();
                    }
                    
                    this.updatePinButton(containerId);
                }
            });
        });
    }

    updatePinButton(containerId) {
        const container = document.getElementById(containerId);
        const inputs = container.querySelectorAll('.pin-digit');
        const filledCount = Array.from(inputs).filter(input => input.value.length > 0).length;
        
        const buttonId = containerId === 'setupPinInputs' ? 'setupPinBtn' : 'verifyPinBtn';
        const button = document.getElementById(buttonId);
        
        button.disabled = filledCount < 6;
    }

    showPinSetup() {
        this.digilockerLanding.style.display = 'none';
        this.pinSetupModal.style.display = 'flex';
        this.pinVerifyModal.style.display = 'none';
        this.digilockerMain.style.display = 'none';
        
        setTimeout(() => {
            document.querySelector('#setupPinInputs .pin-digit').focus();
        }, 300);
    }

    showPinVerification() {
        this.digilockerLanding.style.display = 'none';
        this.pinSetupModal.style.display = 'none';
        this.pinVerifyModal.style.display = 'flex';
        this.digilockerMain.style.display = 'none';
        
        setTimeout(() => {
            document.querySelector('#verifyPinInputs .pin-digit').focus();
        }, 300);
    }

    async showDigilocker() {
        this.digilockerLanding.style.display = 'none';
        this.pinSetupModal.style.display = 'none';
        this.pinVerifyModal.style.display = 'none';
        this.digilockerMain.style.display = 'block';
        this.isUnlocked = true;
        
        await this.loadDocuments();
    }

    async loadDocuments() {
        try {
            this.showLoading('Loading documents...');
            
            const response = await fetch('/api/digilocker/documents');
            const data = await response.json();
            
            if (data.success) {
                this.documents = data.documents;
                this.renderDocuments();
            }
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading documents:', error);
            this.hideLoading();
            this.showMessage('Failed to load documents', 'error');
        }
    }

    setupDragAndDrop() {
        const uploadArea = document.querySelector('.upload-area');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'), false);
        });
        
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files);
    }

    async processFiles(files) {
        const pdfFiles = files.filter(file => file.type === 'application/pdf');
        
        if (pdfFiles.length === 0) {
            this.showMessage('Please upload only PDF files.', 'error');
            return;
        }
        
        this.showLoading('Uploading documents...');
        
        try {
            for (const file of pdfFiles) {
                await this.uploadDocument(file);
            }
            
            await this.loadDocuments();
            this.hideLoading();
            this.showMessage(`Successfully uploaded ${pdfFiles.length} document(s).`, 'success');
        } catch (error) {
            this.hideLoading();
            this.showMessage('Error uploading documents. Please try again.', 'error');
        }
    }

    async uploadDocument(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/digilocker/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Upload failed');
        }
        
        return data.document;
    }

    renderDocuments() {
        // Update documents count
        this.documentsCount.textContent = this.documents.length;
        
        // Clear existing content
        this.documentsGrid.innerHTML = '';
        
        // Show/hide empty state
        if (this.documents.length === 0) {
            this.emptyState.style.display = 'flex';
            this.documentsGrid.style.display = 'none';
            return;
        }
        
        this.emptyState.style.display = 'none';
        this.documentsGrid.style.display = 'grid';
        
        // Render document cards
        const documentsHtml = this.documents.map(doc => `
            <div class="document-card" data-id="${doc.id}">
                <div class="document-header">
                    <div class="document-icon">PDF</div>
                    <div class="document-info">
                        <div class="document-name" title="${doc.filename}">${this.truncateName(doc.filename)}</div>
                        <div class="document-meta">
                            ${this.formatFileSize(doc.file_size)} • ${this.formatDate(doc.upload_date)}
                        </div>
                    </div>
                </div>
                <div class="document-actions">
                    <button class="doc-action-btn view-btn" onclick="digilockerManager.viewDocument('${doc.id}')">
                        View
                    </button>
                    <button class="doc-action-btn delete-btn" onclick="digilockerManager.deleteDocument('${doc.id}')">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
        
        this.documentsGrid.innerHTML = documentsHtml;
    }

    truncateName(name, maxLength = 25) {
        if (name.length <= maxLength) return name;
        return name.substring(0, maxLength - 3) + '...';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    viewDocument(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) {
            this.showMessage('Document not found', 'error');
            return;
        }
        
        console.log('Viewing document:', docId, doc);
        
        // Set document title
        if (this.pdfTitle) {
            this.pdfTitle.textContent = doc.filename;
        }
        
        // Find the pdf-modal-content container
        const pdfModalContent = this.pdfViewerModal.querySelector('.pdf-modal-content');
        
        if (!pdfModalContent) {
            console.error('PDF modal content not found');
            this.showMessage('PDF viewer not found', 'error');
            return;
        }
        
        console.log('PDF modal content found:', pdfModalContent);
        
        const pdfUrl = `/api/digilocker/document/${docId}`;
        
        // Build HTML string instead of using createElement
        const viewerHTML = `
            <div class="pdf-viewer-container" style="width: 100%; height: 70vh; min-height: 500px; background: #f5f5f5; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
                <iframe id="pdfFrame" src="${pdfUrl}" style="width: 100%; height: 100%; border: none; flex: 1;"></iframe>
                <div style="padding: 1rem; background: white; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <span id="pdfFileName" style="font-size: 0.9rem; color: #6c757d; flex: 1; margin-right: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${doc.filename}
                    </span>
                    <button id="downloadBtn" class="pdf-action-btn download-btn" style="background: #e74c3c; color: white; border: none; padding: 0.7rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;">
                        💾 Download Document
                    </button>
                </div>
            </div>
        `;
        
        // Set the HTML content
        pdfModalContent.innerHTML = viewerHTML;
        
        console.log('PDF viewer HTML inserted');
        
        // Setup download button after HTML is inserted
        const downloadBtn = pdfModalContent.querySelector('#downloadBtn');
        if (downloadBtn) {
            downloadBtn.onclick = (e) => {
                e.preventDefault();
                const link = window.document.createElement('a');
                link.href = pdfUrl;
                link.download = doc.filename;
                link.target = '_blank';
                window.document.body.appendChild(link);
                link.click();
                window.document.body.removeChild(link);
            };
            
            downloadBtn.onmouseover = () => {
                downloadBtn.style.background = '#c0392b';
                downloadBtn.style.transform = 'translateY(-2px)';
            };
            
            downloadBtn.onmouseout = () => {
                downloadBtn.style.background = '#e74c3c';
                downloadBtn.style.transform = 'translateY(0)';
            };
        }
        
        // Setup iframe error handling
        const iframe = pdfModalContent.querySelector('#pdfFrame');
        if (iframe) {
            iframe.onerror = () => {
                console.error('Failed to load PDF');
                pdfModalContent.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 500px; text-align: center; padding: 2rem;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                        <h3 style="color: #dc3545; margin-bottom: 1rem;">Failed to load PDF</h3>
                        <p style="color: #6c757d; margin-bottom: 1.5rem;">The document couldn't be displayed in the browser.</p>
                        <button onclick="window.open('${pdfUrl}', '_blank')" style="background: #e74c3c; color: white; border: none; padding: 0.7rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            Open in New Tab
                        </button>
                    </div>
                `;
            };
            
            iframe.onload = () => {
                console.log('PDF loaded successfully');
            };
        }
        
        // Show modal
        this.pdfViewerModal.style.display = 'flex';
        
        console.log('Modal displayed');
    }

    async deleteDocument(docId) {
        const document = this.documents.find(doc => doc.id === docId);
        if (!document) {
            this.showMessage('Document not found', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${document.filename}"?`)) {
            return;
        }
        
        try {
            this.showLoading('Deleting document...');
            
            const response = await fetch(`/api/digilocker/document/${docId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Remove from local array
                this.documents = this.documents.filter(doc => doc.id !== docId);
                
                // Re-render documents
                this.renderDocuments();
                
                this.showMessage('Document deleted successfully.', 'success');
            } else {
                throw new Error(data.error || 'Delete failed');
            }
            
            this.hideLoading();
        } catch (error) {
            console.error('Error deleting document:', error);
            this.hideLoading();
            this.showMessage('Failed to delete document', 'error');
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = window.document.createElement('div');
        messageEl.className = `pin-message ${type}`;
        messageEl.textContent = message;
        messageEl.style.position = 'fixed';
        messageEl.style.top = '20px';
        messageEl.style.right = '20px';
        messageEl.style.background = type === 'error' ? '#dc3545' : '#28a745';
        messageEl.style.color = 'white';
        messageEl.style.padding = '1rem 1.5rem';
        messageEl.style.borderRadius = '10px';
        messageEl.style.zIndex = '10000';
        messageEl.style.animation = 'slideInRight 0.3s ease';
        messageEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        
        window.document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => messageEl.remove(), 300);
        }, 3000);
    }

    showLoading(text = 'Processing...') {
        const loadingText = this.loadingOverlay.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }
}

// Global functions
async function openDigilocker() {
    const landing = document.getElementById('digilockerLanding');
    landing.style.display = 'none';
    
    if (!digilockerManager.hasPin) {
        digilockerManager.showPinSetup();
    } else {
        digilockerManager.showPinVerification();
    }
}

async function setupPin() {
    const inputs = document.querySelectorAll('#setupPinInputs .pin-digit');
    const pin = Array.from(inputs).map(input => input.value).join('');
    const messageEl = document.getElementById('setupPinMessage');
    const button = document.getElementById('setupPinBtn');
    
    if (pin.length !== 6) {
        messageEl.textContent = 'Please enter a 6-digit PIN';
        messageEl.className = 'pin-message error';
        return;
    }
    
    try {
        button.disabled = true;
        button.textContent = 'Setting PIN...';
        
        const response = await fetch('/api/digilocker/pin/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pin })
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageEl.textContent = 'PIN set successfully!';
            messageEl.className = 'pin-message success';
            digilockerManager.hasPin = true;
            
            setTimeout(() => {
                digilockerManager.showDigilocker();
            }, 1000);
        } else {
            throw new Error(data.error || 'Failed to set PIN');
        }
    } catch (error) {
        console.error('Error setting PIN:', error);
        messageEl.textContent = 'Failed to set PIN. Please try again.';
        messageEl.className = 'pin-message error';
        button.disabled = false;
        button.textContent = 'Set PIN';
    }
}

async function verifyPin() {
    const inputs = document.querySelectorAll('#verifyPinInputs .pin-digit');
    const pin = Array.from(inputs).map(input => input.value).join('');
    const messageEl = document.getElementById('verifyPinMessage');
    const button = document.getElementById('verifyPinBtn');
    
    if (pin.length !== 6) {
        messageEl.textContent = 'Please enter your 6-digit PIN';
        messageEl.className = 'pin-message error';
        return;
    }
    
    try {
        button.disabled = true;
        button.textContent = 'Verifying...';
        
        const response = await fetch('/api/digilocker/pin/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pin })
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageEl.textContent = 'PIN verified successfully!';
            messageEl.className = 'pin-message success';
            
            setTimeout(() => {
                digilockerManager.showDigilocker();
            }, 1000);
        } else {
            messageEl.textContent = 'Incorrect PIN. Please try again.';
            messageEl.className = 'pin-message error';
            
            inputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled');
            });
            inputs[0].focus();
            
            button.disabled = false;
            button.textContent = 'Unlock';
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        messageEl.textContent = 'Verification failed. Please try again.';
        messageEl.className = 'pin-message error';
        button.disabled = false;
        button.textContent = 'Unlock';
    }
}

async function resetPin() {
    if (!confirm('Are you sure you want to reset your PIN? This will also delete all stored documents for security reasons.')) {
        return;
    }
    
    try {
        digilockerManager.showLoading('Resetting PIN and deleting documents...');
        
        const response = await fetch('/api/digilocker/pin/reset', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            digilockerManager.hideLoading();
            alert('PIN and documents reset successfully. You will need to set up a new PIN.');
            window.location.reload();
        } else {
            throw new Error(data.error || 'Reset failed');
        }
    } catch (error) {
        console.error('Error resetting PIN:', error);
        digilockerManager.hideLoading();
        alert('Failed to reset PIN. Please try again.');
    }
}

function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    digilockerManager.processFiles(files);
    event.target.value = '';
}

function closePdfViewer() {
    const modal = document.getElementById('pdfViewerModal');
    modal.style.display = 'none';
    
    // Clear all iframes to stop loading PDF
    const iframes = modal.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        iframe.src = '';
        iframe.remove();
    });
}

// Initialize when page loads
let digilockerManager;
document.addEventListener('DOMContentLoaded', function() {
    digilockerManager = new DigilockerManager();
    
    // Auto-open digilocker after initialization
    setTimeout(() => {
        openDigilocker();
    }, 100);
});

// Add CSS animations
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    .drag-over {
        border-color: #e74c3c !important;
        background: #fff5f5 !important;
        transform: scale(1.02) !important;
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    #pdfContent {
        position: relative;
        width: 100%;
        height: 100%;
        background: #f5f5f5;
    }
`;
document.head.appendChild(additionalStyles);