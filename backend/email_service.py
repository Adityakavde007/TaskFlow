import os
import base64

from email.message import EmailMessage
from dotenv import load_dotenv

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send"
]


def send_email(receiver, subject, body):
    required_settings = (
        "GMAIL_REFRESH_TOKEN",
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GMAIL_SENDER",
    )
    missing_settings = [
        setting for setting in required_settings
        if not os.getenv(setting)
    ]
    if missing_settings:
        raise RuntimeError(
            "Missing Gmail configuration: "
            + ", ".join(missing_settings)
        )

    credentials = Credentials(
        None,
        refresh_token=os.getenv("GMAIL_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GMAIL_CLIENT_ID"),
        client_secret=os.getenv("GMAIL_CLIENT_SECRET"),
        scopes=SCOPES
    )

    credentials.refresh(Request())

    service = build(
        "gmail",
        "v1",
        credentials=credentials
    )

    message = EmailMessage()

    message.set_content(body)
    message["To"] = receiver
    message["From"] = os.getenv("GMAIL_SENDER")
    message["Subject"] = subject

    encoded = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode()

    service.users().messages().send(
        userId="me",
        body={"raw": encoded}
    ).execute()