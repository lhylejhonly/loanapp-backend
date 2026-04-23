# Loan App - Complete Setup & Testing Guide

## 🚀 Quick Start

### Backend Setup (Django)

1. **Navigate to backend folder:**
```bash
cd backend
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Configure environment:**
```bash
copy .env.example .env
```

4. **Run migrations:**
```bash
python manage.py migrate
```

5. **Create demo data:**
```bash
python manage.py seed_demo --reset
```

6. **Start server:**
```bash
python manage.py runserver 0.0.0.0:8000
```

### Frontend Setup (React Native/Expo)

1. **Navigate to frontend folder:**
```bash
cd frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure API URL:**
```bash
copy .env.example .env
```

Edit `.env` and set your PC's LAN IP:
```
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:8000/api
```

To find your LAN IP:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` (look for inet)

4. **Start Expo:**
```bash
npx expo start
```

5. **Run on device:**
- Scan QR code with Expo Go app (iOS/Android)
- Or press `a` for Android emulator
- Or press `i` for iOS simulator

## 🧪 Testing Guide

### Test Accounts

**Admin:**
- Email: `admin@loanapp.com`
- Password: `admin123`

**Loan Officer:**
- Email: `officer@loanapp.com`
- Password: `officer123`

**Borrower (Qualified):**
- Email: `borrower@loanapp.com`
- Password: `borrower123`

### Test Flows

#### 1. Guest Browsing
- Open app without logging in
- Browse loan types
- View public statistics
- Try to apply (should prompt login)

#### 2. New Borrower Registration
- Click "Create Account"
- Fill in details:
  - Name: Test User
  - Email: test@example.com
  - Password: test123
  - Phone: +1234567890
  - Enable SMS: Yes
- Submit registration
- Should auto-login

#### 3. Document Upload
- Login as borrower
- Go to "Documents" tab
- Select "ID" type
- Click "Upload Document"
- Choose a PDF or image file
- Verify upload success
- Repeat for "Proof of Income"

#### 4. Profile Verification
- Go to "Profile" tab
- Fill in employment details:
  - Employment Status: Employed
  - Monthly Income: 5000
  - Monthly Debt: 1000
- Submit
- Should show "Qualified" status

#### 5. Loan Application
- Go to "Home" tab
- Select a loan type
- Adjust amount with +/- buttons
- Select term (months)
- Click "Promptly Apply"
- Verify success message

#### 6. Officer Review (Web Admin)
- Open browser: `http://localhost:8000/admin/`
- Login as officer
- View pending applications
- Approve/reject loans
- Record payments

## 🔧 Troubleshooting

### Backend Issues

**Port already in use:**
```bash
python manage.py runserver 0.0.0.0:8001
```

**Database locked:**
```bash
python manage.py migrate --run-syncdb
```

**CORS errors:**
Check `DJANGO_CORS_ALLOWED_ORIGINS` in `.env`

### Frontend Issues

**Cannot connect to backend:**
1. Verify backend is running
2. Check `.env` has correct IP
3. Ensure phone/computer on same WiFi
4. Try: `http://YOUR_IP:8000/api/health/`

**Expo Go not loading:**
```bash
npx expo start --clear
```

**Module not found:**
```bash
rm -rf node_modules
npm install
```

## 📱 Features Implemented

### ✅ Completed
- User authentication (JWT)
- Role-based access (Borrower/Officer/Admin)
- Loan application workflow
- Document upload (metadata only)
- Payment tracking
- Notifications
- Guest browsing
- Profile management
- Real-time data sync

### ⚠️ Partial
- File storage (metadata only, no actual file storage)
- Push notifications (in-app only)
- SMS notifications (simulated)

### ❌ Not Implemented
- Payment gateway integration
- Email notifications
- File download
- Advanced analytics
- Multi-language support

## 🔐 Security Notes

- JWT tokens stored in SecureStore
- Passwords hashed with Django's PBKDF2
- CORS configured for development
- HTTPS required for production
- Input validation on both frontend/backend

## 📊 API Endpoints

### Public
- `GET /api/public/loan-types/` - List loan types
- `GET /api/public/overview/` - Public statistics

### Auth
- `POST /api/auth/register/` - Register borrower
- `POST /api/auth/login/` - Login
- `POST /api/auth/refresh/` - Refresh token
- `GET /api/auth/me/` - Current user

### Borrower
- `GET /api/borrower/loans/` - My loans
- `POST /api/borrower/loans/` - Apply for loan
- `GET /api/borrower/payments/` - My payments
- `GET /api/borrower/documents/` - My documents
- `POST /api/borrower/documents/` - Upload document
- `GET /api/borrower/notifications/` - My notifications

### Officer
- `GET /api/officer/applications/` - Pending loans
- `POST /api/officer/applications/{id}/decision/` - Approve/reject
- `GET /api/officer/borrowers/` - List borrowers
- `POST /api/officer/payments/record/` - Record payment

### Admin
- `GET /api/admin/dashboard/` - Statistics
- `GET /api/admin/users/` - All users
- `GET /api/admin/loans/` - All loans
- `GET /api/admin/loan-types/` - Manage loan types

## 🎯 Next Steps for Production

1. **File Storage:**
   - Implement AWS S3 or similar
   - Add file upload/download endpoints
   - Implement file validation

2. **Notifications:**
   - Add Expo Push Notifications
   - Integrate Twilio for SMS
   - Add email service (SendGrid)

3. **Payment Gateway:**
   - Integrate Stripe/PayPal
   - Add payment webhooks
   - Implement refunds

4. **Database:**
   - Switch to PostgreSQL
   - Add database backups
   - Implement migrations strategy

5. **Deployment:**
   - Deploy backend to AWS/Heroku
   - Build mobile app (EAS Build)
   - Set up CI/CD pipeline

6. **Testing:**
   - Add unit tests
   - Add integration tests
   - Add E2E tests

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review API documentation
3. Check Django logs: `python manage.py runserver`
4. Check Expo logs in terminal

## 📄 License

This is a demo loan application for educational purposes.
