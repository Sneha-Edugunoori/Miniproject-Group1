class EnhancedLoanRecommendationSystem {
    constructor() {
        this.form = document.getElementById('loanForm');
        this.cibilInput = document.getElementById('cibil');
        this.incomeInput = document.getElementById('income');
        this.assetInput = document.getElementById('asset');
        this.loanTypeSelect = document.getElementById('loanType');
        this.fileInput = document.getElementById('fileInput');
        this.generateBtn = document.getElementById('generateBtn');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.processingIndicator = document.getElementById('processingIndicator');
        this.loanResults = document.getElementById('loanResults');
        this.resultsContent = document.getElementById('resultsContent');
        this.cibilStatus = document.getElementById('cibilStatus');
        this.fileText = document.getElementById('fileText');
        
        this.API_ENDPOINT = '/api/loan-recommendation'; // Update with your endpoint

        this.initializeEventListeners();
        this.formatNumberInputs();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmission(e));
        this.cibilInput.addEventListener('input', () => this.updateCibilStatus());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        this.incomeInput.addEventListener('input', () => this.formatNumberInput(this.incomeInput));
        this.assetInput.addEventListener('input', () => this.formatNumberInput(this.assetInput));
        this.form.addEventListener('input', () => this.validateForm());
    }

    updateCibilStatus() {
        const score = parseInt(this.cibilInput.value);
        const status = this.cibilStatus;

        status.classList.remove('cibil-excellent', 'cibil-good', 'cibil-fair', 'cibil-poor');

        if (score >= 750) {
            status.textContent = 'Excellent';
            status.classList.add('cibil-excellent');
        } else if (score >= 700) {
            status.textContent = 'Good';
            status.classList.add('cibil-good');
        } else if (score >= 600) {
            status.textContent = 'Fair';
            status.classList.add('cibil-fair');
        } else if (score >= 300) {
            status.textContent = 'Poor';
            status.classList.add('cibil-poor');
        } else {
            status.textContent = 'Invalid';
            status.classList.add('cibil-poor');
        }
    }

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (file) {
            const fileName = file.name;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);
            this.fileText.textContent = `Selected: ${fileName} (${fileSize} MB)`;
            
            // Validate file type and size
            if (!file.type.includes('pdf')) {
                alert('Please upload a PDF file');
                this.fileInput.value = '';
                this.fileText.textContent = 'Upload 1-Month Bank Statement';
                return;
            }
            
            if (file.size > 200 * 1024 * 1024) {
                alert('File size must be less than 200MB');
                this.fileInput.value = '';
                this.fileText.textContent = 'Upload 1-Month Bank Statement';
                return;
            }
        } else {
            this.fileText.textContent = 'Upload 1-Month Bank Statement';
        }
    }

    formatNumberInput(input) {
        let value = input.value.replace(/[^0-9]/g, '');
        if (value) {
            value = parseInt(value).toLocaleString('en-IN');
        }
        input.value = value;
    }

    formatNumberInputs() {
        this.formatNumberInput(this.incomeInput);
        this.formatNumberInput(this.assetInput);
    }

    validateForm() {
        const cibil = this.cibilInput.value;
        const income = this.incomeInput.value.replace(/,/g, '');
        const asset = this.assetInput.value.replace(/,/g, '');
        const loanType = this.loanTypeSelect.value;
        const file = this.fileInput.files[0];

        const isValid = cibil && income && asset && loanType && file &&
                       cibil >= 300 && cibil <= 900 &&
                       parseInt(income) > 0 &&
                       parseInt(asset) > 0;

        this.generateBtn.disabled = !isValid;
    }

    async handleFormSubmission(event) {
        event.preventDefault();
        this.showProcessing();

        try {
            // Prepare form data
            const formData = new FormData();
            formData.append('cibil', this.cibilInput.value);
            formData.append('income', this.incomeInput.value.replace(/,/g, ''));
            formData.append('asset', this.assetInput.value.replace(/,/g, ''));
            formData.append('loan_type', this.loanTypeSelect.value);
            formData.append('statement', this.fileInput.files[0]);

            // Call ML-powered API
            const response = await fetch(this.API_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to get recommendation');
            }

            const result = await response.json();

            if (result.success) {
                this.showResults(result.data);
            } else {
                throw new Error(result.error || 'Unknown error occurred');
            }

        } catch (error) {
            console.error('Error processing loan application:', error);
            this.showError(error.message || 'An error occurred while processing your application.');
        } finally {
            this.hideProcessing();
        }
    }

    showProcessing() {
        this.generateBtn.disabled = true;
        this.generateBtn.querySelector('.btn-text').textContent = 'Processing...';
        this.loadingSpinner.style.display = 'inline-flex';
        this.processingIndicator.style.display = 'block';
        this.loanResults.style.display = 'none';

        // Update processing text dynamically
        let step = 0;
        const steps = [
            'Extracting bank statement data...',
            'Analyzing financial patterns...',
            'Running ML models...',
            'Generating AI insights...',
            'Preparing recommendations...'
        ];

        this.processingInterval = setInterval(() => {
            const processingText = this.processingIndicator.querySelector('.processing-text p');
            if (processingText && step < steps.length) {
                processingText.textContent = steps[step];
                step++;
            }
        }, 1500);

        this.processingIndicator.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    hideProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
        }
        this.generateBtn.disabled = false;
        this.generateBtn.querySelector('.btn-text').textContent = 'Generate Loan Recommendations';
        this.loadingSpinner.style.display = 'none';
        this.processingIndicator.style.display = 'none';
    }

    showResults(data) {
        const report = this.formatMLReport(data);
        this.resultsContent.innerHTML = report;
        this.loanResults.style.display = 'block';
        
        setTimeout(() => {
            this.loanResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

    formatMLReport(data) {
        const { user_profile, bank_analysis, ml_prediction, loan_terms, ai_insights } = data;
        
        const approvalClass = ml_prediction.is_approved ? 'approved' : 'rejected';
        const approvalText = ml_prediction.is_approved ? '✅ APPROVED' : '❌ NEEDS REVIEW';
        const approvalProb = (ml_prediction.approval_probability * 100).toFixed(1);
        
        return `
            <div class="ml-report">
                <div class="approval-status ${approvalClass}">
                    <h2>${approvalText}</h2>
                    <div class="approval-probability">
                        Approval Probability: ${approvalProb}%
                    </div>
                </div>

                <div class="report-section">
                    <h3>🤖 ML MODEL ANALYSIS</h3>
                    <div class="metrics-grid">
                        <div class="metric">
                            <span class="metric-label">Risk Score</span>
                            <span class="metric-value">${(ml_prediction.risk_score * 100).toFixed(1)}%</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Recommended Amount</span>
                            <span class="metric-value">₹${this.formatNumber(loan_terms.amount)}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Interest Rate</span>
                            <span class="metric-value">${loan_terms.interest_rate}% p.a.</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Monthly EMI</span>
                            <span class="metric-value">₹${this.formatNumber(loan_terms.monthly_emi)}</span>
                        </div>
                    </div>
                </div>

                <div class="report-section">
                    <h3>📊 BANK STATEMENT ANALYSIS</h3>
                    <div class="bank-metrics">
                        <div class="bank-metric">
                            <span>Total Credits:</span>
                            <strong>₹${this.formatNumber(bank_analysis.total_credits)}</strong>
                        </div>
                        <div class="bank-metric">
                            <span>Total Debits:</span>
                            <strong>₹${this.formatNumber(bank_analysis.total_debits)}</strong>
                        </div>
                        <div class="bank-metric">
                            <span>Average Balance:</span>
                            <strong>₹${this.formatNumber(bank_analysis.avg_monthly_balance)}</strong>
                        </div>
                        <div class="bank-metric">
                            <span>Credit Utilization:</span>
                            <strong>${(bank_analysis.credit_utilization * 100).toFixed(1)}%</strong>
                        </div>
                        <div class="bank-metric">
                            <span>Transactions:</span>
                            <strong>${bank_analysis.num_transactions}</strong>
                        </div>
                    </div>
                </div>

                <div class="report-section">
                    <h3>💰 LOAN TERMS</h3>
                    <div class="loan-terms">
                        <div class="term-item">
                            <span class="term-label">Loan Amount</span>
                            <span class="term-value">₹${this.formatNumber(loan_terms.amount)}</span>
                        </div>
                        <div class="term-item">
                            <span class="term-label">Tenure</span>
                            <span class="term-value">${loan_terms.tenure_years} years</span>
                        </div>
                        <div class="term-item">
                            <span class="term-label">Interest Rate</span>
                            <span class="term-value">${loan_terms.interest_rate}% per annum</span>
                        </div>
                        <div class="term-item">
                            <span class="term-label">Monthly EMI</span>
                            <span class="term-value">₹${this.formatNumber(loan_terms.monthly_emi)}</span>
                        </div>
                        <div class="term-item highlight">
                            <span class="term-label">Total Payment</span>
                            <span class="term-value">₹${this.formatNumber(loan_terms.total_payment)}</span>
                        </div>
                    </div>
                </div>

                <div class="report-section">
                    <h3>🔍 FEATURE IMPORTANCE</h3>
                    <div class="feature-importance">
                        ${this.renderFeatureImportance(ml_prediction.feature_importance)}
                    </div>
                </div>

                <div class="report-section ai-insights">
                    <h3>✨ AI-POWERED INSIGHTS</h3>
                    <div class="insights-content">
                        ${this.formatAIInsights(ai_insights)}
                    </div>
                </div>

                <div class="report-section actions">
                    <button onclick="window.print()" class="action-btn print-btn">
                        🖨️ Print Report
                    </button>
                    <button onclick="downloadReport()" class="action-btn download-btn">
                        📥 Download PDF
                    </button>
                    <button onclick="location.reload()" class="action-btn new-btn">
                        🔄 New Application
                    </button>
                </div>
            </div>
        `;
    }

    renderFeatureImportance(importance) {
        const features = Object.entries(importance)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return features.map(([feature, value]) => {
            const percentage = (value * 100).toFixed(1);
            const label = this.formatFeatureName(feature);
            return `
                <div class="feature-bar">
                    <span class="feature-name">${label}</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="feature-value">${percentage}%</span>
                </div>
            `;
        }).join('');
    }

    formatFeatureName(feature) {
        const names = {
            'cibil_score': 'CIBIL Score',
            'annual_income': 'Annual Income',
            'asset_value': 'Asset Value',
            'debt_to_income_ratio': 'Debt-to-Income Ratio',
            'credit_utilization': 'Credit Utilization',
            'avg_monthly_balance': 'Average Balance',
            'loan_type_encoded': 'Loan Type'
        };
        return names[feature] || feature;
    }

    formatAIInsights(insights) {
        // Convert markdown-style formatting to HTML
        let formatted = insights
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        return `<p>${formatted}</p>`;
    }

    formatNumber(num) {
        if (typeof num === 'number') {
            return Math.round(num).toLocaleString('en-IN');
        }
        return num;
    }

    showError(message) {
        this.resultsContent.innerHTML = `
            <div class="error-container">
                <div class="error-icon">❌</div>
                <h2>Error Processing Request</h2>
                <p>${message}</p>
                <button onclick="location.reload()" class="action-btn">Try Again</button>
            </div>
        `;
        this.loanResults.style.display = 'block';
        this.loanResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Utility functions
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        alert('Logging out...');
        window.location.href = 'login.html';
    }
}

function downloadReport() {
    // Create a printable version
    window.print();
    
    // Alternatively, you could implement PDF generation here
    alert('Report download functionality - integrate with jsPDF or similar library');
}

// Initialize the enhanced loan recommendation system
document.addEventListener('DOMContentLoaded', function() {
    new EnhancedLoanRecommendationSystem();
});

// Format number inputs on page load
document.addEventListener('DOMContentLoaded', function() {
    const incomeInput = document.getElementById('income');
    const assetInput = document.getElementById('asset');
    
    if (incomeInput && incomeInput.value) {
        incomeInput.value = parseInt(incomeInput.value.replace(/,/g, '')).toLocaleString('en-IN');
    }
    
    if (assetInput && assetInput.value) {
        assetInput.value = parseInt(assetInput.value.replace(/,/g, '')).toLocaleString('en-IN');
    }
});