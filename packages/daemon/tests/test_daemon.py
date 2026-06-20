"""Tests for the daemon."""
import asyncio
import json
import sqlite3
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio
from aiohttp import test_utils, web

from aw_daemon.main import Daemon, DaemonState


class TestDaemonState:
    """Tests for DaemonState."""
    
    def test_init_db(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        state = DaemonState(db_path)
        
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()
        
        assert 'agents' in tables
        assert 'file_claims' in tables
        assert 'messages' in tables
        assert 'pipeline_state' in tables
        assert 'events' in tables
    
    def test_register_agent(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        state.register_agent("test-1", "coder", "fix bug", "default")
        
        agent = state.get_agent("test-1")
        assert agent is not None
        assert agent['role'] == 'coder'
        assert agent['task'] == 'fix bug'
        assert agent['status'] == 'initializing'
    
    def test_heartbeat(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        state.register_agent("test-1", "coder", "fix bug", "default")
        
        import time
        before = state.get_agent("test-1")['last_heartbeat']
        time.sleep(1.1)
        state.heartbeat("test-1")
        after = state.get_agent("test-1")['last_heartbeat']
        
        assert after >= before
    
    def test_file_claims(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        
        assert state.claim_file("/path/to/file", "agent-1") is True
        assert state.claim_file("/path/to/file", "agent-2") is False
        assert state.claim_file("/path/to/other", "agent-2") is True
        
        state.release_file("/path/to/file")
        assert state.claim_file("/path/to/file", "agent-3") is True
    
    def test_rate_limit(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        
        for i in range(5):
            assert state.check_rate_limit(limit_per_minute=5) is True
        assert state.check_rate_limit(limit_per_minute=5) is False
    
    def test_messages(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        
        state.queue_message("msg-1", "Hello", from_agent="agent-1", to_agent="agent-2")
        
        messages = state.get_pending_messages(to_agent="agent-2")
        assert len(messages) == 1
        assert messages[0]['content'] == "Hello"
        
        state.mark_message_delivered("msg-1")
        messages = state.get_pending_messages(to_agent="agent-2")
        assert len(messages) == 0
    
    def test_pipeline(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        
        assert state.get_pipeline_stage("default") == 'plan'
        
        state.set_pipeline_stage("default", "test")
        assert state.get_pipeline_stage("default") == 'test'
    
    def test_dead_agent_detection(self, tmp_path):
        state = DaemonState(str(tmp_path / "test.db"))
        state.register_agent("test-1", "coder", "fix bug", "default")
        
        import time
        time.sleep(1.1)
        dead = state.detect_dead_agents(timeout_seconds=0)
        assert "test-1" in dead
        
        state.heartbeat("test-1")
        dead = state.detect_dead_agents(timeout_seconds=300)
        assert "test-1" not in dead


class TestDaemonEndpoints:
    """Tests for daemon HTTP endpoints."""
    
    @pytest_asyncio.fixture
    async def daemon_app(self, tmp_path):
        daemon = Daemon("test-session", port=0)
        daemon.state = DaemonState(str(tmp_path / "test.db"))
        return daemon.app
    
    @pytest.mark.asyncio
    async def test_health(self, daemon_app):
        client = test_utils.TestClient(test_utils.TestServer(daemon_app))
        await client.start_server()
        
        resp = await client.get('/v1/health')
        data = await resp.json()
        
        assert data['status'] == 'healthy'
        await client.close()
    
    @pytest.mark.asyncio
    async def test_spawn_agent(self, daemon_app):
        client = test_utils.TestClient(test_utils.TestServer(daemon_app))
        await client.start_server()
        
        resp = await client.post('/v1/spawn', json={
            'role': 'coder',
            'task': 'fix the bug'
        })
        data = await resp.json()
        
        assert 'id' in data
        assert data['status'] == 'initializing'
        await client.close()
    
    @pytest.mark.asyncio
    async def test_list_agents(self, daemon_app):
        client = test_utils.TestClient(test_utils.TestServer(daemon_app))
        await client.start_server()
        
        await client.post('/v1/spawn', json={'role': 'coder', 'task': 'task1'})
        await client.post('/v1/spawn', json={'role': 'planner', 'task': 'task2'})
        
        resp = await client.get('/v1/agents')
        data = await resp.json()
        
        assert len(data['agents']) == 2
        await client.close()
    
    @pytest.mark.asyncio
    async def test_file_claim(self, daemon_app):
        client = test_utils.TestClient(test_utils.TestServer(daemon_app))
        await client.start_server()
        
        resp = await client.post('/v1/claim', json={
            'path': '/tmp/test.txt',
            'agent_id': 'agent-1'
        })
        data = await resp.json()
        assert data['status'] == 'claimed'
        
        resp = await client.post('/v1/claim', json={
            'path': '/tmp/test.txt',
            'agent_id': 'agent-2'
        })
        assert resp.status == 409
        await client.close()
    
    @pytest.mark.asyncio
    async def test_pipeline(self, daemon_app):
        client = test_utils.TestClient(test_utils.TestServer(daemon_app))
        await client.start_server()
        
        resp = await client.get('/v1/pipeline')
        data = await resp.json()
        assert data['stage'] == 'plan'
        
        resp = await client.post('/v1/pipeline/advance', json={'stage': 'test'})
        data = await resp.json()
        assert data['stage'] == 'test'
        await client.close()
