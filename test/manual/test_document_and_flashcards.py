#!/usr/bin/env python3
"""
Graspr Document Upload and Flashcards Generation Test
======================================================
Complete flow: Login → Upload Document → Generate Flashcards
"""

import requests
import json
import os
import time
from io import BytesIO

# Configuration
BASE_URL = "http://localhost:3100"
EMAIL = "tienvan0158@gmail.com"
EMAIL = "yaroslav@phokus.io"
PASSWORD = "SamplePassword123!"
PASSWORD = "newnew"

# Path to test PDF document
TEST_PDF_PATH = "/mnt/d/Code/Upwork/Yann_Startup_Projects/Graspr-Backend/test/manual/Tailieu_HDSD_TMDT_CN_final_V4.pdf"

# Default topic for flashcard generation
DEFAULT_TOPIC = "General knowledge from the document"


def print_step(step_num, title):
    """Print step header"""
    print(f"\n{'='*60}")
    print(f"Step {step_num}: {title}")
    print(f"{'='*60}\n")


def print_success(msg):
    """Print success message"""
    print(f"✓ {msg}")


def print_error(msg):
    """Print error message"""
    print(f"✗ {msg}")


def print_info(msg):
    """Print info message"""
    print(f"ℹ {msg}")


def login():
    """Step 1: Login to get access tokens"""
    print_step(1, "Login")

    url = f"{BASE_URL}/auth/login"
    payload = {
        "email": EMAIL,
        "password": PASSWORD
    }

    print_info(f"Logging in: {EMAIL}")
    print_info(f"Endpoint: POST {url}")

    try:
        response = requests.post(url, json=payload)
        print_info(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            data = response.json()
            print_success("Login successful!")
            print(f"\nUser Info:")
            print(f"  ID: {data['user']['id']}")
            print(f"  Email: {data['user']['email']}")
            print(f"  Full Name: {data['user']['full_name']}")

            return {
                'access_token': data['session']['access_token'],
                'refresh_token': data['session']['refresh_token'],
                'user_id': data['user']['id']
            }
        else:
            print_error(f"Login failed: {response.json()}")
            return None

    except Exception as e:
        print_error(f"Error: {e}")
        return None


def create_default_container(tokens):
    """Create a default container if none exists"""
    url = f"{BASE_URL}/containers/empty"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token'],
        "Content-Type": "application/json"
    }
    payload = {
        "name": "My Documents"
    }

    print_info(f"Creating default container")
    print_info(f"Endpoint: POST {url}")

    try:
        response = requests.post(url, headers=headers, json=payload)
        print_info(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            container_data = response.json()
            print_success("Default container created!")
            print(f"\nCreated Container:")
            print(f"  ID: {container_data['id']}")
            print(f"  Name: {container_data['name']}")
            return container_data['id']
        else:
            print_error(f"Failed to create container: {response.json()}")
            return None

    except Exception as e:
        print_error(f"Error creating container: {e}")
        return None


def get_folder_tree(tokens):
    """Step 2: Get folder tree to find container ID"""
    print_step(2, "Get Folder Tree")

    url = f"{BASE_URL}/folders/tree"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token']
    }

    print_info(f"Fetching folder tree")
    print_info(f"Endpoint: GET {url}")

    try:
        response = requests.get(url, headers=headers)
        print_info(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print_success("Folder tree retrieved!")

            # The response structure is { folders: [], root_containers: [] }
            root_containers = data.get('root_containers', [])

            # Find first root container
            if root_containers and len(root_containers) > 0:
                container_id = root_containers[0]['id']
                print(f"\nFound Container:")
                print(f"  ID: {container_id}")
                print(f"  Name: {root_containers[0]['name']}")
                return container_id
            else:
                print_info("No containers found, creating default container...")
                return create_default_container(tokens)
        else:
            print_error(f"Failed to get folder tree: {response.json()}")
            return None

    except Exception as e:
        print_error(f"Error: {e}")
        return None


def upload_document(tokens, container_id):
    """Step 3: Upload a document"""
    print_step(3, "Upload Document")

    # Use existing PDF file
    filepath = TEST_PDF_PATH

    # Convert WSL path to Windows path if needed
    if filepath.startswith('/mnt/'):
        # Convert /mnt/d/... to D:\...
        drive = filepath[5].upper()
        rest = filepath[6:].replace('/', '\\')
        filepath = f"{drive}:{rest}"

    if not os.path.exists(filepath):
        print_error(f"Test PDF file not found: {filepath}")
        return None

    filename = os.path.basename(filepath)

    url = f"{BASE_URL}/documents"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token']
    }

    print_info(f"Uploading document: {filename}")
    print_info(f"Document path: {filepath}")
    print_info(f"Endpoint: POST {url}")

    try:
        # Open file and read content, then close it before making request
        with open(filepath, 'rb') as f:
            file_content = f.read()

        # Now make the request with the file content
        files = {
            'file': (filename, file_content, 'application/pdf')
        }
        data = {
            'documentName': os.path.splitext(filename)[0],  # Remove .pdf extension
            'documentType': 'pdf',
            'language': 'en',
            'containerId': container_id
        }

        response = requests.post(url, headers=headers, files=files, data=data)
        print_info(f"Status: {response.status_code}")

        if response.status_code in [200, 201]:
            response_data = response.json()
            # Response structure: { message: "...", document: { id, name, type, ... } }
            doc_data = response_data.get('document', response_data)

            print_success("Document uploaded successfully!")
            print(f"\nDocument Info:")
            print(f"  ID: {doc_data['id']}")
            print(f"  Name: {doc_data['name']}")
            print(f"  Type: {doc_data['type']}")
            return doc_data['id']
        else:
            error_data = response.json()
            print_error(f"Upload failed: {error_data}")
            return None

    except Exception as e:
        print_error(f"Error: {e}")
        return None


def wait_for_document_processing(tokens, document_id, max_wait=180):
    """Step 4: Wait for document to be processed (embeddings generated)"""
    print_step(4, "Wait for Document Processing")

    url = f"{BASE_URL}/documents/{document_id}"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token']
    }

    print_info("Waiting for document to be processed...")
    print_info("This may take 30-120 seconds depending on document size")

    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            response = requests.get(url, headers=headers)

            if response.status_code == 200:
                doc_data = response.json()

                # Check if document has been processed
                if doc_data.get('pages_count', 0) > 0 or doc_data.get('tokens', 0) > 0:
                    print_success("Document processing complete!")
                    print(f"\nDocument Stats:")
                    print(f"  Pages/Chunks: {doc_data.get('pages_count', 0)}")
                    print(f"  Tokens: {doc_data.get('tokens', 0)}")
                    print(f"  Length: {doc_data.get('length', 0)} characters")
                    return True

                # Still processing
                elapsed = int(time.time() - start_time)
                print(f"  Processing... ({elapsed}s elapsed)", end='\r')
                time.sleep(3)  # Wait 3 seconds before checking again
            else:
                print_error(f"Failed to check document status: {response.json()}")
                return False

        except Exception as e:
            print_error(f"Error checking document status: {e}")
            return False

    print_error(f"Document processing timeout after {max_wait}s")
    return False


def generate_flashcards(tokens, document_id, cards_count=5, topic=DEFAULT_TOPIC):
    """Step 5: Generate flashcards from the document"""
    print_step(5, "Generate Flashcards")

    url = f"{BASE_URL}/flashcards"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token'],
        "Content-Type": "application/json"
    }

    payload = {
        "documentId": document_id,
        "topic": topic,
        "cardsCount": cards_count
    }

    print_info(f"Generating {cards_count} flashcards")
    print_info(f"Topic: {topic}")
    print_info(f"Endpoint: POST {url}")

    try:
        # Start timing
        start_time = time.time()

        response = requests.post(url, headers=headers, json=payload)

        # Calculate processing time
        processing_time = time.time() - start_time

        print_info(f"Status: {response.status_code}")
        print_info(f"Processing Time: {processing_time:.2f} seconds")

        if response.status_code in [200, 201]:
            flashcards_data = response.json()
            actual_count = len(flashcards_data.get('questions', []))

            print_success("Flashcards generated successfully!")

            print(f"\nFlashcards Info:")
            print(f"  Set ID: {flashcards_data['id']}")
            print(f"  Topic: {flashcards_data.get('topic', 'N/A')}")
            print(f"  Requested Cards: {cards_count}")
            print(f"  Generated Cards: {actual_count}")
            print(f"  Processing Time: {processing_time:.2f}s")

            # CRITICAL VALIDATION: Check exact count
            if actual_count == cards_count:
                print_success(f"✓ EXACT COUNT MATCH: {actual_count}/{cards_count}")
            else:
                print_error(f"✗ COUNT MISMATCH: Generated {actual_count} flashcards, expected {cards_count}")
                return None, processing_time

            # Display only top 5 flashcards
            display_count = min(5, actual_count)
            print(f"\n{'='*60}")
            print(f"GENERATED FLASHCARDS (showing {display_count} of {actual_count}):")
            print(f"{'='*60}\n")

            for idx, card in enumerate(flashcards_data['questions'][:5], 1):
                print(f"Flashcard {idx}:")
                print(f"  Question: {card.get('question', 'N/A')}")
                print(f"  Answer: {card.get('answer', 'N/A')[:100]}..." if len(card.get('answer', '')) > 100 else f"  Answer: {card.get('answer', 'N/A')}")
                print(f"  Page Reference: {card.get('page_number', 'N/A')}")
                print()

            if actual_count > 5:
                print(f"  ... and {actual_count - 5} more flashcards\n")

            return flashcards_data['id'], processing_time
        else:
            error_data = response.json()
            print_error(f"Flashcards generation failed: {error_data}")
            return None, processing_time

    except Exception as e:
        print_error(f"Error: {e}")
        return None, 0


def get_flashcards_by_document(tokens, document_id):
    """Step 6: Get flashcards sets by document (optional verification)"""
    print_step(6, "Verify Flashcards")

    url = f"{BASE_URL}/flashcards/document/{document_id}"
    headers = {
        "access": tokens['access_token'],
        "refresh": tokens['refresh_token']
    }

    print_info(f"Fetching flashcards sets for document")
    print_info(f"Endpoint: GET {url}")

    try:
        response = requests.get(url, headers=headers)
        print_info(f"Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print_success("Flashcards verified!")
            print(f"  Total flashcard sets: {len(data)}")
            return True
        else:
            print_error(f"Failed to verify flashcards: {response.json()}")
            return False

    except Exception as e:
        print_error(f"Error: {e}")
        return False


def run_comprehensive_flashcards_tests(tokens, document_id):
    """Run multiple flashcards generation tests with different card counts"""
    print("\n" + "="*60)
    print("COMPREHENSIVE FLASHCARDS GENERATION TEST".center(60))
    print("="*60)
    print("\nTesting exact flashcard count generation with various counts...\n")

    test_cases = [5, 10, 20, 50]
    results = []

    for cards_count in test_cases:
        print(f"\n{'='*60}")
        print(f"Test Case: {cards_count} Flashcards")
        print(f"{'='*60}")

        flashcards_id, processing_time = generate_flashcards(tokens, document_id, cards_count)

        if flashcards_id:
            results.append({
                'count': cards_count,
                'status': 'PASS',
                'flashcards_id': flashcards_id,
                'time': processing_time
            })
            print_success(f"✓ PASSED: Generated exactly {cards_count} flashcards in {processing_time:.2f}s")
        else:
            results.append({
                'count': cards_count,
                'status': 'FAIL',
                'flashcards_id': None,
                'time': processing_time
            })
            print_error(f"✗ FAILED: Could not generate {cards_count} flashcards (took {processing_time:.2f}s)")

        # Small delay between tests
        time.sleep(2)

    # Print summary
    print("\n" + "="*60)
    print("FLASHCARDS GENERATION TEST SUMMARY".center(60))
    print("="*60)
    print(f"\n{'Flashcards':<12} {'Status':<8} {'Time':<12}")
    print("-" * 32)

    total_time = 0
    for result in results:
        status_symbol = "✓" if result['status'] == 'PASS' else "✗"
        print(f"{result['count']:<12} {status_symbol} {result['status']:<6} {result['time']:.2f}s")
        total_time += result['time']

    passed = sum(1 for r in results if r['status'] == 'PASS')
    total = len(results)

    print("-" * 32)
    print(f"{'Total':<12} {passed}/{total:<6} {total_time:.2f}s")
    print(f"\nOverall: {passed}/{total} test cases passed")
    print(f"Total Processing Time: {total_time:.2f} seconds")

    return passed == total


def main():
    """Main test flow"""
    print("\n" + "="*60)
    print("Graspr Document Upload & Flashcards Generation Test".center(60))
    print("="*60)
    print(f"\nConfiguration:")
    print(f"  Email: {EMAIL}")
    print(f"  Password: {'*' * len(PASSWORD)}")
    print(f"  Backend: {BASE_URL}")

    # Step 1: Login
    tokens = login()
    if not tokens:
        print("\n✗ Test failed at login step")
        return

    # Step 2: Get folder tree / container ID
    container_id = get_folder_tree(tokens)
    if not container_id:
        print("\n✗ Test failed at folder tree step")
        return

    # Step 3: Upload document
    document_id = upload_document(tokens, container_id)
    if not document_id:
        print("\n✗ Test failed at document upload step")
        return

    # Step 4: Wait for document processing
    if not wait_for_document_processing(tokens, document_id):
        print("\n✗ Test failed at document processing step")
        print("⚠ Note: Document may still be processing in background")
        print("⚠ You can try generating flashcards manually later")
        return

    # Step 5: Run comprehensive flashcards generation tests
    all_tests_passed = run_comprehensive_flashcards_tests(tokens, document_id)

    # Test Complete
    print("\n" + "="*60)
    if all_tests_passed:
        print("✓ ALL TESTS PASSED!".center(60))
    else:
        print("⚠ SOME TESTS FAILED".center(60))
    print("="*60)
    print("\nSuccessfully completed:")
    print("  ✓ Login")
    print("  ✓ Document upload")
    print("  ✓ Document processing")
    print("  ✓ Multiple flashcards generation tests" if all_tests_passed else "  ⚠ Flashcards generation (with failures)")
    print(f"\nDocument ID: {document_id}")
    print("\n")


if __name__ == "__main__":
    main()
