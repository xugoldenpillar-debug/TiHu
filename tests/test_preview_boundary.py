import base64
import pytest
from tihu.config import Settings,validate_origin

def prod(**kwargs):
    fields=dict(production=True,role='api',database_url='postgresql+psycopg://unused',app_origin='https://app.tihu.example',preview_origin='https://preview.other.example',master_keys={'v1':base64.b64encode(b'1'*32).decode()},active_key='v1',signing_key=base64.b64encode(b'2'*32).decode(),smtp_host='mail.example',sandbox_runtime='runsc');fields.update(kwargs);return Settings(**fields)
@pytest.mark.parametrize('value',['https://u:p@example.com','https://example.com/#x','ftp://example.com','https://example.com/path'])
def test_origin_validation_rejects_non_origins(value):
    with pytest.raises(ValueError):validate_origin('origin',value)
def test_production_preview_must_be_unrelated_origin():
    with pytest.raises(ValueError):prod(preview_origin='https://preview.tihu.example').validate()
def test_preview_csp_has_no_same_origin_or_network(client):
    # Header details are covered by the integration preview test; this guards source configuration.
    from pathlib import Path
    text=Path('tihu/preview.py').read_text();assert "sandbox allow-scripts" in text;assert 'allow-same-origin' not in text;assert "connect-src 'none'" in text
