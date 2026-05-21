from pydantic import BaseModel


class PushSubscriptionPayload(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
