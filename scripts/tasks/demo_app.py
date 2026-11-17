"""Demo Flask app for Task B verification: mixes secret-looking keys with ordinary ones."""
from flask import Flask

app = Flask(__name__)
app.config.update(
    SECRET_KEY="dev-secret-should-not-print",
    DATABASE_PASSWORD="hunter2",
    API_TOKEN="tok_live_123",
    STRIPE_KEY="sk_test_abc",
    session_secret_value="lowercase-secret",
    APP_NAME="axiom-demo",
    MAX_ITEMS=25,
)
