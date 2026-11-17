"""Generate persistent VAPID files locally. Never prints the private key."""
from pathlib import Path
import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

if __name__ == '__main__':
    target=Path('.group-push-vapid.private.pem')
    if target.exists():raise SystemExit('Private key already exists. Reuse it; do not rotate without resubscribing devices.')
    key=ec.generate_private_key(ec.SECP256R1())
    public=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    with target.open('xb') as stream:
        stream.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    try:target.chmod(0o600)
    except OSError:pass
    print('WEB_PUSH_PUBLIC_KEY='+base64.urlsafe_b64encode(public).decode().rstrip('='))
    print('Private key saved locally; configure the private file/secret on your server. Never commit it.')
