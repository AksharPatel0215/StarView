"""Bounded retries for transient generation-provider failures only."""
import asyncio
import random
import httpx

RETRYABLE={500,502,503,504}

async def post_with_retries(client,url,*,headers,json,enabled=False):
    attempts=3 if enabled else 1
    for attempt in range(attempts):
        response=None
        try:
            response=await client.post(url,headers=headers,json=json)
            if response.status_code not in RETRYABLE or attempt==attempts-1:return response
        except httpx.TransportError:
            if attempt==attempts-1:raise
        delay=2**attempt+random.uniform(0,.25)
        if response is not None:
            try:delay=max(delay,min(10,max(0,float(response.headers.get('retry-after','0')))))
            except ValueError:pass
        await asyncio.sleep(delay)
