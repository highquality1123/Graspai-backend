#!/usr/bin/env python3
"""
Graspr Account Registration Test
=================================
Complete registration flow: register → verify OTP → login → get profile
"""

import requests
import json
import sys

# Configuration
BASE_URL = "http://localhost:3100"
EMAIL = "tienvan0158@gmail.com"
PASSWORD = "SamplePassword123!"
FULL_NAME = "Tien Van"


def print_step(step_num, title):
    """Print step header"""
    print(f"\n{'='*60}")
    print(f"Step {step_num}: {title}")
    print(f"{'='*60}\n")


def register_user():
    """Step 1: Register new user account"""
    print_step(1, "Register Account")

    url = f"{BASE_URL}/auth/register"
    payload = {
        "fullName": FULL_NAME,
        "email": EMAIL,
        "password": PASSWORD
    }

    print(f"Registering: {EMAIL}")
    print(f"Endpoint: POST {url}")

    try:
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            data = response.json()
            print("✓ Registration successful!")
            print(f"✓ OTP sent to {EMAIL}")
            return "new_user"
        elif response.status_code == 409:
            print("⚠ Email already registered (confirmed)")
            return "already_confirmed"
        elif response.status_code == 422:
            error_msg = response.json().get('message', '')
            if 'already been registered' in error_msg:
                print("⚠ Email already exists in system")
                print("⚠ Attempting to resend OTP for verification...")
                return resend_verification()
            else:
                print(f"✗ Registration failed: {response.json()}")
                return None
        else:
            print(f"✗ Registration failed: {response.json()}")
            return None

    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def resend_verification():
    """Resend OTP if email already registered but not verified"""
    url = f"{BASE_URL}/auth/resendVerification"
    payload = {"email": EMAIL}

    try:
        response = requests.post(url, json=payload)
        if response.status_code in [200, 201]:
            print("✓ OTP resent successfully")
            print(f"✓ OTP sent to {EMAIL}")
            return "needs_verification"
        elif response.status_code == 404:
            print("⚠ User not found or already verified")
            return "already_confirmed"
        else:
            error_data = response.json()
            print(f"✗ Failed to resend OTP: {error_data}")
            # If user is already confirmed, we'll get an error
            if 'already registered' in error_data.get('message', '').lower():
                return "already_confirmed"
            return None
    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def verify_otp(otp):
    """Step 2: Verify OTP and complete registration"""
    print_step(2, "Verify OTP")

    url = f"{BASE_URL}/auth/verify"
    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "otp": int(otp)
    }

    print(f"Verifying OTP: {otp}")
    print(f"Endpoint: POST {url}")

    try:
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            data = response.json()
            print("✓ OTP verified!")
            print("✓ Account activated!")
            print(f"\nSession Tokens:")
            print(f"  Access Token: {data['session']['access_token'][:50]}...")
            print(f"  Refresh Token: {data['session']['refresh_token'][:50]}...")
            return data
        else:
            print(f"✗ Verification failed: {response.json()}")
            return None

    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def login():
    """Step 3: Login with credentials"""
    print_step(3, "Login")

    url = f"{BASE_URL}/auth/login"
    payload = {
        "email": EMAIL,
        "password": PASSWORD
    }

    print(f"Logging in: {EMAIL}")
    print(f"Endpoint: POST {url}")

    try:
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            data = response.json()
            print("✓ Login successful!")
            print(f"\nUser Info:")
            print(f"  ID: {data['user']['id']}")
            print(f"  Email: {data['user']['email']}")
            print(f"  Full Name: {data['user']['full_name']}")
            return data
        elif response.status_code == 500:
            error_data = response.json()
            print(f"✗ Login failed: {error_data}")

            if 'multiple (or no) rows returned' in error_data.get('message', ''):
                print("\n" + "!"*60)
                print("DATABASE INTEGRITY ERROR DETECTED")
                print("!"*60)
                print("\nThis error means there are duplicate or missing user records")
                print("in your Supabase database for this email address.")
                print("\n" + "-"*60)
                print("QUICK FIX - Option 1: Clean up via SQL")
                print("-"*60)
                print("\n1. Open Supabase Dashboard → SQL Editor")
                print("2. Run the SQL commands from: cleanup_database.sql")
                print(f"   (located in the same folder as this script)")
                print("3. Run this test script again")
                print("\n" + "-"*60)
                print("QUICK FIX - Option 2: Clean up via UI")
                print("-"*60)
                print("\n1. Supabase Dashboard → Table Editor → profiles table")
                print(f"2. Delete all rows where email = '{EMAIL}'")
                print("3. Supabase Dashboard → Authentication → Users")
                print(f"4. Delete user with email '{EMAIL}'")
                print("5. Run this test script again")
                print("\n" + "-"*60)
                print("ALTERNATIVE: Use a different email")
                print("-"*60)
                print("\nEdit the script and change EMAIL to a new address")
                print("!"*60 + "\n")
            return None
        else:
            print(f"✗ Login failed: {response.json()}")
            return None

    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def get_user_profile(access_token, refresh_token):
    """Step 4: Get user profile using session tokens"""
    print_step(4, "Get User Profile")

    url = f"{BASE_URL}/auth/getUser"
    headers = {
        "access": access_token,
        "refresh": refresh_token
    }

    print(f"Fetching profile")
    print(f"Endpoint: GET {url}")

    try:
        response = requests.get(url, headers=headers)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print("✓ Profile retrieved!")
            print(f"\nProfile Details:")
            print(json.dumps(data, indent=2))
            return data
        else:
            print(f"✗ Failed to get profile: {response.json()}")
            return None

    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def main():
    """Main test flow"""
    print("\n" + "="*60)
    print("Graspr Account Registration Test".center(60))
    print("="*60)
    print(f"\nConfiguration:")
    print(f"  Email: {EMAIL}")
    print(f"  Password: {'*' * len(PASSWORD)}")
    print(f"  Full Name: {FULL_NAME}")
    print(f"  Backend: {BASE_URL}")

    # Step 1: Register
    register_status = register_user()

    if register_status is None:
        print("\n✗ Test failed at registration step")
        return

    # Determine if we need OTP verification
    needs_verification = register_status in ["new_user", "needs_verification"]

    if needs_verification:
        # Get OTP from user input
        print("\n" + "-"*60)
        print("CHECK YOUR EMAIL for the OTP code!")
        print("The OTP will expire in 15 minutes")
        print("-"*60)

        try:
            otp_code = input("\nEnter OTP code: ").strip()
        except KeyboardInterrupt:
            print("\n\n✗ Test cancelled by user")
            return

        # Step 2: Verify OTP
        verify_result = verify_otp(otp_code)
        if not verify_result:
            print("\n✗ Test failed at OTP verification step")
            return

        print("✓ Verification complete, proceeding to login...")
    else:
        print("\n⚠ User already verified, skipping OTP verification")
        print("✓ Proceeding directly to login...")

    # Step 3: Login
    login_result = login()
    if not login_result:
        print("\n✗ Test failed at login step")
        return

    # Step 4: Get user profile
    access_token = login_result['session']['access_token']
    refresh_token = login_result['session']['refresh_token']

    profile_result = get_user_profile(access_token, refresh_token)
    if not profile_result:
        print("\n✗ Test failed at profile retrieval step")
        return

    # Test Complete
    print("\n" + "="*60)
    print("✓ ALL TESTS PASSED!".center(60))
    print("="*60)
    print("\nAccount successfully created and tested!")
    print(f"\nLogin Credentials:")
    print(f"  Email: {EMAIL}")
    print(f"  Password: {PASSWORD}")
    print("\n")


if __name__ == "__main__":
    main()
