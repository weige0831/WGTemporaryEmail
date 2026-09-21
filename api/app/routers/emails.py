"""Email retrieval endpoints - token-based authentication"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models import Email, EmailRecipient, Attachment
from app.rate_limit import ip_rate_limit
from app.schemas import EmailSummary, EmailDetail, EmailListResponse, AttachmentInfo
from app.utils import get_address_by_token, escape_like

router = APIRouter(
    prefix="/api/v1/{token}",
    tags=["emails"],
    # Individual reads are cheap but raw/attachment routes stream whole
    # messages, so every token route is rate limited per IP. Writes are
    # limited in their own routers.
    dependencies=[Depends(ip_rate_limit(240, 60, scope="emails"))],
)


def content_disposition(filename: str) -> str:
    """Build an RFC 6266 attachment header that is safe for any filename.

    Path separators are replaced first (a filename never legitimately contains
    one), then the name is emitted twice: an ASCII fallback for old clients and
    the RFC 5987 `filename*` form. Putting raw non-latin-1 text into a header
    raises while the response is built (HTTP 500), and an unescaped quote would
    break out of the quoted-string.
    """
    name = (filename or "attachment").replace("/", "_").replace("\\", "_")
    name = name.replace("\r", "_").replace("\n", "_")
    fallback = name.encode("ascii", "replace").decode("ascii").replace('"', "_") or "attachment"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(name, safe='')}"


@router.get("/info")
def get_address_info(
    token: str,
    db: Session = Depends(get_db)
):
    """Return the address bound to this token (email, type, timestamps).

    Used by the permanent mailbox page to display the mailbox address after
    logging in with just the token.
    """
    address = get_address_by_token(token, db)
    return {
        "id": str(address.id),
        "email": address.email,
        "address_type": address.address_type,
        "created_at": address.created_at.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z',
        "expires_at": address.expires_at.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z' if address.expires_at else None,
    }


@router.get("/emails", response_model=EmailListResponse)
def list_emails(
    token: str,
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    unread_only: bool = Query(False, description="Show only unread emails"),
    search: Optional[str] = Query(None, description="Search in subject, from, body"),
    db: Session = Depends(get_db)
):
    """
    List emails for a temporary address.

    Returns paginated list of emails with optional filtering.

    **Query Parameters:**
    - `page`: Page number (default: 1)
    - `per_page`: Items per page, max 100 (default: 50)
    - `unread_only`: Filter to unread emails only (default: false)
    - `search`: Search in subject, sender, and body (case-insensitive)

    **Example:**
    ```bash
    curl http://localhost:8000/api/v1/{token}/emails
    curl http://localhost:8000/api/v1/{token}/emails?page=2&per_page=25
    curl http://localhost:8000/api/v1/{token}/emails?unread_only=true
    curl http://localhost:8000/api/v1/{token}/emails?search=invoice
    ```
    """
    # Verify token
    address = get_address_by_token(token, db)

    # Build query
    query = db.query(
        Email,
        EmailRecipient.is_read
    ).join(
        EmailRecipient, Email.id == EmailRecipient.email_id
    ).filter(
        EmailRecipient.address_id == address.id
    )

    # Apply filters
    if unread_only:
        query = query.filter(EmailRecipient.is_read.is_(False))

    if search:
        search_term = f"%{escape_like(search)}%"
        query = query.filter(
            or_(
                Email.subject.ilike(search_term, escape="\\"),
                Email.from_address.ilike(search_term, escape="\\"),
                Email.body_plain.ilike(search_term, escape="\\")
            )
        )

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * per_page
    results = query.order_by(desc(Email.received_at)).offset(offset).limit(per_page).all()

    # Build response
    emails = []
    for email, is_read in results:
        email_summary = EmailSummary(
            id=email.id,
            subject=email.subject,
            from_address=email.from_address,
            to_address=email.to_address,
            received_at=email.received_at,
            is_read=is_read,
            has_attachments=email.has_attachments,
            size_bytes=email.size_bytes
        )
        emails.append(email_summary)

    # Calculate pagination metadata
    total_pages = (total + per_page - 1) // per_page
    has_next = page < total_pages
    has_prev = page > 1

    return EmailListResponse(
        emails=emails,
        total=total,
        page=page,
        per_page=per_page,
        has_next=has_next,
        has_prev=has_prev
    )


@router.get("/emails/{email_id}", response_model=EmailDetail)
def get_email(
    token: str,
    email_id: UUID,
    mark_read: bool = Query(True, description="Mark email as read"),
    db: Session = Depends(get_db)
):
    """
    Get full email details.

    **Path Parameters:**
    - `email_id`: UUID of the email

    **Query Parameters:**
    - `mark_read`: Automatically mark as read (default: true)

    **Returns:**
    - Full email content including headers, body (plain & HTML), and attachments list
    - DKIM/SPF/DMARC validation results

    **Example:**
    ```bash
    curl http://localhost:8000/api/v1/{token}/emails/{email_id}
    curl http://localhost:8000/api/v1/{token}/emails/{email_id}?mark_read=false
    ```
    """
    # Verify token
    address = get_address_by_token(token, db)

    # Get email and recipient record
    result = db.query(
        Email,
        EmailRecipient
    ).join(
        EmailRecipient, Email.id == EmailRecipient.email_id
    ).filter(
        Email.id == email_id,
        EmailRecipient.address_id == address.id
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Email not found")

    email, recipient = result

    # Mark as read if requested
    if mark_read and not recipient.is_read:
        recipient.is_read = True
        recipient.read_at = datetime.utcnow()
        db.commit()

    # Get attachments
    attachments = db.query(Attachment).filter(Attachment.email_id == email.id).all()

    attachment_list = [
        AttachmentInfo(
            id=att.id,
            filename=att.filename,
            content_type=att.content_type,
            size_bytes=att.size_bytes
        )
        for att in attachments
    ]

    return EmailDetail(
        id=email.id,
        message_id=email.message_id,
        subject=email.subject,
        from_address=email.from_address,
        to_address=email.to_address,
        raw_headers=email.raw_headers,
        body_plain=email.body_plain,
        body_html=email.body_html,
        size_bytes=email.size_bytes,
        dkim_valid=email.dkim_valid,
        spf_result=email.spf_result,
        dmarc_result=email.dmarc_result,
        has_attachments=email.has_attachments,
        received_at=email.received_at,
        is_read=recipient.is_read,
        attachments=attachment_list
    )


@router.get("/emails/{email_id}/raw")
def download_raw_email(
    token: str,
    email_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Download raw email message (.eml file).

    Returns the complete RFC 5322 message as received.

    **Example:**
    ```bash
    curl http://localhost:8000/api/v1/{token}/emails/{email_id}/raw -o message.eml
    ```
    """
    # Verify token
    address = get_address_by_token(token, db)

    # Get email
    result = db.query(Email).join(
        EmailRecipient, Email.id == EmailRecipient.email_id
    ).filter(
        Email.id == email_id,
        EmailRecipient.address_id == address.id
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Email not found")

    # Return raw message
    filename = f"{email_id}.eml"
    return Response(
        content=result.raw_message,
        media_type="message/rfc822",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        }
    )


@router.get("/emails/{email_id}/attachments/{attachment_id}")
def download_attachment(
    token: str,
    email_id: UUID,
    attachment_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Download email attachment.

    **Example:**
    ```bash
    curl http://localhost:8000/api/v1/{token}/emails/{email_id}/attachments/{attachment_id} -o file.pdf
    ```
    """
    # Verify token
    address = get_address_by_token(token, db)

    # Verify email belongs to this address
    email_check = db.query(Email).join(
        EmailRecipient, Email.id == EmailRecipient.email_id
    ).filter(
        Email.id == email_id,
        EmailRecipient.address_id == address.id
    ).first()

    if not email_check:
        raise HTTPException(status_code=404, detail="Email not found")

    # Get attachment
    attachment = db.query(Attachment).filter(
        Attachment.id == attachment_id,
        Attachment.email_id == email_id
    ).first()

    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Return file. The attachment's own MIME type is attacker-controlled, so it
    # is only used for allowlisted (render-inert) types; everything else is
    # served as a download-only binary.
    _RENDERABLE = {
        "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp",
        "application/pdf", "text/plain",
    }
    content_type = (attachment.content_type or "").split(";")[0].strip().lower()
    media_type = content_type if content_type in _RENDERABLE else "application/octet-stream"

    return Response(
        content=attachment.data,
        media_type=media_type,
        headers={
            "Content-Disposition": content_disposition(attachment.filename),
            "X-Content-Type-Options": "nosniff",
        }
    )


@router.delete("/emails/{email_id}", status_code=204)
def delete_email(
    token: str,
    email_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete an email.

    **Example:**
    ```bash
    curl -X DELETE http://localhost:8000/api/v1/{token}/emails/{email_id}
    ```
    """
    # Verify token
    address = get_address_by_token(token, db)

    # Get email recipient record
    recipient = db.query(EmailRecipient).filter(
        EmailRecipient.email_id == email_id,
        EmailRecipient.address_id == address.id
    ).first()

    if not recipient:
        raise HTTPException(status_code=404, detail="Email not found")

    # Remove this mailbox's link to the message, then the message itself once
    # no mailbox references it any more. The schema is many-to-many (one
    # message can be delivered to several local addresses), so deleting the
    # shared row outright would destroy other recipients' copies.
    db.delete(recipient)
    db.flush()
    still_referenced = db.query(EmailRecipient).filter(
        EmailRecipient.email_id == email_id
    ).first()
    if not still_referenced:
        db.query(Attachment).filter(Attachment.email_id == email_id).delete(synchronize_session=False)
        db.query(Email).filter(Email.id == email_id).delete(synchronize_session=False)
    db.commit()

    return Response(status_code=204)
