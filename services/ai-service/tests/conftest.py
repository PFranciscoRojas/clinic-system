import os

# Settings() requires these at import time in the modules under test; the
# tests never call the network or the DB.
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("MASTER_KEY", "00" * 32)
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
