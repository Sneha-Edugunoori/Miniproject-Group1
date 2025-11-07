// ============================================================================
// PAYMENTS.JS - Enhanced with Transaction PIN Authentication
// ============================================================================

let userAccounts = [];
let selectedAccount = null;
let transferData = {};
let transactionPin = '';

// Set active menu item for payments page
document.addEventListener('DOMContentLoaded', function() {
    const paymentsMenuItem = document.querySelector('[data-section="payments"]');
    if (paymentsMenuItem) {
        paymentsMenuItem.classList.add('active');
    }
});

// ============================================================================
// TRANSFER FLOW FUNCTIONS
// ============================================================================

function handleTransfer() {
    const accountNumber = document.getElementById('accountNumber').value.trim();
    const ifscCode = document.getElementById('ifscCode').value.trim().toUpperCase();
    const amount = document.getElementById('amount').value.trim();
    
    // Validation
    if (!accountNumber) {
        alert('Please enter a recipient account number');
        return;
    }

    if (!ifscCode) {
        alert('Please enter IFSC code');
        return;
    }
    
    if (ifscCode.length !== 11) {
        alert('IFSC code must be exactly 11 characters');
        return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    // Validate IFSC code format and supported banks
    const supportedBanks = ['SBIN', 'HDFC', 'ICIC'];
    const ifscPrefix = ifscCode.substring(0, 4).toUpperCase();
    
    if (!supportedBanks.includes(ifscPrefix)) {
        alert('Unsupported bank. Please use SBI (SBIN), HDFC, or ICICI (ICIC) accounts.');
        return;
    }
    
    // Store transfer data
    transferData = {
        recipientAccount: accountNumber,
        ifscCode: ifscCode,
        amount: parseFloat(amount),
        destinationBank: getBankCodeFromIFSC(ifscCode)
    };
    
    // Open account selection modal
    openAccountModal();
}

// Helper function to get bank code from IFSC
function getBankCodeFromIFSC(ifsc) {
    const prefix = ifsc.substring(0, 4).toUpperCase();
    const bankMap = {
        'SBIN': 'SBI',
        'HDFC': 'HDFC',
        'ICIC': 'ICICI'
    };
    return bankMap[prefix] || null;
}

// ============================================================================
// ACCOUNT SELECTION MODAL
// ============================================================================

function openAccountModal() {
    document.getElementById('accountModal').style.display = 'block';
    fetchUserAccounts();
}

function closeAccountModal() {
    document.getElementById('accountModal').style.display = 'none';
    selectedAccount = null;
}

async function fetchUserAccounts() {
    const modalBody = document.getElementById('modalBody');
    
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="loading-spinner"></div>
            <p>Loading your accounts...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/dashboard-data');
        
        if (!response.ok) {
            throw new Error('Failed to fetch account data');
        }
        
        const data = await response.json();
        userAccounts = data.banking_data.accounts || [];
        
        if (userAccounts.length === 0) {
            modalBody.innerHTML = `
                <div class="no-accounts">
                    <p>❌ No bank accounts found. Please link your bank account first.</p>
                </div>
            `;
            return;
        }
        
        displayAccounts();
        
    } catch (error) {
        console.error('Error fetching accounts:', error);
        modalBody.innerHTML = `
            <div class="error-message">
                ❌ Failed to load your accounts. Please try again.
            </div>
        `;
    }
}

function displayAccounts() {
    const modalBody = document.getElementById('modalBody');
    
    let accountsHTML = `
        <div class="account-selection">
            <label>Choose account to transfer from:</label>
            <div class="account-list">
    `;
    
    userAccounts.forEach((account, index) => {
        const balance = parseFloat(account.balance || 0);
        const canTransfer = balance >= transferData.amount;
        
        accountsHTML += `
            <div class="account-option ${!canTransfer ? 'disabled' : ''}" 
                 onclick="${canTransfer ? `selectAccount(${index})` : ''}" 
                 data-index="${index}"
                 style="${!canTransfer ? 'cursor: not-allowed; opacity: 0.6;' : 'cursor: pointer;'}">
                <div class="account-info">
                    <div class="account-bank">${account.bank_name || 'Unknown Bank'}</div>
                    <div class="account-number">A/C: ${account.account_number}</div>
                    ${!canTransfer ? '<div style="color: #f44336; font-size: 12px; margin-top: 4px;">⚠️ Insufficient balance</div>' : ''}
                </div>
                <div class="account-balance">₹${balance.toLocaleString('en-IN', {maximumFractionDigits: 2})}</div>
            </div>
        `;
    });
    
    accountsHTML += `
            </div>
        </div>
        <div class="transfer-summary">
            <div class="summary-row">
                <span class="summary-label">Recipient Account:</span>
                <span class="summary-value">${transferData.recipientAccount}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">IFSC Code:</span>
                <span class="summary-value">${transferData.ifscCode}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Destination Bank:</span>
                <span class="summary-value">${transferData.destinationBank}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Transfer Amount:</span>
                <span class="summary-value amount">₹${transferData.amount.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeAccountModal()">Cancel</button>
            <button class="btn btn-confirm" id="accountConfirmBtn" disabled onclick="proceedToPin()">Next: Enter PIN</button>
        </div>
    `;
    
    modalBody.innerHTML = accountsHTML;
}

function selectAccount(index) {
    const account = userAccounts[index];
    const balance = parseFloat(account.balance || 0);
    
    if (balance < transferData.amount) {
        alert('Insufficient balance in this account');
        return;
    }
    
    // Remove previous selection
    document.querySelectorAll('.account-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Add selection to clicked account
    const selectedOption = document.querySelector(`[data-index="${index}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    selectedAccount = account;
    
    // Enable next button
    const confirmBtn = document.getElementById('accountConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
    }
}

// ============================================================================
// PIN ENTRY MODAL
// ============================================================================

function proceedToPin() {
    if (!selectedAccount) {
        alert('Please select an account');
        return;
    }
    
    // Close account modal
    closeAccountModal();
    
    // Open PIN modal
    openPinModal();
}

function openPinModal() {
    document.getElementById('pinModal').style.display = 'block';
    transactionPin = '';
    updatePinDisplay();
    
    // Update PIN modal with transfer details
    const pinModalContent = document.querySelector('#pinModal .pin-transfer-summary');
    if (pinModalContent) {
        pinModalContent.innerHTML = `
            <div class="summary-item">
                <span>From:</span>
                <span>${selectedAccount.bank_name} - ${selectedAccount.account_number}</span>
            </div>
            <div class="summary-item">
                <span>To:</span>
                <span>${transferData.recipientAccount} (${transferData.destinationBank})</span>
            </div>
            <div class="summary-item amount-highlight">
                <span>Amount:</span>
                <span>₹${transferData.amount.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
            </div>
        `;
    }
    
    // Focus on first PIN input
    setTimeout(() => {
        const pin1 = document.getElementById('pin1');
        if (pin1) {
            pin1.focus();
        }
    }, 100);
}

function closePinModal() {
    document.getElementById('pinModal').style.display = 'none';
    transactionPin = '';
    clearPinInputs();
}

function updatePinDisplay() {
    const pinLength = transactionPin.length;
    for (let i = 1; i <= 6; i++) {
        const pinBox = document.getElementById(`pin${i}`);
        if (pinBox) {
            if (i <= pinLength) {
                pinBox.value = '•';
                pinBox.classList.add('filled');
            } else {
                pinBox.value = '';
                pinBox.classList.remove('filled');
            }
        }
    }
    
    // Enable/disable confirm button
    const confirmBtn = document.getElementById('pinConfirmBtn');
    if (confirmBtn) {
        if (pinLength >= 4) {
            confirmBtn.disabled = false;
            confirmBtn.classList.add('ready');
        } else {
            confirmBtn.disabled = true;
            confirmBtn.classList.remove('ready');
        }
    }
}

function clearPinInputs() {
    for (let i = 1; i <= 6; i++) {
        const pinBox = document.getElementById(`pin${i}`);
        if (pinBox) {
            pinBox.value = '';
            pinBox.classList.remove('filled');
        }
    }
    transactionPin = '';
    updatePinDisplay();
}

function handlePinInput(element, index) {
    const value = element.value;
    
    if (value && /^\d$/.test(value)) {
        transactionPin += value;
        updatePinDisplay();
        
        // Move to next input
        if (index < 6 && transactionPin.length < 6) {
            const nextInput = document.getElementById(`pin${index + 1}`);
            if (nextInput) {
                nextInput.focus();
            }
        }
        
        // Auto-submit if 6 digits entered
        if (transactionPin.length === 6) {
            setTimeout(() => {
                const confirmBtn = document.getElementById('pinConfirmBtn');
                if (confirmBtn && !confirmBtn.disabled) {
                    confirmTransfer();
                }
            }, 200);
        }
    }
    
    element.value = '';
}

function handlePinKeydown(event, index) {
    // Handle backspace
    if (event.key === 'Backspace') {
        event.preventDefault();
        
        if (transactionPin.length > 0) {
            transactionPin = transactionPin.slice(0, -1);
            updatePinDisplay();
            
            // Move to previous input
            if (index > 1) {
                const prevInput = document.getElementById(`pin${index - 1}`);
                if (prevInput) {
                    prevInput.focus();
                }
            }
        }
    }
    
    // Handle Enter key
    if (event.key === 'Enter' && transactionPin.length >= 4) {
        confirmTransfer();
    }
    
    // Prevent non-numeric input
    if (event.key && event.key.length === 1 && !/^\d$/.test(event.key)) {
        event.preventDefault();
    }
}

// ============================================================================
// TRANSFER CONFIRMATION
// ============================================================================

async function confirmTransfer() {
    if (!selectedAccount) {
        alert('❌ Please select an account');
        return;
    }
    
    if (transactionPin.length < 4) {
        alert('❌ Please enter your transaction PIN (minimum 4 digits)');
        return;
    }
    
    const confirmBtn = document.getElementById('pinConfirmBtn');
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<span class="spinner"></span> Processing...';
    confirmBtn.disabled = true;
    
    try {
        // Prepare transfer payload with correct field names
        const transferPayload = {
            source_account: selectedAccount.account_number,
            recipient_account: transferData.recipientAccount,
            recipient_ifsc: transferData.ifscCode,
            amount: transferData.amount,
            transaction_pin: transactionPin,
            description: `Transfer to ${transferData.recipientAccount}`
        };
        
        console.log('Sending transfer request:', {
            ...transferPayload,
            transaction_pin: '****' // Don't log actual PIN
        });
        
        const response = await fetch('/api/transfer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transferPayload)
        });
        
        const result = await response.json();
        console.log('Transfer response:', result);
        
        if (response.ok && result.status === 'ok') {
            closePinModal();
            
            // Show success message
            showSuccessModal(result);
            
            // Reset form
            document.getElementById('accountNumber').value = '';
            document.getElementById('ifscCode').value = '';
            document.getElementById('amount').value = '';
            
        } else {
            // Handle different error types
            const errorMsg = result.error || result.message || result.detail || 'Unknown error';
            
            if (errorMsg.toLowerCase().includes('pin') || 
                errorMsg.toLowerCase().includes('invalid transaction pin')) {
                alert(`❌ Invalid Transaction PIN\n\n${errorMsg}\n\nPlease try again with the correct PIN.`);
                clearPinInputs();
                const pin1 = document.getElementById('pin1');
                if (pin1) pin1.focus();
            } else if (errorMsg.toLowerCase().includes('insufficient')) {
                alert(`❌ Insufficient Funds\n\n${errorMsg}`);
                closePinModal();
            } else if (errorMsg.toLowerCase().includes('not found') || 
                       errorMsg.toLowerCase().includes("don't own")) {
                alert(`❌ Account Error\n\n${errorMsg}`);
                closePinModal();
            } else {
                alert(`❌ Transfer Failed\n\n${errorMsg}`);
                closePinModal();
            }
            
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('Transfer error:', error);
        alert('❌ Network error. Please check your connection and try again.');
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
    }
}

function showSuccessModal(result) {
    const successHTML = `
        <div class="success-overlay" id="successOverlay">
            <div class="success-modal">
                <div class="success-icon">✅</div>
                <h2>Transfer Successful!</h2>
                <div class="success-details">
                    <div class="detail-row">
                        <span class="detail-label">Transaction ID:</span>
                        <span class="detail-value">${result.transaction_id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Amount:</span>
                        <span class="detail-value">₹${transferData.amount.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">From:</span>
                        <span class="detail-value">${selectedAccount.account_number}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">To:</span>
                        <span class="detail-value">${transferData.recipientAccount}</span>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="closeSuccessModal()">Done</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', successHTML);
    
    // Auto-reload after 5 seconds
    setTimeout(() => {
        closeSuccessModal();
        window.location.reload();
    }, 5000);
}

function closeSuccessModal() {
    const overlay = document.getElementById('successOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// ============================================================================
// MODAL CLOSE HANDLERS
// ============================================================================

window.onclick = function(event) {
    const accountModal = document.getElementById('accountModal');
    const pinModal = document.getElementById('pinModal');
    
    if (event.target === accountModal) {
        closeAccountModal();
    }
    
    if (event.target === pinModal) {
        // Don't allow closing PIN modal by clicking outside
        // User must either complete or cancel
    }
}

// ============================================================================
// FORM INPUT HANDLERS
// ============================================================================

document.getElementById('accountNumber')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const ifscInput = document.getElementById('ifscCode');
        if (ifscInput) ifscInput.focus();
    }
});

document.getElementById('ifscCode')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const amountInput = document.getElementById('amount');
        if (amountInput) amountInput.focus();
    }
});

document.getElementById('amount')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleTransfer();
    }
});

// Format amount input
document.getElementById('amount')?.addEventListener('input', function(e) {
    let value = e.target.value;
    // Remove non-numeric characters except decimal point
    value = value.replace(/[^\d.]/g, '');
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
    }
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
        value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    e.target.value = value;
});

// Account number formatting
document.getElementById('accountNumber')?.addEventListener('input', function(e) {
    let value = e.target.value;
    // Only allow digits
    value = value.replace(/\D/g, '');
    // Limit length
    if (value.length > 20) {
        value = value.substring(0, 20);
    }
    e.target.value = value;
});

// IFSC code formatting
document.getElementById('ifscCode')?.addEventListener('input', function(e) {
    let value = e.target.value.toUpperCase();
    // Remove spaces and special characters, keep alphanumeric
    value = value.replace(/[^A-Z0-9]/g, '');
    // Limit to 11 characters
    if (value.length > 11) {
        value = value.substring(0, 11);
    }
    e.target.value = value;
    
    // Real-time IFSC validation feedback
    if (value.length === 11) {
        const prefix = value.substring(0, 4);
        const supportedBanks = ['SBIN', 'HDFC', 'ICIC'];
        const ifscInput = e.target;
        
        if (supportedBanks.includes(prefix)) {
            ifscInput.style.borderColor = '#4CAF50';
        } else {
            ifscInput.style.borderColor = '#f44336';
        }
    } else {
        e.target.style.borderColor = '';
    }
});

// Add CSS for spinner and success modal
const style = document.createElement('style');
style.textContent = `
    .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255,255,255,.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 0.6s linear infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .success-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    }
    
    .success-modal {
        background: white;
        padding: 40px;
        border-radius: 15px;
        text-align: center;
        max-width: 400px;
        animation: slideUp 0.4s ease;
    }
    
    .success-icon {
        font-size: 64px;
        margin-bottom: 20px;
        animation: scaleIn 0.5s ease;
    }
    
    .success-details {
        margin: 30px 0;
        text-align: left;
    }
    
    .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #eee;
    }
    
    .detail-label {
        color: #666;
        font-weight: 500;
    }
    
    .detail-value {
        color: #333;
        font-weight: 600;
    }
    
    .amount-highlight {
        font-size: 18px;
        color: #4CAF50;
    }
    
    .loading-spinner {
        border: 3px solid #f3f3f3;
        border-top: 3px solid #dc3545;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes slideUp {
        from {
            transform: translateY(30px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes scaleIn {
        from {
            transform: scale(0);
        }
        to {
            transform: scale(1);
        }
    }
    
    .account-option.selected {
        border: 2px solid #4CAF50;
        background: #f1f8f4;
    }
    
    .btn.ready {
        background: #4CAF50;
        animation: pulse 1.5s ease infinite;
    }
    
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
`;
document.head.appendChild(style);