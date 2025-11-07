import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
import pickle
import fitz  # PyMuPDF
import google.generativeai as genai
import re
from datetime import datetime
import json

# Configure Gemini API
genai.configure(api_key="") #add your api key


class LoanRecommendationMLSystem:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.feature_names = [
            'cibil_score', 'annual_income', 'asset_value',
            'loan_type_encoded', 'debt_to_income_ratio',
            'credit_utilization', 'avg_monthly_balance'
        ]

    def train_model(self, training_data_path=None):
        """Train XGBoost model on historical loan data with improved synthetic data"""
        if training_data_path is None:
            df = self._generate_synthetic_data()
        else:
            df = pd.read_csv(training_data_path)

        X = df[self.feature_names]
        y_approval = df['loan_approved']
        y_amount = df['approved_amount']

        X_train, X_test, y_train, y_test = train_test_split(
            X, y_approval, test_size=0.2, random_state=42
        )

        # Improved XGBoost parameters for smoother predictions
        self.approval_model = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42
        )

        self.approval_model.fit(X_train, y_train)

        approved_df = df[df['loan_approved'] == 1]
        X_amount = approved_df[self.feature_names]
        y_amount_approved = approved_df['approved_amount']

        self.amount_model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            gamma=0.1,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42
        )

        self.amount_model.fit(X_amount, y_amount_approved)

        print(f"✅ Model trained. Approval accuracy: {self.approval_model.score(X_test, y_test):.2%}")

    def _generate_synthetic_data(self, n_samples=10000):
        """Generate improved synthetic training data with gradual transitions"""
        np.random.seed(42)

        data = {
            'cibil_score': np.random.randint(300, 900, n_samples),
            'annual_income': np.random.randint(200000, 5000000, n_samples),
            'asset_value': np.random.randint(100000, 10000000, n_samples),
            'loan_type_encoded': np.random.randint(0, 5, n_samples),
            'debt_to_income_ratio': np.random.uniform(0.05, 0.7, n_samples),
            'credit_utilization': np.random.uniform(0.05, 0.95, n_samples),
            'avg_monthly_balance': np.random.randint(5000, 500000, n_samples)
        }

        df = pd.DataFrame(data)

        # Improved approval logic with gradual scoring
        cibil_score_norm = (df['cibil_score'] - 300) / 600
        debt_score = 1 - (df['debt_to_income_ratio'] / 0.7)
        utilization_score = 1 - (df['credit_utilization'] / 1.0)
        income_score = np.clip((df['annual_income'] - 200000) / 4800000, 0, 1)
        asset_score = np.clip((df['asset_value'] - 100000) / 9900000, 0, 1)

        composite_score = (
            cibil_score_norm * 0.30 +
            debt_score * 0.25 +
            utilization_score * 0.10 +
            income_score * 0.20 +
            asset_score * 0.15
        )

        noise = np.random.normal(0, 0.1, n_samples)
        composite_score = np.clip(composite_score + noise, 0, 1)

        approval_threshold = 0.45
        df['approval_probability'] = 1 / (1 + np.exp(-10 * (composite_score - approval_threshold)))
        
        df['loan_approved'] = (np.random.random(n_samples) < df['approval_probability']).astype(int)

        base_multiplier = 2 + (composite_score * 6)
        
        loan_type_multipliers = {0: 5.0, 1: 1.5, 2: 1.0, 3: 3.0, 4: 2.5}
        type_factor = df['loan_type_encoded'].map(loan_type_multipliers)
        
        df['approved_amount'] = np.where(
            df['loan_approved'] == 1,
            np.clip(
                (df['annual_income'] * base_multiplier * type_factor / 5.0),
                50000,
                df['annual_income'] * 10
            ).astype(int),
            0
        )

        borderline = (composite_score >= 0.35) & (composite_score < 0.45) & (df['loan_approved'] == 0)
        df.loc[borderline, 'loan_approved'] = np.random.choice([0, 1], size=borderline.sum(), p=[0.7, 0.3])
        df.loc[borderline & (df['loan_approved'] == 1), 'approved_amount'] = (
            df.loc[borderline & (df['loan_approved'] == 1), 'annual_income'] * 
            np.random.uniform(0.5, 2.0, size=(borderline & (df['loan_approved'] == 1)).sum())
        ).astype(int)

        return df

    def extract_text_from_pdf(self, file):
        """Extract text from PDF bank statement"""
        doc = fitz.open(stream=file.read(), filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text

    def analyze_bank_statement(self, text):
        """Enhanced bank statement analysis for Indian format with detailed transaction analysis"""
        
        # Parse transactions from the statement
        transactions = self._parse_transactions(text)
        
        if not transactions:
            print("⚠️ No transactions found. Using fallback patterns...")
            return self._fallback_analysis(text)
        
        # Calculate metrics
        total_credits = sum([t['credit'] for t in transactions if t['credit'] > 0])
        total_debits = sum([t['debit'] for t in transactions if t['debit'] > 0])
        balances = [t['balance'] for t in transactions if t['balance'] > 0]
        
        # Identify salary credits (typically largest credits)
        credit_amounts = [t['credit'] for t in transactions if t['credit'] > 0]
        salary_credits = [c for c in credit_amounts if c > 100000]  # Likely salary
        monthly_salary = max(salary_credits) if salary_credits else (max(credit_amounts) if credit_amounts else 0)
        
        # Categorize expenses
        expense_categories = self._categorize_expenses(transactions)
        
        # Calculate financial health indicators
        avg_balance = np.mean(balances) if balances else 0
        min_balance = min(balances) if balances else 0
        max_balance = max(balances) if balances else 0
        
        # Calculate debt indicators
        emi_payments = sum([t['debit'] for t in transactions if 'sip' in t['description'].lower() or 'emi' in t['description'].lower()])
        rent_payments = sum([t['debit'] for t in transactions if 'rent' in t['description'].lower()])
        
        # Fixed monthly obligations
        fixed_obligations = rent_payments + emi_payments
        
        # Spending patterns
        discretionary_spending = (
            expense_categories.get('shopping', 0) + 
            expense_categories.get('dining', 0) + 
            expense_categories.get('entertainment', 0)
        )
        
        essential_spending = (
            expense_categories.get('groceries', 0) + 
            expense_categories.get('utilities', 0) + 
            expense_categories.get('medical', 0) + 
            expense_categories.get('transport', 0)
        )
        
        # Calculate savings and investment behavior
        investment_amount = sum([t['debit'] for t in transactions if 'sip' in t['description'].lower() or 'investment' in t['description'].lower()])
        
        # Credit utilization (spending vs income)
        credit_utilization = min((total_debits / total_credits) if total_credits > 0 else 0.8, 1.0)
        
        # Savings rate
        savings_amount = total_credits - total_debits
        savings_rate = max(0, savings_amount / total_credits) if total_credits > 0 else 0
        
        # Financial stability score (0-1)
        stability_indicators = {
            'consistent_income': 1.0 if len(salary_credits) >= 2 else 0.5,
            'positive_balance': 1.0 if avg_balance > 50000 else (avg_balance / 50000),
            'low_credit_util': 1.0 - credit_utilization,
            'savings_habit': min(savings_rate * 2, 1.0),
            'investment_habit': 1.0 if investment_amount > 0 else 0.3
        }
        
        financial_stability_score = np.mean(list(stability_indicators.values()))
        
        metrics = {
            'total_credits': float(total_credits),
            'total_debits': float(total_debits),
            'avg_monthly_balance': float(avg_balance),
            'min_balance': float(min_balance),
            'max_balance': float(max_balance),
            'num_transactions': len(transactions),
            'credit_utilization': float(credit_utilization),
            'savings_rate': float(savings_rate),
            'monthly_salary': float(monthly_salary),
            'fixed_obligations': float(fixed_obligations),
            'discretionary_spending': float(discretionary_spending),
            'essential_spending': float(essential_spending),
            'investment_amount': float(investment_amount),
            'financial_stability_score': float(financial_stability_score),
            'expense_breakdown': {k: float(v) for k, v in expense_categories.items()},
            'stability_indicators': {k: float(v) for k, v in stability_indicators.items()}
        }
        
        print(f"\n📊 Bank Statement Analysis:")
        print(f"   Total Credits: ₹{total_credits:,.2f}")
        print(f"   Total Debits: ₹{total_debits:,.2f}")
        print(f"   Average Balance: ₹{avg_balance:,.2f}")
        print(f"   Estimated Monthly Salary: ₹{monthly_salary:,.2f}")
        print(f"   Savings Rate: {savings_rate:.2%}")
        print(f"   Financial Stability Score: {financial_stability_score:.2%}")
        
        return metrics

    def _parse_transactions(self, text):
        """Parse transactions from bank statement text"""
        transactions = []
        
        # Pattern for date, description, debit, credit, balance
        # Matches formats like: 1/7/2025 or 15-07-2025
        pattern = r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+([A-Za-z\s/&]+?)\s+(?:(\d{1,3}(?:,\d{3})*(?:\.\d{2})?))?\s*(?:(\d{1,3}(?:,\d{3})*(?:\.\d{2})?))?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)'
        
        matches = re.findall(pattern, text, re.MULTILINE)
        
        for match in matches:
            date_str, description, val1, val2, val3 = match
            
            # Clean and convert values
            vals = []
            for v in [val1, val2, val3]:
                if v:
                    vals.append(float(v.replace(',', '')))
                else:
                    vals.append(0)
            
            # Determine which is debit, credit, balance
            # Typically: [debit, credit, balance] or [credit, balance] or [debit, balance]
            if len([v for v in vals if v > 0]) >= 2:
                if vals[0] > 0 and vals[1] > 0 and vals[2] > 0:
                    # All three present
                    debit, credit, balance = vals[0], vals[1], vals[2]
                elif vals[0] > 0 and vals[2] > 0:
                    # Likely debit and balance
                    if 'credit' in description.lower() or 'salary' in description.lower():
                        debit, credit, balance = 0, vals[0], vals[2]
                    else:
                        debit, credit, balance = vals[0], 0, vals[2]
                elif vals[1] > 0 and vals[2] > 0:
                    # Likely credit and balance
                    debit, credit, balance = 0, vals[1], vals[2]
                else:
                    debit, credit, balance = vals[0], vals[1], vals[2]
                
                transactions.append({
                    'date': date_str,
                    'description': description.strip(),
                    'debit': debit,
                    'credit': credit,
                    'balance': balance
                })
        
        return transactions

    def _categorize_expenses(self, transactions):
        """Categorize expenses from transactions"""
        categories = {
            'groceries': 0,
            'utilities': 0,
            'transport': 0,
            'dining': 0,
            'shopping': 0,
            'medical': 0,
            'rent': 0,
            'investment': 0,
            'entertainment': 0,
            'other': 0
        }
        
        category_keywords = {
            'groceries': ['grocery', 'essentials', 'supermarket', 'provisions'],
            'utilities': ['electricity', 'bill', 'internet', 'ott', 'subscription', 'mobile', 'water'],
            'transport': ['petrol', 'transport', 'fuel', 'uber', 'ola', 'metro'],
            'dining': ['dining', 'restaurant', 'food', 'snacks', 'zomato', 'swiggy'],
            'shopping': ['shopping', 'clothes', 'amazon', 'flipkart', 'mall'],
            'medical': ['medical', 'pharmacy', 'hospital', 'doctor', 'health'],
            'rent': ['rent', 'house rent'],
            'investment': ['sip', 'investment', 'mutual fund', 'stocks'],
            'entertainment': ['movie', 'entertainment', 'netflix', 'prime']
        }
        
        for transaction in transactions:
            if transaction['debit'] > 0:
                desc_lower = transaction['description'].lower()
                categorized = False
                
                for category, keywords in category_keywords.items():
                    if any(keyword in desc_lower for keyword in keywords):
                        categories[category] += transaction['debit']
                        categorized = True
                        break
                
                if not categorized:
                    categories['other'] += transaction['debit']
        
        return categories

    def _fallback_analysis(self, text):
        """Fallback analysis using regex patterns"""
        credit_pattern = r'(?:credit|cr|deposit|salary)\s*(?:rs\.?|₹)?\s*([\d,]+\.?\d*)'
        debit_pattern = r'(?:debit|dr|withdrawal|payment|bill|emi|rent)\s*(?:rs\.?|₹)?\s*([\d,]+\.?\d*)'
        balance_pattern = r'(?:balance|bal)\s*(?:rs\.?|₹)?\s*([\d,]+\.?\d*)'

        credits = [float(x.replace(',', '')) for x in re.findall(credit_pattern, text, re.I)]
        debits = [float(x.replace(',', '')) for x in re.findall(debit_pattern, text, re.I)]
        balances = [float(x.replace(',', '')) for x in re.findall(balance_pattern, text, re.I)]

        total_credits = sum(credits) if credits else 0
        total_debits = sum(debits) if debits else 0
        avg_balance = np.mean(balances) if balances else 0

        return {
            'total_credits': total_credits,
            'total_debits': total_debits,
            'avg_monthly_balance': avg_balance,
            'num_transactions': len(credits) + len(debits),
            'credit_utilization': min((total_debits / total_credits) if total_credits > 0 else 0.5, 1.0),
            'savings_rate': max(0, (total_credits - total_debits) / total_credits) if total_credits > 0 else 0,
            'monthly_salary': max(credits) if credits else 0,
            'fixed_obligations': 0,
            'discretionary_spending': 0,
            'essential_spending': 0,
            'investment_amount': 0,
            'financial_stability_score': 0.5
        }

    def get_gemini_insights(self, user_data, bank_metrics, ml_prediction):
        """Get AI-powered insights from Gemini with enhanced bank analysis"""
        model = genai.GenerativeModel("gemini-2.5-flash")

        expense_breakdown = bank_metrics.get('expense_breakdown', {})
        stability_indicators = bank_metrics.get('stability_indicators', {})

        prompt = f"""You are an expert financial advisor. Analyze this loan application and provide detailed, constructive recommendations.

**USER PROFILE:**
- CIBIL Score: {user_data['cibil_score']} (Rating: {self._get_cibil_rating(user_data['cibil_score'])})
- Annual Income: ₹{user_data['annual_income']:,}
- Asset Value: ₹{user_data['asset_value']:,}
- Loan Type: {user_data['loan_type']}

**BANK STATEMENT ANALYSIS (Last 3 Months):**
- Total Credits: ₹{bank_metrics['total_credits']:,.2f}
- Total Debits: ₹{bank_metrics['total_debits']:,.2f}
- Average Balance: ₹{bank_metrics['avg_monthly_balance']:,.2f}
- Estimated Monthly Salary: ₹{bank_metrics.get('monthly_salary', 0):,.2f}
- Savings Rate: {bank_metrics.get('savings_rate', 0):.2%}
- Credit Utilization: {bank_metrics['credit_utilization']:.2%}
- Financial Stability Score: {bank_metrics.get('financial_stability_score', 0):.2%}

**SPENDING BREAKDOWN:**
- Essential Expenses: ₹{bank_metrics.get('essential_spending', 0):,.2f}
- Discretionary Spending: ₹{bank_metrics.get('discretionary_spending', 0):,.2f}
- Fixed Obligations: ₹{bank_metrics.get('fixed_obligations', 0):,.2f}
- Investment Amount: ₹{bank_metrics.get('investment_amount', 0):,.2f}

**DETAILED EXPENSE CATEGORIES:**
{self._format_expense_breakdown(expense_breakdown)}

**FINANCIAL STABILITY INDICATORS:**
{self._format_stability_indicators(stability_indicators)}

**ML MODEL PREDICTION:**
- Approval Probability: {ml_prediction['approval_probability']:.2%}
- Recommended Loan Amount: ₹{ml_prediction['recommended_amount']:,}
- Risk Level: {self._get_risk_level(ml_prediction['risk_score'])}
- Confidence Level: {ml_prediction.get('confidence_level', 0.5):.2%}

Provide a comprehensive analysis including:
1. **Eligibility Assessment**: Based on CIBIL score, income stability, and spending patterns
2. **Recommended Loan Terms**: 
   - Optimal Amount (considering debt-to-income ratio)
   - Competitive Interest Rate based on profile
   - Suitable Tenure
   - Estimated EMI
3. **Top 3-5 Bank/Lender Recommendations**: Specific products suitable for this profile
4. **Spending Pattern Analysis**: Insights from bank statement
5. **Improvement Strategies**: Specific actionable steps if approval probability is below 70%
6. **Risk Assessment**: Address concerns and mitigation strategies
7. **Financial Health Tips**: Based on observed spending habits
8. **Required Documents**: Complete checklist
9. **Expected Timeline**: Application to disbursement

Be data-driven, realistic, and provide actionable advice. Highlight positive financial behaviors observed in the bank statement."""

        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error generating AI insights: {str(e)}"

    def _format_expense_breakdown(self, expenses):
        """Format expense breakdown for prompt"""
        if not expenses:
            return "No detailed breakdown available"
        
        lines = []
        for category, amount in expenses.items():
            if amount > 0:
                lines.append(f"  - {category.title()}: ₹{amount:,.2f}")
        
        return "\n".join(lines) if lines else "No expenses categorized"

    def _format_stability_indicators(self, indicators):
        """Format stability indicators for prompt"""
        if not indicators:
            return "No indicators available"
        
        lines = []
        for indicator, score in indicators.items():
            status = "✓ Good" if score > 0.7 else "⚠ Needs Attention" if score > 0.4 else "✗ Weak"
            lines.append(f"  - {indicator.replace('_', ' ').title()}: {score:.2%} - {status}")
        
        return "\n".join(lines) if lines else "No indicators available"

    def _get_cibil_rating(self, score):
        """Get CIBIL score rating"""
        if score >= 750: return "Excellent"
        elif score >= 700: return "Good"
        elif score >= 650: return "Fair"
        elif score >= 600: return "Average"
        else: return "Needs Improvement"

    def _get_risk_level(self, risk_score):
        """Get risk level description"""
        if risk_score < 0.3: return "Low Risk"
        elif risk_score < 0.5: return "Moderate Risk"
        elif risk_score < 0.7: return "Moderate-High Risk"
        else: return "High Risk"

    def predict_loan_eligibility(self, user_data, bank_metrics):
        """Make ML prediction with enhanced bank metrics integration"""
        loan_type_map = {'home': 0, 'personal': 1, 'car': 2, 'business': 3, 'education': 4}
        loan_type_encoded = loan_type_map.get(user_data['loan_type'], 1)

        # Use actual monthly salary if available, otherwise estimate from annual income
        monthly_salary = bank_metrics.get('monthly_salary', 0)
        if monthly_salary == 0:
            monthly_salary = user_data['annual_income'] / 12
        
        # Calculate debt-to-income using fixed obligations
        monthly_debits = bank_metrics['total_debits'] / 3
        fixed_obligations = bank_metrics.get('fixed_obligations', 0)
        
        # Use the higher of average monthly debits or fixed obligations
        monthly_debt = max(monthly_debits, fixed_obligations)
        debt_to_income = min(monthly_debt / monthly_salary if monthly_salary > 0 else 0.5, 0.7)

        # Adjust credit utilization based on financial stability
        base_utilization = bank_metrics['credit_utilization']
        stability_score = bank_metrics.get('financial_stability_score', 0.5)
        adjusted_utilization = base_utilization * (1 - stability_score * 0.3)  # Reduce utilization for stable finances

        features = np.array([[
            user_data['cibil_score'],
            user_data['annual_income'],
            user_data['asset_value'],
            loan_type_encoded,
            debt_to_income,
            adjusted_utilization,
            bank_metrics['avg_monthly_balance']
        ]])

        approval_prob = self.approval_model.predict_proba(features)[0][1]

        # Boost approval probability based on good financial habits
        if bank_metrics.get('investment_amount', 0) > 0:
            approval_prob = min(approval_prob * 1.05, 1.0)  # 5% boost
        
        if bank_metrics.get('savings_rate', 0) > 0.2:
            approval_prob = min(approval_prob * 1.03, 1.0)  # 3% boost

        # Calculate recommended amount
        if approval_prob > 0.3:
            base_amount = self.amount_model.predict(features)[0]
            
            # Adjust based on approval probability and financial stability
            if approval_prob < 0.5:
                base_amount *= (approval_prob / 0.5) * 0.7
            
            # Consider savings and investment behavior
            if stability_score > 0.7:
                base_amount *= 1.1  # 10% increase for stable finances
            
            recommended_amount = max(base_amount, 50000)
        else:
            recommended_amount = 0

        feature_importance = dict(zip(
            self.feature_names,
            self.approval_model.feature_importances_
        ))

        return {
            'approval_probability': approval_prob,
            'recommended_amount': int(recommended_amount),
            'is_approved': approval_prob > 0.4,
            'feature_importance': feature_importance,
            'risk_score': 1 - approval_prob,
            'confidence_level': self._calculate_confidence(features[0], approval_prob)
        }

    def _calculate_confidence(self, features, approval_prob):
        """Calculate prediction confidence"""
        cibil = features[0]
        income = features[1]
        dti = features[4]
        
        confidence = 0.5
        
        if 600 <= cibil <= 850:
            confidence += 0.2
        if 300000 <= income <= 3000000:
            confidence += 0.15
        if 0.2 <= dti <= 0.5:
            confidence += 0.15
        
        return min(confidence, 0.95)

    def calculate_emi(self, principal, annual_rate, tenure_years):
        """Calculate EMI using standard formula"""
        if principal <= 0:
            return 0
            
        monthly_rate = annual_rate / 12 / 100
        months = tenure_years * 12

        if monthly_rate == 0:
            return principal / months

        emi = (principal * monthly_rate *
               (1 + monthly_rate) ** months) / \
              ((1 + monthly_rate) ** months - 1)

        return round(emi, 2)

    def generate_complete_recommendation(self, cibil_score, annual_income, asset_value, loan_type, pdf_file):
        """Complete recommendation pipeline with enhanced analysis"""
        print("📄 Extracting bank statement...")
        statement_text = self.extract_text_from_pdf(pdf_file)
        
        print("🔍 Analyzing transactions and spending patterns...")
        bank_metrics = self.analyze_bank_statement(statement_text)

        user_profile = {
            'cibil_score': cibil_score,
            'annual_income': annual_income,
            'asset_value': asset_value,
            'loan_type': loan_type
        }

        print("🤖 Running ML analysis with bank insights...")
        prediction = self.predict_loan_eligibility(user_profile, bank_metrics)

        print("✨ Generating AI-powered recommendations...")
        ai_insights = self.get_gemini_insights(user_profile, bank_metrics, prediction)

        # Calculate loan terms
        interest_rate = self.calculate_interest_rate(cibil_score, loan_type)
        tenure = self.get_recommended_tenure(loan_type)
        recommended_amount = prediction['recommended_amount']
        emi = self.calculate_emi(recommended_amount, interest_rate, tenure)

        loan_terms = {
            'amount': int(recommended_amount),
            'recommended_amount': int(recommended_amount),
            'interest_rate': float(interest_rate),
            'tenure_years': int(tenure),
            'monthly_emi': float(emi),
            'total_payment': float(emi * tenure * 12),
            'cibil_rating': self._get_cibil_rating(cibil_score),
            'risk_level': self._get_risk_level(prediction['risk_score'])
        }

        report = {
            'user_profile': user_profile,
            'bank_analysis': {
                k: float(v) if isinstance(v, (np.floating, np.integer)) else v
                for k, v in bank_metrics.items()
                if k not in ['expense_breakdown', 'stability_indicators']
            },
            'expense_breakdown': bank_metrics.get('expense_breakdown', {}),
            'stability_indicators': bank_metrics.get('stability_indicators', {}),
            'ml_prediction': {
                'is_approved': bool(prediction['is_approved']),
                'approval_probability': float(prediction['approval_probability']),
                'risk_score': float(prediction['risk_score']),
                'confidence_level': float(prediction['confidence_level']),
                'feature_importance': {
                    k: float(v) for k, v in prediction['feature_importance'].items()
                }
            },
            'loan_terms': loan_terms,
            'ai_insights': ai_insights
        }

        return report

    def calculate_interest_rate(self, cibil_score, loan_type):
        """Calculate interest rate with smoother transitions"""
        base_rates = {
            'home': 8.5, 'personal': 12.0, 'car': 9.5,
            'business': 11.5, 'education': 10.0
        }

        base_rate = base_rates.get(loan_type, 11.0)

        # Smoother CIBIL-based adjustments
        if cibil_score >= 750:
            adjustment = -1.5
        elif cibil_score >= 700:
            adjustment = -0.75
        elif cibil_score >= 650:
            adjustment = -0.25
        elif cibil_score >= 600:
            adjustment = 0.5
        elif cibil_score >= 550:
            adjustment = 1.5
        else:
            adjustment = 2.5

        final_rate = base_rate + adjustment
        return max(min(final_rate, 18.0), 7.0)  # Cap between 7% and 18%

    def get_recommended_tenure(self, loan_type):
        """Get recommended tenure based on loan type"""
        tenures = {
            'home': 20, 'personal': 5, 'car': 7,
            'business': 10, 'education': 15
        }
        return tenures.get(loan_type, 10)

    def save_model(self, filepath='loan_model.pkl'):
        """Save trained models"""
        model_data = {
            'approval_model': self.approval_model,
            'amount_model': self.amount_model,
            'scaler': self.scaler
        }
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
        print(f"✅ Model saved to {filepath}")

    def load_model(self, filepath='loan_model.pkl'):
        """Load trained models"""
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)
        self.approval_model = model_data['approval_model']
        self.amount_model = model_data['amount_model']
        self.scaler = model_data['scaler']
        print(f"✅ Model loaded from {filepath}")


if __name__ == "__main__":
    system = LoanRecommendationMLSystem()
    print("Training enhanced ML models with bank statement analysis...")
    system.train_model()
    system.save_model('loan_recommendation_model_v3.pkl')

    print("\n✅ Enhanced system ready!")
    print("\nKey Features:")
    print("✓ Detailed transaction parsing from Indian bank statements")
    print("✓ Expense categorization (Groceries, Rent, Shopping, etc.)")
    print("✓ Financial stability scoring based on spending patterns")
    print("✓ Salary detection and income verification")
    print("✓ Investment and savings behavior analysis")
    print("✓ Debt-to-income ratio calculation from actual transactions")
    print("✓ Enhanced ML predictions using bank statement insights")
    print("✓ AI-powered personalized recommendations")
    print("\n💡 The model now analyzes your specific bank statement format!")
    print("   It extracts: Salary, Rent, EMIs, Investments, and spending patterns")