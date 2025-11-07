// EMI Calculator JavaScript

// Range slider synchronization
const rateSlider = document.getElementById('rateSlider');
const rateInput = document.getElementById('rate');
const rateValue = document.getElementById('rateValue');

const tenureSlider = document.getElementById('tenureSlider');
const tenureInput = document.getElementById('tenure');
const tenureValue = document.getElementById('tenureValue');

// Rate slider event listeners
rateSlider.addEventListener('input', function() {
    rateInput.value = this.value;
    rateValue.textContent = this.value + '%';
});

rateInput.addEventListener('input', function() {
    rateSlider.value = this.value;
    rateValue.textContent = this.value + '%';
});

// Tenure slider event listeners
tenureSlider.addEventListener('input', function() {
    tenureInput.value = this.value;
    tenureValue.textContent = this.value + ' months';
});

tenureInput.addEventListener('input', function() {
    tenureSlider.value = this.value;
    tenureValue.textContent = this.value + ' months';
});

// EMI Calculation Function
function calculateEMI(principal, rate, tenure) {
    const monthlyRate = rate / (12 * 100);
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
                (Math.pow(1 + monthlyRate, tenure) - 1);
    
    const totalAmount = emi * tenure;
    const totalInterest = totalAmount - principal;
    
    // Generate amortization schedule
    const schedule = [];
    let balance = principal;
    
    for (let month = 1; month <= Math.min(tenure, 12); month++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = emi - interestPayment;
        balance -= principalPayment;
        
        schedule.push({
            month: month,
            emi: Math.round(emi),
            principal: Math.round(principalPayment),
            interest: Math.round(interestPayment),
            balance: Math.round(Math.max(0, balance))
        });
    }
    
    return {
        emi: Math.round(emi),
        total_amount: Math.round(totalAmount),
        total_interest: Math.round(totalInterest),
        schedule: schedule,
        success: true
    };
}

// Form submission handler
document.getElementById('emiForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const results = document.getElementById('results');
    
    // Show loading state
    loading.style.display = 'block';
    error.style.display = 'none';
    results.classList.remove('show');

    // Get form data
    const principal = parseFloat(document.getElementById('principal').value);
    const rate = parseFloat(document.getElementById('rate').value);
    const tenure = parseInt(document.getElementById('tenure').value);

    // Validate inputs
    if (isNaN(principal) || principal <= 0) {
        showError('Please enter a valid loan amount');
        return;
    }
    
    if (isNaN(rate) || rate <= 0) {
        showError('Please enter a valid interest rate');
        return;
    }
    
    if (isNaN(tenure) || tenure <= 0) {
        showError('Please enter a valid tenure');
        return;
    }

    // Simulate API call delay
    setTimeout(() => {
        try {
            const data = calculateEMI(principal, rate, tenure);
            loading.style.display = 'none';
            displayResults(data);
        } catch (err) {
            loading.style.display = 'none';
            showError('Calculation error. Please check your inputs.');
        }
    }, 500);
});

// Display results function
function displayResults(data) {
    document.getElementById('emiAmount').textContent = '₹' + data.emi.toLocaleString('en-IN');
    document.getElementById('totalAmount').textContent = '₹' + data.total_amount.toLocaleString('en-IN');
    document.getElementById('totalInterest').textContent = '₹' + data.total_interest.toLocaleString('en-IN');

    // Display amortization schedule
    const scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    
    data.schedule.forEach(month => {
        const row = scheduleBody.insertRow();
        row.insertCell(0).textContent = month.month;
        row.insertCell(1).textContent = '₹' + month.emi.toLocaleString('en-IN');
        row.insertCell(2).textContent = '₹' + month.principal.toLocaleString('en-IN');
        row.insertCell(3).textContent = '₹' + month.interest.toLocaleString('en-IN');
        row.insertCell(4).textContent = '₹' + month.balance.toLocaleString('en-IN');
    });

    // Draw pie chart
    const principal = parseFloat(document.getElementById('principal').value);
    drawPieChart(principal, data.total_interest);
    
    // Show results with animation
    document.getElementById('results').classList.add('show');
}

// Error display function
function showError(message) {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    
    loading.style.display = 'none';
    error.textContent = message;
    error.style.display = 'block';
}

// Pie chart drawing function
function drawPieChart(principal, interest) {
    const canvas = document.getElementById('pieChart');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 220 * dpr;
    canvas.height = 220 * dpr;
    canvas.style.width = '220px';
    canvas.style.height = '220px';
    ctx.scale(dpr, dpr);
    
    const centerX = 110;
    const centerY = 110;
    const radius = 80;
    
    const total = principal + interest;
    const principalAngle = (principal / total) * 2 * Math.PI;
    
    // Clear canvas
    ctx.clearRect(0, 0, 220, 220);
    
    // Draw shadow
    ctx.save();
    ctx.translate(2, 2);
    ctx.globalAlpha = 0.3;
    
    // Principal shadow
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, 0, principalAngle);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    
    // Interest shadow
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, principalAngle, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    
    ctx.restore();
    
    // Draw principal slice with gradient
    const principalGradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    principalGradient.addColorStop(0, '#667eea');
    principalGradient.addColorStop(1, '#764ba2');
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, 0, principalAngle);
    ctx.closePath();
    ctx.fillStyle = principalGradient;
    ctx.fill();
    
    // Add stroke
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw interest slice with gradient
    const interestGradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    interestGradient.addColorStop(0, '#f093fb');
    interestGradient.addColorStop(1, '#f5576c');
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, principalAngle, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = interestGradient;
    ctx.fill();
    
    // Add stroke
    ctx.stroke();
    
    // Add center circle for depth
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 25);
    centerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    centerGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 25, 0, 2 * Math.PI);
    ctx.fillStyle = centerGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// Initialize the calculator on page load
document.addEventListener('DOMContentLoaded', function() {
    // Trigger initial calculation
    document.getElementById('emiForm').dispatchEvent(new Event('submit'));
});