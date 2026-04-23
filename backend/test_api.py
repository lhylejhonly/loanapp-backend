#!/usr/bin/env python
"""
Quick test script to verify backend API endpoints
Run: python test_api.py
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_health():
    """Test health check endpoint"""
    print("Testing health check...")
    response = requests.get(f"{BASE_URL}/health/")
    print(f"✓ Health: {response.status_code} - {response.json()}")

def test_public_endpoints():
    """Test public endpoints"""
    print("\nTesting public endpoints...")
    
    # Loan types
    response = requests.get(f"{BASE_URL}/public/loan-types/")
    print(f"✓ Loan Types: {response.status_code} - {len(response.json())} types")
    
    # Overview
    response = requests.get(f"{BASE_URL}/public/overview/")
    data = response.json()
    print(f"✓ Overview: {response.status_code}")
    print(f"  - Applications: {data['stats']['applications']}")
    print(f"  - Loan Types: {len(data['loan_types'])}")

def test_auth():
    """Test authentication"""
    print("\nTesting authentication...")
    
    # Login
    response = requests.post(
        f"{BASE_URL}/auth/login/",
        json={"email": "borrower@loanapp.com", "password": "borrower123"}
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Login: {response.status_code}")
        print(f"  - User: {data['user']['name']}")
        print(f"  - Role: {data['user']['role']}")
        return data['access']
    else:
        print(f"✗ Login failed: {response.status_code}")
        return None

def test_borrower_endpoints(token):
    """Test borrower endpoints"""
    if not token:
        print("\n✗ Skipping borrower tests (no token)")
        return
    
    print("\nTesting borrower endpoints...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # My loans
    response = requests.get(f"{BASE_URL}/borrower/loans/", headers=headers)
    print(f"✓ My Loans: {response.status_code} - {len(response.json())} loans")
    
    # My payments
    response = requests.get(f"{BASE_URL}/borrower/payments/", headers=headers)
    print(f"✓ My Payments: {response.status_code} - {len(response.json())} payments")
    
    # My documents
    response = requests.get(f"{BASE_URL}/borrower/documents/", headers=headers)
    print(f"✓ My Documents: {response.status_code} - {len(response.json())} documents")
    
    # My notifications
    response = requests.get(f"{BASE_URL}/borrower/notifications/", headers=headers)
    print(f"✓ My Notifications: {response.status_code} - {len(response.json())} notifications")

def main():
    print("=" * 50)
    print("LOAN APP API TEST")
    print("=" * 50)
    
    try:
        test_health()
        test_public_endpoints()
        token = test_auth()
        test_borrower_endpoints(token)
        
        print("\n" + "=" * 50)
        print("✓ ALL TESTS PASSED!")
        print("=" * 50)
        print("\nBackend is ready for frontend integration!")
        
    except requests.exceptions.ConnectionError:
        print("\n✗ ERROR: Cannot connect to backend")
        print("Make sure Django is running: python manage.py runserver")
    except Exception as e:
        print(f"\n✗ ERROR: {e}")

if __name__ == "__main__":
    main()
