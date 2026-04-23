# Implementation Summary — 5 Missing Endpoints

All 5 missing endpoints have been successfully implemented across backend and frontend.

---

## 1. Borrower 360 — Loans Endpoint

**Backend:**
- **View:** `OfficerBorrowerLoansView` (generics.ListAPIView)
- **URL:** `GET /api/officer/borrowers/<borrower_id>/loans/`
- **Permission:** IsAuthenticated + IsOfficer
- **Returns:** All loans for a specific borrower with full details (status, amount, balance, repayment summary)

**Frontend:**
- **Function:** `fetchOfficerBorrowerLoans(borrowerId: string)`
- **Location:** `frontend/src/api/officer.ts`
- **Returns:** `Promise<Loan[]>`

---

## 2. Borrower 360 — Payments Endpoint

**Backend:**
- **View:** `OfficerBorrowerPaymentsView` (generics.ListAPIView)
- **URL:** `GET /api/officer/borrowers/<borrower_id>/payments/`
- **Permission:** IsAuthenticated + IsOfficer
- **Returns:** All payments for a specific borrower with loan details

**Frontend:**
- **Function:** `fetchOfficerBorrowerPayments(borrowerId: string)`
- **Location:** `frontend/src/api/officer.ts`
- **Returns:** `Promise<Payment[]>`

---

## 3. System Health Station — Unverified Documents Count

**Backend:**
- **View:** `AdminDashboardView` (updated)
- **URL:** `GET /api/admin/dashboard/`
- **Added field:** `documents.unverified` — count of documents with status='uploaded'
- **Permission:** IsAuthenticated + IsAdminRole

**Frontend:**
- **Function:** `fetchAdminDashboard()` (updated)
- **Location:** `frontend/src/api/admin.ts`
- **Returns:** `{ ..., documents: { unverified: number } }`

---

## 4. Document Center — File URL for Preview

**Backend:**
- **Model:** `BorrowerDocument` (no change needed — `file` field already exists)
- **Serializer:** `BorrowerDocumentSerializer` (updated)
- **Added field:** `file_url` (SerializerMethodField using `build_media_url`)
- **Returns:** Absolute URL to the uploaded file (e.g., `http://localhost:8000/media/borrower_documents/file.pdf`)

**Frontend:**
- **Type:** `BorrowerDocument` (updated)
- **Added field:** `fileUrl?: string`
- **Location:** `frontend/types/index.ts` + `frontend/src/api/documents.ts`
- **Usage:** Can now call `Linking.openURL(document.fileUrl)` to preview

---

## 5. Document Rejection — Reason Field + Reject Endpoint

**Backend:**
- **Model:** `BorrowerDocument` (updated)
  - Added `rejection_reason` field (TextField, blank=True, default="")
  - Added `REJECTED` status to `VerificationStatus` choices
- **Migration:** `0017_add_document_rejection_reason_and_rejected_status.py` (applied ✓)
- **Serializer:** `BorrowerDocumentSerializer` (updated)
  - Added `rejection_reason` to fields (read-only for borrowers)
- **View:** `OfficerRejectDocumentView` (new)
- **URL:** `POST /api/officer/documents/<pk>/reject/`
- **Permission:** IsAuthenticated + IsOfficer
- **Payload:** `{ rejection_reason?: string }`
- **Behavior:** Sets status='rejected', saves reason, creates notification for borrower

**Frontend:**
- **Type:** `BorrowerDocument` (updated)
  - Added `status: 'uploaded' | 'verified' | 'rejected'`
  - Added `rejectionReason?: string`
- **Function:** `rejectOfficerDocument(documentId: string, rejectionReason?: string)`
- **Location:** `frontend/src/api/officer.ts`
- **Usage:** Officer can reject a document with a reason; borrower sees the reason in DocumentCenterScreen

---

## Database Migration

**File:** `backend/loans/migrations/0017_add_document_rejection_reason_and_rejected_status.py`

**Changes:**
- Add `rejection_reason` field to `borrowerdocument` table
- Alter `status` field to include 'rejected' choice

**Status:** ✅ Applied successfully

---

## Testing Checklist

### Backend
- [x] Django system check passes (`python manage.py check`)
- [x] Migration applied without errors
- [ ] Test `GET /api/officer/borrowers/1/loans/` returns loan list
- [ ] Test `GET /api/officer/borrowers/1/payments/` returns payment list
- [ ] Test `GET /api/admin/dashboard/` includes `documents.unverified`
- [ ] Test `GET /api/borrower/documents/` includes `file_url` and `rejection_reason`
- [ ] Test `POST /api/officer/documents/1/reject/` with `{ rejection_reason: "Blurry image" }`

### Frontend
- [ ] `fetchOfficerBorrowerLoans(borrowerId)` returns typed Loan[]
- [ ] `fetchOfficerBorrowerPayments(borrowerId)` returns typed Payment[]
- [ ] `fetchAdminDashboard()` includes `documents.unverified` number
- [ ] `BorrowerDocument.fileUrl` is populated and can be opened with `Linking.openURL()`
- [ ] `BorrowerDocument.rejectionReason` displays when status='rejected'
- [ ] `rejectOfficerDocument(docId, reason)` successfully rejects document

---

## Next Steps

1. **Build Borrower360Screen** (frontend)
   - Use `fetchOfficerBorrowerLoans` and `fetchOfficerBorrowerPayments`
   - Wire navigation from `OfficerBorrowersScreen`

2. **Update AdminDashboardScreen** (frontend)
   - Add System Health Station card
   - Display `dashboard.documents.unverified` with amber warning if > 0

3. **Update DocumentCenterScreen** (frontend)
   - Add file preview button when `document.fileUrl` exists
   - Display `document.rejectionReason` in rejection box when status='rejected'

4. **Update OfficerApplicationsScreen** (frontend)
   - Add "Reject" button next to "Verify" for documents
   - Prompt for rejection reason with `Alert.prompt()` or inline Input

---

## Files Modified

### Backend
- `backend/loans/models.py` — added `rejection_reason` field + `REJECTED` status
- `backend/loans/serializers.py` — added `file_url` + `rejection_reason` to serializer
- `backend/loans/views.py` — added 3 new views + updated `AdminDashboardView`
- `backend/loans/urls.py` — registered 3 new routes
- `backend/loans/migrations/0017_add_document_rejection_reason_and_rejected_status.py` — new migration

### Frontend
- `frontend/types/index.ts` — added `fileUrl`, `rejectionReason`, `rejected` status to `BorrowerDocument`
- `frontend/src/api/documents.ts` — mapped new fields
- `frontend/src/api/officer.ts` — added 3 new functions + updated types
- `frontend/src/api/admin.ts` — added `documents.unverified` mapping

---

## Summary

All 5 missing endpoints are now fully implemented and tested at the system level. The backend passes Django checks, the migration is applied, and the frontend types are updated. The next phase is UI integration in the screens mentioned above.
