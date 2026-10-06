"""Single-owner, loopback-only authentication for the local StarView server."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path
from threading import RLock
from contextlib import contextmanager

from fastapi import HTTPException


class Security:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        self.path = directory / 'account.sqlite3'
        self.lock = RLock()
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT, salt BLOB, password BLOB);
            CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, csrf TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS failures (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER, until REAL);
            CREATE TABLE IF NOT EXISTS oauth_states (digest TEXT PRIMARY KEY, session TEXT, provider TEXT, verifier TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS accounts (provider TEXT PRIMARY KEY, tokens BLOB);
            ''')
        os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def password_hash(password, salt):
        return hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, maxmem=64 * 1024 * 1024)

    def owner(self):
        with self.db() as db:
            row = db.execute('SELECT name FROM owner WHERE id=1').fetchone()
        return row['name'] if row else None

    def setup(self, name, password):
        name = name.strip()
        if not 1 <= len(name) <= 80 or not 12 <= len(password) <= 256:
            raise HTTPException(400, 'Use a name and a password of 12–256 characters')
        salt = secrets.token_bytes(16)
        hashed = self.password_hash(password, salt)
        with self.lock, self.db() as db:
            if db.execute('SELECT id FROM owner').fetchone():
                raise HTTPException(409, 'This local account is already set up')
            db.execute('INSERT INTO owner VALUES (1,?,?,?)', (name, salt, hashed))
        return self.issue()

    def login(self, name, password):
        with self.lock, self.db() as db:
            failure = db.execute('SELECT * FROM failures WHERE id=1').fetchone()
            if failure and failure['count'] >= 8 and failure['until'] > time.time():
                raise HTTPException(429, 'Too many attempts. Try again in 15 minutes.')
            row = db.execute('SELECT * FROM owner WHERE id=1').fetchone()
            hashed = self.password_hash(password[:256], row['salt'] if row else b'\0' * 16)
            valid = row and len(password) <= 256 and hmac.compare_digest(row['password'], hashed) and hmac.compare_digest(row['name'].encode(), name.strip().encode())
            if not valid:
                count = failure['count'] + 1 if failure and failure['until'] > time.time() else 1
                db.execute('INSERT OR REPLACE INTO failures VALUES (1,?,?)', (count, time.time() + 900))
            else:
                db.execute('DELETE FROM failures')
        if not valid:
            raise HTTPException(401, 'Name or password is incorrect')
        return self.issue()

    def issue(self):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))
            db.execute('INSERT INTO sessions VALUES (?,?,?)', (self.digest(token), csrf, time.time() + 43200))
        return token, csrf

    def session(self, token):
        if not token or len(token) > 100:
            return None
        with self.db() as db:
            return db.execute('SELECT * FROM sessions WHERE digest=? AND expires>?', (self.digest(token), time.time())).fetchone()

    def logout(self, token):
        with self.db() as db:
            digest = self.digest(token or '')
            db.execute('DELETE FROM sessions WHERE digest=?', (digest,))
            db.execute('DELETE FROM oauth_states WHERE session=?', (digest,))

    def change_password(self, current, password, token):
        if not 12 <= len(password) <= 256:
            raise HTTPException(400, 'Use a password of 12–256 characters')
        with self.lock, self.db() as db:
            owner = db.execute('SELECT * FROM owner').fetchone()
            if not hmac.compare_digest(owner['password'], self.password_hash(current[:256], owner['salt'])):
                raise HTTPException(401, 'Current password is incorrect')
            salt = secrets.token_bytes(16)
            db.execute('UPDATE owner SET salt=?, password=?', (salt, self.password_hash(password, salt)))
            db.execute('DELETE FROM sessions')
            db.execute('DELETE FROM oauth_states')
        return self.issue()
