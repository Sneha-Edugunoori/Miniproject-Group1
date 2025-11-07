from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify, Blueprint, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import requests
import secrets
import string
import re
import os
import logging
import concurrent.futures
from threading import Lock
from datetime import datetime, timedelta, date
import fitz  # PyMuPDF
import google.generativeai as genai
import json
import traceback
from loan_ml_system import LoanRecommendationMLSystem
import random
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = "devsecret123"

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL', 
    'postgresql://postgres:root@localhost:5432/smp5a'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max file size
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

# ============================================================================
# DATABASE MODELS
# ============================================================================

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(20), primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    aadhar_number = db.Column(db.String(12), unique=True, nullable=False)
    mobile = db.Column(db.String(15), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'full_name': self.full_name,
            'email': self.email,
            'aadhar_number': self.aadhar_number,
            'mobile': self.mobile,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

class Profile(db.Model):
    __tablename__ = 'profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), db.ForeignKey('users.id'), nullable=False, unique=True)
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    phone_number = db.Column(db.String(15))
    date_of_birth = db.Column(db.Date)
    gender = db.Column(db.String(10))
    address_line_1 = db.Column(db.String(200))
    address_line_2 = db.Column(db.String(200))
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    pin_code = db.Column(db.String(10))
    country = db.Column(db.String(100), default='India')
    profile_image = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref='profile')

class Transaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(50), unique=True, nullable=False)
    user_id = db.Column(db.String(20), db.ForeignKey('users.id'), nullable=False)
    source_account_number = db.Column(db.String(50), nullable=False)
    source_bank_code = db.Column(db.String(10), nullable=False)
    source_bank_name = db.Column(db.String(100))
    recipient_account_number = db.Column(db.String(50), nullable=False)
    recipient_ifsc = db.Column(db.String(11), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    transaction_type = db.Column(db.String(20), default='TRANSFER')
    status = db.Column(db.String(20), default='PENDING')
    description = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    user = db.relationship('User', backref='transactions')
    
    def to_dict(self):
        return {
            'id': self.id,
            'transaction_id': self.transaction_id,
            'source_account': self.source_account_number,
            'source_bank': self.source_bank_name,
            'recipient_account': self.recipient_account_number,
            'recipient_ifsc': self.recipient_ifsc,
            'amount': self.amount,
            'status': self.status,
            'transaction_type': self.transaction_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }

# ============================================================================
# CONFIGURATION CLASSES
# ============================================================================

class BankConfig:
    """Bank server configuration"""
    SERVERS = {
        'SBI': {'url': 'http://localhost:5001', 'name': 'State Bank of India'},
        'HDFC': {'url': 'http://localhost:5002', 'name': 'HDFC Bank'},
        'ICICI': {'url': 'http://localhost:5003', 'name': 'ICICI Bank'}
    }

class GeminiConfig:
    """Gemini AI configuration"""
    API_KEY = "" # add (gemini) api key here
    MODEL = "gemini-2.5-flash-latest" # can use any model

# ============================================================================
# UTILITY CLASSES
# ============================================================================

class IDGenerator:
    """Generate unique IDs"""
    
    @staticmethod
    def generate_user_id():
        max_attempts = 10
        for _ in range(max_attempts):
            random_digits = ''.join(secrets.choice(string.digits) for _ in range(6))
            user_id = f"USR{random_digits}"
            if not User.query.filter_by(id=user_id).first():
                return user_id
        raise Exception("Could not generate unique user ID")
    
    @staticmethod
    def generate_transaction_id():
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_digits = ''.join(secrets.choice(string.digits) for _ in range(6))
        return f"TXN{timestamp}{random_digits}"

class Validator:
    """Input validation utilities"""
    
    @staticmethod
    def validate_aadhar(aadhar):
        return aadhar and len(aadhar) == 12 and aadhar.isdigit()
    
    @staticmethod
    def validate_email(email):
        return re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email)
    
    @staticmethod
    def validate_mobile(mobile):
        return mobile and len(mobile) == 10 and mobile.isdigit()

# ============================================================================
# SERVICE CLASSES
# ============================================================================

class BankingService:
    """Handle banking operations across multiple banks"""
    
    def __init__(self):
        self.data_lock = Lock()
        self.bank_servers = BankConfig.SERVERS
    
    def fetch_accounts_from_bank(self, bank_code, config, aadhaar):
        """Fetch accounts from a single bank"""
        try:
            response = requests.get(f"{config['url']}/accounts/{aadhaar}", timeout=10)
            if response.status_code == 200:
                accounts = response.json()
                for account in accounts:
                    account['bank_name'] = config['name']
                    account['bank_code'] = bank_code
                return {
                    'bank_code': bank_code,
                    'bank_name': config['name'],
                    'status': 'success',
                    'accounts': accounts
                }
            elif response.status_code == 404:
                return {
                    'bank_code': bank_code,
                    'bank_name': config['name'],
                    'status': 'no_accounts',
                    'accounts': []
                }
            else:
                return {
                    'bank_code': bank_code,
                    'bank_name': config['name'],
                    'status': 'error',
                    'accounts': [],
                    'error': f'HTTP {response.status_code}'
                }
        except Exception as e:
            logger.error(f"Error fetching accounts from {bank_code}: {str(e)}")
            return {
                'bank_code': bank_code,
                'bank_name': config['name'],
                'status': 'error',
                'accounts': [],
                'error': str(e)
            }
    
    def fetch_transactions_from_bank(self, bank_code, config, account_number):
        """Fetch transactions from a single bank"""
        try:
            response = requests.get(f"{config['url']}/transactions/{account_number}", timeout=10)
            if response.status_code == 200:
                return {
                    'bank_code': bank_code,
                    'account_number': account_number,
                    'status': 'success',
                    'transactions': response.json()
                }
            else:
                return {
                    'bank_code': bank_code,
                    'account_number': account_number,
                    'status': 'error',
                    'transactions': [],
                    'error': f'HTTP {response.status_code}'
                }
        except Exception as e:
            logger.error(f"Error fetching transactions from {bank_code}: {str(e)}")
            return {
                'bank_code': bank_code,
                'account_number': account_number,
                'status': 'error',
                'transactions': [],
                'error': str(e)
            }
    
    def fetch_all_banking_data(self, aadhar):
        """Fetch banking data from all banks"""
        if not Validator.validate_aadhar(aadhar):
            return {
                'accounts': [],
                'total_balance': 0,
                'banks_with_accounts': [],
                'transactions': {},
                'server_status': 'error',
                'error': 'Invalid Aadhar format'
            }
        
        logger.info(f"Fetching banking data for Aadhar: {aadhar}")
        
        try:
            results = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(self.bank_servers)) as executor:
                future_to_bank = {
                    executor.submit(self.fetch_accounts_from_bank, bank_code, config, aadhar): bank_code 
                    for bank_code, config in self.bank_servers.items()
                }
                
                for future in concurrent.futures.as_completed(future_to_bank):
                    bank_code = future_to_bank[future]
                    try:
                        result = future.result()
                        results.append(result)
                    except Exception as e:
                        logger.error(f"Error processing {bank_code}: {str(e)}")
                        results.append({
                            'bank_code': bank_code,
                            'bank_name': self.bank_servers[bank_code]['name'],
                            'status': 'error',
                            'accounts': [],
                            'error': str(e)
                        })
            
            all_accounts = []
            total_balance = 0
            banks_with_accounts = []
            bank_responses = {}
            
            for result in results:
                bank_responses[result['bank_code']] = {
                    'status': result['status'],
                    'bank_name': result['bank_name'],
                    'account_count': len(result['accounts'])
                }
                
                if result['accounts']:
                    all_accounts.extend(result['accounts'])
                    banks_with_accounts.append(result['bank_name'])
                    for account in result['accounts']:
                        total_balance += float(account.get('balance', 0))
            
            transactions = {}
            if all_accounts:
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(all_accounts)) as executor:
                    future_to_account = {}
                    for account in all_accounts:
                        account_number = account['account_number']
                        bank_code = account['bank_code']
                        config = self.bank_servers[bank_code]
                        future = executor.submit(self.fetch_transactions_from_bank, bank_code, config, account_number)
                        future_to_account[future] = account_number
                    
                    for future in concurrent.futures.as_completed(future_to_account):
                        account_number = future_to_account[future]
                        try:
                            trans_result = future.result()
                            if trans_result['status'] == 'success':
                                transactions[account_number] = trans_result['transactions']
                            else:
                                transactions[account_number] = []
                        except Exception as e:
                            logger.error(f"Error fetching transactions for {account_number}: {str(e)}")
                            transactions[account_number] = []
            
            return {
                'accounts': all_accounts,
                'total_balance': total_balance,
                'banks_with_accounts': banks_with_accounts,
                'transactions': transactions,
                'server_status': 'success',
                'bank_responses': bank_responses,
                'total_banks_checked': len(self.bank_servers),
                'banks_with_data': len(banks_with_accounts),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Banking data fetch error for {aadhar}: {str(e)}")
            return {
                'accounts': [],
                'total_balance': 0,
                'banks_with_accounts': [],
                'transactions': {},
                'server_status': 'error',
                'error': str(e)
            }
        
class DigilockerService:
    """Handle document storage and management"""
    
    def __init__(self):
        self.upload_folder = app.config['UPLOAD_FOLDER']
        self.digilocker_folder = os.path.join(self.upload_folder, 'digilocker')
        os.makedirs(self.digilocker_folder, exist_ok=True)
    
    @staticmethod
    def generate_document_id():
        """Generate unique document ID"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_digits = ''.join(secrets.choice(string.digits) for _ in range(6))
        return f"DOC{timestamp}{random_digits}"
    
    @staticmethod
    def hash_pin(pin):
        """Hash PIN for secure storage"""
        return generate_password_hash(pin)
    
    @staticmethod
    def verify_pin(pin, pin_hash):
        """Verify PIN against stored hash"""
        return check_password_hash(pin_hash, pin)
    
    def save_document(self, user_id, file):
        """Save uploaded document"""
        if not file or file.filename == '':
            raise ValueError("No file provided")
        
        if not file.filename.lower().endswith('.pdf'):
            raise ValueError("Only PDF files are allowed")
        
        # Check file size (50MB limit)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > 50 * 1024 * 1024:
            raise ValueError("File size exceeds 50MB limit")
        
        # Generate unique filename
        document_id = self.generate_document_id()
        original_filename = secure_filename(file.filename)
        filename = f"{user_id}_{document_id}_{original_filename}"
        
        # Create user-specific folder
        user_folder = os.path.join(self.digilocker_folder, user_id)
        os.makedirs(user_folder, exist_ok=True)
        
        file_path = os.path.join(user_folder, filename)
        file.save(file_path)
        
        # Create database record
        document = Document(
            document_id=document_id,
            user_id=user_id,
            filename=filename,
            original_filename=original_filename,
            file_size=file_size,
            file_path=file_path,
            mime_type='application/pdf'
        )
        
        db.session.add(document)
        db.session.commit()
        
        return document
    
    def get_user_documents(self, user_id):
        """Get all documents for a user"""
        documents = Document.query.filter_by(
            user_id=user_id,
            is_deleted=False
        ).order_by(Document.upload_date.desc()).all()
        
        return [doc.to_dict() for doc in documents]
    
    def get_document(self, document_id, user_id):
        """Get specific document"""
        document = Document.query.filter_by(
            document_id=document_id,
            user_id=user_id,
            is_deleted=False
        ).first()
        
        return document
    
    def delete_document(self, document_id, user_id):
        """Soft delete document"""
        document = self.get_document(document_id, user_id)
        
        if not document:
            raise ValueError("Document not found")
        
        document.is_deleted = True
        document.deleted_at = datetime.utcnow()
        db.session.commit()
        
        # Optionally delete physical file
        try:
            if os.path.exists(document.file_path):
                os.remove(document.file_path)
        except Exception as e:
            logger.warning(f"Could not delete physical file: {str(e)}")
        
        return True
    
    def setup_pin(self, user_id, pin):
        """Setup or update PIN for user"""
        if not pin or len(pin) != 6 or not pin.isdigit():
            raise ValueError("PIN must be 6 digits")
        
        existing_pin = DigilockerPin.query.filter_by(user_id=user_id).first()
        
        if existing_pin:
            existing_pin.pin_hash = self.hash_pin(pin)
            existing_pin.updated_at = datetime.utcnow()
        else:
            new_pin = DigilockerPin(
                user_id=user_id,
                pin_hash=self.hash_pin(pin)
            )
            db.session.add(new_pin)
        
        db.session.commit()
        return True
    
    def verify_user_pin(self, user_id, pin):
        """Verify user's PIN"""
        pin_record = DigilockerPin.query.filter_by(user_id=user_id).first()
        
        if not pin_record:
            return False
        
        return self.verify_pin(pin, pin_record.pin_hash)
    
    def has_pin(self, user_id):
        """Check if user has set up PIN"""
        return DigilockerPin.query.filter_by(user_id=user_id).first() is not None
    

class LoanRecommendationService:
    """Handle loan recommendations using ML + Gemini AI"""
    
    def __init__(self):
        # Initialize ML system
        logger.info("Initializing ML-based Loan Recommendation System...")
        self.ml_system = LoanRecommendationMLSystem()
        
        # Try to load existing model
        try:
            self.ml_system.load_model('loan_recommendation_modelv3.pkl')
            logger.info("✓ Pre-trained ML model loaded successfully")
        except:
            # Train new model if no saved model exists
            logger.info("Training new ML model...")
            self.ml_system.train_model()
            self.ml_system.save_model('loan_recommendation_model.pkl')
            logger.info("✓ ML model trained and saved")
    
    def process_loan_application(self, cibil_score, annual_income, asset_value, loan_type, pdf_file):
        """Process complete loan application using ML system"""
        try:
            # Use the ML system's complete recommendation method
            report = self.ml_system.generate_complete_recommendation(
                cibil_score=cibil_score,
                annual_income=annual_income,
                asset_value=asset_value,
                loan_type=loan_type,
                pdf_file=pdf_file
            )
            
            return {
                'success': True,
                'recommendation': report,
                'loan_type': loan_type,
                'user_inputs': {
                    'cibil_score': cibil_score,
                    'annual_income': annual_income,
                    'asset_value': asset_value
                }
            }
        except Exception as e:
            logger.error(f"Loan processing error: {str(e)}")
            raise

class TransactionService:
    """Handle money transfers and transactions"""
    
    def __init__(self, banking_service):
        self.banking_service = banking_service
    
    def process_transfer(self, user_id, from_bank, to_bank, from_acc, to_acc, amount, description):
        """Process money transfer between accounts"""
        user = User.query.get(user_id)
        if not user:
            return {'status': 'error', 'error': 'User not found'}
        
        if amount <= 0:
            return {'status': 'error', 'error': 'Invalid amount'}
        
        if from_bank not in BankConfig.SERVERS or to_bank not in BankConfig.SERVERS:
            return {'status': 'error', 'error': 'Invalid bank'}
        
        banking_data = self.banking_service.fetch_all_banking_data(user.aadhar_number)
        user_accounts = [acc['account_number'] for acc in banking_data.get('accounts', [])]
        
        if from_acc not in user_accounts:
            return {'status': 'error', 'error': "You don't own the source account"}
        
        transaction_id = IDGenerator.generate_transaction_id()
        
        new_transaction = Transaction(
            transaction_id=transaction_id,
            user_id=user_id,
            source_account_number=from_acc,
            source_bank_code=from_bank,
            source_bank_name=BankConfig.SERVERS[from_bank]['name'],
            recipient_account_number=to_acc,
            recipient_ifsc=f"{to_bank}0001234",
            amount=amount,
            status='PENDING',
            description=description
        )
        db.session.add(new_transaction)
        db.session.commit()
        
        try:
            debit_response = requests.post(
                f"{BankConfig.SERVERS[from_bank]['url']}/debit",
                json={
                    "account_number": from_acc,
                    "amount": amount,
                    "description": f"{description} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if debit_response.status_code != 200:
                new_transaction.status = 'FAILED'
                db.session.commit()
                return {'status': 'error', 'error': 'Debit failed'}
            
            credit_response = requests.post(
                f"{BankConfig.SERVERS[to_bank]['url']}/credit",
                json={
                    "account_number": to_acc,
                    "amount": amount,
                    "description": f"{description} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if credit_response.status_code != 200:
                requests.post(
                    f"{BankConfig.SERVERS[from_bank]['url']}/credit",
                    json={
                        "account_number": from_acc,
                        "amount": amount,
                        "description": f"Refund - Transfer failed (TXN: {transaction_id})"
                    },
                    timeout=5
                )
                new_transaction.status = 'FAILED'
                db.session.commit()
                return {'status': 'error', 'error': 'Credit failed; amount refunded'}
            
            new_transaction.status = 'SUCCESS'
            new_transaction.completed_at = datetime.utcnow()
            db.session.commit()
            
            return {
                'status': 'ok',
                'detail': 'Transfer completed successfully',
                'transaction_id': transaction_id,
                'transaction': new_transaction.to_dict()
            }
            
        except Exception as e:
            new_transaction.status = 'FAILED'
            db.session.commit()
            logger.error(f"Transfer error: {str(e)}")
            return {'status': 'error', 'error': 'Transfer failed', 'detail': str(e)}

class OTPService:
    """Secure OTP management service with rate limiting and thread safety"""
    
    def __init__(self, brevo_api_key, sender_email, sender_name="VyomNext Banking"):
        self.otp_storage = {}
        self.otp_lock = Lock()
        self.rate_limit_storage = {}
        self.rate_limit_lock = Lock()
        
        # Email configuration
        self.brevo_api_key = brevo_api_key
        self.sender_email = sender_email
        self.sender_name = sender_name
        self.brevo_url = "https://api.brevo.com/v3/smtp/email"
        
        # Configuration
        self.otp_length = 6
        self.otp_expiry_minutes = 10
        self.max_otp_attempts = 3
        self.rate_limit_window_minutes = 15
    
    def generate_otp(self):
        """Generate a random 6-digit OTP"""
        return ''.join(random.choices(string.digits, k=self.otp_length))
    
    def cleanup_expired_otps(self):
        """Remove expired OTPs from storage"""
        with self.otp_lock:
            current_time = datetime.now()
            expired_emails = [
                email for email, data in self.otp_storage.items()
                if current_time > data['expires_at']
            ]
            for email in expired_emails:
                del self.otp_storage[email]
            
            if expired_emails:
                logger.info(f"Cleaned up {len(expired_emails)} expired OTPs")
    
    def check_rate_limit(self, email):
        """
        Check if email has exceeded rate limit
        Returns: (allowed: bool, retry_after: int)
        """
        with self.rate_limit_lock:
            current_time = datetime.now()
            
            if email in self.rate_limit_storage:
                attempts = self.rate_limit_storage[email]
                # Remove old attempts outside the window
                attempts = [
                    t for t in attempts 
                    if current_time - t < timedelta(minutes=self.rate_limit_window_minutes)
                ]
                self.rate_limit_storage[email] = attempts
                
                if len(attempts) >= self.max_otp_attempts:
                    oldest_attempt = min(attempts)
                    retry_after = int(
                        (oldest_attempt + timedelta(minutes=self.rate_limit_window_minutes) - current_time).total_seconds()
                    )
                    return False, retry_after
            else:
                self.rate_limit_storage[email] = []
            
            self.rate_limit_storage[email].append(current_time)
            return True, 0
    
    def mask_email(self, email):
        """Mask email for secure logging"""
        try:
            local, domain = email.split('@')
            if len(local) <= 3:
                masked_local = local[0] + '***'
            else:
                masked_local = local[:3] + '***'
            return f"{masked_local}@{domain}"
        except:
            return "***@***"
    
    def send_otp_email(self, email, otp, full_name):
        """Send OTP email using Brevo API"""
        headers = {
            "accept": "application/json",
            "api-key": self.brevo_api_key,
            "content-type": "application/json"
        }
        
        payload = {
            "sender": {
                "name": self.sender_name,
                "email": self.sender_email
            },
            "to": [{"email": email, "name": full_name}],
            "subject": "VyomNext - Email Verification OTP",
            "htmlContent": f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }}
                    .container {{ max-width: 600px; margin: 50px auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                    .header {{ text-align: center; color: #dc3545; margin-bottom: 30px; }}
                    .otp-box {{ background: linear-gradient(135deg, #dc3545, #ff6b6b); color: white; padding: 20px; text-align: center; border-radius: 10px; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 30px 0; }}
                    .content {{ color: #333; line-height: 1.6; }}
                    .footer {{ text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }}
                    .warning {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>{self.sender_name}</h1>
                        <h2>Email Verification</h2>
                    </div>
                    <div class="content">
                        <p>Hello {full_name},</p>
                        <p>Thank you for registering with VyomNext Banking Platform. To complete your registration, please use the following One-Time Password (OTP):</p>
                        <div class="otp-box">{otp}</div>
                        <p>This OTP is valid for <strong>{self.otp_expiry_minutes} minutes</strong>.</p>
                        <div class="warning">
                            <strong>Security Notice:</strong> Never share this OTP with anyone. VyomNext staff will never ask for your OTP.
                        </div>
                        <p>If you didn't request this registration, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2025 VyomNext Banking Platform. All rights reserved.</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
            """
        }
        
        try:
            response = requests.post(self.brevo_url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 201:
                logger.info(f"OTP email sent successfully to {self.mask_email(email)}")
                return True
            else:
                logger.error(f"Brevo API Error: Status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error sending OTP email: {str(e)}")
            return False
    
    def create_otp(self, email, user_data):
        """
        Create and store OTP for user
        Returns: (success: bool, message: str, otp: str or None)
        """
        self.cleanup_expired_otps()
        
        # Check rate limit
        allowed, retry_after = self.check_rate_limit(email)
        if not allowed:
            return False, f"Too many OTP requests. Please try again in {retry_after} seconds.", None
        
        # Generate OTP
        otp = self.generate_otp()
        
        # Store OTP with user data
        with self.otp_lock:
            self.otp_storage[email] = {
                'otp': otp,
                'expires_at': datetime.now() + timedelta(minutes=self.otp_expiry_minutes),
                'user_data': user_data,
                'created_at': datetime.now()
            }
        
        logger.info(f"OTP created for {self.mask_email(email)}")
        return True, "OTP created successfully", otp
    
    def verify_otp(self, email, otp):
        """
        Verify OTP for email
        Returns: (success: bool, message: str, user_data: dict or None)
        """
        self.cleanup_expired_otps()
        
        with self.otp_lock:
            if email not in self.otp_storage:
                return False, "OTP expired or invalid", None
            
            stored_data = self.otp_storage[email]
            
            # Check expiration
            if datetime.now() > stored_data['expires_at']:
                del self.otp_storage[email]
                return False, "OTP has expired", None
            
            # Verify OTP
            if stored_data['otp'] != otp:
                return False, "Invalid OTP", None
            
            # OTP is valid, get user data and remove from storage
            user_data = stored_data['user_data']
            del self.otp_storage[email]
        
        logger.info(f"OTP verified successfully for {self.mask_email(email)}")
        return True, "OTP verified successfully", user_data
    
    def resend_otp(self, email):
        """
        Resend OTP to email
        Returns: (success: bool, message: str, otp: str or None)
        """
        self.cleanup_expired_otps()
        
        # Check rate limit
        allowed, retry_after = self.check_rate_limit(email)
        if not allowed:
            return False, f"Too many requests. Please try again in {retry_after} seconds.", None
        
        with self.otp_lock:
            if email not in self.otp_storage:
                return False, "No pending registration found", None
            
            # Generate new OTP
            otp = self.generate_otp()
            stored_data = self.otp_storage[email]
            stored_data['otp'] = otp
            stored_data['expires_at'] = datetime.now() + timedelta(minutes=self.otp_expiry_minutes)
            stored_data['created_at'] = datetime.now()
        
        logger.info(f"OTP resent to {self.mask_email(email)}")
        return True, "OTP resent successfully", otp
    
    def get_otp_info(self, email):
        """Get OTP information for debugging (remove in production)"""
        with self.otp_lock:
            if email not in self.otp_storage:
                return None
            
            data = self.otp_storage[email]
            return {
                'expires_at': data['expires_at'].isoformat(),
                'expired': datetime.now() > data['expires_at'],
                'created_at': data['created_at'].isoformat()
            }
    
    def clear_otp(self, email):
        """Manually clear OTP for email"""
        with self.otp_lock:
            if email in self.otp_storage:
                del self.otp_storage[email]
                logger.info(f"OTP cleared for {self.mask_email(email)}")
                return True
        return False

# ============================================================================
# INITIALIZE SERVICES
# ============================================================================

banking_service = BankingService()
loan_service = LoanRecommendationService()
transaction_service = TransactionService(banking_service)
digilocker_service = DigilockerService()
otp_service = OTPService(
   api_key = "YOUR_SENDINBLUE_KEY", # add brevo api key
    sender_email="", # add your email here
    sender_name="VyomNext Banking"
)
# ============================================================================
# AUTHENTICATION ROUTES
# ============================================================================

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form

        username = data.get('username', '').strip()
        full_name = data.get('fullName', data.get('full_name', '')).strip()
        email = data.get('email', '').strip().lower()
        aadhar_number = data.get('aadharNumber', data.get('aadhar_number', '')).strip()
        mobile = data.get('mobileNumber', data.get('mobile', '')).strip()
        password = data.get('password', '')
        confirm_password = data.get('confirmPassword', data.get('confirm_password', ''))

        errors = {}

        # Validation
        if not username or len(username) < 3:
            errors['username'] = "Username must be at least 3 characters."
        if not full_name or len(full_name) < 2:
            errors['fullName'] = "Full name must be at least 2 characters."
        if not email or not Validator.validate_email(email):
            errors['email'] = "Please enter a valid email address."
        if not Validator.validate_aadhar(aadhar_number):
            errors['aadharNumber'] = "Please enter a valid 12-digit Aadhar number."
        if not Validator.validate_mobile(mobile):
            errors['mobile'] = "Please enter a valid 10-digit mobile number."
        if not password or len(password) < 6:
            errors['password'] = "Password must be at least 6 characters."
        if password != confirm_password:
            errors['confirmPassword'] = "Passwords do not match."

        if not errors:
            existing_user = User.query.filter(
                (User.username == username) |
                (User.email == email) | 
                (User.mobile == mobile) | 
                (User.aadhar_number == aadhar_number)
            ).first()
            
            if existing_user:
                if existing_user.username == username:
                    errors['username'] = "Username already exists."
                if existing_user.email == email:
                    errors['email'] = "Email already registered."
                if existing_user.mobile == mobile:
                    errors['mobile'] = "Mobile number already registered."
                if existing_user.aadhar_number == aadhar_number:
                    errors['aadharNumber'] = "Aadhar number already registered."

        if request.is_json:
            if errors:
                return jsonify({'success': False, 'errors': errors}), 400
            
            # Create OTP using service
            user_data = {
                'username': username,
                'full_name': full_name,
                'email': email,
                'aadhar_number': aadhar_number,
                'mobile': mobile,
                'password': password
            }
            
            success, message, otp = otp_service.create_otp(email, user_data)
            
            if not success:
                return jsonify({'success': False, 'message': message}), 429
            
            # Send OTP email
            if otp_service.send_otp_email(email, otp, full_name):
                return jsonify({
                    'success': True,
                    'message': 'OTP sent to your email',
                    'requiresOtp': True
                }), 200
            else:
                otp_service.clear_otp(email)
                return jsonify({
                    'success': False,
                    'message': 'Failed to send OTP. Please try again.'
                }), 500

        # Handle form submission
        if errors:
            return render_template('register.html', errors=errors, form_data=data)

        user_data = {
            'username': username,
            'full_name': full_name,
            'email': email,
            'aadhar_number': aadhar_number,
            'mobile': mobile,
            'password': password
        }
        
        success, message, otp = otp_service.create_otp(email, user_data)
        
        if not success:
            flash(message, "error")
            return render_template('register.html', errors={}, form_data=data)
        
        if otp_service.send_otp_email(email, otp, full_name):
            return render_template('verify_otp.html', email=email)
        else:
            otp_service.clear_otp(email)
            flash("Failed to send OTP. Please try again.", "error")
            return render_template('register.html', errors={}, form_data=data)

    return render_template('register.html', errors={}, form_data={})


@app.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '').strip()
    
    if not email or not otp:
        return jsonify({'success': False, 'message': 'Email and OTP are required'}), 400
    
    # Verify OTP using service
    success, message, user_data = otp_service.verify_otp(email, otp)
    
    if not success:
        return jsonify({'success': False, 'message': message}), 400
    
    try:
        # Create user
        user_id = IDGenerator.generate_user_id()
        new_user = User(
            id=user_id,
            username=user_data['username'],
            full_name=user_data['full_name'],
            email=user_data['email'],
            aadhar_number=user_data['aadhar_number'],
            mobile=user_data['mobile']
        )
        new_user.set_password(user_data['password'])
        
        db.session.add(new_user)
        db.session.commit()
        
        logger.info(f"User registered successfully: {new_user.username}")
        
        return jsonify({
            'success': True,
            'message': 'Registration successful!',
            'user': new_user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {str(e)}")
        return jsonify({'success': False, 'message': 'Registration failed.'}), 500


@app.route('/resend-otp', methods=['POST'])
def resend_otp():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    
    if not email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400
    
    # Resend OTP using service
    success, message, otp = otp_service.resend_otp(email)
    
    if not success:
        return jsonify({'success': False, 'message': message}), 429 if 'try again' in message.lower() else 400
    
    # Get user data to send email
    otp_info = otp_service.otp_storage.get(email)
    if not otp_info:
        return jsonify({'success': False, 'message': 'No pending registration found'}), 400
    
    full_name = otp_info['user_data'].get('full_name', 'User')
    
    if otp_service.send_otp_email(email, otp, full_name):
        return jsonify({'success': True, 'message': 'OTP resent successfully'}), 200
    else:
        return jsonify({'success': False, 'message': 'Failed to resend OTP'}), 500


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form

        credential = data.get('username', '').strip()
        password = data.get('password', '')

        if not credential or not password:
            error_msg = 'Username/email/mobile and password are required'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg}), 400
            return render_template('login.html', error=error_msg)

        try:
            user = User.query.filter(
                (User.username == credential) |
                (User.email == credential.lower()) | 
                (User.mobile == credential)
            ).filter_by(is_active=True).first()

            if not user or not user.check_password(password):
                error_msg = 'Invalid credentials'
                if request.is_json:
                    return jsonify({'success': False, 'message': error_msg}), 401
                return render_template('login.html', error=error_msg)

            user.last_login = datetime.utcnow()
            db.session.commit()

            session['user_id'] = user.id
            session['username'] = user.username
            session['aadhar'] = user.aadhar_number

            if request.is_json:
                banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
                return jsonify({
                    'success': True,
                    'message': 'Login successful',
                    'user': user.to_dict(),
                    'banking_data': banking_data,
                    'redirect': '/dashboard'
                }), 200
            else:
                flash(f"Welcome back, {user.full_name}!", "success")
                return redirect('/dashboard')

        except Exception as e:
            logger.error(f"Login error: {str(e)}")
            error_msg = 'Login failed'
            if request.is_json:
                return jsonify({'success': False, 'message': error_msg}), 500
            return render_template('login.html', error=error_msg)

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash("You have been logged out successfully.", "info")
    return redirect(url_for('home'))


# ============================================================================
# DIGILOCKER ROUTES
# ============================================================================

@app.route('/digilocker')
def digilocker():
    """Render digilocker page"""
    if 'user_id' not in session:
        flash("Please log in to access Digilocker.", "warning")
        return redirect(url_for('login'))
    
    return render_template('digilocker.html')

@app.route('/api/digilocker/pin/check', methods=['GET'])
def check_pin_status():
    """Check if user has set up PIN"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        has_pin = digilocker_service.has_pin(session['user_id'])
        return jsonify({
            'success': True,
            'has_pin': has_pin
        }), 200
    except Exception as e:
        logger.error(f"Check PIN status error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/digilocker/pin/setup', methods=['POST'])
def setup_digilocker_pin():
    """Setup PIN for digilocker"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        pin = data.get('pin', '').strip()
        
        digilocker_service.setup_pin(session['user_id'], pin)
        
        return jsonify({
            'success': True,
            'message': 'PIN set successfully'
        }), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Setup PIN error: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to set PIN'}), 500

@app.route('/api/digilocker/pin/verify', methods=['POST'])
def verify_digilocker_pin():
    """Verify PIN"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        pin = data.get('pin', '').strip()
        
        is_valid = digilocker_service.verify_user_pin(session['user_id'], pin)
        
        if is_valid:
            return jsonify({
                'success': True,
                'message': 'PIN verified'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid PIN'
            }), 401
    except Exception as e:
        logger.error(f"Verify PIN error: {str(e)}")
        return jsonify({'success': False, 'error': 'Verification failed'}), 500

@app.route('/api/digilocker/pin/reset', methods=['POST'])
def reset_digilocker_pin():
    """Reset PIN and delete all documents"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        user_id = session['user_id']
        
        # Delete all user documents
        documents = Document.query.filter_by(user_id=user_id).all()
        for doc in documents:
            try:
                if os.path.exists(doc.file_path):
                    os.remove(doc.file_path)
            except:
                pass
            db.session.delete(doc)
        
        # Delete PIN
        pin_record = DigilockerPin.query.filter_by(user_id=user_id).first()
        if pin_record:
            db.session.delete(pin_record)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'PIN and documents reset successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Reset PIN error: {str(e)}")
        return jsonify({'success': False, 'error': 'Reset failed'}), 500

@app.route('/api/digilocker/documents', methods=['GET'])
def get_documents():
    """Get all user documents"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        documents = digilocker_service.get_user_documents(session['user_id'])
        return jsonify({
            'success': True,
            'documents': documents,
            'count': len(documents)
        }), 200
    except Exception as e:
        logger.error(f"Get documents error: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch documents'}), 500

@app.route('/api/digilocker/upload', methods=['POST'])
def upload_document():
    """Upload document"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        document = digilocker_service.save_document(session['user_id'], file)
        
        return jsonify({
            'success': True,
            'message': 'Document uploaded successfully',
            'document': document.to_dict()
        }), 201
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Upload document error: {str(e)}")
        return jsonify({'success': False, 'error': 'Upload failed'}), 500

@app.route('/api/digilocker/document/<document_id>', methods=['GET'])
def download_document(document_id):
    """Download/view document"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        document = digilocker_service.get_document(document_id, session['user_id'])
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        return send_file(
            document.file_path,
            mimetype=document.mime_type,
            as_attachment=False,
            download_name=document.original_filename
        )
    except Exception as e:
        logger.error(f"Download document error: {str(e)}")
        return jsonify({'error': 'Download failed'}), 500

@app.route('/api/digilocker/document/<document_id>', methods=['DELETE'])
def delete_document_api(document_id):
    """Delete document"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        digilocker_service.delete_document(document_id, session['user_id'])
        return jsonify({
            'success': True,
            'message': 'Document deleted successfully'
        }), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Delete document error: {str(e)}")
        return jsonify({'success': False, 'error': 'Delete failed'}), 500

# ============================================================================
# API AUTHENTICATION ROUTES
# ============================================================================

@app.route('/api/register', methods=['POST'])
def api_register():
    """API endpoint for user registration with OTP"""
    try:
        data = request.get_json()
        
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        aadhar_number = data.get('aadharNumber', data.get('aadhar_number', '')).strip()
        full_name = data.get('fullName', data.get('full_name', '')).strip()
        mobile = data.get('mobileNumber', data.get('mobile', '')).strip()
        
        errors = {}
        
        if not username or len(username) < 3:
            errors['username'] = 'Username must be at least 3 characters'
        if not email or not Validator.validate_email(email):
            errors['email'] = 'Please enter a valid email address'
        if not password or len(password) < 6:
            errors['password'] = 'Password must be at least 6 characters'
        if not Validator.validate_aadhar(aadhar_number):
            errors['aadhar_number'] = 'Invalid Aadhar number format'
        if not full_name:
            errors['full_name'] = 'Full name is required'
        if not Validator.validate_mobile(mobile):
            errors['mobile'] = 'Please enter a valid 10-digit mobile number'
        
        if errors:
            return jsonify({'success': False, 'errors': errors}), 400
        
        existing_user = User.query.filter(
            (User.username == username) |
            (User.email == email) |
            (User.mobile == mobile) |
            (User.aadhar_number == aadhar_number)
        ).first()
        
        if existing_user:
            if existing_user.username == username:
                return jsonify({'success': False, 'errors': {'username': 'Username already exists'}}), 400
            elif existing_user.email == email:
                return jsonify({'success': False, 'errors': {'email': 'Email already exists'}}), 400
            elif existing_user.mobile == mobile:
                return jsonify({'success': False, 'errors': {'mobile': 'Mobile number already registered'}}), 400
            elif existing_user.aadhar_number == aadhar_number:
                return jsonify({'success': False, 'errors': {'aadhar_number': 'Aadhar number already registered'}}), 400
        
        # Create OTP
        user_data = {
            'username': username,
            'full_name': full_name,
            'email': email,
            'aadhar_number': aadhar_number,
            'mobile': mobile,
            'password': password
        }
        
        success, message, otp = otp_service.create_otp(email, user_data)
        
        if not success:
            return jsonify({'success': False, 'message': message}), 429
        
        if otp_service.send_otp_email(email, otp, full_name):
            return jsonify({
                'success': True,
                'message': 'OTP sent to your email',
                'requiresOtp': True
            }), 200
        else:
            otp_service.clear_otp(email)
            return jsonify({
                'success': False,
                'message': 'Failed to send OTP. Please try again.'
            }), 500
        
    except Exception as e:
        logger.error(f"API Registration error: {str(e)}")
        return jsonify({'success': False, 'message': 'Registration failed', 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    """API endpoint for user login with banking data"""
    try:
        data = request.get_json()
        
        if not data.get('username') or not data.get('password'):
            return jsonify({'success': False, 'error': 'Username and password are required'}), 400
        
        credential = data['username'].strip()
        password = data['password']
        
        user = User.query.filter(
            (User.username == credential) |
            (User.email == credential.lower()) |
            (User.mobile == credential)
        ).filter_by(is_active=True).first()
        
        if not user or not user.check_password(password):
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
        
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        session['user_id'] = user.id
        session['username'] = user.username
        session['aadhar'] = user.aadhar_number
        
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        
        logger.info(f"User logged in via API: {user.username}")
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': user.to_dict(),
            'banking_data': banking_data,
            'redirect': '/dashboard'
        }), 200
        
    except Exception as e:
        logger.error(f"API Login error: {str(e)}")
        return jsonify({'success': False, 'error': 'Login failed', 'message': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def api_logout():
    """API endpoint for user logout"""
    try:
        if 'user_id' in session:
            logger.info(f"User logged out via API: {session.get('username')}")
        session.clear()
        return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
    except Exception as e:
        logger.error(f"API Logout error: {str(e)}")
        return jsonify({'success': False, 'error': 'Logout failed'}), 500

@app.route('/check-user', methods=['POST'])
def check_user():
    """Check if user exists by username, email, or mobile"""
    try:
        if request.is_json:
            data = request.get_json()
            credential = data.get('credential', '').strip().lower()
        else:
            credential = request.form.get('credential', '').strip().lower()
        
        if not credential:
            return jsonify({'exists': False})
        
        existing_user = User.query.filter(
            (User.username == credential) |
            (User.email == credential) | 
            (User.mobile == credential)
        ).first()
        
        return jsonify({
            'exists': existing_user is not None
        })
    except Exception as e:
        logger.error(f"Check user error: {str(e)}")
        return jsonify({'exists': False, 'error': str(e)}), 500

# ============================================================================
# LOAN RECOMMENDATION ROUTES
# ============================================================================

@app.route('/lrs')
def loan_recommendation():
    return render_template('loanrs.html')

@app.route('/api/loan-recommendation', methods=['POST'])
def get_loan_recommendation():
    """API endpoint for ML-based loan recommendation"""
    try:
        if 'statement' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No bank statement file uploaded'
            }), 400

        cibil_score = int(request.form.get('cibil', 0))
        annual_income = int(request.form.get('income', '0').replace(',', ''))
        asset_value = int(request.form.get('asset', '0').replace(',', ''))
        loan_type = request.form.get('loan_type', 'personal')
        
        if not (300 <= cibil_score <= 900):
            return jsonify({
                'success': False,
                'error': 'CIBIL score must be between 300 and 900'
            }), 400
        
        if annual_income <= 0 or asset_value <= 0:
            return jsonify({
                'success': False,
                'error': 'Income and asset values must be positive'
            }), 400
        
        file = request.files['statement']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({
                'success': False,
                'error': 'Only PDF files are allowed'
            }), 400
        
        filename = secure_filename(f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            logger.info(f"Processing {loan_type} loan application with ML system...")
            
            with open(filepath, 'rb') as pdf_file:
                report = loan_service.process_loan_application(
                    cibil_score=cibil_score,
                    annual_income=annual_income,
                    asset_value=asset_value,
                    loan_type=loan_type,
                    pdf_file=pdf_file
                )
            
            os.remove(filepath)
            
            session['last_recommendation'] = {
                'timestamp': datetime.now().isoformat(),
                'loan_type': loan_type,
                'amount': report['recommendation'].get('loan_terms', {}).get('amount', 0)
            }
            
            logger.info("✓ ML-based recommendation generated successfully")
            
            return jsonify({
                'success': True,
                'data': report['recommendation'],
                'message': 'Loan recommendation generated successfully using ML and AI'
            })
            
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            raise e
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid input: {str(e)}'
        }), 400
    
    except Exception as e:
        logger.error(f"Error processing loan recommendation: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': 'An error occurred while processing your request. Please try again.'
        }), 500

@app.route('/api/model-info')
def model_info():
    """Get ML model information"""
    try:
        if loan_service.ml_system.approval_model is None:
            return jsonify({
                'success': False,
                'error': 'Model not loaded'
            }), 500
        
        feature_importance = dict(zip(
            loan_service.ml_system.feature_names,
            loan_service.ml_system.approval_model.feature_importances_
        ))
        
        return jsonify({
            'success': True,
            'data': {
                'model_type': 'XGBoost',
                'features': loan_service.ml_system.feature_names,
                'feature_importance': feature_importance,
                'n_estimators': loan_service.ml_system.approval_model.n_estimators
            }
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================================
# DASHBOARD AND PROFILE ROUTES
# ============================================================================

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        flash("Please log in to access dashboard.", "warning")
        return redirect(url_for('login'))
    
    try:
        user = User.query.get(session['user_id'])
        if not user:
            flash("User not found.", "error")
            session.clear()
            return redirect(url_for('login'))
        
        banking_data = None
        try:
            banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
            logger.info(f"Pre-loaded banking data for user {user.username}")
        except Exception as e:
            logger.warning(f"Could not pre-load banking data for {user.username}: {str(e)}")
            banking_data = {
                'accounts': [],
                'total_balance': 0,
                'banks_with_accounts': [],
                'transactions': {},
                'server_status': 'error',
                'error': 'Could not load banking data'
            }
        
        return render_template('dashboard.html', user=user, banking_data=banking_data)
        
    except Exception as e:
        logger.error(f"Dashboard route error: {str(e)}")
        flash("Error loading dashboard. Please try again.", "error")
        return redirect(url_for('login'))

@app.route('/profile')
def profile():
    if 'user_id' not in session:
        flash("Please log in to access your profile.", "warning")
        return redirect(url_for('login'))
    
    user = User.query.get(session['user_id'])
    if not user:
        flash("User not found.", "error")
        return redirect(url_for('login'))
    
    return render_template('profile.html', user=user)

# ============================================================================
# PROFILE API ROUTES
# ============================================================================

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/api/profile/data', methods=['GET'])
def get_profile_data():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        user_id = session['user_id']
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        profile = Profile.query.filter_by(user_id=user_id).first()
        
        profile_data = {
            'email': user.email,
            'first_name': profile.first_name if profile else '',
            'last_name': profile.last_name if profile else '',
            'phone_number': profile.phone_number if profile else '',
            'date_of_birth': profile.date_of_birth.isoformat() if profile and profile.date_of_birth else '',
            'gender': profile.gender if profile else '',
            'address_line_1': profile.address_line_1 if profile else '',
            'address_line_2': profile.address_line_2 if profile else '',
            'city': profile.city if profile else '',
            'state': profile.state if profile else '',
            'pin_code': profile.pin_code if profile else '',
            'country': profile.country if profile else 'India',
            'profile_image': profile.profile_image if profile else None
        }
        
        return jsonify(profile_data), 200
        
    except Exception as e:
        logger.error(f"Error getting profile data: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@profile_bp.route('/api/profile/personal-info', methods=['PUT'])
def update_personal_info():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        user_id = session['user_id']
        data = request.get_json()
        
        profile = Profile.query.filter_by(user_id=user_id).first()
        if not profile:
            profile = Profile(user_id=user_id)
            db.session.add(profile)
        
        profile.first_name = data.get('first_name')
        profile.last_name = data.get('last_name')
        profile.phone_number = data.get('phone_number')
        
        if data.get('date_of_birth'):
            try:
                profile.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'Invalid date format'}), 400
        
        profile.gender = data.get('gender')
        profile.address_line_1 = data.get('address_line_1')
        profile.address_line_2 = data.get('address_line_2')
        profile.city = data.get('city')
        profile.state = data.get('state')
        profile.pin_code = data.get('pin_code')
        profile.country = data.get('country', 'India')
        profile.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'message': 'Profile updated successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating profile: {e}")
        return jsonify({'error': 'Failed to update profile'}), 500

@profile_bp.route('/api/profile/avatar', methods=['POST'])
def upload_avatar():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        user_id = session['user_id']
        
        if 'profile_image' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['profile_image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
        file_ext = os.path.splitext(secure_filename(file.filename))[1].lower()
        
        if file_ext not in allowed_extensions:
            return jsonify({'error': 'Invalid file type'}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"avatar_{user_id}_{timestamp}{file_ext}"
        
        upload_dir = os.path.join('static', 'uploads', 'avatars')
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, filename)
        file.save(file_path)
        
        profile = Profile.query.filter_by(user_id=user_id).first()
        if not profile:
            profile = Profile(user_id=user_id)
            db.session.add(profile)
        
        profile.profile_image = f"/static/uploads/avatars/{filename}"
        profile.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'Avatar uploaded successfully',
            'profile_image_url': profile.profile_image
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading avatar: {e}")
        return jsonify({'error': 'Failed to upload avatar'}), 500

@profile_bp.route('/api/profile/change-password', methods=['PUT'])
def change_password():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        user_id = session['user_id']
        data = request.get_json()
        
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Current password and new password are required'}), 400
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if not user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        user.set_password(new_password)
        user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Password updated successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error changing password: {e}")
        return jsonify({'error': 'Failed to change password'}), 500

app.register_blueprint(profile_bp)

# ============================================================================
# CHATBOT AND BANKING API ROUTES
# ============================================================================

@app.route('/cb')
def cb():
    return render_template('chatbot.html')

@app.route("/api/lookup_aadhaar", methods=["POST"])
def lookup_aadhaar():
    if 'user_id' not in session:
        return jsonify({"error": "Not authenticated"}), 401
    
    try:
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        aadhaar = user.aadhar_number
        found = {}
        
        for bank_code, config in BankConfig.SERVERS.items():
            try:
                response = requests.post(
                    f"{config['url']}/get_accounts_by_aadhaar",
                    json={"aadhaar": aadhaar},
                    timeout=3
                )
                if response.status_code == 200:
                    accounts = response.json().get("accounts", [])
                    if accounts:
                        found[bank_code] = {
                            'bank_name': config['name'],
                            'accounts': accounts
                        }
            except Exception as e:
                logger.warning(f"Bank {bank_code} unreachable: {str(e)}")
                continue
        
        return jsonify({
            "success": True,
            "aadhaar": aadhaar,
            "found": found,
            "total_banks_checked": len(BankConfig.SERVERS)
        })
        
    except Exception as e:
        logger.error(f"Lookup Aadhaar error: {str(e)}")
        return jsonify({"error": "Failed to lookup accounts"}), 500

@app.route("/api/chat", methods=["POST"])
def chat():
    if 'user_id' not in session:
        return jsonify({"reply": "Please log in to use chat."}), 401
    
    try:
        data = request.get_json()
        bank_code = data.get("bank")
        account_number = data.get("account_number")
        message = data.get("message")
        
        if not all([bank_code, account_number, message]):
            return jsonify({"reply": "Missing required fields"}), 400
        
        if bank_code not in BankConfig.SERVERS:
            return jsonify({"reply": "Bank not supported"}), 400
        
        user = User.query.get(session['user_id'])
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        
        user_accounts = [acc['account_number'] for acc in banking_data.get('accounts', [])]
        if account_number not in user_accounts:
            return jsonify({"reply": "You don't have access to this account."}), 403
        
        bank_config = BankConfig.SERVERS[bank_code]
        response = requests.post(
            f"{bank_config['url']}/process_query",
            json={
                "account_number": account_number,
                "message": message
            },
            timeout=5
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({"reply": "Bank server error. Please try again."}), 500
            
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return jsonify({"reply": f"Chat service error: {str(e)}"}), 500

@app.route("/api/user/accounts", methods=["GET"])
def get_user_accounts():
    if 'user_id' not in session:
        return jsonify({"error": "Not authenticated"}), 401
    
    try:
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        
        return jsonify({
            "success": True,
            "accounts": banking_data.get('accounts', []),
            "total_balance": banking_data.get('total_balance', 0),
            "banks_with_accounts": banking_data.get('banks_with_accounts', [])
        })
        
    except Exception as e:
        logger.error(f"Get user accounts error: {str(e)}")
        return jsonify({"error": "Failed to fetch accounts"}), 500

@app.route("/api/account/transactions", methods=["GET"])
def get_account_transactions():
    if 'user_id' not in session:
        return jsonify({"error": "Not authenticated"}), 401
    
    try:
        account_number = request.args.get('account_number')
        bank_code = request.args.get('bank_code')
        
        if not account_number or not bank_code:
            return jsonify({"error": "Missing account_number or bank_code"}), 400
        
        if bank_code not in BankConfig.SERVERS:
            return jsonify({"error": "Invalid bank"}), 400
        
        user = User.query.get(session['user_id'])
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        user_accounts = [acc['account_number'] for acc in banking_data.get('accounts', [])]
        
        if account_number not in user_accounts:
            return jsonify({"error": "Unauthorized access to account"}), 403
        
        bank_config = BankConfig.SERVERS[bank_code]
        response = requests.get(
            f"{bank_config['url']}/transactions/{account_number}",
            timeout=10
        )
        
        if response.status_code == 200:
            return jsonify({
                "success": True,
                "transactions": response.json()
            })
        else:
            return jsonify({"error": "Failed to fetch transactions"}), 500
            
    except Exception as e:
        logger.error(f"Get account transactions error: {str(e)}")
        return jsonify({"error": "Failed to fetch transactions"}), 500

# ============================================================================
# TRANSACTION ROUTES
# ============================================================================

# Replace the existing /api/transfer endpoint in main.py with this updated version

@app.route("/api/transfer", methods=["POST"])
def transfer():
    """Enhanced transfer endpoint with PIN authentication and improved error handling"""
    if 'user_id' not in session:
        return jsonify({
            "status": "error",
            "error": "Not authenticated",
            "message": "Please log in to perform transfers"
        }), 401
    
    try:
        data = request.get_json()
        logger.info(f"Transfer request received from user {session.get('username')}")
        
        # Extract data
        source_account = data.get('source_account', '').strip()
        recipient_account = data.get('recipient_account', '').strip()
        recipient_ifsc = data.get('recipient_ifsc', '').strip().upper()
        amount = data.get('amount', 0)
        transaction_pin = data.get('transaction_pin', '').strip()
        description = data.get('description', 'Transfer')
        
        # Validate inputs
        if not all([source_account, recipient_account, recipient_ifsc, transaction_pin]):
            return jsonify({
                "status": "error",
                "error": "Missing required fields",
                "message": "Please provide all required information"
            }), 400
        
        # Validate amount
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify({
                "status": "error",
                "error": "Invalid amount",
                "message": "Transfer amount must be a valid number"
            }), 400
        
        if amount <= 0:
            return jsonify({
                "status": "error",
                "error": "Invalid amount",
                "message": "Transfer amount must be greater than zero"
            }), 400
        
        # Validate PIN format
        if len(transaction_pin) < 4 or not transaction_pin.isdigit():
            return jsonify({
                "status": "error",
                "error": "Invalid PIN",
                "message": "Transaction PIN must be at least 4 digits"
            }), 400
        
        # Get user and verify ownership
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({
                "status": "error",
                "error": "User not found",
                "message": "Your session may have expired"
            }), 404
        
        # Fetch user's banking data
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        
        # Find source account and determine bank
        source_bank_code = None
        source_bank_name = None
        source_account_balance = 0
        
        for account in banking_data.get('accounts', []):
            if account['account_number'] == source_account:
                source_bank_code = account['bank_code']
                source_bank_name = account['bank_name']
                source_account_balance = account.get('balance', 0)
                break
        
        if not source_bank_code:
            return jsonify({
                "status": "error",
                "error": "Unauthorized",
                "message": "Source account not found or you don't own it"
            }), 403
        
        # Verify sufficient balance
        if source_account_balance < amount:
            return jsonify({
                "status": "error",
                "error": "Insufficient funds",
                "message": f"Your account balance (₹{source_account_balance:,.2f}) is insufficient for this transfer"
            }), 400
        
        # Validate source bank
        if source_bank_code not in BankConfig.SERVERS:
            return jsonify({
                "status": "error",
                "error": "Invalid bank",
                "message": "Source bank is not supported"
            }), 400
        
        # Determine destination bank from IFSC
        dest_bank_code = None
        if recipient_ifsc.startswith('SBIN'):
            dest_bank_code = 'SBI'
        elif recipient_ifsc.startswith('HDFC'):
            dest_bank_code = 'HDFC'
        elif recipient_ifsc.startswith('ICIC'):
            dest_bank_code = 'ICICI'
        else:
            return jsonify({
                "status": "error",
                "error": "Unsupported bank",
                "message": "Recipient's bank IFSC is not supported. Please use SBI, HDFC, or ICICI accounts."
            }), 400
        
        if dest_bank_code not in BankConfig.SERVERS:
            return jsonify({
                "status": "error",
                "error": "Invalid destination bank",
                "message": "Destination bank is not available"
            }), 400
        
        # Generate transaction ID
        transaction_id = IDGenerator.generate_transaction_id()
        
        # Create transaction record
        new_transaction = Transaction(
            transaction_id=transaction_id,
            user_id=user.id,
            source_account_number=source_account,
            source_bank_code=source_bank_code,
            source_bank_name=source_bank_name,
            recipient_account_number=recipient_account,
            recipient_ifsc=recipient_ifsc,
            amount=amount,
            status='PENDING',
            description=description
        )
        db.session.add(new_transaction)
        db.session.commit()
        
        logger.info(f"Transaction {transaction_id} created, verifying PIN...")
        
        # Step 1: Verify PIN with source bank
        source_bank_url = BankConfig.SERVERS[source_bank_code]['url']
        
        try:
            verify_response = requests.post(
                f"{source_bank_url}/verify_pin",
                json={
                    "account_number": source_account,
                    "pin": transaction_pin
                },
                timeout=5
            )
            
            if verify_response.status_code != 200:
                logger.warning(f"PIN verification failed for transaction {transaction_id}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Invalid PIN",
                    "message": "The transaction PIN you entered is incorrect"
                }), 401
            
            verify_data = verify_response.json()
            if not verify_data.get('valid'):
                logger.warning(f"Invalid PIN for transaction {transaction_id}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Invalid PIN",
                    "message": "The transaction PIN you entered is incorrect"
                }), 401
            
            logger.info(f"PIN verified for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"PIN verification request failed: {str(e)}")
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not verify PIN - bank server unavailable"
            }), 500
        
        # Step 2: Debit from source account WITH PIN
        try:
            debit_response = requests.post(
                f"{source_bank_url}/debit",
                json={
                    "account_number": source_account,
                    "amount": amount,
                    "transaction_pin": transaction_pin,
                    "description": f"{description} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if debit_response.status_code != 200:
                error_data = debit_response.json()
                error_msg = error_data.get('error', 'Debit failed')
                logger.error(f"Debit failed for transaction {transaction_id}: {error_msg}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Debit failed",
                    "message": f"Could not debit from your account: {error_msg}"
                }), 400
            
            logger.info(f"Debit successful for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"Debit request failed: {str(e)}")
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not complete debit - bank server unavailable"
            }), 500
        
        # Step 3: Credit to recipient account
        dest_bank_url = BankConfig.SERVERS[dest_bank_code]['url']
        
        try:
            credit_response = requests.post(
                f"{dest_bank_url}/credit",
                json={
                    "account_number": recipient_account,
                    "amount": amount,
                    "description": f"Received from {source_account} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if credit_response.status_code != 200:
                error_data = credit_response.json()
                error_msg = error_data.get('error', 'Credit failed')
                logger.error(f"Credit failed for transaction {transaction_id}, reversing debit")
                
                # Rollback: Credit back to source account
                try:
                    rollback_response = requests.post(
                        f"{source_bank_url}/credit",
                        json={
                            "account_number": source_account,
                            "amount": amount,
                            "description": f"Refund - Transfer failed (TXN: {transaction_id})"
                        },
                        timeout=5
                    )
                    
                    if rollback_response.status_code == 200:
                        logger.info(f"Rollback successful for transaction {transaction_id}")
                    else:
                        logger.error(f"Rollback FAILED for transaction {transaction_id} - CRITICAL")
                except Exception as rollback_error:
                    logger.error(f"Rollback exception for {transaction_id}: {str(rollback_error)}")
                
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Credit failed",
                    "message": f"Could not credit recipient account: {error_msg}. Amount has been refunded to your account."
                }), 400
            
            logger.info(f"Credit successful for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"Credit request failed: {str(e)}")
            # Attempt rollback
            try:
                requests.post(
                    f"{source_bank_url}/credit",
                    json={
                        "account_number": source_account,
                        "amount": amount,
                        "description": f"Refund - Transfer failed (TXN: {transaction_id})"
                    },
                    timeout=5
                )
            except:
                pass
            
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not complete credit - bank server unavailable. Amount has been refunded."
            }), 500
        
        # Step 4: Mark transaction as successful
        new_transaction.status = 'SUCCESS'
        new_transaction.completed_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"Transaction {transaction_id} completed successfully")
        
        return jsonify({
            'status': 'ok',
            'message': 'Transfer completed successfully',
            'transaction_id': transaction_id,
            'amount': amount,
            'from_account': source_account,
            'to_account': recipient_account,
            'transaction': new_transaction.to_dict()
        }), 200
        
    except ValueError as e:
        logger.error(f"Transfer validation error: {str(e)}")
        return jsonify({
            "status": "error",
            "error": "Invalid input",
            "message": str(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Transfer error: {str(e)}")
        logger.error(traceback.format_exc())
        if 'new_transaction' in locals():
            try:
                new_transaction.status = 'FAILED'
                db.session.commit()
            except:
                pass
        return jsonify({
            "status": "error",
            "error": "Transfer failed",
            "message": "An unexpected error occurred. Please try again."
        }), 500

# Add this endpoint to your main.py file, after the existing /api/transfer endpoint

@app.route("/api/transfer_v2", methods=["POST"])
def transfer_v2():
    """Enhanced transfer endpoint for Payments page with PIN authentication"""
    if 'user_id' not in session:
        return jsonify({
            "status": "error",
            "error": "Not authenticated",
            "message": "Please log in to perform transfers"
        }), 401
    
    try:
        data = request.get_json()
        logger.info(f"Transfer V2 request received from user {session.get('username')}")
        
        # Extract and validate data
        source_account = data.get('source_account', '').strip()
        recipient_account = data.get('recipient_account', '').strip()
        recipient_ifsc = data.get('recipient_ifsc', '').strip().upper()
        amount = data.get('amount', 0)
        transaction_pin = data.get('transaction_pin', '').strip()
        description = data.get('description', 'Transfer')
        
        # Validate required fields
        if not all([source_account, recipient_account, recipient_ifsc, transaction_pin]):
            return jsonify({
                "status": "error",
                "error": "Missing required fields",
                "message": "Please provide all required information"
            }), 400
        
        # Validate amount
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify({
                "status": "error",
                "error": "Invalid amount",
                "message": "Transfer amount must be a valid number"
            }), 400
        
        if amount <= 0:
            return jsonify({
                "status": "error",
                "error": "Invalid amount",
                "message": "Transfer amount must be greater than zero"
            }), 400
        
        # Validate PIN format
        if len(transaction_pin) < 4 or not transaction_pin.isdigit():
            return jsonify({
                "status": "error",
                "error": "Invalid PIN",
                "message": "Transaction PIN must be at least 4 digits"
            }), 400
        
        # Get user and verify ownership
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({
                "status": "error",
                "error": "User not found",
                "message": "Your session may have expired"
            }), 404
        
        # Fetch user's banking data
        banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
        
        # Find source account and determine bank
        source_bank_code = None
        source_bank_name = None
        source_account_balance = 0
        
        for account in banking_data.get('accounts', []):
            if account['account_number'] == source_account:
                source_bank_code = account['bank_code']
                source_bank_name = account['bank_name']
                source_account_balance = account.get('balance', 0)
                break
        
        if not source_bank_code:
            return jsonify({
                "status": "error",
                "error": "Unauthorized",
                "message": "Source account not found or you don't own it"
            }), 403
        
        # Verify sufficient balance
        if source_account_balance < amount:
            return jsonify({
                "status": "error",
                "error": "Insufficient funds",
                "message": f"Your account balance (₹{source_account_balance:,.2f}) is insufficient for this transfer"
            }), 400
        
        # Validate source bank
        if source_bank_code not in BankConfig.SERVERS:
            return jsonify({
                "status": "error",
                "error": "Invalid bank",
                "message": "Source bank is not supported"
            }), 400
        
        # Determine destination bank from IFSC
        dest_bank_code = None
        if recipient_ifsc.startswith('SBIN'):
            dest_bank_code = 'SBI'
        elif recipient_ifsc.startswith('HDFC'):
            dest_bank_code = 'HDFC'
        elif recipient_ifsc.startswith('ICIC'):
            dest_bank_code = 'ICICI'
        else:
            return jsonify({
                "status": "error",
                "error": "Unsupported bank",
                "message": "Recipient's bank IFSC is not supported. Please use SBI, HDFC, or ICICI accounts."
            }), 400
        
        if dest_bank_code not in BankConfig.SERVERS:
            return jsonify({
                "status": "error",
                "error": "Invalid destination bank",
                "message": "Destination bank is not available"
            }), 400
        
        # Generate transaction ID
        transaction_id = IDGenerator.generate_transaction_id()
        
        # Create transaction record
        new_transaction = Transaction(
            transaction_id=transaction_id,
            user_id=user.id,
            source_account_number=source_account,
            source_bank_code=source_bank_code,
            source_bank_name=source_bank_name,
            recipient_account_number=recipient_account,
            recipient_ifsc=recipient_ifsc,
            amount=amount,
            status='PENDING',
            description=description
        )
        db.session.add(new_transaction)
        db.session.commit()
        
        logger.info(f"Transaction {transaction_id} created, verifying PIN...")
        
        # Step 1: Verify PIN with source bank
        source_bank_url = BankConfig.SERVERS[source_bank_code]['url']
        
        try:
            verify_response = requests.post(
                f"{source_bank_url}/verify_pin",
                json={
                    "account_number": source_account,
                    "pin": transaction_pin
                },
                timeout=5
            )
            
            if verify_response.status_code != 200:
                logger.warning(f"PIN verification failed for transaction {transaction_id}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Invalid PIN",
                    "message": "The transaction PIN you entered is incorrect"
                }), 401
            
            verify_data = verify_response.json()
            if not verify_data.get('valid'):
                logger.warning(f"Invalid PIN for transaction {transaction_id}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Invalid PIN",
                    "message": "The transaction PIN you entered is incorrect"
                }), 401
            
            logger.info(f"PIN verified for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"PIN verification request failed: {str(e)}")
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not verify PIN - bank server unavailable"
            }), 500
        
        # Step 2: Debit from source account WITH PIN
        try:
            debit_response = requests.post(
                f"{source_bank_url}/debit",
                json={
                    "account_number": source_account,
                    "amount": amount,
                    "transaction_pin": transaction_pin,
                    "description": f"{description} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if debit_response.status_code != 200:
                error_data = debit_response.json()
                error_msg = error_data.get('error', 'Debit failed')
                logger.error(f"Debit failed for transaction {transaction_id}: {error_msg}")
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Debit failed",
                    "message": f"Could not debit from your account: {error_msg}"
                }), 400
            
            logger.info(f"Debit successful for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"Debit request failed: {str(e)}")
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not complete debit - bank server unavailable"
            }), 500
        
        # Step 3: Credit to recipient account
        dest_bank_url = BankConfig.SERVERS[dest_bank_code]['url']
        
        try:
            credit_response = requests.post(
                f"{dest_bank_url}/credit",
                json={
                    "account_number": recipient_account,
                    "amount": amount,
                    "description": f"Received from {source_account} (TXN: {transaction_id})"
                },
                timeout=5
            )
            
            if credit_response.status_code != 200:
                error_data = credit_response.json()
                error_msg = error_data.get('error', 'Credit failed')
                logger.error(f"Credit failed for transaction {transaction_id}, reversing debit")
                
                # Rollback: Credit back to source account
                try:
                    rollback_response = requests.post(
                        f"{source_bank_url}/credit",
                        json={
                            "account_number": source_account,
                            "amount": amount,
                            "description": f"Refund - Transfer failed (TXN: {transaction_id})"
                        },
                        timeout=5
                    )
                    
                    if rollback_response.status_code == 200:
                        logger.info(f"Rollback successful for transaction {transaction_id}")
                    else:
                        logger.error(f"Rollback FAILED for transaction {transaction_id} - CRITICAL")
                except Exception as rollback_error:
                    logger.error(f"Rollback exception for {transaction_id}: {str(rollback_error)}")
                
                new_transaction.status = 'FAILED'
                db.session.commit()
                return jsonify({
                    "status": "error",
                    "error": "Credit failed",
                    "message": f"Could not credit recipient account: {error_msg}. Amount has been refunded to your account."
                }), 400
            
            logger.info(f"Credit successful for transaction {transaction_id}")
            
        except requests.RequestException as e:
            logger.error(f"Credit request failed: {str(e)}")
            # Attempt rollback
            try:
                requests.post(
                    f"{source_bank_url}/credit",
                    json={
                        "account_number": source_account,
                        "amount": amount,
                        "description": f"Refund - Transfer failed (TXN: {transaction_id})"
                    },
                    timeout=5
                )
            except:
                pass
            
            new_transaction.status = 'FAILED'
            db.session.commit()
            return jsonify({
                "status": "error",
                "error": "Service unavailable",
                "message": "Could not complete credit - bank server unavailable. Amount has been refunded."
            }), 500
        
        # Step 4: Mark transaction as successful
        new_transaction.status = 'SUCCESS'
        new_transaction.completed_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"Transaction {transaction_id} completed successfully")
        
        return jsonify({
            'status': 'ok',
            'message': 'Transfer completed successfully',
            'transaction_id': transaction_id,
            'amount': amount,
            'from_account': source_account,
            'to_account': recipient_account,
            'transaction': new_transaction.to_dict()
        }), 200
        
    except ValueError as e:
        logger.error(f"Transfer V2 validation error: {str(e)}")
        return jsonify({
            "status": "error",
            "error": "Invalid input",
            "message": str(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Transfer V2 error: {str(e)}")
        logger.error(traceback.format_exc())
        if 'new_transaction' in locals():
            try:
                new_transaction.status = 'FAILED'
                db.session.commit()
            except:
                pass
        return jsonify({
            "status": "error",
            "error": "Transfer failed",
            "message": "An unexpected error occurred. Please try again."
        }), 500   
@app.route('/api/transactions/history', methods=['GET'])
def get_transaction_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        user_id = session['user_id']
        limit = request.args.get('limit', 50, type=int)
        status = request.args.get('status')
        
        query = Transaction.query.filter_by(user_id=user_id)
        
        if status:
            query = query.filter_by(status=status)
        
        transactions = query.order_by(Transaction.created_at.desc()).limit(limit).all()
        
        return jsonify({
            'success': True,
            'transactions': [txn.to_dict() for txn in transactions]
        }), 200
        
    except Exception as e:
        logger.error(f"Transaction history error: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch transactions'}), 500

# ============================================================================
# Digilocker Model
# ============================================================================

class Document(db.Model):
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.String(50), unique=True, nullable=False)
    user_id = db.Column(db.String(20), db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    mime_type = db.Column(db.String(100), default='application/pdf')
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime)
    
    user = db.relationship('User', backref='documents')
    
    def to_dict(self):
        return {
            'id': self.document_id,
            'filename': self.original_filename,
            'file_size': self.file_size,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None,
            'mime_type': self.mime_type
        }

class DigilockerPin(db.Model):
    __tablename__ = 'digilocker_pins'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), db.ForeignKey('users.id'), nullable=False, unique=True)
    pin_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref='digilocker_pin')

# ============================================================================
# UTILITY ROUTES
# ============================================================================

@app.route('/digi')
def digi():
    """Redirect old route to new route"""
    return redirect(url_for('digilocker'))

@app.route('/emi')
def emi():
    return render_template('emi.html')

@app.route('/calculate_emi', methods=['POST'])
def calculate_emi():
    try:
        data = request.get_json()
        principal = float(data['principal'])
        rate = float(data['rate'])
        tenure = int(data['tenure'])
        
        monthly_rate = rate / (12 * 100)
        
        if monthly_rate == 0:
            emi = principal / tenure
        else:
            emi = principal * monthly_rate * (1 + monthly_rate)**tenure / ((1 + monthly_rate)**tenure - 1)
        
        total_amount = emi * tenure
        total_interest = total_amount - principal
        
        balance = principal
        schedule = []
        
        for month in range(1, tenure + 1):
            if monthly_rate == 0:
                interest_payment = 0
                principal_payment = emi
            else:
                interest_payment = balance * monthly_rate
                principal_payment = emi - interest_payment
            
            balance -= principal_payment
            
            schedule.append({
                'month': month,
                'emi': round(emi, 2),
                'principal': round(principal_payment, 2),
                'interest': round(interest_payment, 2),
                'balance': round(max(0, balance), 2)
            })
        
        return jsonify({
            'success': True,
            'emi': round(emi, 2),
            'total_amount': round(total_amount, 2),
            'total_interest': round(total_interest, 2),
            'schedule': schedule[:12]
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/payments')
def payments():
    return render_template('payments.html')

@app.route('/check-auth', methods=['GET'])
def api_check_auth():
    if 'user_id' in session:
        try:
            user = User.query.get(session['user_id'])
            if user:
                return jsonify({
                    'authenticated': True,
                    'user': user.to_dict(),
                    'session_info': {
                        'user_id': session['user_id'],
                        'username': session.get('username'),
                        'aadhar': session.get('aadhar')
                    }
                }), 200
            else:
                session.clear()
                return jsonify({'authenticated': False, 'reason': 'User not found'}), 401
        except Exception as e:
            logger.error(f"Auth check error: {str(e)}")
            return jsonify({'authenticated': False, 'reason': 'Database error'}), 500
    else:
        return jsonify({'authenticated': False, 'reason': 'No session'}), 401

@app.route('/api/dashboard-data', methods=['GET'])
def api_get_dashboard_data():
    if 'user_id' not in session:
        logger.warning("Unauthenticated request to dashboard data")
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        user = User.query.get(session['user_id'])
        if not user:
            logger.warning(f"User not found for session user_id: {session.get('user_id')}")
            session.clear()
            return jsonify({'error': 'User not found'}), 404
        
        logger.info(f"Fetching dashboard data for user: {user.username}")
        
        try:
            banking_data = banking_service.fetch_all_banking_data(user.aadhar_number)
            logger.info(f"Successfully fetched banking data for {user.username}")
        except Exception as banking_error:
            logger.error(f"Banking data fetch error for {user.username}: {str(banking_error)}")
            banking_data = {
                'accounts': [],
                'total_balance': 0,
                'banks_with_accounts': [],
                'transactions': {},
                'server_status': 'error',
                'error': f'Banking data unavailable: {str(banking_error)}'
            }
        
        return jsonify({
            'user': user.to_dict(),
            'banking_data': banking_data,
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Dashboard data API error: {str(e)}")
        return jsonify({
            'error': 'Failed to fetch dashboard data', 
            'details': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    try:
        user_count = User.query.count()
        db_connected = True
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        db_connected = False
        user_count = 0
    
    banking_status = {}
    banks_connected = 0
    
    for bank_code, config in BankConfig.SERVERS.items():
        try:
            response = requests.get(f"{config['url']}/health", timeout=5)
            if response.status_code == 200:
                banking_status[bank_code] = 'connected'
                banks_connected += 1
            else:
                banking_status[bank_code] = 'error'
        except:
            banking_status[bank_code] = 'disconnected'
    
    ml_model_loaded = loan_service.ml_system.approval_model is not None
    
    health_status = {
        "status": "healthy" if db_connected and ml_model_loaded else "degraded",
        "timestamp": datetime.now().isoformat(),
        "integrated_banking_proxy": True,
        "ml_system_enabled": True,
        "services": {
            "database": {
                "status": "connected" if db_connected else "disconnected",
                "user_count": user_count
            },
            "banking_servers": {
                "total_configured": len(BankConfig.SERVERS),
                "connected": banks_connected,
                "individual_status": banking_status
            },
            "ml_loan_system": {
                "status": "loaded" if ml_model_loaded else "not_loaded",
                "model_type": "XGBoost" if ml_model_loaded else None
            }
        }
    }
    
    return jsonify(health_status)

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(413)
def file_too_large(error):
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'File size exceeds 200MB limit'
        }), 413
    return "File too large (max 200MB)", 413

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith('/api/'):
        return jsonify({"error": "Endpoint not found"}), 404
    
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>404 - Page Not Found</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
            .error-container { max-width: 500px; margin: 0 auto; }
            h1 { color: #e74c3c; }
            a { color: #3498db; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="error-container">
            <h1>404 - Page Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
            <a href="/">Go back to home</a>
        </div>
    </body>
    </html>
    """, 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    if request.path.startswith('/api/'):
        return jsonify({"error": "Internal server error"}), 500
    
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>500 - Internal Server Error</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
            .error-container { max-width: 500px; margin: 0 auto; }
            h1 { color: #e74c3c; }
            a { color: #3498db; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="error-container">
            <h1>500 - Internal Server Error</h1>
            <p>Something went wrong on our end. Please try again later.</p>
            <a href="/">Go back to home</a>
        </div>
    </body>
    </html>
    """, 500

# ============================================================================
# APPLICATION STARTUP
# ============================================================================

if __name__ == '__main__':
    print("="*70)
    print("🚀 VyomNext Integrated Application with ML Loan System")
    print("="*70)
    
    with app.app_context():
        try:
            db.create_all()
            print("✓ Database tables created/verified")
        except Exception as e:
            print(f"✗ Database initialization failed: {str(e)}")
    
    print("\nConfigured Bank Servers:")
    for bank_code, config in BankConfig.SERVERS.items():
        print(f"  • {bank_code}: {config['name']} at {config['url']}")
    
    print("\nML Loan Recommendation System:")
    print(f"  • XGBoost model: {'Loaded' if loan_service.ml_system.approval_model else 'Not loaded'}")
    print("  • Gemini AI integration: Active")
    print("  • Bank statement analysis: Enabled")
    
    print("\n" + "="*70)
    print("🌐 VyomNext App running at: http://localhost:4000")
    print("="*70)
    print("\n⚠️  Required services - Start bank servers in separate terminals:")
    print("  Terminal 2: python sbi_server.py (port 5001)")
    print("  Terminal 3: python hdfc_server.py (port 5002)")  
    print("  Terminal 4: python icici_server.py (port 5003)")
    print("\n" + "="*70)
    
    app.run(host='0.0.0.0', port=4000, debug=True)