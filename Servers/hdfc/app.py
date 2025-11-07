from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pymysql
from datetime import datetime
import logging
import hashlib

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure SQLAlchemy for MySQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:root@localhost/hdfc_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Define models
class BankAccount(db.Model):
    __tablename__ = 'accounts'
    
    account_number = db.Column(db.String(20), primary_key=True, nullable=False)
    user_name = db.Column(db.String(100), nullable=False)
    aadhaar_number = db.Column(db.String(12), nullable=False)
    account_type = db.Column(db.String(20), nullable=False)
    balance = db.Column(db.Float, default=0.0)
    phone = db.Column(db.String(15))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    ifsc_code = db.Column(db.String(20))
    transaction_pin = db.Column(db.String(64))  # Hashed PIN

class BankTransaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(50), unique=True)
    account_number = db.Column(db.String(20), db.ForeignKey('accounts.account_number'))
    type = db.Column(db.String(20))
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(500))
    balance_after = db.Column(db.Float)
    recipient_account = db.Column(db.String(50))
    status = db.Column(db.String(20), default='SUCCESS')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# PIN utility functions
def hash_pin(pin):
    """Hash PIN using SHA-256"""
    return hashlib.sha256(str(pin).encode()).hexdigest()

def verify_pin(account_number, pin):
    """Verify transaction PIN"""
    account = BankAccount.query.filter_by(account_number=account_number).first()
    if not account:
        return False
    
    if not account.transaction_pin:
        return False
    
    return account.transaction_pin == hash_pin(pin)

# Database connection function
def get_db_connection():
    try:
        conn = pymysql.connect(
            host="localhost",
            user="root",
            password="root",
            database="hdfc_db",
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        return conn
    except Exception as e:
        logger.error(f"Error connecting to MySQL: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
            conn.close()
            return jsonify({
                "status": "healthy",
                "bank": "HDFC",
                "database": "hdfc_db",
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            conn.close()
            return jsonify({
                "status": "unhealthy",
                "bank": "HDFC",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }), 500
    else:
        return jsonify({
            "status": "unhealthy",
            "bank": "HDFC",
            "error": "Database connection failed",
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route("/get_accounts_by_aadhaar", methods=["POST"])
def get_accounts_by_aadhaar():
    """Get accounts by Aadhaar (POST method)"""
    aadhaar = request.json.get("aadhaar")
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT account_number, user_name, aadhaar_number, account_type, balance, phone, created_at, ifsc_code FROM accounts WHERE aadhaar_number=%s",
                (aadhaar,)
            )
            rows = cursor.fetchall()
        conn.close()
        
        for account in rows:
            if account.get('created_at'):
                account['created_at'] = account['created_at'].isoformat()
        
        return jsonify({"accounts": rows})
    except Exception as e:
        conn.close()
        logger.error(f"Error fetching accounts: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/accounts/<aadhaar>', methods=['GET'])
def get_accounts(aadhaar):
    """Get all accounts for a specific Aadhaar number"""
    if not aadhaar or len(aadhaar) != 12 or not aadhaar.isdigit():
        return jsonify({"error": "Invalid Aadhaar number format"}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cursor:
            query = """
                SELECT 
                    account_number, user_name, aadhaar_number,
                    account_type, balance, phone, created_at, ifsc_code
                FROM accounts 
                WHERE aadhaar_number = %s
                ORDER BY created_at DESC
            """
            cursor.execute(query, (aadhaar,))
            result = cursor.fetchall()
        
        conn.close()
        
        for account in result:
            if account.get('created_at'):
                account['created_at'] = account['created_at'].isoformat()
        
        logger.info(f"Found {len(result)} accounts for Aadhaar {aadhaar}")
        return jsonify(result)
        
    except Exception as e:
        conn.close()
        logger.error(f"Error fetching accounts for Aadhaar {aadhaar}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/transactions/<account_number>', methods=['GET'])
def get_transactions(account_number):
    """Get all transactions for a specific account number"""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT account_number FROM accounts WHERE account_number = %s", (account_number,))
            if not cursor.fetchone():
                conn.close()
                return jsonify({"error": "Account not found"}), 404
            
            query = """
                SELECT account_number, type, amount, description,
                       balance_after, timestamp
                FROM transactions
                WHERE account_number = %s
                ORDER BY timestamp DESC
            """
            cursor.execute(query, (account_number,))
            result = cursor.fetchall()
        
        conn.close()
        
        for transaction in result:
            if transaction.get('timestamp'):
                transaction['timestamp'] = transaction['timestamp'].isoformat()
        
        logger.info(f"Found {len(result)} transactions for account {account_number}")
        return jsonify(result)
        
    except Exception as e:
        conn.close()
        logger.error(f"Error fetching transactions for account {account_number}: {e}")
        return jsonify({"error": str(e)}), 500

# PIN Management Endpoints
@app.route('/check_pin', methods=['POST'])
def check_pin_exists():
    """Check if account has a PIN set"""
    try:
        data = request.get_json()
        account_number = data.get('account_number')
        
        if not account_number:
            return jsonify({'error': 'Account number required'}), 400
        
        account = BankAccount.query.filter_by(account_number=account_number).first()
        if not account:
            return jsonify({'error': 'Account not found'}), 404
        
        has_pin = account.transaction_pin is not None and account.transaction_pin != ''
        
        return jsonify({
            'has_pin': has_pin,
            'account_number': account_number
        }), 200
        
    except Exception as e:
        logger.error(f"Check PIN error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/set_pin', methods=['POST'])
def set_transaction_pin():
    """Set or update transaction PIN"""
    try:
        data = request.get_json()
        account_number = data.get('account_number')
        new_pin = data.get('pin')
        
        if not account_number or not new_pin:
            return jsonify({'error': 'Account number and PIN required'}), 400
        
        if len(str(new_pin)) not in [4, 5, 6]:
            return jsonify({'error': 'PIN must be 4-6 digits'}), 400
        
        if not str(new_pin).isdigit():
            return jsonify({'error': 'PIN must contain only digits'}), 400
        
        account = BankAccount.query.filter_by(account_number=account_number).first()
        if not account:
            return jsonify({'error': 'Account not found'}), 404
        
        account.transaction_pin = hash_pin(new_pin)
        db.session.commit()
        
        logger.info(f"Transaction PIN set for account {account_number}")
        
        return jsonify({
            'success': True,
            'message': 'Transaction PIN set successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Set PIN error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/verify_pin', methods=['POST'])
def verify_transaction_pin():
    """Verify transaction PIN"""
    try:
        data = request.get_json()
        account_number = data.get('account_number')
        pin = data.get('pin')
        
        if not account_number or not pin:
            return jsonify({'error': 'Account number and PIN required'}), 400
        
        if verify_pin(account_number, pin):
            return jsonify({'valid': True}), 200
        else:
            return jsonify({'valid': False, 'error': 'Invalid PIN'}), 401
            
    except Exception as e:
        logger.error(f"Verify PIN error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Transfer endpoint
@app.route('/process_query', methods=['POST'])
def process_query():
    """Process natural language banking queries"""
    try:
        data = request.get_json()
        account_number = data.get('account_number')
        message = data.get('message', '').lower()
        
        if not account_number:
            return jsonify({'error': 'Account number required'}), 400
        
        # Get database connection
        conn = get_db_connection()
        if not conn:
            return jsonify({
                'error': 'Database connection failed',
                'reply': 'Sorry, unable to connect to bank database.'
            }), 500
        
        try:
            with conn.cursor() as cursor:
                # Verify account exists
                cursor.execute(
                    "SELECT account_number, user_name, account_type, balance, ifsc_code FROM accounts WHERE account_number=%s",
                    (account_number,)
                )
                account = cursor.fetchone()
                
                if not account:
                    conn.close()
                    return jsonify({'error': 'Account not found'}), 404
                
                # Process different query types
                reply = ""
                
                if 'balance' in message:
                    reply = f"Your current balance is ₹{account['balance']:,.2f}"
                
                elif 'transaction' in message or 'history' in message:
                    cursor.execute(
                        """SELECT type, amount, description, timestamp 
                           FROM transactions 
                           WHERE account_number=%s 
                           ORDER BY timestamp DESC 
                           LIMIT 5""",
                        (account_number,)
                    )
                    transactions = cursor.fetchall()
                    
                    if transactions:
                        reply = f"Your last {len(transactions)} transactions:\n"
                        for txn in transactions:
                            reply += f"• {txn['type'].upper()}: ₹{txn['amount']:,.2f} - {txn['description']}\n"
                    else:
                        reply = "No recent transactions found."
                
                elif 'account' in message and 'details' in message:
                    reply = f"Account Number: {account['account_number']}\n"
                    reply += f"Account Type: {account['account_type']}\n"
                    reply += f"Account Holder: {account['user_name']}\n"
                    reply += f"Balance: ₹{account['balance']:,.2f}\n"
                    reply += f"IFSC: {account['ifsc_code']}"
                
                elif 'help' in message:
                    reply = "I can help you with:\n"
                    reply += "• Check balance - 'What is my balance?'\n"
                    reply += "• View transaction history - 'Show my transactions'\n"
                    reply += "• Account details - 'Show account details'"
                
                else:
                    reply = "I can help you check your balance, view transactions, or get account details. What would you like to know?"
            
            conn.close()
            
            return jsonify({
                'reply': reply,
                'account_number': account_number,
                'status': 'success'
            }), 200
            
        except Exception as e:
            conn.close()
            logger.error(f"Query processing error: {str(e)}")
            return jsonify({
                'error': 'Query processing failed',
                'reply': 'Sorry, I encountered an error processing your request.'
            }), 500
        
    except Exception as e:
        logger.error(f"Process query error: {str(e)}")
        return jsonify({
            'error': 'Failed to process query',
            'reply': 'Sorry, I encountered an error processing your request.'
        }), 500
    
@app.route("/debit", methods=["POST"])
def debit():
    """Debit endpoint"""
    data = request.json
    acc = data['account_number']
    amt = float(data['amount'])
    desc = data.get('description', 'debit')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT balance FROM accounts WHERE account_number=%s", (acc,))
            row = cursor.fetchone()
            if not row:
                raise Exception("Account not found")
            if float(row['balance']) < amt:
                raise Exception("Insufficient funds")
            
            new_bal = float(row['balance']) - amt
            cursor.execute("UPDATE accounts SET balance=%s WHERE account_number=%s", (new_bal, acc))
            cursor.execute(
                "INSERT INTO transactions (account_number, type, amount, description, balance_after, timestamp) VALUES (%s,%s,%s,%s,%s,%s)",
                (acc, 'debit', amt, desc, new_bal, datetime.utcnow())
            )
            conn.commit()
        conn.close()
        return jsonify({"status": "ok", "balance": new_bal})
    except Exception as e:
        conn.rollback()
        conn.close()
        logger.error(f"Debit error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 400

@app.route("/credit", methods=["POST"])
def credit():
    """Credit endpoint"""
    data = request.json
    acc = data['account_number']
    amt = float(data['amount'])
    desc = data.get('description', 'credit')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"status": "error", "error": "Database connection failed"}), 500
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT balance FROM accounts WHERE account_number=%s", (acc,))
            row = cursor.fetchone()
            if not row:
                raise Exception("Account not found")
            
            new_bal = float(row['balance']) + amt
            cursor.execute("UPDATE accounts SET balance=%s WHERE account_number=%s", (new_bal, acc))
            cursor.execute(
                "INSERT INTO transactions (account_number, type, amount, description, balance_after, timestamp) VALUES (%s,%s,%s,%s,%s,%s)",
                (acc, 'credit', amt, desc, new_bal, datetime.utcnow())
            )
            conn.commit()
        conn.close()
        return jsonify({"status": "ok", "balance": new_bal})
    except Exception as e:
        conn.rollback()
        conn.close()
        logger.error(f"Credit error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 400

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found", "bank": "HDFC"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error", "bank": "HDFC"}), 500

if __name__ == '__main__':
    print("Starting HDFC Bank Server with PIN Authentication...")
    print("Port: 5002")
    print("Available endpoints:")
    print("  GET  /health - Health check")
    print("  POST /check_pin - Check if PIN exists")
    print("  POST /set_pin - Set transaction PIN")
    print("  POST /verify_pin - Verify transaction PIN")
    print("  POST /transfer - Process transfer (requires PIN)")
    print("  POST /debit - Debit from account")
    print("  POST /credit - Credit to account")
    
    with app.app_context():
        db.create_all()
        print("Database tables verified")
    
    app.run(host='0.0.0.0', port=5002, debug=True)