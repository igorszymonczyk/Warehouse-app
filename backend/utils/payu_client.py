# backend/utils/payu_client.py
import httpx
import logging
from urllib.parse import urljoin
from config import settings

logger = logging.getLogger(__name__)

class PayUClient:
    def __init__(self):
        # Initialize configuration and callback URLs
        self.api_url = settings.PAYU_API_URL
        self.pos_id = settings.PAYU_POS_ID
        self.client_id = settings.PAYU_CLIENT_ID
        self.client_secret = settings.PAYU_CLIENT_SECRET
        self.notify_url = urljoin(settings.BACKEND_URL, "/payu/notify")
        self.continue_url = urljoin(settings.FRONTEND_URL, "/my-orders")

    async def get_auth_token(self) -> str:
        # Retrieve OAuth access token using client credentials
        auth_url = urljoin(self.api_url, "/pl/standard/user/oauth/authorize")
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(auth_url, data=payload)
                response.raise_for_status()
                return response.json()["access_token"]
            except (httpx.RequestError, httpx.HTTPStatusError) as e:
                logger.error(f"PayU auth error: {e}")
                raise

    async def create_order(self, token: str, order_data: dict):
        # Submit order request to PayU API
        order_url = urljoin(self.api_url, "/api/v2_1/orders")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        async with httpx.AsyncClient() as client:
            try:
                # Disable auto-redirects to handle 3xx responses manually
                response = await client.post(order_url, json=order_data, headers=headers, follow_redirects=False)

                # Extract redirect URL from headers if status is 3xx
                if 300 <= response.status_code < 400:
                    loc = response.headers.get("Location") or response.headers.get("location")
                    return {"redirectUri": loc, "status_code": response.status_code}

                # Enforce error checks for client/server errors
                if response.status_code >= 400:
                    response.raise_for_status()

                # Return standard JSON response
                return response.json()
            except (httpx.RequestError, httpx.HTTPStatusError) as e:
                # Log detailed error information before re-raising
                try:
                    resp_text = e.response.text if hasattr(e, 'response') and e.response is not None else str(e)
                except Exception:
                    resp_text = str(e)
                logger.error(f"PayU create order error: {resp_text}")
                raise

payu_client = PayUClient()