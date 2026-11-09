import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Set SUPABASE_URL and SUPABASE_KEY in backend/.env."
    )


def get_supabase_client(access_token: str | None = None) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    if access_token:
        client.postgrest.auth(access_token)

    return client
