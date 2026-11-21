import os
from pathlib import Path

import uvicorn

from src.api_application import ApiApplication


app = ApiApplication(base_dir=Path(__file__).resolve().parent).build()

if __name__ == "__main__":
    uvicorn.run(
        app="server:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
